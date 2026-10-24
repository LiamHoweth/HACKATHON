import { serverConfig } from '@/server/config';
import { synthesize, type SynthesisFailureKind } from '@/server/elevenlabs/client';
import { MAX_SPEECH_BODY_BYTES, reserveCharacters, speechRequestSchema } from '@/server/elevenlabs/speech-request';
import { approvedVoiceId } from '@/server/elevenlabs/voices';
import { checkAccess, clientKey, failure, rateLimit, readBoundedText } from '@/server/request-guards';
import type { ApiError } from '@/core/types';

const SPEECH_RATE_LIMIT_PER_MIN = 40;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Content-free log line: route, utterance id, outcome, duration, character count. Never the text.
function log(utteranceId: string, outcome: string, startedAt: number, chars: number | null) {
  console.info(JSON.stringify({ route: 'speech', requestId: utteranceId, outcome, ms: Date.now() - startedAt, chars }));
}

const FAILURES: Record<SynthesisFailureKind, { code: ApiError['code']; status: number; message: string; recoverable: boolean }> = {
  auth: { code: 'PROVIDER_UNAVAILABLE', status: 502, message: 'The voice service rejected this server’s credentials.', recoverable: false },
  quota: { code: 'RATE_LIMITED', status: 429, message: 'The voice service quota is used up.', recoverable: false },
  rate: { code: 'RATE_LIMITED', status: 429, message: 'The voice service is busy. Wait a moment.', recoverable: true },
  voice: { code: 'PROVIDER_UNAVAILABLE', status: 502, message: 'The selected voice is not available.', recoverable: false },
  timeout: { code: 'TIMEOUT', status: 502, message: 'The voice service took too long.', recoverable: true },
  aborted: { code: 'NETWORK', status: 499, message: 'Speech request was cancelled.', recoverable: true },
  malformed: { code: 'PROVIDER_UNAVAILABLE', status: 502, message: 'The voice service returned unusable audio.', recoverable: true },
  'too-long': { code: 'INVALID_INPUT', status: 400, message: 'This message is too long for the natural voice. Shorten it or use the basic device voice.', recoverable: true },
  rejected: { code: 'PROVIDER_UNAVAILABLE', status: 502, message: 'The voice service refused this request.', recoverable: false },
  unavailable: { code: 'PROVIDER_UNAVAILABLE', status: 502, message: 'The voice service is unavailable.', recoverable: true },
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const cfg = serverConfig();
  const body = await readBoundedText(request, MAX_SPEECH_BODY_BYTES);
  if (body === null) return failure('unknown', 'INVALID_INPUT', 'Request too large.', 413, false);

  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return failure('unknown', 'INVALID_INPUT', 'Request was not valid JSON.', 400, false); }
  const parsed = speechRequestSchema.safeParse(raw);
  if (!parsed.success) {
    log('unknown', 'INVALID_INPUT', startedAt, null);
    return failure('unknown', 'INVALID_INPUT', 'The speech request was not valid.', 400, false);
  }
  const req = parsed.data;
  const id = req.utteranceId;
  const chars = req.exactText.length;

  if (!cfg.speechConfigured) {
    log(id, 'NOT_CONFIGURED', startedAt, chars);
    return failure(id, 'NOT_CONFIGURED', 'Natural voice is not configured. Use the basic device voice.', 503, false);
  }
  const access = checkAccess(request, cfg);
  if (access !== 'ok') {
    log(id, 'UNAUTHORIZED', startedAt, chars);
    return failure(id, 'UNAUTHORIZED', access === 'throttled' ? 'Too many incorrect access codes. Wait and try again.' : access === 'denied' ? 'Access code required for natural voice.' : 'Natural voice on a deployed server requires APP_ACCESS_TOKEN to be configured.', 401, false);
  }
  // 40/min per client: fast mode prefetches the 3 suggestions of every turn plus the spoken line.
  if (!rateLimit(`speech:${clientKey(request)}`, SPEECH_RATE_LIMIT_PER_MIN, 60_000)) {
    log(id, 'RATE_LIMITED', startedAt, chars);
    return failure(id, 'RATE_LIMITED', 'Too many requests. Wait a moment.', 429);
  }
  const voiceId = approvedVoiceId(req.voiceChoiceId, cfg);
  if (!voiceId) {
    log(id, 'INVALID_VOICE', startedAt, chars);
    return failure(id, 'INVALID_INPUT', 'That voice is not available.', 400, false);
  }
  if (!reserveCharacters(chars, cfg.elevenLabsDailyCharBudget)) {
    log(id, 'BUDGET_EXHAUSTED', startedAt, chars);
    return failure(id, 'RATE_LIMITED', 'Today’s natural voice budget is used up. Use the basic device voice.', 429, false);
  }

  // Exactly the confirmed text goes to the provider. Nothing is added, trimmed, or tagged.
  const result = await synthesize({ text: req.exactText, voiceId }, cfg, request.signal);
  if (!result.ok) {
    const f = FAILURES[result.kind];
    log(id, `${f.code}:${result.kind}`, startedAt, chars);
    return failure(id, f.code, f.message, f.status, f.recoverable);
  }
  log(id, `ok:${result.transport}`, startedAt, chars);
  return new Response(new Blob([result.audio as Uint8Array<ArrayBuffer>], { type: 'audio/mpeg' }), {
    status: 200,
    headers: {
      'content-type': 'audio/mpeg',
      'content-length': String(result.audio.byteLength),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-still-here-model': result.model,
      'x-still-here-utterance-id': encodeURIComponent(id),
    },
  });
}
