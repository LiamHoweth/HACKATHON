// Pure cross-gesture arbiter (no DOM, no React, no timers): the ONLY emitter of accepted gesture
// commands. Inputs are detector proposals — BlinkGesture events (closure-start / select / discard
// / face-lost / face-found) and BrowGesture events (brow-start / brow-next / brow-cancel). Output
// is an ordered list of instructions for the runtime: freeze/unfreeze the highlight, accept a
// command (with a fresh physical cycle id), tell the brow machine to cancel, or show feedback.
//
// Rules (brief §19 "Exclusive gesture arbitration", §24 "Cross-gesture arbiter"):
// - Blink closure onset freezes the highlight immediately and pre-empts an incomplete raise.
// - While a closure is in progress, no brow NEXT is ever accepted (never move after closure).
// - A brow-start and a closure-start within AMBIGUITY_WINDOW_MS of each other are ambiguous:
//   the raise is cancelled and the blink cycle is discarded — no command, calm feedback.
// - One physical cycle yields at most one accepted command; a brow-next needs the brow-start of
//   the same raise to have been seen since the last reset, and a select needs the closure-start
//   of the same closure. reset() (new surface / session) invalidates both.
// - "Eyebrow raise detected — Next" / "Blink detected — Selected" are emitted only after accept.
import type { BlinkGestureEvent, GestureCommand, GestureFeedback } from '@/runtime/contract';
import type { BrowEvent } from './brow-gesture';

export type ArbiterOutput =
  | { type: 'freeze'; at: number }                         // blink closure began: freeze highlight now
  | { type: 'unfreeze'; at: number }
  | { type: 'accept'; command: GestureCommand; at: number; cycleId: string }
  | { type: 'cancel-brow'; reason: 'blink-preempted' | 'ambiguous' }  // runtime must call brow.cancel()
  | { type: 'feedback'; feedback: GestureFeedback };

/** Brow-start and closure-start this close together (either order) are treated as ambiguous. */
export const AMBIGUITY_WINDOW_MS = 120;

/** Feedback lines (brief §18). Progress kinds carry progress01 only (never intent confidence). */
export const GESTURE_FEEDBACK = {
  faceFound: { kind: 'face-detected', label: 'Face detected — Ready' },
  idle: { kind: 'face-detected', label: 'Raise eyebrows to move' },
  browTooShort: { kind: 'face-detected', label: 'Not held long enough — no move' },
  browAccepted: { kind: 'brow-accepted', label: 'Eyebrow raise detected — Next' },
  blinkAccepted: { kind: 'blink-accepted', label: 'Blink detected — Selected' },
  ambiguous: { kind: 'ambiguous', label: 'Not sure which gesture — nothing happened. Try again.' },
  trackingPaused: { kind: 'tracking-paused', label: 'Tracking lost — Paused' },
} as const satisfies Record<string, GestureFeedback>;

const clamp01 = (x: number) => (Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0);

/** Eyebrow hold progress (0..1 of holdMs). Never a command and never "Next". */
export function browProgressFeedback(progress01: number): GestureFeedback {
  return { kind: 'brow-progress', progress01: clamp01(progress01), label: 'Eyebrows up — keep holding' };
}

/** Deliberate-closure progress (0..1 of minClosureMs). Never a command and never "Selected". */
export function blinkProgressFeedback(progress01: number): GestureFeedback {
  return { kind: 'blink-progress', progress01: clamp01(progress01), label: 'Eyes closed — open to select' };
}

const fb = (feedback: GestureFeedback): ArbiterOutput => ({ type: 'feedback', feedback: { ...feedback } });

export class GestureArbiter {
  private readonly newId: () => string;
  private readonly browEnabled: () => boolean;
  /** Onset of the current blink closure, or null when eyes are not closing. */
  private closureAt: number | null = null;
  /** The current closure overlapped a brow-start ambiguously: it can never select. */
  private closureAmbiguous = false;
  /** Onset of the brow raise in progress (seen since last reset), or null. */
  private browStartAt: number | null = null;

  constructor(opts: { newId: () => string; browEnabled: () => boolean }) {
    this.newId = opts.newId;
    this.browEnabled = opts.browEnabled;
  }

