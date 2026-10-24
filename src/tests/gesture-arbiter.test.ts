import { describe, expect, it } from 'vitest';
import { BlinkGesture, DEFAULT_GESTURE_CONFIG } from '@/access/blink-gesture';
import { BrowGesture, DEFAULT_BROW_CALIBRATION } from '@/access/brow-gesture';
import {
  AMBIGUITY_WINDOW_MS,
  GESTURE_FEEDBACK,
  GestureArbiter,
  blinkProgressFeedback,
  browProgressFeedback,
  type ArbiterOutput,
} from '@/access/gesture-arbiter';

function make(browOn = true) {
  let n = 0;
  let enabled = browOn;
  const a = new GestureArbiter({ newId: () => `c${++n}`, browEnabled: () => enabled });
  return { a, setBrow: (v: boolean) => { enabled = v; } };
}

const accepts = (out: ArbiterOutput[]) => out.filter((o): o is Extract<ArbiterOutput, { type: 'accept' }> => o.type === 'accept');
const labels = (out: ArbiterOutput[]) => out.flatMap((o) => (o.type === 'feedback' ? [o.feedback.label] : []));

describe('GestureArbiter — single gestures', () => {
  it('brow-start → brow-next accepts NAV_NEXT once with a fresh cycle id', () => {
    const { a } = make();
    const start = a.onBrow({ type: 'brow-start', at: 100 });
    expect(start).toEqual([{ type: 'feedback', feedback: browProgressFeedback(0) }]);
    expect(labels(start)).not.toContain(GESTURE_FEEDBACK.browAccepted.label);
    const out = a.onBrow({ type: 'brow-next', at: 600, heldMs: 500 });
    expect(accepts(out)).toEqual([{ type: 'accept', command: 'NAV_NEXT', at: 600, cycleId: 'c1' }]);
    expect(labels(out)).toEqual(['Eyebrow raise detected — Next']);
    // A duplicate next for the same raise is ignored.
    expect(a.onBrow({ type: 'brow-next', at: 650, heldMs: 550 })).toEqual([]);
  });

  it('brow-next without a seen brow-start (old cycle) is ignored', () => {
    const { a } = make();
    expect(a.onBrow({ type: 'brow-next', at: 600, heldMs: 500 })).toEqual([]);
  });

  it('too-short brow-cancel gives calm feedback and no command', () => {
    const { a } = make();
    a.onBrow({ type: 'brow-start', at: 100 });
    const out = a.onBrow({ type: 'brow-cancel', at: 400, heldMs: 300, reason: 'too-short' });
    expect(accepts(out)).toEqual([]);
    expect(out).toEqual([{ type: 'feedback', feedback: GESTURE_FEEDBACK.browTooShort }]);
    expect(a.onBrow({ type: 'brow-next', at: 600, heldMs: 500 })).toEqual([]);
  });

  it('brow events are ignored while brow navigation is disabled', () => {
    const { a } = make(false);
    expect(a.onBrow({ type: 'brow-start', at: 100 })).toEqual([]);
    expect(a.onBrow({ type: 'brow-next', at: 600, heldMs: 500 })).toEqual([]);
    // Blink closure does not ask for a brow cancel when brows are off.
    const out = a.onBlink({ type: 'closure-start', at: 1000 });
    expect(out.some((o) => o.type === 'cancel-brow')).toBe(false);
    expect(out[0]).toEqual({ type: 'freeze', at: 1000 });
  });

  it('closure-start freezes; select accepts SELECT then unfreezes', () => {
    const { a } = make();
    const c = a.onBlink({ type: 'closure-start', at: 1000 });
    expect(c).toEqual([
      { type: 'freeze', at: 1000 },
      { type: 'cancel-brow', reason: 'blink-preempted' },
      { type: 'feedback', feedback: blinkProgressFeedback(0) },
    ]);
    expect(a.closing).toBe(true);
    const s = a.onBlink({ type: 'select', at: 1700, durationMs: 700 });
    expect(s).toEqual([
      { type: 'accept', command: 'SELECT', at: 1700, cycleId: 'c1' },
      { type: 'unfreeze', at: 1700 },
      { type: 'feedback', feedback: GESTURE_FEEDBACK.blinkAccepted },
    ]);
    expect(a.closing).toBe(false);
    // Duplicate select for the same closure: nothing.
    expect(a.onBlink({ type: 'select', at: 1750, durationMs: 750 })).toEqual([]);
  });

  it('discard unfreezes with no command or feedback spam', () => {
    const { a } = make();
    a.onBlink({ type: 'closure-start', at: 1000 });
    expect(a.onBlink({ type: 'discard', at: 1200, durationMs: 200, reason: 'too-short' })).toEqual([{ type: 'unfreeze', at: 1200 }]);
    expect(a.closing).toBe(false);
  });

  it('face-lost pauses tracking and ends a closure; face-found reports ready', () => {
    const { a } = make();
    a.onBrow({ type: 'brow-start', at: 900 });
    a.onBlink({ type: 'closure-start', at: 1100 });
    const out = a.onBlink({ type: 'face-lost', at: 1300 });
    expect(out).toEqual([{ type: 'unfreeze', at: 1300 }, { type: 'feedback', feedback: GESTURE_FEEDBACK.trackingPaused }]);
    expect(labels(out)).toEqual(['Tracking lost — Paused']);
    expect(a.onBlink({ type: 'select', at: 1400, durationMs: 300 })).toEqual([]);
    expect(a.onBlink({ type: 'face-found', at: 2000 })).toEqual([{ type: 'feedback', feedback: GESTURE_FEEDBACK.faceFound }]);
  });

  it('brow-* events delivered through onBlink are routed to onBrow', () => {
    const { a } = make();
    a.onBlink({ type: 'brow-start', at: 100 });
    expect(accepts(a.onBlink({ type: 'brow-next', at: 600, heldMs: 500 }))).toHaveLength(1);
  });

  it('progress feedback clamps to 0..1 and is never an accepted label', () => {
    expect(browProgressFeedback(1.7).progress01).toBe(1);
    expect(browProgressFeedback(-1).progress01).toBe(0);
    expect(browProgressFeedback(Number.NaN).progress01).toBe(0);
    expect(blinkProgressFeedback(0.4)).toMatchObject({ kind: 'blink-progress', progress01: 0.4 });
    expect(browProgressFeedback(0.99).label).not.toBe(GESTURE_FEEDBACK.browAccepted.label);
  });
});

