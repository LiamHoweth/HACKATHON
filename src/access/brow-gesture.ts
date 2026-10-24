// Pure, framework-free eyebrow-raise NEXT state machine (no DOM, no React, no timers).
// Input: one frame per processed camera image with a monotonic timestamp (ms), the face count,
// and a brow-raise score (0 rest … 1 fully raised, e.g. from browInnerUp/browOuterUp). Output:
// BrowEvents. 'brow-next' is only a PROPOSED NAV_NEXT: the gesture arbiter is the only emitter
// of accepted commands (a blink closure onset pre-empts a pending raise).
//
// States: NEUTRAL → (score ≥ raisedThreshold) RISING → held continuously ≥ holdMs → one
// 'brow-next' → LATCHED (further raised frames ignored; a long hold never repeats) → stable
// score ≤ releaseThreshold for releaseMs → REARMING for cooldownMs → NEUTRAL.
// While RISING, a frame counts as "still raised" while score > releaseThreshold (hysteresis band).
// After construction, reset(), or any non-'too-short' cancel, a neutral frame (score ≤
// releaseThreshold) must be seen before a new raise can start, so a raise held across a surface
// change, face dropout or blink can never carry over into a NEXT.
// Thresholds and durations are prototype defaults, not clinical values.
import type { BlinkGestureEvent, BrowCalibration, BrowStatus } from '@/runtime/contract';

export type BrowFrame = { t: number; faces: number; score: number | null }; // t = monotonic ms; score 0..1

export type BrowEvent =
  | { type: 'brow-start'; at: number }
  | { type: 'brow-next'; at: number; heldMs: number }      // proposed NAV_NEXT, exactly once per raise
  | { type: 'brow-cancel'; at: number; heldMs: number; reason: 'too-short' | 'blink-preempted' | 'face-lost' | 'ambiguous' | 'stale' };

// Compile-time guarantee that BrowEvent stays a subset of the contract's BlinkGestureEvent.
type _BrowEventIsGestureEvent = BrowEvent extends BlinkGestureEvent ? true : never;
const _browEventCheck: _BrowEventIsGestureEvent = true;
void _browEventCheck;

export type BrowCancelReason = Extract<BrowEvent, { type: 'brow-cancel' }>['reason'];

/**
 * Provisional defaults used before brow calibration. Scores are on the 0..1 blendshape scale;
 * holdMs 500 is the user-requested hold. Not clinical values; calibration replaces the thresholds.
 */
export const DEFAULT_BROW_CALIBRATION: BrowCalibration = {
  neutral: 0.1,
  raisedThreshold: 0.45,
  releaseThreshold: 0.3,
  holdMs: 500,
  releaseMs: 250,
  cooldownMs: 500,
};

export const BROW_TIMING = {
  /** A gap between frames longer than this makes an in-progress raise untrustworthy. */
  staleGapMs: 700,
} as const;

