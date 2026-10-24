import 'server-only';
// Request guards for the paid endpoints: access gate, size limits, and a per-process rate limiter.
// The in-memory limiter is suitable for one local process only; it is not a distributed cap.
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

function isLocalHost(request: Request): boolean {
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

// Paid endpoints require the access code when APP_ACCESS_TOKEN is set, and refuse
// non-local hosts entirely when it is not set.
export function checkAccess(request: Request, cfg: ServerConfig): 'ok' | 'denied' | 'unprotected-remote' {
  if (cfg.accessToken) {
    const given = request.headers.get(ACCESS_HEADER) ?? '';
    const a = Buffer.from(given);
    const b = Buffer.from(cfg.accessToken);
    return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'denied';
  }
  return isLocalHost(request) ? 'ok' : 'unprotected-remote';
}

const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function clientKey(request: Request): string {
  return (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
}

export async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) return null;
  return new TextDecoder().decode(buf);
}

// Content-free logging: request id, route, outcome code, duration.
export function logRequest(route: string, requestId: string, outcome: string, startedAt: number) {
  console.info(JSON.stringify({ route, requestId, outcome, ms: Date.now() - startedAt }));
}
