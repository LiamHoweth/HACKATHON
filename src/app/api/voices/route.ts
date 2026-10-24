import { serverConfig } from '@/server/config';
import { listApprovedVoices } from '@/server/elevenlabs/voices';
import { checkAccess, clientKey, failure, json, rateLimit } from '@/server/request-guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Server-approved ElevenLabs voices only (ELEVENLABS_VOICE_ID + ELEVENLABS_ALLOWED_VOICE_IDS).
export async function GET(request: Request) {
  const cfg = serverConfig();
  const requestId = 'voices';
  if (!cfg.speechConfigured) return failure(requestId, 'NOT_CONFIGURED', 'Natural voice is not configured.', 503, false);
  const access = checkAccess(request, cfg);
  if (access !== 'ok') {
    return failure(requestId, 'UNAUTHORIZED', access === 'throttled' ? 'Too many incorrect access codes. Wait and try again.' : 'Access code required for natural voice.', 401, false);
  }
  if (!rateLimit(`voices:${clientKey(request)}`, 30, 60_000)) return failure(requestId, 'RATE_LIMITED', 'Too many requests. Wait a moment.', 429);
  const voices = await listApprovedVoices(cfg);
  return json({ ok: true, requestId, data: { voices, defaultVoiceId: cfg.elevenLabsVoiceId } });
}