describe('GestureArbiter — cross-gesture conflicts (GEST-05/06)', () => {
  it('GEST-06: a brow raise in progress is pre-empted by closure onset; a late brow-next is ignored', () => {
    const { a } = make();
    a.onBrow({ type: 'brow-start', at: 1000 });
    const c = a.onBlink({ type: 'closure-start', at: 1300 });
    expect(c).toContainEqual({ type: 'cancel-brow', reason: 'blink-preempted' });
    expect(a.onBrow({ type: 'brow-next', at: 1500, heldMs: 500 })).toEqual([]);
    const s = a.onBlink({ type: 'select', at: 2000, durationMs: 700 });
    expect(accepts(s).map((x) => x.command)).toEqual(['SELECT']);
    // Even after the closure ends, the pre-empted raise can never produce a next.
    expect(a.onBrow({ type: 'brow-next', at: 2100, heldMs: 1100 })).toEqual([]);
  });

  it('GEST-06: a brow-start during a closure (outside the ambiguity window) is pre-empted', () => {
    const { a } = make();
    a.onBlink({ type: 'closure-start', at: 1000 });
    expect(a.onBrow({ type: 'brow-start', at: 1000 + AMBIGUITY_WINDOW_MS + 50 })).toEqual([{ type: 'cancel-brow', reason: 'blink-preempted' }]);
    expect(a.onBrow({ type: 'brow-next', at: 1700, heldMs: 500 })).toEqual([]);
    expect(accepts(a.onBlink({ type: 'select', at: 1800, durationMs: 800 }))).toHaveLength(1);
  });

  it('ambiguous: brow-start then closure-start within the window → cancel brow, discard blink, no command', () => {
    const { a } = make();
    a.onBrow({ type: 'brow-start', at: 1000 });
    const c = a.onBlink({ type: 'closure-start', at: 1000 + AMBIGUITY_WINDOW_MS });
    expect(c).toEqual([
      { type: 'freeze', at: 1120 },
      { type: 'cancel-brow', reason: 'ambiguous' },
      { type: 'feedback', feedback: GESTURE_FEEDBACK.ambiguous },
    ]);
    expect(a.onBrow({ type: 'brow-next', at: 1500, heldMs: 500 })).toEqual([]);
    const s = a.onBlink({ type: 'select', at: 1900, durationMs: 780 });
    expect(s).toEqual([{ type: 'unfreeze', at: 1900 }]);
  });

  it('ambiguous: closure-start then brow-start within the window → same discard', () => {
    const { a } = make();
    a.onBlink({ type: 'closure-start', at: 1000 });
    const b = a.onBrow({ type: 'brow-start', at: 1060 });
    expect(b).toEqual([{ type: 'cancel-brow', reason: 'ambiguous' }, { type: 'feedback', feedback: GESTURE_FEEDBACK.ambiguous }]);
    expect(accepts(a.onBlink({ type: 'select', at: 1800, durationMs: 800 }))).toEqual([]);
    // The next closure is a fresh, unambiguous cycle.
    a.onBlink({ type: 'closure-start', at: 3000 });
    expect(accepts(a.onBlink({ type: 'select', at: 3800, durationMs: 800 }))).toHaveLength(1);
  });

  it('a raise that started well before the closure is pre-empted, not ambiguous', () => {
    const { a } = make();
    a.onBrow({ type: 'brow-start', at: 1000 });
    const c = a.onBlink({ type: 'closure-start', at: 1000 + AMBIGUITY_WINDOW_MS + 1 });
    expect(c).toContainEqual({ type: 'cancel-brow', reason: 'blink-preempted' });
    expect(accepts(a.onBlink({ type: 'select', at: 1900, durationMs: 780 }))).toHaveLength(1);
  });

  it('select and confirm need two distinct closures with different cycle ids', () => {
    const { a } = make();
    a.onBlink({ type: 'closure-start', at: 1000 });
    const first = accepts(a.onBlink({ type: 'select', at: 1700, durationMs: 700 }));
    a.onBrow({ type: 'brow-start', at: 2600 });
    const nav = accepts(a.onBrow({ type: 'brow-next', at: 3100, heldMs: 500 }));
    a.onBlink({ type: 'closure-start', at: 4500 });
    const second = accepts(a.onBlink({ type: 'select', at: 5200, durationMs: 700 }));
    const ids = [...first, ...nav, ...second].map((x) => x.cycleId);
    expect(ids).toEqual(['c1', 'c2', 'c3']);
    expect(new Set(ids).size).toBe(3);
  });

  it('reset() invalidates a pending closure and a pending raise', () => {
    const { a } = make();
    a.onBrow({ type: 'brow-start', at: 1000 });
    a.reset();
    expect(a.onBrow({ type: 'brow-next', at: 1500, heldMs: 500 })).toEqual([]);
    a.onBlink({ type: 'closure-start', at: 2000 });
    a.reset();
    expect(a.closing).toBe(false);
    expect(a.onBlink({ type: 'select', at: 2700, durationMs: 700 })).toEqual([]);
  });

  it('a duplicate closure-start while closing is ignored', () => {
    const { a } = make();
    a.onBlink({ type: 'closure-start', at: 1000 });
    expect(a.onBlink({ type: 'closure-start', at: 1100 })).toEqual([]);
    expect(accepts(a.onBlink({ type: 'select', at: 1700, durationMs: 700 }))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// End-to-end with the real detectors: one frame stream feeds BlinkGesture and BrowGesture, the
// arbiter's cancel-brow is honored, and we count accepted commands and moves while frozen.
describe('Pipeline — real detectors + arbiter (GEST-05/06)', () => {
  type F = { t: number; eye: number; brow: number; faces?: number };
  function run(frames: F[]) {
    const blink = new BlinkGesture(DEFAULT_GESTURE_CONFIG);
    const brow = new BrowGesture(DEFAULT_BROW_CALIBRATION);
    const { a } = make();
    const acc: { command: string; at: number; frozen: boolean }[] = [];
    let frozen = false;
    const apply = (outs: ArbiterOutput[], t: number) => {
      for (const o of outs) {
        if (o.type === 'freeze') frozen = true;
        else if (o.type === 'unfreeze') frozen = false;
        else if (o.type === 'accept') acc.push({ command: o.command, at: o.at, frozen });
        else if (o.type === 'cancel-brow') for (const e of brow.cancel(o.reason, t)) apply(a.onBrow(e), t);
      }
    };
    for (const f of frames) {
      const faces = f.faces ?? 1;
      for (const e of blink.push({ t: f.t, faces, score: f.eye })) apply(a.onBlink(e), f.t);
      for (const e of brow.push({ t: f.t, faces, score: f.brow })) apply(a.onBrow(e), f.t);
    }
    return acc;
  }
  /** Frames every 66 ms from t0 for ms with the given signals. */
  function seg(t0: number, ms: number, eye: number, brow: number): F[] {
    const out: F[] = [];
    for (let t = t0; t < t0 + ms; t += 66) out.push({ t, eye, brow });
    return out;
  }
  const OPEN = 0.1, CLOSED = 0.9, REST = 0.1, UP = 0.7;

  it('brow raise ≥500 ms → one NAV_NEXT; long blink → one SELECT', () => {
    const frames = [
      ...seg(0, 1200, OPEN, REST),        // acquire face + arm both machines
      ...seg(1200, 2000, OPEN, UP),       // 2 s raise → one next
      ...seg(3200, 1200, OPEN, REST),     // release + cooldown
      ...seg(4400, 800, CLOSED, REST),    // deliberate closure
      ...seg(5200, 1000, OPEN, REST),
    ];
    const acc = run(frames);
    expect(acc.map((x) => x.command)).toEqual(['NAV_NEXT', 'SELECT']);
    // NEXT moves an unfrozen highlight; SELECT is accepted while the closure-onset target is
    // still frozen (accept precedes unfreeze), so the runtime commits the snapshotted target.
    expect(acc.map((x) => x.frozen)).toEqual([false, true]);
  });

  it('GEST-06: eyes close while brows are rising → no NAV_NEXT ever; the blink selects', () => {
    const frames = [
      ...seg(0, 1200, OPEN, REST),
      ...seg(1200, 330, OPEN, UP),        // raise begins (rising)
      ...seg(1530, 800, CLOSED, UP),      // closure onset while brows still up, held past 500 ms
      ...seg(2330, 1000, OPEN, UP),       // reopen; brows still up (must not navigate)
      ...seg(3330, 1000, OPEN, REST),
    ];
    const acc = run(frames);
    expect(acc.map((x) => x.command)).toEqual(['SELECT']);
  });

  it('GEST-06: brows and eyes start together → ambiguous, no command at all', () => {
    const frames = [
      ...seg(0, 1200, OPEN, REST),
      ...seg(1200, 800, CLOSED, UP),      // simultaneous onset
      ...seg(2000, 1200, OPEN, REST),
    ];
    expect(run(frames)).toEqual([]);
  });

  it('GEST-07: face loss mid-raise cancels; no command after reacquisition with brows still up', () => {
    const frames: F[] = [
      ...seg(0, 1200, OPEN, REST),
      ...seg(1200, 300, OPEN, UP),
      ...seg(1500, 600, OPEN, UP).map((f) => ({ ...f, faces: 0 })),
      ...seg(2100, 1500, OPEN, UP),
    ];
    expect(run(frames)).toEqual([]);
  });
});
