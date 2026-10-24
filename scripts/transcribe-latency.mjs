#!/usr/bin/env node
// Transcription latency check for hands-free listening. macOS only (uses `say` and `afconvert`),
// Node 24, no dependencies. Calls the transcription provider DIRECTLY, the same way
// src/server/transcription.ts does, so it measures the model round trip without the app server.
//
//   node scripts/transcribe-latency.mjs [--out docs/evidence/latency-transcribe-<time>.json]
//        [--env-file .env.local] [--max-calls 30] [--dry-run]
//
// Clips are synthesised with `say` and encoded to m4a/AAC (what iPad Safari records). "before"
// clips carry 2.0 s of leading silence and 0.9 s of trailing silence (old idleRestartMs average
// and endSilenceMs); "after" clips carry 1.0 s and 0.65 s (new constants), at 32 kbps mono.
// Variants isolate each request parameter. A silence-only clip checks that the prompt is not echoed.
//
// Secrets: the key is read from the env file into memory only. It is never printed, logged or
// written to the output. Calls are capped (default 30, hard cap 30). Spends a few cents.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PHRASES = [
  'Are you coming to dinner tonight?',
  'Do you want some water or something to eat?',
  'The doctor said the appointment is at three fifteen on Thursday.',
  'How are you feeling today?',
];
// Illustrative only: the app sends no prompt unless TRANSCRIPTION_PROMPT is set (opt-in).
const PROMPT = 'A short, everyday spoken sentence in a conversation.';

function arg(name, d) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
}
const dryRun = process.argv.includes('--dry-run');
const maxCalls = Math.min(30, Number(arg('--max-calls', 30)) || 30);
const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).replace(/[: ]/g, '-').slice(0, 16).replace('-', '').replace('-', '');
const outPath = resolve(ROOT, arg('--out', `docs/evidence/latency-transcribe-${stamp}.json`));

function readEnvFile(p) {
  const env = new Map();
  const file = [resolve(process.cwd(), p), resolve(ROOT, p)].find((c) => existsSync(c));
  if (!file) return env;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim();
    env.set(m[1], v);
  }
  return env;
}
const env = readEnvFile(arg('--env-file', '.env.local'));
const get = (n) => (env.get(n) ?? process.env[n] ?? '').trim();
const provider = get('TRANSCRIPTION_PROVIDER').toLowerCase();
const key = get('TRANSCRIPTION_API_KEY') || (provider === 'openai' ? get('OPENAI_API_KEY') : '');
const model = get('TRANSCRIPTION_MODEL');
const base = (get('TRANSCRIPTION_BASE_URL') || 'https://api.openai.com/v1').replace(/\/+$/, '');
if (!dryRun && (provider !== 'openai' || !key || !model)) {
  console.error('Transcription is not configured in the env file (provider/key/model). Nothing was sent.');
  process.exit(2);
}

// ---------- clips ----------
const dir = mkdtempSync(join(tmpdir(), 'transcribe-latency-'));
function makeClip(name, text, leadMs, trailMs, bitrate) {
  const aiff = join(dir, `${name}.aiff`);
  const m4a = join(dir, `${name}.m4a`);
  const spoken = `${leadMs ? `[[slnc ${leadMs}]] ` : ''}${text}${trailMs ? ` [[slnc ${trailMs}]]` : ''}`;
  execFileSync('say', ['-o', aiff, spoken]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(bitrate), '-c', '1', aiff, m4a]);
  const info = execFileSync('afinfo', [m4a]).toString();
  const seconds = Number(/estimated duration: ([\d.]+)/.exec(info)?.[1] ?? 0);
  return { name, path: m4a, bytes: statSync(m4a).size, seconds };
}
const clips = PHRASES.map((text, i) => ({
  text,
  before: makeClip(`b${i}`, text, 2000, 900, 64000),
  after: makeClip(`a${i}`, text, 1000, 650, 32000),
}));
const silence = makeClip('silence', '', 2500, 0, 32000);

