// Prefetch cache for natural-voice (ElevenLabs) audio. In fast mode (speakOnSelect) the suggestion
// sentences are synthesized as soon as a batch is shown, so choosing one plays from memory instead
// of waiting ~650 ms for /api/speech. Framework-free and injectable for tests.
//
// Key = exact text + voice choice (null → server default). The audio is only ever played for an
// utterance whose confirmed text is byte-for-byte the key, so the spoken text is always exactly
// what was confirmed. Prefetch failures are silent; the normal request path is unaffected.
import type { SpeechRequest } from '@/core/types';
import { ACCESS_HEADER } from '@/runtime/contract';

export const SPEECH_ENDPOINT = '/api/speech';
/** Client-side ceiling on one /api/speech request (shared by the player and prefetch). */
export const SPEECH_REQUEST_TIMEOUT_MS = 25_000;

export const PREFETCH_MAX_ENTRIES = 12;
export const PREFETCH_TTL_MS = 10 * 60_000;
export const PREFETCH_MAX_BYTES = 8 * 1024 * 1024;
export const PREFETCH_CONCURRENCY = 3;
/** After a refusal (auth, quota, rate limit) stop prefetching for a while instead of hammering. */
export const PREFETCH_COOLDOWN_MS = 30_000;

export type SpeechFetchResult = { ok: true; blob: Blob } | { ok: false; status: number };

export function speechRequestHeaders(accessCode: string): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (accessCode) headers[ACCESS_HEADER] = accessCode;
  return headers;
}

/**
 * The /api/speech request exactly as the player makes it: same endpoint, access header, and body
 * shape (exact text, no normalization). Resolves with the audio or the failing status (0 = network
 * error / aborted). Never throws.
 */
