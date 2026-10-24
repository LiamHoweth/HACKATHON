// Pure, framework-free deliberate-blink gesture state machine (no DOM, no React, no timers).
// Input: one frame per processed camera image with a monotonic timestamp, the face count, and an
// eye-closure score (0 open … 1 closed). Output: BlinkGestureEvents. The integration snapshots
// the highlighted target on 'closure-start' and commits it only on 'select'.
//
// Score choice: min(eyeBlinkLeft, eyeBlinkRight) — both eyes must close, so winks and one-eye
// squints never count. This is eye-closure measurement, not gaze tracking or identification.
// Thresholds and durations are prototype defaults, not clinical values.
import type { BlinkCalibration, BlinkGestureEvent, BlinkStatus } from '@/runtime/contract';

export type BlinkFrame = { t: number; faces: number; score: number | null };

export type GestureConfig = Pick<BlinkCalibration, 'closedThreshold' | 'openThreshold' | 'minClosureMs' | 'maxClosureMs' | 'cooldownMs'>;

export type DiscardReason = Extract<BlinkGestureEvent, { type: 'discard' }>['reason'];

/** Prototype defaults used before calibration. */
export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  closedThreshold: 0.5,
  openThreshold: 0.35,
  minClosureMs: 600,
  maxClosureMs: 2500,
  cooldownMs: 800,
};

export const GESTURE_TIMING = {
  /** No face for this long → face-lost (any closure discarded). Shorter dropouts are tolerated. */
  faceLostMs: 500,
  /** Exactly one face for this long before tracking (re)starts after no-face / multiple faces. */
  stableFaceMs: 500,
  /** A gap between frames longer than this makes an in-progress closure untrustworthy. */
  staleGapMs: 700,
  /** Re-arm delay after an ordinary blink or a discarded closure. */
  shortCooldownMs: 150,
  /** How long 'selected' shows before 'cooldown' (capped by cooldownMs). */
  selectedFlashMs: 400,
} as const;

export type GestureTiming = { [K in keyof typeof GESTURE_TIMING]: number };

type Phase = 'no-face' | 'face-lost' | 'multiple-faces' | 'ready' | 'closing' | 'cooldown';

