import 'server-only';
// OpenAI-compatible transcription adapter (POST {base}/audio/transcriptions, multipart).
import type { ServerConfig } from './config';

export type TranscriptionResult = { ok: true; text: string } | { ok: false; code: 'TIMEOUT' | 'TRANSCRIPTION_FAILED' | 'RATE_LIMITED'; message: string };

export async function transcribe(audio: File, cfg: ServerConfig, signal: AbortSignal): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append('file', audio, audio.name);
  form.append('model', cfg.transcriptionModel);
  form.append('response_format', 'json');
  const timeout = AbortSignal.timeout(cfg.transcriptionTimeoutMs);
  try {
    const res = await fetch(`${cfg.transcriptionBaseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.transcriptionKey}` },
      body: form,
      signal: AbortSignal.any([signal, timeout]),
    });
    if (res.status === 429) return { ok: false, code: 'RATE_LIMITED', message: 'Transcription service is busy.' };
    if (!res.ok) return { ok: false, code: 'TRANSCRIPTION_FAILED', message: 'Transcription failed. Type instead or re-record.' };
    const data = (await res.json()) as { text?: unknown };
    return { ok: true, text: typeof data.text === 'string' ? data.text.trim() : '' };
  } catch {
    if (timeout.aborted) return { ok: false, code: 'TIMEOUT', message: 'Transcription took too long.' };
    return { ok: false, code: 'TRANSCRIPTION_FAILED', message: 'Could not reach the transcription service.' };
  }
}
