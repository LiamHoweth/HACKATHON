import 'server-only';
// ElevenLabs speech adapter: picks the documented endpoint for the configured model, enforces
// the timeout and cancellation, and maps provider failures to content-free kinds. Endpoint
// facts and their sources are in ./README.md. Never log the text or the key.
import type { ServerConfig } from '../config';
import { synthesizeDialogueWs, type WebSocketFactory } from './tts-dialogue-ws';
import { synthesizeHttp } from './tts-http';
import { deadline, looksLikeMp3, MAX_AUDIO_BYTES, SynthesisError, type SynthesisInput, type SynthesisResult } from './shared';

export * from './shared';

export type SynthesisDeps = {
  fetch?: typeof fetch;
  createWebSocket?: WebSocketFactory;
};

/**
 * Model → endpoint routing, per the current ElevenLabs model docs:
 * - `eleven_v4_turbo*` is available only on the Text to Dialogue WebSocket.
 * - other `eleven_v4*` / `eleven_v3*` models use the TTD WebSocket or `POST /v1/text-to-dialogue`.
 * - everything else (`eleven_flash_v2_5`, `eleven_multilingual_v2`) uses `POST /v1/text-to-speech/{voice_id}`.
 * The ordinary TTS `stream-input` WebSocket is never used.
 */
export type Route = { transport: 'ws' } | { transport: 'http'; endpoint: 'dialogue' | 'tts' };
export function routeFor(modelId: string, preferred: 'ws' | 'http'): Route {
  const dialogueModel = /^eleven_v[34]/.test(modelId);
  if (/^eleven_v4_turbo/.test(modelId)) return { transport: 'ws' };
  if (dialogueModel) return preferred === 'ws' ? { transport: 'ws' } : { transport: 'http', endpoint: 'dialogue' };
  return { transport: 'http', endpoint: 'tts' };
}

/** Sends exactly `input.text` (no tags, SSML or added words) and returns the complete MP3. */
export async function synthesize(input: SynthesisInput, cfg: ServerConfig, signal?: AbortSignal, deps: SynthesisDeps = {}): Promise<SynthesisResult> {
  const route = routeFor(cfg.elevenLabsModelId, cfg.elevenLabsTransport);
  const d = deadline(signal, cfg.elevenLabsTimeoutMs);
  try {
    const audio = route.transport === 'ws'
      ? await synthesizeDialogueWs(input, cfg, d.signal, deps.createWebSocket)
      : await synthesizeHttp(input, cfg, route.endpoint, d.signal, deps.fetch ?? fetch);
    if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES || !looksLikeMp3(audio)) return { ok: false, kind: 'malformed' };
    return { ok: true, audio, model: cfg.elevenLabsModelId, transport: route.transport };
  } catch (e) {
    if (d.signal.aborted) return { ok: false, kind: d.kind() };
    if (e instanceof SynthesisError) return { ok: false, kind: e.kind };
    return { ok: false, kind: 'unavailable' };
  } finally {
    d.done();
  }
}