export type GestureSnapshot = {
  status: Exclude<BlinkStatus, 'off' | 'unsupported' | 'permission-denied' | 'starting'>;
  /** 0..1 progress of the current closure toward minClosureMs. */
  closureProgress: number;
  /** Onset timestamp of the current closure, or null. */
  closingSince: number | null;
  /** Reason for the most recent discard while still re-arming from it (for guidance text). */
  lastDiscard: DiscardReason | null;
  /** True while re-arming and the eyes have not opened yet. */
  awaitingOpen: boolean;
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Light exponential smoothing for the eye-closure score. Pass prev = null to restart. */
export function smoothScore(prev: number | null, next: number, alpha = 0.6): number {
  return prev === null ? next : prev + alpha * (next - prev);
}

export class BlinkGesture {
  private phase: Phase = 'no-face';
  private acquired = false;
  private lastT: number | null = null;
  private now = 0;
  private onset: number | null = null;
  private missingSince: number | null = null;
  private singleSince: number | null = null;
  private cooldownUntil = 0;
  private selectedUntil = 0;
  private lastDiscard: DiscardReason | null = null;
  private eyesOpen = false;
  private cfg: GestureConfig;
  private timing: GestureTiming;

  constructor(cfg: GestureConfig = DEFAULT_GESTURE_CONFIG, timing: Partial<GestureTiming> = {}) {
    this.cfg = { ...cfg };
    this.timing = { ...GESTURE_TIMING, ...timing };
  }

  get config(): GestureConfig {
    return { ...this.cfg };
  }

  setConfig(cfg: GestureConfig): void {
    this.cfg = {
      closedThreshold: cfg.closedThreshold,
      openThreshold: cfg.openThreshold,
      minClosureMs: cfg.minClosureMs,
      maxClosureMs: cfg.maxClosureMs,
      cooldownMs: cfg.cooldownMs,
    };
  }

  /** Back to the initial state (camera stopped / restarted). Emits nothing. */
  reset(): void {
    this.phase = 'no-face';
    this.acquired = false;
    this.lastT = null;
    this.now = 0;
    this.onset = null;
    this.missingSince = null;
    this.singleSince = null;
    this.cooldownUntil = 0;
    this.selectedUntil = 0;
    this.lastDiscard = null;
    this.eyesOpen = false;
  }

  /**
   * Processing was interrupted (tab hidden, camera paused). Any pending closure is discarded as
   * stale and the machine must see open eyes again before it re-arms.
   */
  interrupt(): BlinkGestureEvent[] {
    const ev: BlinkGestureEvent[] = [];
    if (this.phase === 'closing') this.discard(ev, this.now, 'stale');
    if (this.phase === 'ready' || this.phase === 'cooldown') this.enterCooldown(this.now, 0);
    this.lastT = null;
    this.missingSince = null;
    this.singleSince = null;
    return ev;
  }

  snapshot(): GestureSnapshot {
    const closing = this.phase === 'closing' && this.onset !== null;
    let status: GestureSnapshot['status'];
    switch (this.phase) {
      case 'cooldown':
        status = this.now < this.selectedUntil ? 'selected' : 'cooldown';
        break;
      default:
        status = this.phase;
    }
    return {
      status,
      closureProgress: closing ? clamp01((this.now - (this.onset as number)) / Math.max(1, this.cfg.minClosureMs)) : 0,
      closingSince: closing ? this.onset : null,
      lastDiscard: this.phase === 'cooldown' ? this.lastDiscard : null,
      awaitingOpen: this.phase === 'cooldown' && !this.eyesOpen,
    };
  }

  push(f: BlinkFrame): BlinkGestureEvent[] {
    const ev: BlinkGestureEvent[] = [];
    if (!Number.isFinite(f.t)) return ev;

    // Out-of-order or duplicate timestamp: ignore the frame's content entirely; a pending
    // closure can no longer be trusted.
    if (this.lastT !== null && f.t <= this.lastT) {
      if (this.phase === 'closing') this.discard(ev, this.lastT, 'stale');
      return ev;
    }
    // Long gap (throttling, sleep, hidden tab): discard the closure, never commit across it.
    if (this.lastT !== null && f.t - this.lastT > this.timing.staleGapMs && this.phase === 'closing') {
      this.discard(ev, f.t, 'stale');
    }
    this.lastT = f.t;
    this.now = f.t;
    const t = f.t;
    const faces = Math.max(0, Math.floor(f.faces));
    const score = typeof f.score === 'number' && Number.isFinite(f.score) ? f.score : null;

    // ---- Face presence ----
    if (faces === 0 || (faces === 1 && score === null)) {
      // A closure cannot be measured across a frame without a face or a score: discard it now
      // (even a short dropout), but only raise the face-lost pause via the >faceLostMs rule below.
      if (this.phase === 'closing') this.discard(ev, t, faces === 0 ? 'face-lost' : 'stale');
      this.singleSince = null;
      if (this.missingSince === null) this.missingSince = t;
      if (t - this.missingSince >= this.timing.faceLostMs && this.phase !== 'no-face' && this.phase !== 'face-lost') {
        if (this.acquired) {
          this.phase = 'face-lost';
          ev.push({ type: 'face-lost', at: t });
        } else {
          this.phase = 'no-face';
        }
      }
      return ev; // brief dropouts: hold the current phase, no score to evaluate
    }
    this.missingSince = null;

    if (faces > 1) {
      // Ambiguous: never commit. Hold until exactly one face is stable again.
      this.singleSince = null;
      if (this.phase === 'closing') this.discard(ev, t, 'multiple-faces');
      this.phase = 'multiple-faces';
      return ev;
    }

    // ---- Exactly one face with a score ----
    if (this.phase === 'no-face' || this.phase === 'face-lost' || this.phase === 'multiple-faces') {
      if (this.singleSince === null) this.singleSince = t;
      if (t - this.singleSince < this.timing.stableFaceMs) return ev;
      ev.push({ type: 'face-found', at: t });
      this.acquired = true;
      this.enterCooldown(t, 0); // re-arm only once the eyes are open
      this.lastDiscard = null;
    }

    const s = score as number;
    const { closedThreshold, openThreshold, minClosureMs, maxClosureMs, cooldownMs } = this.cfg;
    const open = s <= openThreshold;

    switch (this.phase) {
      case 'ready':
        if (s >= closedThreshold) {
          this.phase = 'closing';
          this.onset = t;
          this.lastDiscard = null;
          ev.push({ type: 'closure-start', at: t });
        }
        break;
      case 'closing': {
        const onset = this.onset as number;
        const duration = t - onset;
        if (duration > maxClosureMs) {
          this.discard(ev, t, 'too-long');
          this.eyesOpen = open;
        } else if (open) {
          if (duration >= minClosureMs) {
            this.onset = null;
            ev.push({ type: 'select', at: t, durationMs: duration });
            this.enterCooldown(t, cooldownMs);
            this.selectedUntil = t + Math.min(this.timing.selectedFlashMs, cooldownMs);
            this.lastDiscard = null;
          } else {
            this.discard(ev, t, 'too-short');
          }
          this.eyesOpen = true;
        }
        break;
      }
      case 'cooldown':
        if (open) this.eyesOpen = true;
        else if (s >= closedThreshold) this.eyesOpen = false;
        if (t >= this.cooldownUntil && this.eyesOpen && open) {
          this.phase = 'ready';
          this.lastDiscard = null;
        }
        break;
    }
    return ev;
  }

  private enterCooldown(t: number, ms: number) {
    this.phase = 'cooldown';
    this.onset = null;
    this.cooldownUntil = t + ms;
    this.selectedUntil = 0;
    this.eyesOpen = false;
  }

  private discard(ev: BlinkGestureEvent[], at: number, reason: DiscardReason) {
    if (this.phase !== 'closing' || this.onset === null) return;
    ev.push({ type: 'discard', at, durationMs: Math.max(0, at - this.onset), reason });
    this.enterCooldown(at, this.timing.shortCooldownMs);
    this.lastDiscard = reason;
  }
}