  get closing(): boolean {
    return this.closureAt !== null;
  }

  /** Surface changed or session reset: drop pending state; old cycles can't complete. */
  reset(): void {
    this.closureAt = null;
    this.closureAmbiguous = false;
    this.browStartAt = null;
  }

  onBlink(e: BlinkGestureEvent): ArbiterOutput[] {
    switch (e.type) {
      case 'brow-start':
      case 'brow-next':
      case 'brow-cancel':
        return this.onBrow(e);
      case 'closure-start':
        return this.onClosureStart(e.at);
      case 'select':
        return this.onSelect(e.at);
      case 'discard':
        return this.endClosure(e.at);
      case 'face-lost': {
        const out = this.endClosure(e.at);
        this.browStartAt = null;
        out.push(fb(GESTURE_FEEDBACK.trackingPaused));
        return out;
      }
      case 'face-found':
        return [fb(GESTURE_FEEDBACK.faceFound)];
    }
  }

  onBrow(e: BrowEvent): ArbiterOutput[] {
    switch (e.type) {
      case 'brow-start': {
        if (!this.browEnabled()) return [];
        if (this.closureAt !== null) {
          // A raise beginning during a closure never counts. Right at closure onset it is
          // ambiguous (discard both); later the blink simply wins.
          this.browStartAt = null;
          if (!this.closureAmbiguous && Math.abs(e.at - this.closureAt) <= AMBIGUITY_WINDOW_MS) {
            this.closureAmbiguous = true;
            return [{ type: 'cancel-brow', reason: 'ambiguous' }, fb(GESTURE_FEEDBACK.ambiguous)];
          }
          return [{ type: 'cancel-brow', reason: 'blink-preempted' }];
        }
        this.browStartAt = e.at;
        return [fb(browProgressFeedback(0))];
      }
      case 'brow-next': {
        // Never move after closure onset; never accept a raise whose start was not seen since the
        // last reset/closure (old physical cycle); never accept when brow navigation is off.
        if (this.closureAt !== null || this.browStartAt === null || !this.browEnabled()) {
          this.browStartAt = null;
          return [];
        }
        this.browStartAt = null;
        return [
          { type: 'accept', command: 'NAV_NEXT', at: e.at, cycleId: this.newId() },
          fb(GESTURE_FEEDBACK.browAccepted),
        ];
      }
      case 'brow-cancel': {
        const wasPending = this.browStartAt !== null;
        this.browStartAt = null;
        if (wasPending && e.reason === 'too-short' && this.closureAt === null) return [fb(GESTURE_FEEDBACK.browTooShort)];
        return [];
      }
    }
  }

  private onClosureStart(at: number): ArbiterOutput[] {
    if (this.closureAt !== null) return []; // duplicate onset: already frozen
    this.closureAt = at;
    this.closureAmbiguous = false;
    const out: ArbiterOutput[] = [{ type: 'freeze', at }];
    const browStart = this.browStartAt;
    this.browStartAt = null; // a raise in progress can never complete after closure onset
    if (this.browEnabled()) {
      if (browStart !== null && Math.abs(at - browStart) <= AMBIGUITY_WINDOW_MS) {
        this.closureAmbiguous = true;
        out.push({ type: 'cancel-brow', reason: 'ambiguous' }, fb(GESTURE_FEEDBACK.ambiguous));
        return out;
      }
      out.push({ type: 'cancel-brow', reason: 'blink-preempted' });
    }
    out.push(fb(blinkProgressFeedback(0)));
    return out;
  }

  private onSelect(at: number): ArbiterOutput[] {
    if (this.closureAt === null) return []; // closure began before reset (old cycle) or unseen
    const ambiguous = this.closureAmbiguous;
    const out = this.endClosure(at);
    if (ambiguous) return out; // discard: no command
    out.unshift({ type: 'accept', command: 'SELECT', at, cycleId: this.newId() });
    out.push(fb(GESTURE_FEEDBACK.blinkAccepted));
    return out;
  }

  private endClosure(at: number): ArbiterOutput[] {
    if (this.closureAt === null) return [];
    this.closureAt = null;
    this.closureAmbiguous = false;
    return [{ type: 'unfreeze', at }];
  }
}
