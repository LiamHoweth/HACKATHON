#!/usr/bin/env node
// End-to-end latency against the DEPLOYED server: partner finishes a question -> transcript ->
// 3 suggestions -> (person's blink, excluded) -> first audio of the spoken reply.
// macOS only (uses `say` and `afconvert`), Node 24, no dependencies.
//
//   node scripts/e2e-latency.mjs [--base https://api-production-18038.up.railway.app]
//        [--env-file .env.railway.local] [--passes 2] [--out docs/evidence/e2e-latency-<HHMM>.json]
//        [--md docs/evidence/E2E_LATENCY-<HHMM>.md] [--dry-run]
//
// Per question and pass: POST /api/transcribe (T1), POST /api/replies (T2), POST /api/speech for
// the first suggestion (T3 = full MP3, plus time to first byte). Pass 1 requests only the first
// suggestion's speech. Pass 2 requests all three in parallel, like the app's prefetch (concurrency
// 3), and records each. Total API calls: questions * passes * 2 + questions + 3 * questions * (passes-1)
// with 5 questions and 2 passes = 40 (hard cap 44). A failed call is retried once after 15 s.
//
// Secrets: the access code is read from the env file into memory only and is never printed or
// written. Output is scrubbed of it defensively.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUESTIONS = [
  'Are you coming to dinner tonight?',
  'How are you feeling today?',
  'Do you want some water?',
  'What did you think of the game?',
  'Should we leave at six?',
];
// src/audio/continuous-listener.ts VAD.endSilenceMs
const END_SILENCE_MS = 650;
const MAX_CALLS = 44;
const TIMEOUT_MS = 45_000;
const ACCESS_HEADER = 'x-still-here-access';

function arg(name, d) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
}
const dryRun = process.argv.includes('--dry-run');
const base = arg('--base', 'https://api-production-18038.up.railway.app').replace(/\/+$/, '');
const passes = Math.max(1, Math.min(2, Number(arg('--passes', 2)) || 2));
const hhmm = new Date().toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).slice(11, 16).replace(':', '');
const outPath = resolve(ROOT, arg('--out', `docs/evidence/e2e-latency-${hhmm}.json`));
const mdPath = resolve(ROOT, arg('--md', `docs/evidence/E2E_LATENCY-${hhmm}.md`));
if (basename(mdPath) === 'E2E_LATENCY.md') { console.error('Refusing to overwrite the E2E_LATENCY.md baseline; pick another --md path.'); process.exit(2); }

const baseUrl = new URL(base);
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname);
if (baseUrl.protocol !== 'https:' && !localHost) { console.error('Refusing a non-HTTPS remote base URL.'); process.exit(2); }

function readEnvValue(file, name) {
  const p = resolve(ROOT, file);
  if (!existsSync(p)) return '';
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || m[1] !== name) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v.trim();
  }
  return '';
}
const envFile = arg('--env-file', '.env.railway.local');
const accessCode = readEnvValue(envFile, 'RAILWAY_APP_ACCESS_TOKEN') || readEnvValue(envFile, 'APP_ACCESS_TOKEN');
if (!accessCode && !dryRun) { console.error(`No RAILWAY_APP_ACCESS_TOKEN in ${envFile}.`); process.exit(2); }
const scrub = (s) => (accessCode ? String(s).split(accessCode).join('[redacted]') : String(s));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
let calls = 0;
const callLog = [];

// One API call with a single retry after 15 s (the lead may redeploy mid-run: brief 502s).
async function call(label, fn) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (calls >= MAX_CALLS) throw new Error('call cap reached');
    calls++;
    const startedAtIso = new Date().toISOString();
    try {
      const r = await fn();
      callLog.push({ label, attempt, at: startedAtIso, status: r.status, ms: Math.round(r.ms) });
      if (r.ok) return { ...r, attempt, at: startedAtIso };
      if (attempt === 2) throw new Error(`${label} failed: HTTP ${r.status}`);
      console.error(`${label}: HTTP ${r.status}, retrying once in 15 s`);
    } catch (e) {
      callLog.push({ label, attempt, at: startedAtIso, error: scrub(e.message).slice(0, 120) });
      if (attempt === 2) throw e;
      console.error(`${label}: ${scrub(e.message).slice(0, 80)}, retrying once in 15 s`);
    }
    await sleep(15_000);
  }
}

