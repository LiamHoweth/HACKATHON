#!/usr/bin/env node
// Latency benchmark for the reply provider (partner line -> 3 validated suggestions). Calls the real
// generateLive() (prompt + provider + validation + repair) directly, bypassing the HTTP route, and wraps
// fetch to record each upstream OpenAI call's time and token usage. Costs money; keep runs small.
//   node --import ./scripts/ts-register.mjs --env-file=.env.local scripts/latency-replies.mjs \
//        [--label baseline] [--reps 1] [--only 1,2,3] [--out path.json] [--branching] [--path 'Label|Summary']
// --branching asks for 2 replies + 3-5 paths; --path sends a pathHint (3 replies in that direction).
// Environment overrides (REPLY_MODEL, REPLY_REASONING_EFFORT, REPLY_MAX_OUTPUT_TOKENS, ...) take precedence over the env file.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { scenarios } from './live-scenarios-data.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const label = arg('--label', 'run');
const reps = Number(arg('--reps', '1'));
const only = arg('--only', '') ? arg('--only', '').split(',').map(Number) : null;
const out = arg('--out', null);
const branching = process.argv.includes('--branching');
const pathArg = arg('--path', null);
const pathHint = pathArg ? { label: pathArg.split('|')[0], summary: pathArg.split('|')[1] ?? pathArg } : null;

const { serverConfig } = await import('../src/server/config.ts');
const { generateLive } = await import('../src/server/provider.ts');
const cfg = serverConfig();

const upstream = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const t = performance.now();
  const res = await realFetch(url, init);
  const entry = { ms: Math.round(performance.now() - t), status: res.status };
  upstream.push(entry);
  try {
    const j = await res.clone().json();
    entry.usage = j.usage ? { in: j.usage.input_tokens, out: j.usage.output_tokens, reasoning: j.usage.output_tokens_details?.reasoning_tokens } : null;
    if (!res.ok) entry.error = j.error?.message?.slice(0, 200) ?? null;
  } catch { /* ignore */ }
  return res;
};

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const rows = [];
for (let r = 0; r < reps; r++) {
  for (const [name, body] of scenarios) {
    const n = Number(name.split(' ')[0]);
    if (only && !only.includes(n)) continue;
    upstream.length = 0;
    const started = performance.now();
    const res = await generateLive({ ...body, identity: { ...body.identity, requestId: `lat-${n}-${r}` }, ...(branching ? { branching: true } : {}), ...(pathHint ? { pathHint } : {}) }, cfg, new AbortController().signal);
    const ms = Math.round(performance.now() - started);
    rows.push({
      scenario: name, rep: r, ms, ok: res.ok, repaired: res.ok ? res.data.repaired : null, calls: [...upstream],
      candidates: res.ok ? res.data.candidates : null, paths: res.ok ? res.data.paths ?? null : null, error: res.ok ? null : res.error,
    });
    console.log(`${name} [${ms} ms${res.ok && res.data.repaired ? ', repaired' : ''}] ${res.ok ? res.data.candidates.map((c) => c.text).join(' | ') + (res.data.paths ? ` || paths: ${res.data.paths.map((p) => `${p.label} (${p.summary})`).join('; ')}` : '') : res.error.code}${upstream.find((u) => u.error) ? ' UPSTREAM: ' + upstream.find((u) => u.error).error : ''}`);
  }
}
const okMs = rows.filter((x) => x.ok).map((x) => x.ms);
const allMs = rows.map((x) => x.ms);
const outTok = rows.flatMap((x) => x.calls.map((c) => c.usage?.out).filter((v) => typeof v === 'number'));
const summary = {
  label, n: rows.length, valid: rows.filter((x) => x.ok).length, repaired: rows.filter((x) => x.repaired).length,
  medianMs: pct(okMs, 0.5), p90Ms: pct(okMs, 0.9), meanMs: Math.round(okMs.reduce((a, b) => a + b, 0) / (okMs.length || 1)), maxMs: Math.max(...allMs),
  medianOutputTokens: outTok.length ? pct(outTok, 0.5) : null,
  settings: { model: cfg.replyModel, reasoningEffort: cfg.replyReasoningEffort || '(unset)', maxOutputTokens: cfg.replyMaxOutputTokens ?? 4000, timeoutMs: cfg.generationTimeoutMs },
};
console.log(JSON.stringify(summary));
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), summary, rows }, null, 2) + '\n');
}
