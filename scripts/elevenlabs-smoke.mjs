#!/usr/bin/env node
// ElevenLabs live smoke + naturalness check (brief §23.5, gate TTS-09). Node 24, no dependencies.
//
//   Step 0  Report which ELEVENLABS_* / access env names are present in .env.local (never values).
//   Step 1  GET {base}/api/voices (the app's approved list), and, when .env.local holds a key,
//           GET https://api.elevenlabs.io/v2/voices directly to suggest 3 natural adult premade
//           voices. Listing voices does not consume characters.
//   Step 2  POST {base}/api/speech for the five TTS-09 lines, sequentially. This SPENDS ElevenLabs
//           characters (about 143 for all five). MP3s go to docs/evidence/tts/<n>-<slug>.mp3 and
//           per-line timings to docs/evidence/tts/results.json with humanListening "not reviewed".
//
// Usage (from the repo root, with `npm run dev` running in another terminal):
//   node scripts/elevenlabs-smoke.mjs [base] [--base URL] [--max-lines N] [--voices-only]
//        [--dry-run] [--no-direct] [--access-code-file .env.railway.local] [--env-file .env.local]
//   base defaults to http://localhost:3000. For the deployed app pass its URL and
//   --access-code-file .env.railway.local (reads RAILWAY_APP_ACCESS_TOKEN, sent as a header).
//
// Secrets: key and access code are read into memory only. They are never printed, logged,
// written to results.json, or put in a URL. Voice IDs are not secrets and are printed.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs', 'evidence', 'tts');
const ACCESS_HEADER = 'x-still-here-access';
const ELEVENLABS_API = 'https://api.elevenlabs.io';

// TTS-09 lines, exactly as chosen before testing (brief §23.5). Do not edit, trim or tag them.
const LINES = [
  'Hey, how was your day?',
  "I don't agree with that.",
  "Please don't change my medication.",
  'Only if I get to pick the movie.',
  "I'll be there at 3:15, Dr. Lee.",
];
const BUDGET = { maxLines: 5, maxChars: 200 };
const ENV_NAMES = [
  'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_ALLOWED_VOICE_IDS', 'ELEVENLABS_MODEL_ID',
  'ELEVENLABS_TRANSPORT', 'ELEVENLABS_OUTPUT_FORMAT', 'ELEVENLABS_TIMEOUT_MS', 'ELEVENLABS_DAILY_CHAR_BUDGET',
  'APP_ACCESS_TOKEN',
];

// ---------- args ----------
function parseArgs(argv) {
  const opts = { base: 'http://localhost:3000', maxLines: 5, voicesOnly: false, dryRun: false, direct: true, accessCodeFile: null, envFile: '.env.local' };
  const needValue = (i, name) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) fail(`${name} needs a value`, 2);
    return v;
  };
  let positional = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--base') { opts.base = needValue(i, a); i += 1; }
    else if (a === '--max-lines') { opts.maxLines = Number(needValue(i, a)); i += 1; }
    else if (a === '--access-code-file') { opts.accessCodeFile = needValue(i, a); i += 1; }
    else if (a === '--env-file') { opts.envFile = needValue(i, a); i += 1; }
    else if (a === '--voices-only') opts.voicesOnly = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--no-direct') opts.direct = false;
    else if (a === '-h' || a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
    else if (!a.startsWith('--') && !positional) { opts.base = a; positional = true; }
    else fail(`Unknown argument: ${a}`, 2);
  }
  if (!Number.isInteger(opts.maxLines) || opts.maxLines < 1 || opts.maxLines > BUDGET.maxLines) fail(`--max-lines must be an integer from 1 to ${BUDGET.maxLines}`, 2);
  let url;
  try { url = new URL(opts.base); } catch { fail('Base URL is not a valid URL', 2); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail('Base URL must be http or https', 2);
  if (url.username || url.password || url.search) fail('Base URL must not contain credentials or a query string', 2);
  opts.base = url.origin + url.pathname.replace(/\/+$/, '');
  const host = url.hostname.toLowerCase();
  opts.local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  return opts;
}

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

// ---------- env files (values stay in memory; only names and presence are ever printed) ----------
function findFile(p) {
  if (isAbsolute(p)) return existsSync(p) ? p : null;
  for (const candidate of [resolve(process.cwd(), p), resolve(ROOT, p)]) if (existsSync(candidate)) return candidate;
  return null;
}

