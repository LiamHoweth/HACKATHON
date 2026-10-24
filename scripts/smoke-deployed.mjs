#!/usr/bin/env node
// Fast pre-demo check of the deployed server. macOS only (uses `say` + `afconvert`), Node 24, no deps.
//   node scripts/smoke-deployed.mjs [base-url]     (default https://api-production-18038.up.railway.app)
// 5 API calls total, run concurrently, under ~30 s. Exit 0 only if every line says PASS.
// The access code is read from .env.railway.local (RAILWAY_APP_ACCESS_TOKEN) into memory only and is never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || 'https://api-production-18038.up.railway.app').replace(/\/+$/, '');
const ACCESS_HEADER = 'x-still-here-access';
const TIMEOUT_MS = 25_000;
const QUESTION = 'Are you coming to dinner tonight?';

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
const envFile = '.env.railway.local';
const accessCode = readEnvValue(envFile, 'RAILWAY_APP_ACCESS_TOKEN') || readEnvValue(envFile, 'APP_ACCESS_TOKEN');
if (!accessCode) { console.error(`No RAILWAY_APP_ACCESS_TOKEN in ${envFile}.`); process.exit(2); }
const scrub = (s) => String(s).split(accessCode).join('[redacted]');
const auth = { [ACCESS_HEADER]: accessCode };
const sig = () => AbortSignal.timeout(TIMEOUT_MS);

// Each check resolves to { ok, ms, detail }; exceptions become FAIL lines.
async function timed(fn) {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { ok: !!r.ok, ms: Math.round(performance.now() - t0), detail: r.detail ?? '', extra: r.extra };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), detail: scrub(e?.name === 'TimeoutError' ? 'timeout' : e?.message ?? e).slice(0, 80) };
  }
}
const json = async (res) => { try { return JSON.parse(await res.text()); } catch { return null; } };

const checks = [];
const add = (name, fn) => checks.push({ name, p: timed(fn) });

let rootHeaders = null;
const rootP = timed(async () => {
  const res = await fetch(`${base}/`, { signal: sig(), cache: 'no-store' });
  rootHeaders = res.headers;
  const type = res.headers.get('content-type') ?? '';
  const body = await res.text();
  return { ok: res.status === 200 && type.includes('text/html') && /<html/i.test(body), detail: `HTTP ${res.status} ${type.split(';')[0]}` };
});
checks.push({ name: 'GET /', p: rootP });

add('GET /api/status', async () => {
  const res = await fetch(`${base}/api/status`, { headers: auth, signal: sig(), cache: 'no-store' });
  const d = await json(res);
  const flags = { replies: d?.replies?.configured, transcription: d?.transcription?.configured, speech: d?.speech?.configured };
  const ok = res.ok && Object.values(flags).every((v) => v === true) && d?.accessCodeValid === true;
  return { ok, detail: `HTTP ${res.status} ${Object.entries(flags).map(([k, v]) => `${k}=${v}`).join(' ')} codeValid=${d?.accessCodeValid}` };
});

add('POST /api/replies', async () => {
  const sessionEpoch = randomUUID();
  const body = {
    identity: { sessionEpoch, workspaceId: randomUUID(), requestId: randomUUID(), contextRevision: 1, preferenceRevision: 0 },
    mode: 'live',
    anchor: { mode: 'reply', turnId: randomUUID(), turnContentRevision: 0 },
    activePartnerText: QUESTION,
    language: 'en-US',
    recentConversation: [{ role: 'partner', text: QUESTION, source: 'partner-transcribed' }],
    approvedProfile: [],
    guidance: { intent: null, wording: [], userTopicOrSeed: null, scope: { relationship: null, setting: null } },
    approvedPreferences: [], sessionStyleHints: [], rejected: [], refineTarget: null,
    lengthPolicy: { maxWords: 24, maxCharacters: 160 },
  };
  const res = await fetch(`${base}/api/replies`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify(body), signal: sig() });
  const d = await json(res);
  const texts = Array.isArray(d?.data?.candidates) ? d.data.candidates.map((c) => c.text) : [];
  return { ok: res.ok && d?.ok === true && texts.length === 3, detail: `HTTP ${res.status} ${texts.length} candidates`, extra: texts };
});

add('POST /api/speech', async () => {
  const body = { utteranceId: randomUUID(), reviewSnapshotId: randomUUID(), sessionEpoch: randomUUID(), exactText: "Yeah, I'm down.", voiceChoiceId: null };
  const res = await fetch(`${base}/api/speech`, { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify(body), signal: sig(), cache: 'no-store' });
  const type = res.headers.get('content-type') ?? '';
  const bytes = (await res.arrayBuffer()).byteLength;
  return { ok: res.ok && type.startsWith('audio/mpeg') && bytes > 1024, detail: `HTTP ${res.status} ${type.split(';')[0]} ${bytes} bytes` };
});

const dir = mkdtempSync(join(tmpdir(), 'smoke-deployed-'));
add('POST /api/transcribe', async () => {
  const aiff = join(dir, 'q.aiff'); const m4a = join(dir, 'q.m4a');
  execFileSync('say', ['-o', aiff, QUESTION]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', aiff, m4a]);
  const form = new FormData();
  form.append('audio', new File([readFileSync(m4a)], 'q.m4a', { type: 'audio/mp4' }));
  form.append('captureId', randomUUID());
  form.append('sessionEpoch', randomUUID());
  const res = await fetch(`${base}/api/transcribe`, { method: 'POST', body: form, headers: auth, signal: sig() });
  const d = await json(res);
  const text = typeof d?.data?.text === 'string' ? d.data.text.trim() : '';
  return { ok: res.ok && d?.ok === true && text.length > 0, detail: `HTTP ${res.status} "${text.slice(0, 50)}"` };
});

const results = [];
for (const c of checks) results.push({ name: c.name, ...(await c.p) });
rmSync(dir, { recursive: true, force: true });

// Security headers come from the GET / response (no extra call).
{
  const pp = rootHeaders?.get('permissions-policy') ?? '';
  const ok = /camera=\(self\)/.test(pp) && /microphone=\(self\)/.test(pp);
  results.push({ name: 'Permissions-Policy on /', ok, ms: 0, detail: pp ? scrub(pp).slice(0, 80) : 'header missing' });
}

for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.ms}ms ${scrub(r.detail)}`);
  if (r.name === 'POST /api/replies' && Array.isArray(r.extra)) r.extra.forEach((t, i) => console.log(`     ${i + 1}. ${scrub(t)}`));
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} check(s) FAILED against ${base}` : `\nAll ${results.length} checks PASSED against ${base}`);
process.exit(failed ? 1 : 0);
