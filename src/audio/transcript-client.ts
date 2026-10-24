// Uploads one bounded capture to /api/transcribe. The result is a DRAFT for partner review;
// nothing here submits it as a conversation turn.
import type { ApiResult, Id } from '@/core/types';
import { ACCESS_HEADER } from '@/runtime/contract';
import type { Capture } from './recording-controller';

export type TranscriptData = { captureId: Id; text: string };

export async function transcribe(
  capture: Capture,
  sessionEpoch: Id,
  accessCode: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<TranscriptData>> {
  const form = new FormData();
  form.append('audio', new File([capture.blob], capture.filename, { type: capture.mimeType }));
  form.append('captureId', capture.captureId);
  form.append('sessionEpoch', sessionEpoch);
  const headers: Record<string, string> = {};
  if (accessCode) headers[ACCESS_HEADER] = accessCode;
  let res: Response;
  try {
    res = await fetchImpl('/api/transcribe', { method: 'POST', body: form, headers, signal });
  } catch {
    return { ok: false, requestId: capture.captureId, error: { code: 'NETWORK', message: 'Could not reach the server. Type the message instead.', recoverable: true } };
  }
  try {
    const json = (await res.json()) as ApiResult<TranscriptData>;
    if (json && typeof json === 'object' && typeof json.ok === 'boolean') {
      if (json.ok && (typeof json.data?.text !== 'string' || json.data.captureId !== capture.captureId)) throw new Error('shape');
      return json;
    }
  } catch {
    /* fall through */
  }
  return { ok: false, requestId: capture.captureId, error: { code: 'TRANSCRIPTION_FAILED', message: 'Transcription failed. Type the message instead.', recoverable: true } };
}
