import 'server-only';
// Request guards for the API: access gate, size limits, and a per-process rate limiter.
// The in-memory limiter is suitable for one instance only; it is not a distributed cap.
import { timingSafeEqual } from 'node:crypto';
import type { ApiError, ApiResult } from '@/core/types';
import type { ServerConfig } from './config';

export const ACCESS_HEADER = 'x-still-here-access';

export function json<T>(body: ApiResult<T> | object, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export function failure(requestId: string, code: ApiError['code'], message: string, status: number, recoverable = true): Response {
  return json({ ok: false, requestId, error: { code, message, recoverable } }, status);
}

function isLocalDevHost(request: Request): boolean {
  // Production builds (Railway, `next start`) never trust the Host header for access.
  if (process.env.NODE_ENV === 'production') return false;
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

export function accessCodeMatches(request: Request, cfg: ServerConfig): boolean {
  if (!cfg.accessToken) return false;
  const a = Buffer.from(request.headers.get(ACCESS_HEADER) ?? '');
  const b = Buffer.from(cfg.accessToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Paid endpoints require the access code when APP_ACCESS_TOKEN is set. Without one, they
// work only from a local development server.
export function checkAccess(request: Request, cfg: ServerConfig): 'ok' | 'denied' | 'unprotected-remote' {
  if (cfg.accessToken) return accessCodeMatches(request, cfg) ? 'ok' : 'denied';
  return isLocalDevHost(request) ? 'ok' : 'unprotected-remote';
}

const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

// Railway's proxy sets X-Real-IP and appends the client address to X-Forwarded-For; the
// first X-Forwarded-For entry is client-controlled, so prefer X-Real-IP, then the last entry.
export function clientKey(request: Request): string {
  const real = (request.headers.get('x-real-ip') ?? '').trim();
  if (real) return real;
  const xff = (request.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || 'local';
}

// Reads at most maxBytes, stopping early instead of buffering an oversized or chunked body.
export async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(buf);
}

// Content-free logging: request id, route, outcome code, duration.
export function logRequest(route: string, requestId: string, outcome: string, startedAt: number) {
  console.info(JSON.stringify({ route, requestId, outcome, ms: Date.now() - startedAt }));
}
