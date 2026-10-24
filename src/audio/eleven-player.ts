// The single authoritative player for ElevenLabs (natural voice) speech output.
// Framework-free and injectable for tests. Accepts only a ConfirmedUtterance (from the reducer's
// `speak` effect), sends exactly utterance.exactText to POST /api/speech, and plays the returned
// audio through ONE reused audio element that enableAudio() unlocked inside a real user gesture
// (iPad Safari autoplay policy). It never retries, never replays, and never falls back to another
// voice by itself: failures are reported and the reducer offers the labeled basic-voice path.
//
// States: idle → requesting → buffering → playing → completed | failed | interrupted | uncertain,
// plus blocked (play() rejected by the browser's autoplay policy).
import type { ApiErrorCode, ConfirmedUtterance, Id, SpeechRequest } from '@/core/types';
import type { SpeechPlaybackState } from '@/runtime/contract';
import {
  getSharedSpeechCache, SPEECH_ENDPOINT, SPEECH_REQUEST_TIMEOUT_MS, speechRequestHeaders, type SpeechAudioCache,
} from '@/audio/speech-prefetch';

export { SPEECH_ENDPOINT, SPEECH_REQUEST_TIMEOUT_MS };

export type ElevenEventKind = 'start' | 'end' | 'error' | 'interrupted' | 'uncertain';
/**
 * Result of a setup voice preview. 'played' means play() resolved or playback started (it is not
 * proof that the listener heard it); 'busy' means a conversation message holds the voice or took
 * over the preview; 'not-configured' means the server reported NOT_CONFIGURED.
 */
export type PreviewOutcome = 'played' | 'blocked' | 'not-configured' | 'failed' | 'busy';
export type ElevenListener = (e: { utteranceId: Id; sessionEpoch: Id; kind: ElevenEventKind }) => void;

/** The subset of HTMLAudioElement this player uses. */
export interface AudioLike {
  src: string;
  currentTime: number;
  playsInline?: boolean;
  preload?: string;
  muted?: boolean;
  play(): Promise<void> | void;
  pause(): void;
  load?(): void;
  setAttribute?(name: string, value: string): void;
  removeAttribute?(name: string): void;
  addEventListener(type: string, fn: (ev: unknown) => void): void;
  removeEventListener(type: string, fn: (ev: unknown) => void): void;
}

type Timers = { setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (h: unknown) => void };

export type ElevenPlayerDeps = {
  fetchImpl?: typeof fetch;
  /** Creates the one reused audio element. Return null when audio playback is unavailable. */
  createAudio?: () => AudioLike | null;
  createObjectURL?: (b: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  now?: () => number;
  timers?: Timers;
  /**
   * Extra unlock steps run synchronously inside enableAudio's gesture (default: set
   * navigator.audioSession.type = 'playback' where supported, and queue a silent speechSynthesis
   * utterance so the labeled basic-voice fallback is unlocked too). No Web Audio: it honors the
   * iPad silent switch, <audio> does not.
   */
  unlockExtras?: () => void;
  /** Prefetched audio (fast mode). Without it every utterance is requested on demand. */
  cache?: SpeechAudioCache | null;
};

export type ElevenSnapshot = {
  state: SpeechPlaybackState;
  message: string | null;
  unlocked: boolean;
  lastConfirmToPlayMs: number | null;
};

/** No `playing` event this long after the audio bytes arrived → uncertain (never replayed). */
export const PLAYING_WATCHDOG_MS = 10_000;
/** Started but no `ended` this long → uncertain. Generous: short AAC sentences only. */
export const endWatchdogMs = (text: string) => Math.max(20_000, text.length * 250);
export const NATURAL_VOICE_TEST_TEXT = 'This is the natural voice preview. It is not part of the conversation.';
export const VOICE_TEST_PREFIX = 'voice-test-';

export const MESSAGES = {
  requesting: 'Generating natural voice…',
  buffering: 'Preparing natural voice audio…',
  playing: 'Speaking (natural voice)',
  completed: 'Natural voice finished playing.',
  interrupted: 'Speech stopped.',
  uncertain: 'Playback status is uncertain. It was not replayed.',
  blocked: 'Audio blocked — tap Enable audio',
  enabled: 'Audio enabled.',
  unavailable: 'Audio playback is not available in this browser.',
  previewing: 'Playing natural voice preview…',
  previewDone: 'Natural voice preview finished.',
  previewBusy: 'Voice preview is unavailable while a message is being spoken.',
  notConfigured: 'Natural voice not configured',
  noAudio: 'Natural voice returned no audio.',
  playFailed: 'Could not play the natural voice audio.',
} as const;

const ERROR_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  NOT_CONFIGURED: MESSAGES.notConfigured,
  UNAUTHORIZED: 'Natural voice not authorized — check the access code',
  INVALID_INPUT: 'Natural voice could not use this message',
  RATE_LIMITED: 'Voice service busy — try again shortly',
  TIMEOUT: 'Natural voice took too long',
  PROVIDER_UNAVAILABLE: 'Natural voice unavailable right now',
  NETWORK: 'Could not reach the voice service',
};

