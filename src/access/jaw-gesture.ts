// Pure, framework-free jaw-drop BACK state machine (no DOM, no React, no timers).
// Input: one frame per processed camera image with a monotonic timestamp (ms), the face count and
// the `jawOpen` blendshape score (0 closed … 1 wide open). Output: JawEvents. 'jaw-back' is only a
// PROPOSED NAV_PREV: the gesture arbiter is the only emitter of accepted commands.
//
// Robustness (talking, yawning, casual expressions must never move the highlight):
// - Conservative absolute threshold (jawOpen ≥ openThreshold) with hysteresis: the drop ends only
//   when the score falls to ≤ releaseThreshold.
// - The drop must be held continuously for minHoldMs (talking is short repeated opens).
// - BACK is proposed when the mouth CLOSES after a hold between minHoldMs and maxHoldMs, so a
//   yawn (a long open) is ignored. A held drop shows progress only, never a command.
// - After a BACK (or a too-long open) a cooldown must pass before a new drop can start, and a
//   closed frame must be seen first after construction, reset(), a face dropout or a stale gap.
// - Exactly one face must have been tracked continuously for stableFaceMs before a drop starts.
// Thresholds and durations are prototype defaults, not clinical values.

export type JawFrame = { t: number; faces: number; score: number | null }; // t = monotonic ms; score 0..1

export type JawCancelReason = 'too-short' | 'too-long' | 'face-lost' | 'ambiguous' | 'stale' | 'preempted';

export type JawEvent =
  | { type: 'jaw-start'; at: number }
  | { type: 'jaw-back'; at: number; heldMs: number } // proposed NAV_PREV, at most once per drop
  | { type: 'jaw-cancel'; at: number; heldMs: number; reason: JawCancelReason };

export type JawConfig = {
  /** jawOpen at or above which the jaw counts as dropped. */
  openThreshold: number;
  /** jawOpen at or below which the jaw counts as closed again (hysteresis). */
  releaseThreshold: number;
  /** Continuous open time required before closing counts as BACK. */
  minHoldMs: number;
  /** Opens longer than this (yawns) never count. */
  maxHoldMs: number;
  /** Re-arm delay after a BACK or a too-long open. */
  cooldownMs: number;
};

/** Conservative defaults (no jaw calibration yet). Not clinical values. */
export const DEFAULT_JAW_CONFIG: JawConfig = {
  openThreshold: 0.5,
  releaseThreshold: 0.3,
  minHoldMs: 400,
  maxHoldMs: 1500,
  cooldownMs: 700,
};

export const JAW_TIMING = {
  staleGapMs: 700,
  stableFaceMs: 500,
} as const;

export type JawStatus = 'neutral' | 'open' | 'rearming';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class JawGesture {
  private phase: JawStatus = 'neutral';
  private needClosed = true;
  private lastT: number | null = null;
  private stableSince: number | null = null;
  private onset: number | null = null;
  private rearmUntil = 0;
  private cfg: JawConfig;

  constructor(cfg: JawConfig = DEFAULT_JAW_CONFIG) {
    this.cfg = { ...cfg };
  }

  get status(): JawStatus {
    return this.phase;
  }

  /** 0..1 of minHoldMs while open (progress only, never a command). */
  progress(t: number): number {
    if (this.phase !== 'open' || this.onset === null || !Number.isFinite(t)) return 0;
    return clamp01((t - this.onset) / Math.max(1, this.cfg.minHoldMs));
  }

  /** New surface / session: drop a drop in progress; a closed frame must be seen again. */
  reset(): void {
    this.phase = this.phase === 'rearming' ? 'rearming' : 'neutral';
    this.onset = null;
    this.needClosed = true;
  }

  /** Cancel a drop in progress (e.g. blink closure onset or a brow raise at the same time). */
  cancel(reason: Exclude<JawCancelReason, 'too-short' | 'too-long'>, at: number): JawEvent[] {
    const ev: JawEvent[] = [];
    this.cancelOpen(ev, at, reason);
    return ev;
  }

  push(f: JawFrame): JawEvent[] {
    const ev: JawEvent[] = [];
    if (!Number.isFinite(f.t)) return ev;
    const t = f.t;
    if (this.lastT !== null && t <= this.lastT) {
      this.cancelOpen(ev, this.lastT, 'stale');
      this.untrusted();
      return ev;
    }
    if (this.lastT !== null && t - this.lastT > JAW_TIMING.staleGapMs) {
      this.cancelOpen(ev, t, 'stale');
      this.untrusted();
    }
    this.lastT = t;

    const faces = Number.isFinite(f.faces) ? Math.max(0, Math.floor(f.faces)) : 0;
    const score = typeof f.score === 'number' && Number.isFinite(f.score) ? f.score : null;
    if (faces !== 1 || score === null) {
      this.cancelOpen(ev, t, faces > 1 ? 'ambiguous' : 'face-lost');
      this.untrusted();
      return ev;
    }
    if (this.stableSince === null) this.stableSince = t;
    const stable = t - this.stableSince >= JAW_TIMING.stableFaceMs;
    const { openThreshold, releaseThreshold, minHoldMs, maxHoldMs, cooldownMs } = this.cfg;
    const closed = score <= releaseThreshold;

    switch (this.phase) {
      case 'neutral':
        if (closed) {
          if (stable) this.needClosed = false;
        } else if (!this.needClosed && score >= openThreshold) {
          this.phase = 'open';
          this.onset = t;
          ev.push({ type: 'jaw-start', at: t });
        }
        break;
      case 'open': {
        const held = t - (this.onset as number);
        if (closed) {
          this.onset = null;
          if (held < minHoldMs) {
            ev.push({ type: 'jaw-cancel', at: t, heldMs: held, reason: 'too-short' });
            this.phase = 'neutral';
            this.needClosed = false; // this frame is itself closed
          } else if (held > maxHoldMs) {
            ev.push({ type: 'jaw-cancel', at: t, heldMs: held, reason: 'too-long' });
            this.enterRearm(t, cooldownMs);
          } else {
            ev.push({ type: 'jaw-back', at: t, heldMs: held });
            this.enterRearm(t, cooldownMs);
          }
        } else if (held > maxHoldMs) {
          // A yawn-length open: give up now (no command) and wait for a closed jaw + cooldown.
          ev.push({ type: 'jaw-cancel', at: t, heldMs: held, reason: 'too-long' });
          this.onset = null;
          this.phase = 'rearming';
          this.rearmUntil = Number.POSITIVE_INFINITY; // re-armed by the first closed frame below
        }
        break;
      }
      case 'rearming':
        if (!closed) {
          if (this.rearmUntil !== Number.POSITIVE_INFINITY) this.rearmUntil = Math.max(this.rearmUntil, t + cooldownMs);
        } else if (this.rearmUntil === Number.POSITIVE_INFINITY) {
          this.rearmUntil = t + cooldownMs;
        } else if (t >= this.rearmUntil) {
          this.phase = 'neutral';
          this.needClosed = false;
        }
        break;
    }
    return ev;
  }

  private enterRearm(t: number, cooldownMs: number) {
    this.phase = 'rearming';
    this.rearmUntil = t + cooldownMs;
  }

  private untrusted() {
    this.needClosed = true;
    this.stableSince = null;
  }

  private cancelOpen(ev: JawEvent[], at: number, reason: JawCancelReason) {
    if (this.phase !== 'open' || this.onset === null) return;
    ev.push({ type: 'jaw-cancel', at, heldMs: Math.max(0, at - this.onset), reason });
    this.phase = 'neutral';
    this.onset = null;
    this.needClosed = true;
  }
}
