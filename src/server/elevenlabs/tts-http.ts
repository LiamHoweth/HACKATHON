import 'server-only';
// HTTP fallback transports (ElevenLabs docs, checked 2026-10-24; see ./README.md):
// - POST /v1/text-to-dialogue?output_format=…  body {inputs:[{text,voice_id}], model_id}  (eleven_v4, eleven_v3)
// - POST /v1/text-to-speech/{voice_id}?output_format=…  body {text, model_id}  (eleven_flash_v2_5, eleven_multilingual_v2)
// Both authenticate with the `xi-api-key` header and return the audio file in the body.
import type { ServerConfig } from '../config';
import { classifyProviderError, ELEVENLABS_API, MAX_AUDIO_BYTES, SynthesisError, type SynthesisFailureKind, type SynthesisInput } from './shared';

export function httpRequestFor(input: SynthesisInput, cfg: ServerConfig, endpoint: 'dialogue' | 'tts'): { url: string; body: string } {
  const q = new URLSearchParams({ output_format: cfg.elevenLabsOutputFormat }).toString();
  if (endpoint === 'dialogue') {
    return {
      url: `${ELEVENLABS_API}/v1/text-to-dialogue?${q}`,
      body: JSON.stringify({ inputs: [{ text: input.text, voice_id: input.voiceId }], model_id: cfg.elevenLabsModelId }),
    };
  }
  return {
    url: `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?${q}`,
    body: JSON.stringify({ text: input.text, model_id: cfg.elevenLabsModelId }),
  };
}

async function readBounded(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

/** Extracts only machine-readable identifiers from an error body; the message text is dropped. */
async function errorIdentifier(res: Response): Promise<string> {
  try {
    const bytes = await readBounded(res, 8_000);
    if (!bytes) return '';
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { detail?: unknown };
    const d = body.detail;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const status = (d as { status?: unknown; code?: unknown }).status ?? (d as { code?: unknown }).code;
      return typeof status === 'string' ? status : '';
    }
    if (Array.isArray(d)) {
      return d.map((x) => {
        const loc = Array.isArray((x as { loc?: unknown }).loc) ? (x as { loc: unknown[] }).loc.join('.') : '';
        const type = typeof (x as { type?: unknown }).type === 'string' ? (x as { type: string }).type : '';
        return `${loc} ${type}`;
      }).join(' ');
    }
  } catch { /* unparseable body: classify by status only */ }
  return '';
}

export function kindForStatus(status: number, identifier: string): SynthesisFailureKind {
  const fromId = identifier ? classifyProviderError(identifier) : null;
  if (fromId === 'quota' || fromId === 'voice') return fromId;
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status === 404) return 'voice';
  if (status === 400 || status === 422) return fromId && fromId !== 'unavailable' ? fromId : 'rejected';
  if (status === 408 || status === 504) return 'timeout';
  return 'unavailable';
}

export async function synthesizeHttp(input: SynthesisInput, cfg: ServerConfig, endpoint: 'dialogue' | 'tts', signal: AbortSignal, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const { url, body } = httpRequestFor(input, cfg, endpoint);
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'xi-api-key': cfg.elevenLabsKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body,
    signal,
    cache: 'no-store',
  });
  if (!res.ok) throw new SynthesisError(kindForStatus(res.status, await errorIdentifier(res)));
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  if (type && !type.startsWith('audio/') && !type.startsWith('application/octet-stream')) {
    await res.body?.cancel().catch(() => {});
    throw new SynthesisError('malformed');
  }
  const audio = await readBounded(res, MAX_AUDIO_BYTES);
  if (!audio) throw new SynthesisError('malformed');
  return audio;
}
