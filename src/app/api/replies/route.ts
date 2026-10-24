import { replyRequestSchema } from '@/core/schemas';
import type { ReplyRequest } from '@/core/types';
import { LIMITS } from '@/core/limits';
import { serverConfig } from '@/server/config';
import { fixtureReplies } from '@/server/fixtures';
import { generateLive } from '@/server/provider';
import { checkAccess, clientKey, failure, json, logRequest, rateLimit, readBoundedText } from '@/server/request-guards';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const startedAt = Date.now();
  const cfg = serverConfig();
  const body = await readBoundedText(request, LIMITS.maxRequestBytes);
  if (body === null) return failure('unknown', 'INVALID_INPUT', 'Request too large.', 413, false);

  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return failure('unknown', 'INVALID_INPUT', 'Request was not valid JSON.', 400, false); }
  const parsed = replyRequestSchema.safeParse(raw);
  const requestId = typeof (raw as { identity?: { requestId?: unknown } })?.identity?.requestId === 'string'
    ? String((raw as { identity: { requestId: string } }).identity.requestId).slice(0, 80) : 'unknown';
  if (!parsed.success) {
    logRequest('replies', requestId, 'INVALID_INPUT', startedAt);
    return failure(requestId, 'INVALID_INPUT', 'The suggestion request was not valid.', 400, false);
  }
  const req = parsed.data as ReplyRequest;

  if (req.mode === 'fixture') {
    if (!cfg.fixturesEnabled) return failure(requestId, 'NOT_CONFIGURED', 'Fixture mode is disabled on this server.', 400, false);
    logRequest('replies', requestId, 'fixture', startedAt);
    return json({ ok: true, requestId, data: fixtureReplies(req) });
  }

  // Live mode: validate everything before any paid inference.
  if (!cfg.repliesConfigured) return failure(requestId, 'NOT_CONFIGURED', 'Live AI is not configured. Use fixture demo or your own words.', 503, false);
  const access = checkAccess(request, cfg);
  if (access !== 'ok') {
    logRequest('replies', requestId, 'UNAUTHORIZED', startedAt);
    return failure(requestId, 'UNAUTHORIZED', access === 'denied' ? 'Access code required for live AI.' : 'Live AI is only available locally unless an access code is configured.', 401, false);
  }
  if (!rateLimit(`replies:${clientKey(request)}`, 30, 60_000)) return failure(requestId, 'RATE_LIMITED', 'Too many requests. Wait a moment.', 429);

  const result = await generateLive(req, cfg, request.signal);
  logRequest('replies', requestId, result.ok ? 'live-ok' : result.error.code, startedAt);
  if (!result.ok) return failure(requestId, result.error.code, result.error.message, 502, result.error.recoverable);
  return json({ ok: true, requestId, data: result.data });
}