/** Factual, safe message for a speech error code (never echoes provider text). */
export function speechErrorMessage(code: ApiErrorCode | null, status?: number): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]!;
  if (status === 401 || status === 403) return ERROR_MESSAGES.UNAUTHORIZED!;
  if (status === 429) return ERROR_MESSAGES.RATE_LIMITED!;
  if (status === 504 || status === 408) return ERROR_MESSAGES.TIMEOUT!;
  return ERROR_MESSAGES.PROVIDER_UNAVAILABLE!;
}

/** A short silent PCM WAV (8 kHz, 8-bit mono, 50 ms) used to unlock the element in a gesture. */
export function silentWavDataUri(): string {
  const samples = 400;
  const bytes = new Uint8Array(44 + samples);
  const dv = new DataView(bytes.buffer);
  const ascii = (o: number, s: string) => [...s].forEach((c, i) => (bytes[o + i] = c.charCodeAt(0)));
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true); // byte rate
  dv.setUint16(32, 1, true); // block align
  dv.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  dv.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit PCM silence
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

type Job = {
  id: Id;
  sessionEpoch: Id;
  text: string;
  preview: boolean;
  listener: ElevenListener | null;
  ctrl: AbortController;
  started: boolean;
  finished: boolean;
  timedOut: boolean;
  timer: unknown;
  requestTimer: unknown;
  url: string | null;
  handlers: Array<[string, (ev: unknown) => void]>;
  t0: number;
  /** Server error code of a failed request (used for the preview outcome only). */
  code: ApiErrorCode | null;
  /** How the job finished, once it has. */
  endKind: ElevenEventKind | null;
  endState: SpeechPlaybackState | null;
};

const errorName = (err: unknown) => (err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '');

export class ElevenPlayer {
  private audio: AudioLike | null = null;
  private audioCreated = false;
  private active: Job | null = null;
  private spoken = new Set<Id>();
  private previewSeq = 0;
  private snap: ElevenSnapshot = { state: 'idle', message: null, unlocked: false, lastConfirmToPlayMs: null };
  private listeners = new Set<() => void>();
  private fetchImpl: typeof fetch;
  private now: () => number;
  private timers: Timers;

  constructor(private deps: ElevenPlayerDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? ((...a) => fetch(...a));
    this.now = deps.now ?? (() => performance.now());
    this.timers = deps.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
  }

