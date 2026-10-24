import 'server-only';
// Server-side Text to Dialogue (TTD) WebSocket client for one short confirmed utterance.
// Protocol (ElevenLabs docs, checked 2026-10-24; see ./README.md):
//   wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=…&output_format=…
//   → {"voices":[id],"xi_api_key":key}       first message registers the voice and authenticates
//   → {"inputs":[{"text","voice_id"}],"flush":true}
//   → {"close_socket":true}                   flush, remaining audio, then a final frame
//   ← {"audio":"<base64>", …}                 audio chunks
//   ← {"is_final":true}                       end of the closing flush
//   ← {"error":"<id>","message":…,"code":n}   error, followed by a close
// The key travels in the first message (not the URL) because Node's global WebSocket cannot set
// request headers. This is never the ordinary TTS `/v1/text-to-speech/{id}/stream-input` socket.
import type { ServerConfig } from '../config';
import { classifyProviderError, ELEVENLABS_WS, MAX_AUDIO_BYTES, SynthesisError, type SynthesisInput } from './shared';

type Listener = (event: { data?: unknown; code?: number }) => void;
export type WebSocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: Listener): void;
};
export type WebSocketFactory = (url: string) => WebSocketLike;

const defaultFactory: WebSocketFactory = (url) => new WebSocket(url) as unknown as WebSocketLike;

export function dialogueSocketUrl(cfg: Pick<ServerConfig, 'elevenLabsModelId' | 'elevenLabsOutputFormat'>): string {
  const q = new URLSearchParams({ model_id: cfg.elevenLabsModelId, output_format: cfg.elevenLabsOutputFormat });
  return `${ELEVENLABS_WS}/v1/text-to-dialogue/stream-input?${q.toString()}`;
}

function frameText(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return null;
}

export function synthesizeDialogueWs(input: SynthesisInput, cfg: ServerConfig, signal: AbortSignal, factory: WebSocketFactory = defaultFactory): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    if (signal.aborted) { reject(new SynthesisError('aborted')); return; }
    const chunks: Uint8Array[] = [];
    let total = 0;
    let settled = false;
    let ws: WebSocketLike;
    const finish = (err: SynthesisError | null) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      try { ws?.close(1000); } catch { /* already closed */ }
      if (err) { reject(err); return; }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
      resolve(out);
    };
    const onAbort = () => finish(new SynthesisError('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });

    try { ws = factory(dialogueSocketUrl(cfg)); } catch { finish(new SynthesisError('unavailable')); return; }

    ws.addEventListener('open', () => {
      try {
        ws.send(JSON.stringify({ voices: [input.voiceId], xi_api_key: cfg.elevenLabsKey }));
        // Exactly the confirmed text: no tags, SSML, or added words. One voice for v4 Turbo.
        ws.send(JSON.stringify({ inputs: [{ text: input.text, voice_id: input.voiceId }], flush: true }));
        ws.send(JSON.stringify({ close_socket: true }));
      } catch { finish(new SynthesisError('unavailable')); }
    });
    ws.addEventListener('message', (event) => {
      if (settled) return;
      const text = frameText(event.data);
      if (text === null) { finish(new SynthesisError('malformed')); return; }
      let msg: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
        msg = parsed as Record<string, unknown>;
      } catch { finish(new SynthesisError('malformed')); return; }
      if (msg.error) {
        // Classify from the machine identifier only; the provider message is not kept.
        finish(new SynthesisError(classifyProviderError(typeof msg.error === 'string' ? msg.error : 'unknown')));
        return;
      }
      if (typeof msg.audio === 'string' && msg.audio.length > 0) {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(msg.audio)) { finish(new SynthesisError('malformed')); return; }
        const bytes = Buffer.from(msg.audio, 'base64');
        total += bytes.byteLength;
        if (total > MAX_AUDIO_BYTES) { finish(new SynthesisError('malformed')); return; }
        chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      }
      if (msg.is_final === true) finish(null);
    });
    ws.addEventListener('error', () => finish(new SynthesisError('unavailable')));
    // A close before `is_final` means the utterance may be incomplete: never return partial audio.
    // Close codes are not mapped: the docs send an `error` frame first when there is a reason.
    ws.addEventListener('close', () => finish(new SynthesisError('unavailable')));
  });
}