async function postTranscribe(file, captureId, sessionEpoch) {
  const form = new FormData();
  form.append('audio', new File([readFileSync(file)], 'q.m4a', { type: 'audio/mp4' }));
  form.append('captureId', captureId);
  form.append('sessionEpoch', sessionEpoch);
  const t0 = now();
  const res = await fetch(`${base}/api/transcribe`, { method: 'POST', body: form, headers: { [ACCESS_HEADER]: accessCode }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  const ms = now() - t0;
  let data = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok && data?.ok === true && typeof data.data?.text === 'string' && data.data.text.trim().length > 0, status: res.status, ms, text: data?.data?.text ?? '' };
}

function replyBody(transcript, sessionEpoch) {
  const turnId = randomUUID();
  return {
    identity: { sessionEpoch, workspaceId: randomUUID(), requestId: randomUUID(), contextRevision: 1, preferenceRevision: 0 },
    mode: 'live',
    anchor: { mode: 'reply', turnId, turnContentRevision: 0 },
    activePartnerText: transcript,
    language: 'en-US',
    recentConversation: [{ role: 'partner', text: transcript, source: 'partner-transcribed' }],
    approvedProfile: [],
    guidance: { intent: null, wording: [], userTopicOrSeed: null, scope: { relationship: null, setting: null } },
    approvedPreferences: [],
    sessionStyleHints: [],
    rejected: [],
    refineTarget: null,
    lengthPolicy: { maxWords: 24, maxCharacters: 160 }, // LENGTH_POLICIES.balanced (default)
  };
}

async function postReplies(transcript, sessionEpoch) {
  const t0 = now();
  const res = await fetch(`${base}/api/replies`, {
    method: 'POST', headers: { 'content-type': 'application/json', [ACCESS_HEADER]: accessCode },
    body: JSON.stringify(replyBody(transcript, sessionEpoch)), signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  const ms = now() - t0;
  let data = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }
  const cands = data?.data?.candidates;
  const ok = res.ok && data?.ok === true && Array.isArray(cands) && cands.length >= 1;
  return { ok, status: res.status, ms, candidates: ok ? cands.map((c) => c.text) : [], source: data?.data?.source ?? null, model: data?.data?.model ?? null };
}

async function postSpeech(textToSpeak, sessionEpoch) {
  const body = { utteranceId: randomUUID(), reviewSnapshotId: randomUUID(), sessionEpoch, exactText: textToSpeak, voiceChoiceId: null };
  const t0 = now();
  const res = await fetch(`${base}/api/speech`, {
    method: 'POST', headers: { 'content-type': 'application/json', [ACCESS_HEADER]: accessCode },
    body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store',
  });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('audio/')) { await res.text().catch(() => ''); return { ok: false, status: res.ok ? 502 : res.status, ms: now() - t0 }; }
  const reader = res.body.getReader();
  let ttfbMs = null; let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (value && value.length) { if (ttfbMs === null) ttfbMs = now() - t0; bytes += value.length; }
    if (done) break;
  }
  const ms = now() - t0;
  return { ok: bytes > 0, status: res.status, ms, ttfbMs: ttfbMs ?? ms, bytes };
}

function makeAudio(dir) {
  return QUESTIONS.map((q, i) => {
    const aiff = join(dir, `q${i}.aiff`); const m4a = join(dir, `q${i}.m4a`);
    // Trailing/leading silence is not added: the client's 650 ms end-silence is added as a constant.
    execFileSync('say', ['-o', aiff, q]);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', aiff, m4a]);
    return m4a;
  });
}

const sorted = (a) => [...a].sort((x, y) => x - y);
const median = (a) => { const s = sorted(a); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const p90 = (a) => { const s = sorted(a); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)] : null; };
const stat = (a) => ({ n: a.length, median: Math.round(median(a)), p90: Math.round(p90(a)), min: Math.round(Math.min(...a)), max: Math.round(Math.max(...a)) });

if (dryRun) {
  console.log(`dry run: base=${base} passes=${passes} questions=${QUESTIONS.length} accessCode=${accessCode ? 'present' : 'missing'} out=${outPath}`);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'e2e-latency-'));
