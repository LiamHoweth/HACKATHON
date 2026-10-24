// The single controller around the browser speech API for conversational output.
// Accepts only a ConfirmedUtterance produced by the review-confirmation transition and speaks
// exactly utterance.exactText. Injectable for tests: pass a SpeechSynthesis-like object.
import type { ConfirmedUtterance, Id } from '@/core/types';

export type SpeechEventKind = 'start' | 'end' | 'error' | 'interrupted' | 'uncertain';
export type SpeechListener = (e: { utteranceId: Id; sessionEpoch: Id; kind: SpeechEventKind }) => void;

/** The subset of SpeechSynthesisUtterance this controller uses. */
export interface UtteranceLike {
  text: string;
  rate: number;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  onstart: ((ev: unknown) => void) | null;
  onend: ((ev: unknown) => void) | null;
  onerror: ((ev: { error?: string } & object) => void) | null;
}

export interface SynthLike {
  speak(u: UtteranceLike): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  paused?: boolean;
  resume?(): void;
}

export type SpeakOptions = { voiceURI: string | null; rate: number; lang: string };

type Timers = { setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (h: unknown) => void };

type Job = {
  utterance: ConfirmedUtterance;
  listener: SpeechListener;
  started: boolean;
  finished: boolean;
  stoppedByUs: boolean;
  timer: unknown;
};

export const START_WATCHDOG_MS = 4000;
export const endWatchdogMs = (text: string) => Math.max(10_000, text.length * 200);

export class SpeechController {
  private active: Job | null = null;
  private spoken = new Set<Id>();
  private timers: Timers;

  constructor(
    private synth: SynthLike,
    private makeUtterance: (text: string) => UtteranceLike = (t) => new SpeechSynthesisUtterance(t) as unknown as UtteranceLike,
    timers?: Timers,
  ) {
    this.timers = timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
  }

  get activeId(): Id | null {
    return this.active && !this.active.finished ? this.active.utterance.id : null;
  }

  /** Returns false when the utterance id was already spoken (dedupe) or speaking could not begin. */
  speak(utterance: ConfirmedUtterance, opts: SpeakOptions, listener: SpeechListener): boolean {
    if (this.spoken.has(utterance.id)) return false;
    this.spoken.add(utterance.id);
    if (this.spoken.size > 500) this.spoken.delete(this.spoken.values().next().value as Id);

    // Cancel any previous queue before a newly authorized utterance.
    if (this.active && !this.active.finished) this.finish(this.active, 'interrupted');
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }

    const job: Job = { utterance, listener, started: false, finished: false, stoppedByUs: false, timer: null };
    this.active = job;
    let u: UtteranceLike;
    try {
      u = this.makeUtterance(utterance.exactText); // exact reviewed text, no normalization
      const voice = opts.voiceURI ? this.synth.getVoices().find((v) => v.voiceURI === opts.voiceURI) ?? null : null;
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = opts.lang;
      }
      u.rate = opts.rate;
    } catch {
      this.finish(job, 'error');
      return false;
    }

    u.onstart = () => {
      if (this.isLive(job) && !job.started) {
        job.started = true;
        this.clearTimer(job);
        job.listener({ utteranceId: utterance.id, sessionEpoch: utterance.sessionEpoch, kind: 'start' });
        job.timer = this.timers.setTimeout(() => this.uncertain(job, false), endWatchdogMs(utterance.exactText));
      }
    };
    u.onend = () => {
      if (this.isLive(job)) this.finish(job, job.stoppedByUs ? 'interrupted' : 'end');
    };
    u.onerror = (ev) => {
      if (!this.isLive(job)) return;
      const code = ev && typeof ev === 'object' && 'error' in ev ? String(ev.error) : '';
      this.finish(job, job.stoppedByUs || code === 'interrupted' || code === 'canceled' ? 'interrupted' : 'error');
    };

    job.timer = this.timers.setTimeout(() => this.uncertain(job, true), START_WATCHDOG_MS);
    try {
      if (this.synth.paused) this.synth.resume?.();
      this.synth.speak(u);
    } catch {
      this.finish(job, 'error');
      return false;
    }
    return true;
  }

  /** User-requested stop of a specific utterance. Reports 'interrupted' once. */
  stop(utteranceId: Id): void {
    const job = this.active;
    if (!job || job.finished || job.utterance.id !== utteranceId) return;
    job.stoppedByUs = true;
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
    // Some engines never fire onend after cancel; report now and ignore late callbacks.
    if (this.isLive(job)) this.finish(job, 'interrupted');
  }

  /** Session cleanup: stop everything and ignore every later callback. Reports nothing. */
  cancelAll(): void {
    const job = this.active;
    if (job) {
      this.clearTimer(job);
      job.finished = true;
    }
    this.active = null;
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
  }

  private isLive(job: Job) {
    return this.active === job && !job.finished;
  }

  private clearTimer(job: Job) {
    if (job.timer !== null) this.timers.clearTimeout(job.timer);
    job.timer = null;
  }

  private uncertain(job: Job, beforeStart: boolean) {
    if (!this.isLive(job)) return;
    // Never replay. If playback never started, cancel so it cannot start late and surprise anyone.
    if (beforeStart) {
      try {
        this.synth.cancel();
      } catch {
        /* ignore */
      }
    }
    this.finish(job, 'uncertain');
  }

  private finish(job: Job, kind: SpeechEventKind) {
    if (job.finished) return;
    job.finished = true;
    this.clearTimer(job);
    if (this.active === job) this.active = null;
    job.listener({ utteranceId: job.utterance.id, sessionEpoch: job.utterance.sessionEpoch, kind });
  }
}
