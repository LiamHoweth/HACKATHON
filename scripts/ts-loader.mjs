// Node module hooks so scripts can import src/**/*.ts directly: resolves the "@/" alias, extensionless
// relative imports, and stubs "server-only". Used by scripts/latency-replies.mjs only.
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve as pathResolve } from 'node:path';

export function initialize() {}
const root = pathResolve(fileURLToPath(new URL('..', import.meta.url)));
const tryExt = (p) => ['.ts', '.tsx', '/index.ts'].map((e) => p + e).find(existsSync);

export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const hit = tryExt(pathResolve(root, 'src', specifier.slice(2)));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const hit = tryExt(pathResolve(fileURLToPath(new URL('.', context.parentURL)), specifier));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return next(specifier, context);
}