function readEnvFile(p) {
  const env = new Map();
  const file = findFile(p);
  if (!file) return { file: null, env };
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim();
    env.set(m[1], v);
  }
  return { file, env };
}
const has = (env, name) => (env.get(name) ?? '').trim().length > 0;

// ---------- small helpers ----------
const clean = (v, n = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, n) : '');
const slug = (t) => t.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const looksLikeMp3 = (b) => b.byteLength >= 4 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
const errName = (e) => clean(e?.cause?.code || e?.name || 'error', 40);
const rel = (p) => relative(ROOT, p) || p;

async function readJson(res) {
  try { return await res.json(); } catch { return null; }
}

// ---------- step 1a: app's approved voices ----------
async function appVoices(base, headers) {
  try {
    const res = await fetch(`${base}/api/voices`, { headers, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    const body = await readJson(res);
    if (res.ok && body?.ok) {
      const voices = Array.isArray(body.data?.voices) ? body.data.voices : [];
      return { reachable: true, status: res.status, code: 'OK', voices, defaultVoiceId: clean(body.data?.defaultVoiceId) || null };
    }
    return { reachable: true, status: res.status, code: clean(body?.error?.code, 40) || `HTTP_${res.status}`, voices: [], defaultVoiceId: null };
  } catch (e) {
    return { reachable: false, status: null, code: `UNREACHABLE:${errName(e)}`, voices: [], defaultVoiceId: null };
  }
}

// ---------- step 1b: direct /v2/voices listing and suggestions ----------
async function listAccountVoices(key) {
  const all = [];
  let token = null;
  for (let page = 0; page < 5; page += 1) {
    const q = new URLSearchParams({ page_size: '100', include_total_count: 'false' });
    if (token) q.set('next_page_token', token);
    let res;
    try {
      res = await fetch(`${ELEVENLABS_API}/v2/voices?${q}`, { headers: { 'xi-api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    } catch (e) {
      return { ok: false, reason: `network:${errName(e)}`, voices: all };
    }
    // Status code only; the provider's message body is not printed.
    if (!res.ok) { await res.body?.cancel().catch(() => {}); return { ok: false, reason: `HTTP ${res.status}`, voices: all }; }
    const body = await readJson(res);
    if (!Array.isArray(body?.voices)) return { ok: false, reason: 'unexpected response shape', voices: all };
    all.push(...body.voices);
    token = body.has_more === true && typeof body.next_page_token === 'string' ? body.next_page_token : null;
    if (!token) break;
  }
  return { ok: true, reason: null, voices: all };
}

const POSITIVE = /\b(calm|warm|casual|friendly|relaxed|natural|conversational|soft|gentle|pleasant|smooth|easygoing|reassuring)\b/;
const NEGATIVE = /\b(dramatic|intense|raspy|gravelly|whisper\w*|excited|energetic|hyped|robotic|seductive|childlike|cartoon\w*|anim\w*|villain\w*|meme)\b/;

function scoreVoice(v) {
  const labels = v.labels && typeof v.labels === 'object' ? v.labels : {};
  const flat = (x) => String(x ?? '').toLowerCase().replace(/[_-]+/g, ' ');
  const age = flat(labels.age);
  const useCase = flat(labels.use_case ?? labels.usecase);
  const text = [flat(labels.description), flat(labels.descriptive), flat(v.description)].join(' ');
  if (/child|kid|teen/.test(age) || /child|kid/.test(text)) return null; // adults only
  let s = 0;
  if (/middle/.test(age)) s += 2; else if (/young/.test(age)) s += 1; // "young" is young adult in ElevenLabs labels
  if (/conversation/.test(useCase)) s += 3;
  else if (/social|narrat|informative|educational/.test(useCase)) s += 1;
  else if (/character|animation|game/.test(useCase)) s -= 3;
  s += Math.min(2, (text.match(new RegExp(POSITIVE.source, 'g')) ?? []).length);
  if (NEGATIVE.test(text) || NEGATIVE.test(useCase)) s -= 2;
  return s;
}

function suggestVoices(voices) {
  const premade = voices.filter((v) => typeof v?.voice_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v.voice_id) && String(v.category).toLowerCase() === 'premade');
  const ranked = premade.map((v) => ({ v, s: scoreVoice(v) })).filter((x) => x.s !== null).sort((a, b) => b.s - a.s || clean(a.v.name).localeCompare(clean(b.v.name)));
  // Best voice of each gender label first (a small mix to choose from), then fill by score.
  const picked = [];
  const genders = new Set();
  for (const x of ranked) {
    const g = String(x.v.labels?.gender ?? '').toLowerCase();
    if (picked.length < 3 && g && !genders.has(g)) { picked.push(x); genders.add(g); }
  }
  for (const x of ranked) { if (picked.length >= 3) break; if (!picked.includes(x)) picked.push(x); }
  picked.sort((a, b) => b.s - a.s);
  return { premadeCount: premade.length, picks: picked.map((x) => x.v) };
}

function printSuggestions(listing) {
  const counts = {};
  for (const v of listing.voices) { const c = clean(String(v?.category ?? 'unknown'), 20) || 'unknown'; counts[c] = (counts[c] ?? 0) + 1; }
  console.log(`  account voices: ${listing.voices.length} (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'})`);
  const { picks } = suggestVoices(listing.voices);
  if (picks.length === 0) { console.log('  no premade adult voices found to suggest; pick one in the ElevenLabs dashboard'); return []; }
  console.log('  Suggested natural adult premade voices (heuristic from labels; listen to the preview before choosing):');
  picks.forEach((v, i) => {
    const labels = v.labels && typeof v.labels === 'object' ? Object.entries(v.labels).map(([k, val]) => `${clean(k, 20)}=${clean(String(val), 30)}`).join(', ') : '';
    console.log(`  ${i + 1}. ${clean(v.name, 60)}  [${clean(String(v.category), 20)}]  ${labels}`);
    const preview = clean(v.preview_url, 300);
    if (/^https:\/\//.test(preview)) console.log(`     free preview sample: ${preview}`);
  });
  console.log('  Put ONE of these in .env.local (voice IDs are not secrets):');
  for (const v of picks) console.log(`    ELEVENLABS_VOICE_ID=${v.voice_id}    # ${clean(v.name, 40)}`);
  if (picks.length > 1) console.log(`  Optional small picker (the other suggestions): ELEVENLABS_ALLOWED_VOICE_IDS=${picks.slice(1).map((v) => v.voice_id).join(',')}`);
  console.log('  Compatibility with the configured model is only confirmed by a successful step 2.');
  return picks;
}

// ---------- step 2: synthesis through the app ----------
async function speakLine(base, headers, n, text, runId) {
  const body = JSON.stringify({ utteranceId: `smoke-${runId}-${n}`, reviewSnapshotId: `smoke-${runId}-${n}`, sessionEpoch: `smoke-${runId}`, exactText: text, voiceChoiceId: null });
  const row = { n, text, chars: text.length, file: null, httpStatus: null, ok: false, errorCode: null, contentType: null, modelHeader: null, bytes: 0, looksLikeMp3: false, headersMs: null, requestToBytesMs: null, humanListening: 'not reviewed', listeningNotes: '' };
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}/api/speech`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(45_000), cache: 'no-store' });
    row.headersMs = Math.round(performance.now() - t0);
    row.httpStatus = res.status;
    row.contentType = clean(res.headers.get('content-type'), 60) || null;
    row.modelHeader = clean(res.headers.get('x-still-here-model'), 60) || null;
    if (!res.ok) {
      const j = await readJson(res);
      row.requestToBytesMs = Math.round(performance.now() - t0);
      row.errorCode = clean(j?.error?.code, 40) || `HTTP_${res.status}`;
      return row;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    row.requestToBytesMs = Math.round(performance.now() - t0);
    row.bytes = bytes.byteLength;
    row.looksLikeMp3 = looksLikeMp3(bytes);
    if (!row.contentType?.startsWith('audio/mpeg') || !row.looksLikeMp3) { row.errorCode = 'NOT_MP3'; return row; }
    const file = join(OUT_DIR, `${n}-${slug(text)}.mp3`);
    writeFileSync(file, bytes);
    row.file = rel(file);
    row.ok = true;
  } catch (e) {
    row.requestToBytesMs = Math.round(performance.now() - t0);
    row.errorCode = `NETWORK:${errName(e)}`;
  }
  return row;
}

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

// ---------- main ----------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const lines = LINES.slice(0, opts.maxLines);
  const chars = lines.reduce((a, t) => a + t.length, 0);
  if (lines.length > BUDGET.maxLines || chars > BUDGET.maxChars) fail(`Budget guard: ${lines.length} lines / ${chars} chars exceeds ${BUDGET.maxLines} lines / ${BUDGET.maxChars} chars`, 2);

  console.log(`ElevenLabs smoke check -> ${opts.base} (${opts.local ? 'local' : 'deployed'})`);

  // Step 0: env presence.
  const local = readEnvFile(opts.envFile);
  console.log(`\nStep 0  env presence in ${local.file ? rel(local.file) : `${opts.envFile} (file not found)`} (values never printed)`);
  const presence = Object.fromEntries(ENV_NAMES.map((n) => [n, has(local.env, n)]));
  for (const n of ENV_NAMES) console.log(`  ${n.padEnd(30)} ${presence[n] ? 'present' : 'absent'}`);
  const localKey = presence.ELEVENLABS_API_KEY ? local.env.get('ELEVENLABS_API_KEY').trim() : null;

  // Access code: explicit file (RAILWAY_APP_ACCESS_TOKEN, then APP_ACCESS_TOKEN), else APP_ACCESS_TOKEN from .env.local.
  let accessCode = null;
  let accessSource = 'none';
  if (opts.accessCodeFile) {
    const f = readEnvFile(opts.accessCodeFile);
    if (!f.file) fail(`--access-code-file ${opts.accessCodeFile} not found`, 2);
    const name = has(f.env, 'RAILWAY_APP_ACCESS_TOKEN') ? 'RAILWAY_APP_ACCESS_TOKEN' : has(f.env, 'APP_ACCESS_TOKEN') ? 'APP_ACCESS_TOKEN' : null;
    if (!name) fail(`${rel(f.file)} has no RAILWAY_APP_ACCESS_TOKEN or APP_ACCESS_TOKEN`, 2);
    accessCode = f.env.get(name).trim();
    accessSource = `${name} from ${rel(f.file)}`;
  } else if (presence.APP_ACCESS_TOKEN) {
    accessCode = local.env.get('APP_ACCESS_TOKEN').trim();
    accessSource = `APP_ACCESS_TOKEN from ${rel(local.file)}`;
  }
  console.log(`  access code header: ${accessCode ? `sent (${accessSource})` : 'not sent'}`);
  if (!opts.local && !accessCode) console.log('  warning: deployed base without an access code; the server will answer UNAUTHORIZED');
  const headers = accessCode ? { [ACCESS_HEADER]: accessCode } : {};

  // Step 1a: the app's approved voice list (also tells us whether the server is configured).
  console.log(`\nStep 1  voices`);
  const app = await appVoices(opts.base, headers);
  console.log(`  GET ${opts.base}/api/voices -> ${app.status ?? 'no response'} ${app.code}`);
  if (app.code === 'OK') {
    for (const v of app.voices) console.log(`    ${clean(v.id)}  ${clean(v.name, 60)}${v.id === app.defaultVoiceId ? '  (default)' : ''}`);
  }

  // Step 1b: direct listing with the local key (free; suggests voices to pick from).
  if (opts.direct && localKey) {
    console.log(`  GET ${ELEVENLABS_API}/v2/voices (server-side, key from ${rel(local.file)})`);
    const listing = await listAccountVoices(localKey);
    if (!listing.ok) console.log(`  direct listing failed: ${listing.reason}${/401|403/.test(listing.reason) ? ' (key rejected or missing the Voices read permission)' : ''}`);
    if (listing.voices.length) printSuggestions(listing);
  } else if (opts.direct) {
    console.log('  direct /v2/voices listing skipped: no ELEVENLABS_API_KEY in .env.local');
  }

  // Gates before any paid call.
  if (app.code === 'NOT_CONFIGURED' || (!localKey && opts.local && app.code !== 'OK')) {
    if (!localKey && opts.local) console.log('\nELEVENLABS_API_KEY not configured');
    else if (opts.local && !presence.ELEVENLABS_VOICE_ID) console.log('\nELEVENLABS_VOICE_ID not configured: add one of the suggested ELEVENLABS_VOICE_ID lines to .env.local, let the dev server reload, and rerun.');
    else console.log(`\nServer at ${opts.base} reports NOT_CONFIGURED (ELEVENLABS_API_KEY not configured there, or ELEVENLABS_VOICE_ID missing / not allowed).${opts.local ? ' If .env.local was just edited, restart `npm run dev`.' : ''}`);
    if (!app.reachable) console.log(`(The server was not reachable: ${app.code}. Start it with \`npm run dev\`.)`);
    console.log('No speech was requested and nothing was spent. No evidence files were written.');
    return 0;
  }
  if (!app.reachable) { console.error(`\nServer not reachable at ${opts.base} (${app.code}). Start it with \`npm run dev\`.`); return 1; }
  if (app.code !== 'OK') {
    console.error(`\n/api/voices returned ${app.code}; not attempting speech.${app.code === 'UNAUTHORIZED' ? ' Pass --access-code-file for a deployed base.' : ''}`);
    return 1;
  }

  // Step 2: synthesis.
  console.log(`\nStep 2  synthesis: ${lines.length} line(s), ${chars} characters (budget ${BUDGET.maxLines} lines / ${BUDGET.maxChars} chars)`);
  lines.forEach((t, i) => console.log(`  ${i + 1}. "${t}" -> docs/evidence/tts/${i + 1}-${slug(t)}.mp3`));
  if (opts.voicesOnly || opts.dryRun) {
    console.log(`  ${opts.dryRun ? '--dry-run' : '--voices-only'}: not requesting speech. Nothing was spent.`);
    return 0;
  }
  console.log('  This spends ElevenLabs characters. Requests run one at a time and stop at the first failure.');
  mkdirSync(OUT_DIR, { recursive: true });
  // Keep each run's evidence self-consistent: move an earlier run's outputs aside (never delete).
  const earlier = readdirSync(OUT_DIR).filter((f) => f === 'results.json' || /^[1-5]-[a-z0-9-]+\.mp3$/.test(f));
  if (earlier.length) {
    const prev = join(OUT_DIR, `previous-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    mkdirSync(prev);
    for (const f of earlier) renameSync(join(OUT_DIR, f), join(prev, f));
    console.log(`  moved ${earlier.length} earlier output file(s) to ${rel(prev)}`);
  }
  const runId = Date.now().toString(36);
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const row = await speakLine(opts.base, headers, i + 1, lines[i], runId);
    rows.push(row);
    console.log(row.ok
      ? `  ${row.n}. ${row.httpStatus} ${row.bytes} B  ${row.requestToBytesMs} ms (headers ${row.headersMs} ms)  model=${row.modelHeader ?? 'n/a'}  -> ${row.file}`
      : `  ${row.n}. FAILED ${row.httpStatus ?? ''} ${row.errorCode}  ${row.requestToBytesMs} ms`);
    if (!row.ok) { console.log('  stopping after the first failure to avoid repeat spend'); break; }
  }

  const okRows = rows.filter((r) => r.ok);
  const lat = okRows.map((r) => r.requestToBytesMs);
  const result = {
    ranAt: new Date().toISOString(),
    script: 'scripts/elevenlabs-smoke.mjs',
    base: opts.base,
    target: opts.local ? 'local' : 'deployed',
    envPresence: presence,
    accessCodeSent: Boolean(accessCode),
    appVoices: { status: app.status, code: app.code, count: app.voices.length, defaultVoiceId: app.defaultVoiceId },
    budget: { ...BUDGET, lines: lines.length, chars, charsAttempted: rows.reduce((a, r) => a + r.chars, 0) },
    lines: rows,
    summary: {
      attempted: rows.length,
      succeeded: okRows.length,
      medianRequestToBytesMs: median(lat),
      maxRequestToBytesMs: lat.length ? Math.max(...lat) : null,
      models: [...new Set(okRows.map((r) => r.modelHeader).filter(Boolean))],
    },
    humanListening: 'not reviewed',
    listener: { who: 'not recorded', device: 'not recorded', output: 'not recorded', comparedWithBrowserVoice: 'not recorded' },
    notes: [
      'requestToBytesMs is measured by this script from sending POST /api/speech to receiving the last MP3 byte. It includes the app server and ElevenLabs, not iPad playback; it is not confirmation-to-sound latency (TTS-10).',
      'HTTP 200 with MP3 bytes proves the request path only. Word fidelity and naturalness need a human listening pass; see docs/evidence/tts/README.md.',
      'Characters are charged per attempted request, including failures after the provider was contacted.',
    ],
  };
  const resultsPath = join(OUT_DIR, 'results.json');
  writeFileSync(resultsPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`\nWrote ${rel(resultsPath)}: ${okRows.length}/${rows.length} ok, median ${result.summary.medianRequestToBytesMs ?? 'n/a'} ms.`);
  console.log('Next: listen to each MP3 with the checklist in docs/evidence/tts/README.md and fill humanListening / listeningNotes.');
  return okRows.length === lines.length ? 0 : 1;
}

main().then((code) => process.exit(code), (e) => { console.error(`error: ${errName(e)}`); process.exit(1); });
