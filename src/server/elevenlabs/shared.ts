import 'server-only';
// Shared ElevenLabs constants, failure kinds and validators (no network code).

export const ELEVENLABS_API = 'https://api.elevenlabs.io';
export const ELEVENLABS_WS = 'wss://api.elevenlabs.io';
/** Upper bound on collected audio. ~500 characters of speech at 128 kbps is far below this. */
export const MAX_AUDIO_BYTES = 6_000_000;

export type SynthesisFailureKind =
  | 'auth'        // provider rejected the key or its permissions (401/403, authentication_required)
  | 'quota'       // character quota or credits exhausted
  | 'rate'        // provider rate limit / concurrency limit (429)
  | 'voice'       // voice id unknown or not accessible to this key
  | 'timeout'     // ELEVENLABS_TIMEOUT_MS elapsed
  | 'aborted'     // the client went away or Stop was pressed
  | 'malformed'   // empty, oversized or non-MP3 audio, or an unparseable stream
  | 'too-long'    // this message exceeds a per-request character limit (the user can shorten it)
  | 'rejected'    // provider refused the request shape (400/422) for another reason
  | 'unavailable';// network failure, 5xx, or the socket closed before the final message

export type SynthesisResult =
  | { ok: true; audio: Uint8Array; model: string; transport: 'ws' | 'http' }
  | { ok: false; kind: SynthesisFailureKind };

export type SynthesisInput = { text: string; voiceId: string };

/** Thrown inside transports to carry a failure kind out of nested callbacks. */
export class SynthesisError extends Error {
  constructor(readonly kind: SynthesisFailureKind) { super(kind); }
}

/** True for an ID3-tagged MP3 or a bare MPEG audio frame sync. */
export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true; // "ID3"
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/** Classifies a provider error identifier or status string without retaining its text. */
export function classifyProviderError(identifier: string): SynthesisFailureKind {
  const s = identifier.toLowerCase();
  // A per-request text-length limit is about this input, not the account: never 'quota'.
  if (/character_limit|max_character|text_too_long|too_long/.test(s)) return 'too-long';
  if (/quota|credit|insufficient/.test(s)) return 'quota';
  if (/voice/.test(s) && /not_found|not found|invalid|unknown|does not exist|missing|unavailable/.test(s)) return 'voice';
  if (/auth|api_key|api key|unauthori[sz]ed|permission|forbidden|invalid_key/.test(s)) return 'auth';
  if (/rate|too_many|too many|concurren|throttl|busy/.test(s)) return 'rate';
  if (/timeout|timed out/.test(s)) return 'timeout';
  if (/invalid|validation|unprocessable|bad_request|unsupported|model/.test(s)) return 'rejected';
  return 'unavailable';
}

/** Combines the client's abort signal with the configured timeout; reports which fired. */
export function deadline(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    kind: (): SynthesisFailureKind => (timedOut ? 'timeout' : 'aborted'),
    done: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); },
  };
}
