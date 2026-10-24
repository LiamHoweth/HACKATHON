import { serverConfig } from '@/server/config';
import { transcribe } from '@/server/transcription';
import { checkAccess, clientKey, failure, json, logRequest, rateLimit } from '@/server/request-guards';

export const dynamic = 'force-dynamic';

const ALLOWED = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-m4a'];

export async function POST(request: Request) {
  const startedAt = Date.now();
  const cfg = serverConfig();
  // Enforce size before parsing (allow some multipart overhead).
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!declared || declared > cfg.maxAudioBytes + 64_000) return failure('unknown', 'INVALID_INPUT', 'Recording is missing or too large.', 413, false);
  if (!cfg.transcriptionConfigured) return failure('unknown', 'NOT_CONFIGURED', 'Transcription is not configured. Type instead.', 503, false);
  const access = checkAccess(request, cfg);
  if (access !== 'ok') return failure('unknown', 'UNAUTHORIZED', 'Access code required for transcription.', 401, false);
  if (!rateLimit(`transcribe:${clientKey(request)}`, 20, 60_000)) return failure('unknown', 'RATE_LIMITED', 'Too many recordings. Wait a moment.', 429);

  let form: FormData;
  try { form = await request.formData(); } catch { return failure('unknown', 'INVALID_INPUT', 'Could not read the recording.', 400, false); }
  const captureId = String(form.get('captureId') ?? '').slice(0, 80);
  const audio = form.get('audio');
  if (!captureId || !(audio instanceof File)) return failure(captureId || 'unknown', 'INVALID_INPUT', 'Recording is missing.', 400, false);
  const baseType = audio.type.split(';')[0].trim().toLowerCase();
  if (audio.size === 0) return failure(captureId, 'INVALID_INPUT', 'The recording was empty.', 400, false);
  if (audio.size > cfg.maxAudioBytes || !ALLOWED.includes(baseType)) return failure(captureId, 'INVALID_INPUT', 'Unsupported or oversized recording.', 400, false);

  const result = await transcribe(audio, cfg, request.signal);
  logRequest('transcribe', captureId, result.ok ? 'ok' : result.code, startedAt);
  if (!result.ok) return failure(captureId, result.code, result.message, 502);
  return json({ ok: true, requestId: captureId, data: { captureId, text: result.text } });
}