export async function fetchSpeechAudio(
  text: string,
  voiceChoiceId: string | null,
  accessCode: string,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
  ids: { utteranceId: string; reviewSnapshotId: string; sessionEpoch: string },
): Promise<SpeechFetchResult> {
  const body: SpeechRequest = { ...ids, exactText: text, voiceChoiceId };
  try {
    const res = await fetchImpl(SPEECH_ENDPOINT, {
      method: 'POST', headers: speechRequestHeaders(accessCode), body: JSON.stringify(body), signal, cache: 'no-store',
    });
    const type = res.headers?.get?.('content-type') ?? '';
    if (!res.ok || !type.startsWith('audio/')) return { ok: false, status: res.ok ? 502 : res.status };
    const blob = await res.blob();
    if (!blob || blob.size === 0) return { ok: false, status: 502 };
    return { ok: true, blob };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Statuses that mean prefetching itself is refused or the provider is struggling (not one bad item). */
function isCooldownStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

export type PrefetchItem = { text: string; voiceChoiceId: string | null };

/** A lookup result: audio in hand, a request in flight (await it), or nothing. */
export type CacheLookup =
  | { kind: 'hit'; blob: Blob }
  | { kind: 'pending'; promise: Promise<Blob | null>; release: () => void };

type Entry = { blob: Blob; at: number };
type Flight = { ctrl: AbortController; promise: Promise<Blob | null>; waiters: number };
type Queued = { key: string; item: PrefetchItem; accessCode: string };

export type SpeechCacheOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  maxEntries?: number;
  ttlMs?: number;
  maxBytes?: number;
  concurrency?: number;
  cooldownMs?: number;
};

export class SpeechAudioCache {
  private entries = new Map<string, Entry>(); // insertion order = LRU order (oldest first)
  private flights = new Map<string, Flight>();
  private queue: Queued[] = [];
  private bytes = 0;
  private seq = 0;
  private cooldownUntil = 0;
  private fetchImpl: typeof fetch;
  private now: () => number;
  private maxEntries: number;
  private ttlMs: number;
  private maxBytes: number;
  private concurrency: number;
  private cooldownMs: number;

  constructor(opts: SpeechCacheOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.now = opts.now ?? (() => Date.now());
    this.maxEntries = opts.maxEntries ?? PREFETCH_MAX_ENTRIES;
    this.ttlMs = opts.ttlMs ?? PREFETCH_TTL_MS;
    this.maxBytes = opts.maxBytes ?? PREFETCH_MAX_BYTES;
    this.concurrency = opts.concurrency ?? PREFETCH_CONCURRENCY;
    this.cooldownMs = opts.cooldownMs ?? PREFETCH_COOLDOWN_MS;
  }

  static key(text: string, voiceChoiceId: string | null): string {
    return JSON.stringify([voiceChoiceId ?? null, text]);
  }

  get size(): number {
    return this.entries.size;
  }
  get totalBytes(): number {
    return this.bytes;
  }
  get inFlight(): number {
    return this.flights.size;
  }

  /**
   * Audio for exactly this text + voice: cached (refreshes LRU), or a request in flight that the
   * caller may await instead of starting a duplicate. The caller must call `release()` when it
   * stops waiting so an unwanted prefetch can be aborted.
   */
  lookup(text: string, voiceChoiceId: string | null): CacheLookup | null {
    const key = SpeechAudioCache.key(text, voiceChoiceId);
    const e = this.entries.get(key);
    if (e) {
      if (this.now() - e.at > this.ttlMs) {
        this.drop(key);
      } else {
        this.entries.delete(key);
        this.entries.set(key, e);
        return { kind: 'hit', blob: e.blob };
      }
    }
    const f = this.flights.get(key);
    if (f) {
      f.waiters += 1;
      let released = false;
      return { kind: 'pending', promise: f.promise, release: () => { if (!released) { released = true; f.waiters -= 1; } } };
    }
    // Queued but not yet started: it is wanted now, so start it immediately.
    const qi = this.queue.findIndex((q) => q.key === key);
    if (qi >= 0) {
      const [q] = this.queue.splice(qi, 1);
      const f2 = this.start(q);
      f2.waiters += 1;
      let released = false;
      return { kind: 'pending', promise: f2.promise, release: () => { if (!released) { released = true; f2.waiters -= 1; } } };
    }
    return null;
  }

  /**
   * Prefetch these items in order (top first) for the batch now on screen. Anything queued or in
   * flight for an earlier batch that nobody is waiting on is dropped. Items already cached or in
   * flight are shared, not requested again.
   */
  prefetch(items: PrefetchItem[], accessCode: string): void {
    const wanted = new Set(items.map((i) => SpeechAudioCache.key(i.text, i.voiceChoiceId)));
    this.queue = this.queue.filter((q) => wanted.has(q.key));
    for (const [key, f] of this.flights) if (!wanted.has(key) && f.waiters === 0) f.ctrl.abort();
    if (this.now() < this.cooldownUntil) return;
    for (const item of items) {
      const key = SpeechAudioCache.key(item.text, item.voiceChoiceId);
      const e = this.entries.get(key);
      if (e && this.now() - e.at <= this.ttlMs) continue;
      if (this.flights.has(key) || this.queue.some((q) => q.key === key)) continue;
      this.queue.push({ key, item, accessCode });
    }
    this.pump();
  }

  /** Cancel queued and unawaited in-flight prefetches (e.g. fast mode turned off). */
  cancelPending(): void {
    this.queue = [];
    for (const f of this.flights.values()) if (f.waiters === 0) f.ctrl.abort();
  }

  clear(): void {
    this.cancelPending();
    this.entries.clear();
    this.bytes = 0;
  }

  // ---- internals ----

  private pump(): void {
    while (this.flights.size < this.concurrency && this.queue.length > 0) this.start(this.queue.shift()!);
  }

  private start(q: Queued): Flight {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SPEECH_REQUEST_TIMEOUT_MS);
    const n = ++this.seq;
    const ids = { utteranceId: `prefetch-${n}`, reviewSnapshotId: `prefetch-${n}`, sessionEpoch: 'prefetch' };
    const promise: Promise<Blob | null> = fetchSpeechAudio(q.item.text, q.item.voiceChoiceId, q.accessCode, ctrl.signal, this.fetchImpl, ids)
      .then((r) => {
        if (r.ok) {
          if (!ctrl.signal.aborted) this.store(q.key, r.blob);
          return r.blob;
        }
        // Refusals (auth / quota / rate limit / provider trouble) pause prefetching; the normal
        // path still works and reports its own errors. Our own aborts are not refusals, and a 400
        // (this one text is too long / invalid) only skips this item, not the following batches.
        if (!ctrl.signal.aborted && isCooldownStatus(r.status)) this.cooldownUntil = this.now() + this.cooldownMs;
        return null;
      })
      .catch(() => null)
      .finally(() => {
        clearTimeout(timer);
        this.flights.delete(q.key);
        this.pump();
      });
    const flight: Flight = { ctrl, promise, waiters: 0 };
    this.flights.set(q.key, flight);
    return flight;
  }

  private store(key: string, blob: Blob): void {
    this.drop(key);
    if (blob.size > this.maxBytes) return;
    this.entries.set(key, { blob, at: this.now() });
    this.bytes += blob.size;
    // Expired first, then least recently used, until within both caps.
    for (const [k, e] of this.entries) if (this.now() - e.at > this.ttlMs) this.drop(k);
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.drop(oldest);
    }
  }

  private drop(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.bytes -= e.blob.size;
  }
}

let shared: SpeechAudioCache | null = null;
export function getSharedSpeechCache(): SpeechAudioCache | null {
  if (typeof window === 'undefined') return null;
  if (!shared) shared = new SpeechAudioCache();
  return shared;
}