type Phase = Exclude<BrowStatus, 'disabled'>;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class BrowGesture {
  private phase: Phase = 'neutral';
  private needNeutral = true;
  private lastT: number | null = null;
  private onset: number | null = null;
  private releaseSince: number | null = null;
  private rearmUntil = 0;
  private cal: BrowCalibration;

  constructor(cal: BrowCalibration = DEFAULT_BROW_CALIBRATION) {
    this.cal = copyCal(cal);
  }

  get calibration(): BrowCalibration {
    return copyCal(this.cal);
  }

  setCalibration(cal: BrowCalibration): void {
    this.cal = copyCal(cal);
  }

  get status(): BrowStatus {
    return this.phase;
  }

  /** 0..1 elapsed/holdMs while rising (progress only, never a command); 0 otherwise. */
  progress(t: number): number {
    if (this.phase !== 'rising' || this.onset === null || !Number.isFinite(t)) return 0;
    return clamp01((t - this.onset) / Math.max(1, this.cal.holdMs));
  }

  /** New surface / session: back to neutral, and a neutral frame must be seen before a raise. */
  reset(): void {
    this.phase = 'neutral';
    this.needNeutral = true;
    this.lastT = null;
    this.onset = null;
    this.releaseSince = null;
    this.rearmUntil = 0;
  }

  /** Cancel any in-progress raise (e.g. blink closure onset). Latched/rearming state is kept. */
  cancel(reason: Exclude<BrowCancelReason, 'too-short'>, at: number): BrowEvent[] {
    const ev: BrowEvent[] = [];
    this.cancelRising(ev, at, reason);
    return ev;
  }

  push(f: BrowFrame): BrowEvent[] {
    const ev: BrowEvent[] = [];
    if (!Number.isFinite(f.t)) return ev;
    const t = f.t;

    // Out-of-order or duplicate timestamp: ignore the frame; a pending raise is untrustworthy.
    if (this.lastT !== null && t <= this.lastT) {
      this.cancelRising(ev, this.lastT, 'stale');
      return ev;
    }
    // Long gap (throttling, sleep, hidden tab): never commit across it, and never count
    // unobserved time toward a stable release.
    if (this.lastT !== null && t - this.lastT > BROW_TIMING.staleGapMs) {
      this.cancelRising(ev, t, 'stale');
      this.releaseSince = null;
    }
    this.lastT = t;

    const faces = Number.isFinite(f.faces) ? Math.max(0, Math.floor(f.faces)) : 0;
    const score = typeof f.score === 'number' && Number.isFinite(f.score) ? f.score : null;

    if (faces !== 1 || score === null) {
      // No measurable single face: cancel a raise in progress, and require observed neutral
      // time again before a latched raise can release.
      this.cancelRising(ev, t, faces > 1 ? 'ambiguous' : 'face-lost');
      this.releaseSince = null;
      return ev;
    }

    const { raisedThreshold, releaseThreshold, holdMs, releaseMs, cooldownMs } = this.cal;
    const released = score <= releaseThreshold;

    switch (this.phase) {
      case 'neutral':
        if (released) this.needNeutral = false;
        else if (!this.needNeutral && score >= raisedThreshold) {
          this.phase = 'rising';
          this.onset = t;
          ev.push({ type: 'brow-start', at: t });
          this.maybeCommit(ev, t, holdMs); // holdMs ≤ 0 commits on the onset frame
        }
        break;
      case 'rising': {
        const onset = this.onset as number;
        if (released) {
          ev.push({ type: 'brow-cancel', at: t, heldMs: t - onset, reason: 'too-short' });
          this.phase = 'neutral';
          this.onset = null;
          this.needNeutral = false; // this frame is itself neutral
        } else {
          // Commit on the first still-raised frame with t − onset ≥ holdMs (≤ one frame late).
          this.maybeCommit(ev, t, holdMs);
        }
        break;
      }
      case 'latched':
        if (released) {
          if (this.releaseSince === null) this.releaseSince = t;
          if (t - this.releaseSince >= releaseMs) {
            this.phase = 'rearming';
            this.rearmUntil = t + cooldownMs;
            this.releaseSince = null;
          }
        } else {
          this.releaseSince = null;
        }
        break;
      case 'rearming':
        if (score >= raisedThreshold) {
          // Raised again during cooldown: does not count; a stable release is required again.
          this.phase = 'latched';
          this.releaseSince = null;
        } else if (released && t >= this.rearmUntil) {
          this.phase = 'neutral';
          this.needNeutral = false;
        }
        break;
    }
    return ev;
  }

  private maybeCommit(ev: BrowEvent[], t: number, holdMs: number) {
    if (this.phase !== 'rising' || this.onset === null) return;
    const held = t - this.onset;
    if (held < holdMs) return;
    ev.push({ type: 'brow-next', at: t, heldMs: held });
    this.phase = 'latched';
    this.onset = null;
    this.releaseSince = null;
  }

  private cancelRising(ev: BrowEvent[], at: number, reason: BrowCancelReason) {
    if (this.phase !== 'rising' || this.onset === null) return;
    ev.push({ type: 'brow-cancel', at, heldMs: Math.max(0, at - this.onset), reason });
    this.phase = 'neutral';
    this.onset = null;
    this.needNeutral = true;
  }
}

function copyCal(c: BrowCalibration): BrowCalibration {
  return {
    neutral: c.neutral,
    raisedThreshold: c.raisedThreshold,
    releaseThreshold: c.releaseThreshold,
    holdMs: c.holdMs,
    releaseMs: c.releaseMs,
    cooldownMs: c.cooldownMs,
  };
}
