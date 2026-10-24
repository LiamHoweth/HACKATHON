#!/usr/bin/env node
// Deployment smoke test for the Still Here Railway service. Prints a PASS/FAIL/SKIP table and
// never prints secret values (the access code is read from a file and only sent as a header).
//
//   node scripts/railway-smoke.mjs                                   # free checks only
//   node scripts/railway-smoke.mjs --access-code-file .env.railway.local
//   node scripts/railway-smoke.mjs --access-code-file .env.railway.local --live   # costs money
//
// Options:
//   --base <url>               Default https://api-production-18038.up.railway.app
//   --access-code-file <path>  File with a RAILWAY_APP_ACCESS_TOKEN=... (or APP_ACCESS_TOKEN=...) line
//   --live                     Also run the paid checks: one live reply, one tiny transcription,
//                              and one short /api/speech request (ElevenLabs, if configured)
//
// Without --live, no request can reach a paid provider: every request either has no access code
// or goes to a free endpoint (status, fixture replies, static assets). Exit code 1 if any check fails.
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, d) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const base = arg('--base', 'https://api-production-18038.up.railway.app').replace(/\/+$/, '');
const codeFile = arg('--access-code-file', null);
const live = argv.includes('--live');
const ACCESS_HEADER = 'x-still-here-access';
const TIMEOUT_MS = 30_000;

const baseUrl = new URL(base);
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname) || baseUrl.hostname.endsWith('.localhost');
if (baseUrl.protocol !== 'https:' && !localHost) {
  console.error('Refusing a non-HTTPS base URL for a remote host (the access code would travel in clear text).');
  process.exit(2);
}

