#!/usr/bin/env node
// Opt-in, bounded live scenario run (master prompt §30). Sends 14 synthetic requests to a
// locally running server in live mode and writes outputs for human review. Costs money:
// run only when a live key is configured and you intend to spend on it.
//   npm run dev   (in another terminal, with .env.local configured)
//   node scripts/live-scenarios.mjs [--base http://localhost:3000] [--out docs/evidence/live-scenarios.json]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name, d) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : d;
};
const base = arg('--base', 'http://localhost:3000');
const out = arg('--out', 'docs/evidence/live-scenarios.json');

import { scenarios } from './live-scenarios-data.mjs';

const results = [];
for (const [name, body] of scenarios) {
  const started = Date.now();
  let result;
  try {
    const res = await fetch(`${base}/api/replies`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    result = await res.json();
  } catch (e) {
    result = { ok: false, error: { code: 'NETWORK', message: String(e) } };
  }
  results.push({
    scenario: name, ms: Date.now() - started, ok: result.ok,
    source: result.data?.source ?? null, model: result.data?.model ?? null, repaired: result.data?.repaired ?? null,
    candidates: result.data?.candidates ?? null, error: result.ok ? null : result.error,
    humanJudgment: 'not reviewed',
  });
  console.log(`${name}: ${result.ok ? result.data.candidates.map((c) => c.text).join(' | ') : result.error?.code}`);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), base, results }, null, 2) + '\n');
console.log(`Wrote ${out}. Fill in humanJudgment for each scenario before citing results.`);