const startedAt = new Date().toISOString();
const runs = [];
try {
  const files = makeAudio(dir);
  const sessionEpoch = randomUUID();
  // Warm-up is deliberately omitted: a cold first call is part of an honest measurement.
  for (let pass = 1; pass <= passes; pass++) {
    for (let qi = 0; qi < QUESTIONS.length; qi++) {
      const run = { pass, question: QUESTIONS[qi], startedAt: new Date().toISOString() };
      const t = await call(`transcribe q${qi + 1} p${pass}`, () => postTranscribe(files[qi], randomUUID(), sessionEpoch));
      run.t1Ms = Math.round(t.ms); run.transcript = t.text; run.t1Retried = t.attempt > 1;
      const r = await call(`replies q${qi + 1} p${pass}`, () => postReplies(t.text, sessionEpoch));
      run.t2Ms = Math.round(r.ms); run.suggestions = r.candidates; run.repliesSource = r.source; run.repliesModel = r.model; run.t2Retried = r.attempt > 1;
      run.suggestionsAt = new Date().toISOString();
      if (pass === 1) {
        const s = await call(`speech q${qi + 1} p${pass}`, () => postSpeech(r.candidates[0], sessionEpoch));
        run.speech = [{ ttfbMs: Math.round(s.ttfbMs), fullMs: Math.round(s.ms), bytes: s.bytes }];
        run.speechMode = 'single';
      } else {
        // Like the app's prefetch: all suggestions are synthesized in parallel as soon as they show.
        const texts = r.candidates.slice(0, 3);
        const rs = await Promise.all(texts.map((tx, k) => call(`speech q${qi + 1} p${pass} s${k + 1}`, () => postSpeech(tx, sessionEpoch))));
        run.speech = rs.map((s) => ({ ttfbMs: Math.round(s.ttfbMs), fullMs: Math.round(s.ms), bytes: s.bytes }));
        run.speechMode = `parallel-${texts.length}`;
      }
      run.speechRetried = false;
      runs.push(run);
      console.log(`q${qi + 1} p${pass}: T1=${run.t1Ms} ms  T2=${run.t2Ms} ms  T3(first)=${run.speech[0].fullMs} ms  "${run.transcript}"`);
      await sleep(1500);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const finishedAt = new Date().toISOString();

// ---- Aggregate -------------------------------------------------------------------------------
const t1 = runs.map((r) => r.t1Ms);
const t2 = runs.map((r) => r.t2Ms);
const t3First = runs.map((r) => r.speech[0].fullMs);
const t3Ttfb = runs.map((r) => r.speech[0].ttfbMs);
const t3Single = runs.filter((r) => r.speechMode === 'single').map((r) => r.speech[0].fullMs);
const t3Par = runs.filter((r) => r.speechMode.startsWith('parallel')).map((r) => r.speech[0].fullMs);
const t3ParLast = runs.filter((r) => r.speechMode.startsWith('parallel')).map((r) => Math.max(...r.speech.map((s) => s.fullMs)));
const toSuggestions = runs.map((r) => END_SILENCE_MS + r.t1Ms + r.t2Ms);
const noPrefetchBlinkToVoice = runs.map((r) => r.speech[0].fullMs);
const toVoiceNoPrefetch = runs.map((r) => END_SILENCE_MS + r.t1Ms + r.t2Ms + r.speech[0].fullMs);

const summary = {
  endSilenceMs: END_SILENCE_MS,
  t1_transcribe: stat(t1),
  t2_replies: stat(t2),
  t3_speechFullMp3_firstSuggestion_all: stat(t3First),
  t3_speechTtfb_firstSuggestion_all: stat(t3Ttfb),
  t3_speechFull_single: t3Single.length ? stat(t3Single) : null,
  t3_speechFull_parallel3_first: t3Par.length ? stat(t3Par) : null,
  t3_speechFull_parallel3_slowestOfThree: t3ParLast.length ? stat(t3ParLast) : null,
  partnerStops_to_suggestionsOnScreen: stat(toSuggestions),
  blink_to_voice_with_prefetch_ms: 0,
  blink_to_voice_without_prefetch: stat(noPrefetchBlinkToVoice),
  partnerStops_to_audioReady_if_person_blinked_instantly_no_prefetch: stat(toVoiceNoPrefetch),
};
const report = {
  label: 'End-to-end latency, measured from a Mac against the deployed server; synthetic speech (macOS say); excludes the person\'s gesture/reading time; NOT iPad-measured.',
  base, startedAt, finishedAt, passes, questions: QUESTIONS, apiCalls: calls,
  model: { transcribe: 'deployed /api/transcribe', replies: [...new Set(runs.map((r) => r.repliesModel))], repliesSource: [...new Set(runs.map((r) => r.repliesSource))] },
  summary, runs, callLog,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, scrub(JSON.stringify(report, null, 2)) + '\n');

const row = (name, s) => `| ${name} | ${s.median} | ${s.p90} | ${s.min}-${s.max} |`;
const md = `# End-to-end latency (deployed server)

> **How this was measured.** From a Mac on the venue network against the deployed server (${base}), by \`scripts/e2e-latency.mjs\`. The partner questions are **synthetic speech** (macOS \`say\`, encoded to m4a/AAC). It **excludes the person's gesture/reading time** (the blink). It is **not iPad-measured**: no on-device audio capture, VAD or playback latency is included. Run window: ${startedAt} to ${finishedAt}. Raw data: \`${outPath.replace(ROOT + '/', '')}\`.

Chain: partner finishes speaking -> end-of-speech detection (650 ms, \`VAD.endSilenceMs\`, a client constant, not measured here) -> \`/api/transcribe\` (T1) -> \`/api/replies\` for 3 suggestions (T2) -> person's blink (excluded) -> \`/api/speech\` (T3) -> first audio.

${runs.length} runs (${QUESTIONS.length} questions x ${passes} passes), ${calls} API calls. All values in ms.

| Step | Median | p90 | Min-max |
|---|---|---|---|
${row('End-of-speech detection (constant)', { median: END_SILENCE_MS, p90: END_SILENCE_MS, min: END_SILENCE_MS, max: END_SILENCE_MS })}
${row('T1 transcribe', summary.t1_transcribe)}
${row('T2 replies (3 suggestions)', summary.t2_replies)}
${row('T3 speech, full MP3, first suggestion', summary.t3_speechFullMp3_firstSuggestion_all)}
${row('T3 speech, time to first byte', summary.t3_speechTtfb_firstSuggestion_all)}
${summary.t3_speechFull_single ? row('T3 full MP3, one request alone', summary.t3_speechFull_single) + '\n' : ''}${summary.t3_speechFull_parallel3_first ? row('T3 full MP3, first suggestion while 3 run in parallel (as prefetch does)', summary.t3_speechFull_parallel3_first) + '\n' : ''}${summary.t3_speechFull_parallel3_slowestOfThree ? row('T3 full MP3, slowest of the 3 parallel', summary.t3_speechFull_parallel3_slowestOfThree) + '\n' : ''}
**Headline numbers**

| | Median | p90 |
|---|---|---|
| Partner stops -> 3 suggestions on screen (650 + T1 + T2) | ${summary.partnerStops_to_suggestionsOnScreen.median} ms | ${summary.partnerStops_to_suggestionsOnScreen.p90} ms |
| Blink -> voice, **with prefetch** | ~0 ms | ~0 ms |
| Blink -> voice, without prefetch (T3, full MP3) | ${summary.blink_to_voice_without_prefetch.median} ms | ${summary.blink_to_voice_without_prefetch.p90} ms |

**Reading the "with prefetch ~0" claim honestly.** With prefetch, the app requests speech for the suggestions as soon as they appear, while the person reads. Audio is ready after T3 (median ${summary.t3_speechFullMp3_firstSuggestion_all.median} ms, p90 ${summary.t3_speechFullMp3_firstSuggestion_all.p90} ms) from the moment suggestions show, so the blink-to-voice delay is ~0 only if reading plus the blink takes longer than that. A faster blink would wait for the remainder. This script does not measure how long people take to read and select.

Per-run transcripts and suggestions are in the JSON (transcripts are of synthetic audio; the questions contain no personal data).
`;
mkdirSync(dirname(mdPath), { recursive: true });
writeFileSync(mdPath, scrub(md));
console.log('\n' + md);
console.log(`Wrote ${outPath}\nWrote ${mdPath}`);