// --- Access code (value is never printed) -------------------------------------------------
let accessCode = '';
if (codeFile) {
  let text;
  try { text = readFileSync(codeFile, 'utf8'); } catch { console.error(`Could not read the access code file (${codeFile}).`); process.exit(2); }
  for (const name of ['RAILWAY_APP_ACCESS_TOKEN', 'APP_ACCESS_TOKEN']) {
    const line = text.split(/\r?\n/).find((l) => l.trim().startsWith(`${name}=`));
    if (line) { accessCode = line.trim().slice(name.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2'); break; }
  }
  if (!accessCode) { console.error('The access code file has no RAILWAY_APP_ACCESS_TOKEN= (or APP_ACCESS_TOKEN=) line with a value.'); process.exit(2); }
}
const withCode = (headers = {}) => ({ ...headers, [ACCESS_HEADER]: accessCode });
// Defensive: never let the code appear in output, even if a server echoed it back.
const scrub = (s) => (accessCode ? String(s).split(accessCode).join('[redacted]') : String(s));

// --- Helpers ------------------------------------------------------------------------------
const results = [];
const record = (name, status, detail) => results.push({ name, status, detail: scrub(detail) });

async function req(path, init = {}) {
  const res = await fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  return res;
}
async function bodyJson(res) {
  try { return await res.json(); } catch { return null; }
}
const errCode = (j) => j?.error?.code ?? 'no-error-code';

async function check(name, fn, { needsLive = false, needsCode = false } = {}) {
  if (needsLive && !live) return record(name, 'SKIP', 'paid check; pass --live to run');
  if (needsCode && !accessCode) return record(name, 'SKIP', 'needs --access-code-file');
  try {
    const out = await fn();
    record(name, out.pass ? 'PASS' : 'FAIL', out.detail);
  } catch (e) {
    record(name, 'FAIL', e?.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS} ms` : `error: ${e?.message ?? e}`);
  }
}

const ids = () => {
  const t = Date.now();
  return { sessionEpoch: 'smoke', workspaceId: `smoke-w-${t}`, requestId: `smoke-r-${t}`, contextRevision: 1, preferenceRevision: 0 };
};
const replyBody = (mode) => ({
  identity: ids(),
  mode,
  anchor: { mode: 'reply', turnId: 'smoke-t1', turnContentRevision: 0 },
  activePartnerText: 'Do you want some tea?',
  language: 'en-US',
  recentConversation: [{ role: 'partner', text: 'Do you want some tea?', source: 'partner-typed' }],
  approvedProfile: [],
  guidance: { intent: null, wording: [], userTopicOrSeed: null, scope: { relationship: null, setting: null } },
  approvedPreferences: [],
  sessionStyleHints: [],
  rejected: [],
  refineTarget: null,
  lengthPolicy: { maxWords: 14, maxCharacters: 100 },
});
const speechBody = () => ({
  utteranceId: `smoke-u-${Date.now()}`,
  reviewSnapshotId: 'smoke-review',
  sessionEpoch: 'smoke',
  exactText: 'Smoke test.',
  voiceChoiceId: null,
});
const postJson = (path, body, headers = {}) =>
  req(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

// 0.25 s of a quiet 440 Hz tone, 16 kHz mono 16-bit PCM WAV (~8 KB), generated in memory.
function tinyWav() {
  const rate = 16_000, samples = 4_000, dataBytes = samples * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples; i++) b.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  return b;
}
const transcribeForm = () => {
  const form = new FormData();
  form.set('captureId', `smoke-c-${Date.now()}`);
  form.set('audio', new Blob([tinyWav()], { type: 'audio/wav' }), 'smoke.wav');
  return form;
};

// --- Checks -------------------------------------------------------------------------------
let status = null;

await check('GET /api/status (shape, speech field)', async () => {
  const res = await req('/api/status');
  status = await bodyJson(res);
  const keys = ['replies', 'speech', 'transcription', 'fixturesEnabled', 'accessRequired'];
  const missing = keys.filter((k) => !(status && k in status));
  const cc = res.headers.get('cache-control') ?? '';
  if (res.status !== 200 || missing.length) return { pass: false, detail: `HTTP ${res.status}; missing: ${missing.join(', ') || 'none'}` };
  return {
    pass: cc.includes('no-store'),
    detail: `replies=${status.replies.configured} speech=${status.speech.configured} transcription=${status.transcription.configured} fixtures=${status.fixturesEnabled} accessRequired=${status.accessRequired}${cc.includes('no-store') ? '' : ' (cache-control not no-store)'}`,
  };
});

await check('status hides provider/model without code', async () => {
  if (!status) return { pass: false, detail: 'no status body' };
  const leaked = [status.replies?.provider && 'replies.provider', status.replies?.model && 'replies.model', status.speech?.model && 'speech.model'].filter(Boolean);
  return { pass: leaked.length === 0 && status.accessRequired === true, detail: leaked.length ? `revealed: ${leaked.join(', ')}` : `hidden; accessRequired=${status.accessRequired}` };
});

await check('status with code -> accessCodeValid', async () => {
  const res = await req('/api/status', { headers: withCode() });
  const j = await bodyJson(res);
  if (j?.accessCodeThrottled) return { pass: false, detail: 'THROTTLED: this IP had >=10 failed access attempts in the last 10 min (correct codes are refused too); retry later' };
  return { pass: res.status === 200 && j?.accessCodeValid === true, detail: `HTTP ${res.status}; accessCodeValid=${j?.accessCodeValid}` };
}, { needsCode: true });

// --- Paid checks (only with --live) --------------------------------------------------------
// These run before the no-code probes below: every request to a paid route without a valid code
// counts toward the server's per-IP failed-attempt throttle (10 per 10 minutes).
await check('POST /api/replies live with code (PAID)', async () => {
  const res = await postJson('/api/replies', replyBody('live'), withCode());
  const j = await bodyJson(res);
  const n = j?.data?.candidates?.length ?? 0;
  return { pass: res.status === 200 && j?.ok === true && n === 3 && j.data?.source !== 'demo-fixture', detail: `HTTP ${res.status}; ${j?.ok ? `source=${j.data.source} model=${j.data.model ?? '?'} candidates=${n}` : errCode(j)}` };
}, { needsLive: true, needsCode: true });

await check('POST /api/transcribe with code, tiny WAV (PAID)', async () => {
  const res = await req('/api/transcribe', { method: 'POST', headers: withCode(), body: transcribeForm() });
  const j = await bodyJson(res);
  // A tone has no words, so an empty transcript is a pass; only the round trip is under test.
  return { pass: res.status === 200 && j?.ok === true && typeof j.data?.text === 'string', detail: `HTTP ${res.status}; ${j?.ok ? `text length ${j.data.text.length}` : errCode(j)}` };
}, { needsLive: true, needsCode: true });

await check('POST /api/speech with code (PAID if configured)', async () => {
  const res = await postJson('/api/speech', speechBody(), withCode());
  const ct = res.headers.get('content-type') ?? '';
  if (res.status === 200 && ct.startsWith('audio/mpeg')) {
    const bytes = (await res.arrayBuffer()).byteLength;
    return { pass: bytes > 0, detail: `HTTP 200; audio/mpeg ${bytes} bytes; model=${res.headers.get('x-still-here-model') ?? '?'}` };
  }
  const j = await bodyJson(res);
  if (res.status === 503 && errCode(j) === 'NOT_CONFIGURED') return { pass: true, detail: 'NOT_CONFIGURED (no ElevenLabs key/voice on this deployment)' };
  return { pass: false, detail: `HTTP ${res.status}; ${ct}; ${errCode(j)}` };
}, { needsLive: true, needsCode: true });

// --- Free checks -------------------------------------------------------------------------
await check('security headers on /', async () => {
  const res = await req('/');
  const h = (k) => res.headers.get(k) ?? '';
  const want = {
    'x-content-type-options': (v) => v === 'nosniff',
    'referrer-policy': (v) => v === 'no-referrer',
    'x-frame-options': (v) => v.toUpperCase() === 'DENY',
    'content-security-policy': (v) => v.includes("frame-ancestors 'none'"),
    'permissions-policy': (v) => v.includes('camera=(self)') && v.includes('microphone=(self)'),
  };
  const bad = Object.entries(want).filter(([k, ok]) => !ok(h(k))).map(([k]) => k);
  if (res.headers.has('x-powered-by')) bad.push('x-powered-by present');
  await res.body?.cancel().catch(() => {});
  return { pass: res.status === 200 && bad.length === 0, detail: `HTTP ${res.status}; ${bad.length ? `bad: ${bad.join(', ')}` : 'all 5 present, no x-powered-by'}` };
});

await check('POST /api/replies fixture (no code)', async () => {
  const res = await postJson('/api/replies', replyBody('fixture'));
  const j = await bodyJson(res);
  const n = j?.data?.candidates?.length ?? 0;
  return { pass: res.status === 200 && j?.ok === true && j.data?.source === 'demo-fixture' && n === 3, detail: `HTTP ${res.status}; source=${j?.data?.source ?? errCode(j)}; candidates=${n}` };
});

await check('POST /api/replies live without code -> 401', async () => {
  const res = await postJson('/api/replies', replyBody('live'));
  const j = await bodyJson(res);
  return { pass: res.status === 401 && errCode(j) === 'UNAUTHORIZED', detail: `HTTP ${res.status}; ${errCode(j)}` };
});

await check('POST /api/transcribe without code -> 401', async () => {
  const res = await req('/api/transcribe', { method: 'POST', body: transcribeForm() });
  const j = await bodyJson(res);
  return { pass: res.status === 401 && errCode(j) === 'UNAUTHORIZED', detail: `HTTP ${res.status}; ${errCode(j)}` };
});

await check('POST /api/speech without code -> 401', async () => {
  const res = await postJson('/api/speech', speechBody());
  const j = await bodyJson(res);
  // An unconfigured voice answers NOT_CONFIGURED before the access gate; nothing paid can run then.
  if (status && status.speech?.configured === false) {
    return { pass: res.status === 503 && errCode(j) === 'NOT_CONFIGURED', detail: `speech not configured: HTTP ${res.status}; ${errCode(j)} (401 gate not reachable)` };
  }
  return { pass: res.status === 401 && errCode(j) === 'UNAUTHORIZED', detail: `HTTP ${res.status}; ${errCode(j)}` };
});

for (const [path, type] of [['/wasm/vision_wasm_internal.wasm', 'application/wasm'], ['/models/face_landmarker.task', null]]) {
  await check(`GET ${path} (200, immutable)`, async () => {
    const res = await req(path);
    const cc = res.headers.get('cache-control') ?? '';
    const ct = res.headers.get('content-type') ?? '';
    const len = res.headers.get('content-length') ?? '?';
    await res.body?.cancel().catch(() => {});
    const immutable = cc.includes('immutable') && cc.includes('max-age=31536000');
    const typeOk = !type || ct.startsWith(type);
    return { pass: res.status === 200 && immutable && typeOk, detail: `HTTP ${res.status}; ${len} bytes; ${ct || 'no content-type'}; cache=${immutable ? 'immutable 1y' : cc || 'none'}` };
  });
}

// --- Report -------------------------------------------------------------------------------
const w = Math.max(...results.map((r) => r.name.length));
console.log(`\nStill Here smoke: ${base}  (${new Date().toISOString()})  live=${live} accessCode=${accessCode ? 'provided' : 'none'}\n`);
console.log(`${'Check'.padEnd(w)}  Result  Detail`);
console.log(`${'-'.repeat(w)}  ------  ${'-'.repeat(40)}`);
for (const r of results) console.log(`${r.name.padEnd(w)}  ${r.status.padEnd(6)}  ${r.detail}`);
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count('PASS')} pass, ${count('FAIL')} fail, ${count('SKIP')} skip`);
process.exit(count('FAIL') ? 1 : 0);