  // ---- Observable snapshot (for useSyncExternalStore) ----
  getSnapshot = (): ElevenSnapshot => this.snap;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(patch: Partial<ElevenSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  /** Show a factual status line without changing playback state (e.g. "Natural voice not configured"). */
  notice(message: string | null): void {
    this.set({ message });
  }

  get activeId(): Id | null {
    return this.active && !this.active.finished && !this.active.preview ? this.active.id : null;
  }

  /**
   * Unlock audio. Call ONLY synchronously from a genuine click/touch handler: play() on the
   * reused element starts before any await so iPad Safari counts it as user-initiated.
   */
  enableAudio(): Promise<boolean> {
    const el = this.ensureAudio();
    if (!el) {
      this.set({ message: MESSAGES.unavailable });
      return Promise.resolve(false);
    }
    // The element is busy with real speech: do not hijack it. Playing audio proves it is unlocked.
    if (this.active && !this.active.finished && this.active.url) return Promise.resolve(this.snap.unlocked || this.active.started);
    try {
      (this.deps.unlockExtras ?? defaultUnlockExtras)();
    } catch {
      /* best effort; the audio element unlock below is what matters */
    }
    let p: Promise<void> | void;
    try {
      el.playsInline = true;
      el.setAttribute?.('playsinline', '');
      el.muted = false; // muted playback does not unlock unmuted playback on iOS
      el.src = silentWavDataUri();
      p = el.play();
    } catch (err) {
      return Promise.resolve(this.unlockFailed(err));
    }
    return Promise.resolve(p).then(
      () => {
        const busy = !!this.active && !this.active.finished;
        if (!busy) this.release(el);
        this.set(busy ? { unlocked: true } : { unlocked: true, ...(this.snap.state === 'blocked' ? { state: 'idle' as const } : {}), message: MESSAGES.enabled });
        return true;
      },
      (err) => this.unlockFailed(err),
    );
  }

  private unlockFailed(err: unknown): boolean {
    const name = errorName(err);
    if (name === 'NotAllowedError') this.set({ unlocked: false, state: 'blocked', message: MESSAGES.blocked });
    else if (name !== 'AbortError') this.set({ message: MESSAGES.playFailed }); // AbortError: real speech took the element
    return false;
  }

  /**
   * Speak a confirmed utterance through the natural voice. Idempotent by utterance id: a second
   * call with the same id (rerender, StrictMode, duplicate effect) does nothing and returns false.
   */
  speak(utterance: ConfirmedUtterance, opts: { accessCode: string; listener: ElevenListener; startedAt?: number }): boolean {
    if (utterance.provider !== 'elevenlabs') return false;
    if (this.spoken.has(utterance.id)) return false;
    this.spoken.add(utterance.id);
    if (this.spoken.size > 500) this.spoken.delete(this.spoken.values().next().value as Id);
    const body: SpeechRequest = {
      utteranceId: utterance.id,
      reviewSnapshotId: utterance.reviewId,
      sessionEpoch: utterance.sessionEpoch,
      exactText: utterance.exactText, // exact reviewed text, no normalization
      voiceChoiceId: utterance.voiceChoiceId,
    };
    // Confirm-to-play latency is measured from the confirming ACTIVATE (monotonic) when known.
    const t0 = typeof utterance.confirmedAt === 'number' ? utterance.confirmedAt : opts.startedAt;
    const job = this.newJob(utterance.id, utterance.sessionEpoch, utterance.exactText, false, opts.listener, t0);
    void this.run(job, body, opts.accessCode);
    return true;
  }

  /**
   * Setup preview with fixed text. Never reports speech events and never enters history.
   * Resolves once play() settles (or the request fails) with the outcome for the setup screen.
   */
  async preview(opts: { accessCode: string; voiceChoiceId: Id | null }): Promise<PreviewOutcome> {
    if (this.activeId) {
      this.set({ message: MESSAGES.previewBusy });
      return 'busy';
    }
    const id = `${VOICE_TEST_PREFIX}${++this.previewSeq}-${Math.round(this.now())}`;
    const body: SpeechRequest = {
      utteranceId: id,
      reviewSnapshotId: id,
      sessionEpoch: `${VOICE_TEST_PREFIX}session`,
      exactText: NATURAL_VOICE_TEST_TEXT,
      voiceChoiceId: opts.voiceChoiceId,
    };
    const job = this.newJob(id, body.sessionEpoch, NATURAL_VOICE_TEST_TEXT, true, null);
    await this.run(job, body, opts.accessCode);
    return previewOutcome(job);
  }

  /** User Stop for a specific utterance: halt playback, abort the request, report 'interrupted' once. */
  stop(utteranceId: Id): void {
    const job = this.active;
    if (!job || job.finished || job.preview || job.id !== utteranceId) return;
    this.finish(job, 'interrupted');
  }

  /**
   * Stop everything (session end / start / teardown). Late responses are discarded. With nothing
   * in flight, a stale failure or blocked status from an earlier utterance is cleared to idle.
   */
  cancelAll(): void {
    const job = this.active;
    if (job && !job.finished) {
      this.finish(job, 'interrupted');
      return;
    }
    const st = this.snap.state;
    if (st === 'failed' || st === 'blocked' || st === 'uncertain') this.set({ state: 'idle', message: null });
  }

  // ---- internals ----

  private ensureAudio(): AudioLike | null {
    if (!this.audioCreated) {
      this.audioCreated = true;
      try {
        this.audio = (this.deps.createAudio ?? defaultCreateAudio)();
        if (this.audio) {
          this.audio.preload = 'auto';
          this.audio.playsInline = true;
          this.audio.setAttribute?.('playsinline', '');
        }
      } catch {
        this.audio = null;
      }
    }
    return this.audio;
  }

  private newJob(id: Id, sessionEpoch: Id, text: string, preview: boolean, listener: ElevenListener | null, startedAt?: number): Job {
    // Newly authorized speech replaces anything in flight (old players and requests are cleaned up).
    if (this.active && !this.active.finished) this.finish(this.active, 'interrupted');
    const job: Job = {
      id, sessionEpoch, text, preview, listener,
      ctrl: new AbortController(), started: false, finished: false, timedOut: false,
      timer: null, requestTimer: null, url: null, handlers: [], t0: startedAt ?? this.now(),
      code: null, endKind: null, endState: null,
    };
    this.active = job;
    // Each new conversational utterance starts a fresh latency measurement.
    this.set(preview
      ? { state: 'requesting', message: MESSAGES.previewing }
      : { state: 'requesting', message: MESSAGES.requesting, lastConfirmToPlayMs: null });
    return job;
  }

  private live(job: Job) {
    return this.active === job && !job.finished;
  }

  private async run(job: Job, body: SpeechRequest, accessCode: string): Promise<void> {
    const headers = speechRequestHeaders(accessCode);
    job.requestTimer = this.timers.setTimeout(() => {
      job.timedOut = true;
      job.ctrl.abort();
    }, SPEECH_REQUEST_TIMEOUT_MS);

    // Fast mode: audio for exactly this text + voice may already be prefetched (or be in flight).
    // The key is the exact confirmed text, so what plays is always what was confirmed. A miss, or a
    // failed prefetch, falls through to the normal request below. Previews never use the cache.
    let blob: Blob | null = null;
    const cached = job.preview ? null : this.deps.cache?.lookup(body.exactText, body.voiceChoiceId) ?? null;
    if (cached?.kind === 'hit') {
      blob = cached.blob;
    } else if (cached?.kind === 'pending') {
      const onAbort = new Promise<null>((resolve) => job.ctrl.signal.addEventListener('abort', () => resolve(null), { once: true }));
      try {
        blob = await Promise.race([cached.promise, onAbort]);
      } finally {
        cached.release();
      }
      if (!this.live(job)) return;
    }

    if (!blob) {
      try {
        const res = await this.fetchImpl(SPEECH_ENDPOINT, {
          method: 'POST', headers, body: JSON.stringify(body), signal: job.ctrl.signal, cache: 'no-store',
        });
        if (!this.live(job)) return;
        const type = res.headers?.get?.('content-type') ?? '';
        if (!res.ok || !type.startsWith('audio/')) {
          let code: ApiErrorCode | null = null;
          try {
            const json = (await res.json()) as { ok?: boolean; error?: { code?: ApiErrorCode } } | null;
            code = json && json.ok === false && json.error?.code ? json.error.code : null;
          } catch {
            code = null;
          }
          if (!this.live(job)) return;
          job.code = code;
          this.fail(job, res.ok ? MESSAGES.noAudio : speechErrorMessage(code, res.status));
          return;
        }
        blob = await res.blob();
      } catch {
        if (!this.live(job)) return; // stopped or superseded: a late result never plays
        this.fail(job, speechErrorMessage(job.timedOut ? 'TIMEOUT' : 'NETWORK'));
        return;
      }
    }
    if (!this.live(job)) return;
    this.clearRequestTimer(job);
    if (!blob || blob.size === 0) return this.fail(job, MESSAGES.noAudio);

    const el = this.ensureAudio();
    if (!el) return this.fail(job, MESSAGES.unavailable);
    this.set({ state: 'buffering', message: job.preview ? MESSAGES.previewing : MESSAGES.buffering });
    try {
      job.url = (this.deps.createObjectURL ?? ((b) => URL.createObjectURL(b)))(blob);
    } catch {
      return this.fail(job, MESSAGES.playFailed);
    }

    const on = (type: string, fn: (ev: unknown) => void) => {
      el.addEventListener(type, fn);
      job.handlers.push([type, fn]);
    };
    on('playing', () => this.onPlaying(job));
    on('ended', () => {
      if (this.live(job)) this.finish(job, 'end');
    });
    on('error', () => {
      if (this.live(job)) this.fail(job, MESSAGES.playFailed);
    });
    job.timer = this.timers.setTimeout(() => {
      if (this.live(job) && !job.started) this.finish(job, 'uncertain');
    }, PLAYING_WATCHDOG_MS);

    try {
      el.playsInline = true;
      el.muted = false;
      el.src = job.url;
      await el.play();
    } catch (err) {
      if (!this.live(job)) return;
      if (errorName(err) === 'NotAllowedError') {
        this.finish(job, 'error', { state: 'blocked', message: MESSAGES.blocked, unlocked: false });
      } else {
        this.fail(job, MESSAGES.playFailed);
      }
    }
  }

  private onPlaying(job: Job) {
    if (!this.live(job) || job.started) return;
    job.started = true;
    this.clearTimer(job);
    const patch: Partial<ElevenSnapshot> = { state: 'playing', message: job.preview ? MESSAGES.previewing : MESSAGES.playing, unlocked: true };
    if (!job.preview) patch.lastConfirmToPlayMs = Math.max(0, this.now() - job.t0);
    this.set(patch);
    job.listener?.({ utteranceId: job.id, sessionEpoch: job.sessionEpoch, kind: 'start' });
    job.timer = this.timers.setTimeout(() => {
      if (this.live(job)) this.finish(job, 'uncertain');
    }, endWatchdogMs(job.text));
  }

  private fail(job: Job, message: string) {
    this.finish(job, 'error', { state: 'failed', message });
  }

  private clearTimer(job: Job) {
    if (job.timer !== null) this.timers.clearTimeout(job.timer);
    job.timer = null;
  }

  private clearRequestTimer(job: Job) {
    if (job.requestTimer !== null) this.timers.clearTimeout(job.requestTimer);
    job.requestTimer = null;
  }

  /** Pause and detach the source without discarding the (unlocked) element. */
  private release(el: AudioLike) {
    try {
      el.pause();
    } catch {
      /* ignore */
    }
    try {
      if (el.removeAttribute) el.removeAttribute('src');
      else el.src = '';
      el.load?.();
    } catch {
      /* ignore */
    }
  }

  private finish(job: Job, kind: ElevenEventKind, override?: Partial<ElevenSnapshot>) {
    if (job.finished) return;
    job.finished = true;
    this.clearTimer(job);
    this.clearRequestTimer(job);
    job.ctrl.abort();
    const el = this.audio;
    if (el) {
      for (const [type, fn] of job.handlers) el.removeEventListener(type, fn);
      if (job.url) this.release(el);
    }
    job.handlers = [];
    if (job.url) {
      try {
        (this.deps.revokeObjectURL ?? ((u) => URL.revokeObjectURL(u)))(job.url);
      } catch {
        /* ignore */
      }
      job.url = null;
    }
    if (this.active === job) this.active = null;
    const base: Record<ElevenEventKind, Partial<ElevenSnapshot>> = {
      start: {},
      end: { state: 'completed', message: job.preview ? MESSAGES.previewDone : MESSAGES.completed },
      interrupted: { state: 'interrupted', message: MESSAGES.interrupted },
      uncertain: { state: 'uncertain', message: MESSAGES.uncertain },
      error: { state: 'failed', message: MESSAGES.playFailed },
    };
    const patch = { ...base[kind], ...override };
    job.endKind = kind;
    job.endState = patch.state ?? this.snap.state;
    this.set(patch);
    // Previews never report speech events.
    job.listener?.({ utteranceId: job.id, sessionEpoch: job.sessionEpoch, kind });
  }
}

function previewOutcome(job: Job): PreviewOutcome {
  if (!job.finished || job.started || job.endKind === 'end') return 'played';
  if (job.endState === 'blocked') return 'blocked';
  if (job.code === 'NOT_CONFIGURED') return 'not-configured';
  if (job.endKind === 'interrupted') return 'busy'; // superseded by a conversation message or stopped
  return 'failed';
}

function setPlaybackSession() {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { audioSession?: { type: string } }) : null;
  // Never downgrade an open microphone: 'playback' makes WebKit refuse capture, which would
  // silently deafen hands-free listening. play-and-record also plays through the speaker.
  if (nav?.audioSession && nav.audioSession.type !== 'play-and-record') nav.audioSession.type = 'playback';
}

function defaultCreateAudio(): AudioLike | null {
  if (typeof window === 'undefined' || typeof window.Audio !== 'function') return null;
  setPlaybackSession();
  // One long-lived element, kept in the DOM (hidden) so WebKit keeps its gesture unlock.
  const el = new window.Audio();
  el.setAttribute('playsinline', '');
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'none';
  try {
    document.body?.appendChild(el);
  } catch {
    /* detached element still works */
  }
  return el as unknown as AudioLike;
}

function defaultUnlockExtras() {
  setPlaybackSession();
  // Unlock speechSynthesis in the same gesture. Silent, and not cancelled, so an in-progress
  // basic-voice utterance is never cut off by this.
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return;
  const u = new window.SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

// One player per page so the effects runner and the React hook share the unlocked element.
let shared: ElevenPlayer | null = null;
export function getSharedElevenPlayer(): ElevenPlayer | null {
  if (typeof window === 'undefined') return null;
  if (!shared) shared = new ElevenPlayer({ cache: getSharedSpeechCache() });
  return shared;
}