// ---------- calls ----------
let calls = 0;
async function call(clip, { language, prompt, format = 'json' }) {
  if (calls >= maxCalls) throw new Error('call cap reached');
  calls += 1;
  const form = new FormData();
  form.append('file', new File([readFileSync(clip.path)], 'capture.m4a', { type: 'audio/mp4' }), 'capture.m4a');
  form.append('model', model);
  form.append('response_format', format);
  if (language) form.append('language', language);
  if (prompt) form.append('prompt', prompt);
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(30_000),
    });
    const raw = await res.text();
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      let msg = raw;
      try { msg = JSON.parse(raw)?.error?.message ?? raw; } catch { /* keep raw */ }
      return { ok: false, status: res.status, ms, error: String(msg).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').slice(0, 200) };
    }
    let text = raw;
    if (format === 'json') { try { text = JSON.parse(raw).text ?? ''; } catch { text = ''; } }
    return { ok: true, status: res.status, ms, text: String(text).trim() };
  } catch (e) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: String(e?.name || 'error') };
  }
}

const VARIANTS = [
  { id: 'baseline', clip: 'before', params: {} },
  { id: 'language', clip: 'before', params: { language: 'en' } },
  { id: 'language+prompt', clip: 'before', params: { language: 'en', prompt: PROMPT } },
  { id: 'language+prompt+text', clip: 'before', params: { language: 'en', prompt: PROMPT, format: 'text' } },
  { id: 'after (new clip + language+prompt)', clip: 'after', params: { language: 'en', prompt: PROMPT } },
];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2)) : null; };
const results = [];
const plan = VARIANTS.length * clips.length + 2 + 1;
console.log(`clips in ${dir}; planned calls: ${plan} (cap ${maxCalls})${dryRun ? ' [dry run, nothing sent]' : ''}`);
for (const c of clips) console.log(`  "${c.text}"  before ${c.before.seconds.toFixed(1)}s/${c.before.bytes}B  after ${c.after.seconds.toFixed(1)}s/${c.after.bytes}B`);

if (!dryRun) {
  await call(clips[0].after, { language: 'en' }); // warm-up (TLS, routing); not recorded
  for (const v of VARIANTS) {
    for (const c of clips) {
      const clip = c[v.clip];
      const r = await call(clip, v.params);
      results.push({ variant: v.id, phrase: c.text, clipSeconds: Number(clip.seconds.toFixed(2)), clipBytes: clip.bytes, ...r });
      console.log(`${v.id.padEnd(36)} ${String(r.ms).padStart(5)} ms  ${r.ok ? JSON.stringify(r.text) : `FAILED ${r.status} ${r.error}`}`);
    }
  }
  // Silence-only clip: the prompt must not be echoed back as a transcript.
  for (const [id, params] of [['silence baseline', {}], ['silence language+prompt', { language: 'en', prompt: PROMPT }]]) {
    const r = await call(silence, params);
    results.push({ variant: id, phrase: '(silence)', clipSeconds: Number(silence.seconds.toFixed(2)), clipBytes: silence.bytes, ...r });
    console.log(`${id.padEnd(36)} ${String(r.ms).padStart(5)} ms  ${r.ok ? JSON.stringify(r.text) : `FAILED ${r.status} ${r.error}`}`);
  }
}

const summary = {};
for (const v of [...VARIANTS.map((x) => x.id)]) {
  const rows = results.filter((r) => r.variant === v && r.ok);
  summary[v] = { n: rows.length, medianMs: median(rows.map((r) => r.ms)), minMs: rows.length ? Math.min(...rows.map((r) => r.ms)) : null, maxMs: rows.length ? Math.max(...rows.map((r) => r.ms)) : null,
    failed: results.filter((r) => r.variant === v && !r.ok).length, medianClipBytes: median(rows.map((r) => r.clipBytes)) };
}
const doc = {
  generatedAt: new Date().toISOString(),
  host: 'Mac (this machine) to the transcription provider directly; not the iPad, not venue Wi-Fi',
  model,
  baseHost: new URL(base).host,
  calls,
  note: 'before = 2.0 s lead + 0.9 s trail, 64 kbps mono AAC; after = 1.0 s lead + 0.65 s trail, 32 kbps mono AAC. Lead values are the average idle-restart offset for 4000 ms and 2000 ms idleRestartMs.',
  promptUsed: PROMPT,
  summary,
  results,
};
if (!dryRun) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`\nwrote ${outPath.replace(`${ROOT}/`, '')}\n${JSON.stringify(summary, null, 2)}`);
}
rmSync(dir, { recursive: true, force: true });
