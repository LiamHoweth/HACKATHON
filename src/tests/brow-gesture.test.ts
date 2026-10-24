import { describe, expect, it } from 'vitest';
import { BrowGesture, DEFAULT_BROW_CALIBRATION, type BrowEvent, type BrowFrame } from '@/access/brow-gesture';

// Synthetic monotonic frame sequences. Scores: 0.1 neutral, 0.7 raised (defaults: raised ≥ 0.45,
// release ≤ 0.3, hold 500 ms, release 250 ms, cooldown 500 ms).
const NEUTRAL = 0.1;
const RAISED = 0.7;
const BAND = 0.38; // between release and raised thresholds (hysteresis band)

class Sim {
  g = new BrowGesture(DEFAULT_BROW_CALIBRATION);
  t = 1000;
  events: BrowEvent[] = [];
  constructor(public dt = 33) {}
  push(f: Omit<BrowFrame, 't'>, t = this.t) {
    const ev = this.g.push({ t, ...f });
    this.events.push(...ev);
    return ev;
  }
  /** One frame at exactly time `t` (absolute). */
  at(t: number, score: number | null, faces = 1) {
    this.t = t;
    return this.push({ faces, score });
  }
  /** Frames every dt for `ms` (frame times t+dt … ≤ t+ms). */
  hold(ms: number, score: number | null, faces = 1) {
    const end = this.t + ms;
    while (this.t + this.dt <= end) {
      this.t += this.dt;
      this.push({ faces, score });
    }
  }
  neutral(ms: number) { this.hold(ms, NEUTRAL); }
  raised(ms: number) { this.hold(ms, RAISED); }
  types() { return this.events.map((e) => e.type); }
  count(type: BrowEvent['type']) { return this.events.filter((e) => e.type === type).length; }
  clear() { this.events = []; }
}

/** A sim that has seen neutral frames (armed). */
function armed(dt = 33) {
  const s = new Sim(dt);
  s.neutral(200);
  expect(s.g.status).toBe('neutral');
  return s;
}

describe('BrowGesture — hold threshold (GEST-01/02)', () => {
  it('GEST-01: a raise held 499 ms gives progress only, no next', () => {
    const s = armed();
    const onset = s.t + 1;
    s.at(onset, RAISED);
    expect(s.types()).toEqual(['brow-start']);
    expect(s.g.status).toBe('rising');
    s.at(onset + 250, RAISED);
    expect(s.g.progress(onset + 250)).toBeCloseTo(0.5, 5);
    s.at(onset + 499, RAISED);
    expect(s.g.progress(onset + 499)).toBeCloseTo(0.998, 3);
    s.at(onset + 520, NEUTRAL);
    expect(s.count('brow-next')).toBe(0);
    const cancel = s.events.at(-1);
    expect(cancel).toMatchObject({ type: 'brow-cancel', reason: 'too-short' });
    expect(s.g.status).toBe('neutral');
    expect(s.g.progress(onset + 520)).toBe(0);
  });

  it('GEST-01: short attempts at 30 fps and 15 fps never navigate', () => {
    for (const dt of [33, 66]) {
      const s = armed(dt);
      for (let i = 0; i < 5; i++) {
        s.raised(400);
        s.neutral(1000);
      }
      expect(s.count('brow-next')).toBe(0);
      expect(s.count('brow-start')).toBe(5);
      expect(s.count('brow-cancel')).toBe(5);
    }
  });

  it('GEST-02: exactly 500 ms commits once, on the first frame with t − onset ≥ 500', () => {
    const s = armed();
    const onset = s.t + 1;
    s.at(onset, RAISED);
    s.at(onset + 499, RAISED);
    expect(s.count('brow-next')).toBe(0);
    const ev = s.at(onset + 500, RAISED);
    expect(ev).toEqual([{ type: 'brow-next', at: onset + 500, heldMs: 500 }]);
    expect(s.g.status).toBe('latched');
    expect(s.g.progress(onset + 500)).toBe(0);
  });

  it('GEST-02: frame sampling tolerance — commits at most one frame late (15 fps)', () => {
    const s = armed(66);
    s.raised(700);
    const next = s.events.find((e) => e.type === 'brow-next');
    expect(next).toBeDefined();
    const start = s.events.find((e) => e.type === 'brow-start')!;
    const held = (next as Extract<BrowEvent, { type: 'brow-next' }>).heldMs;
    expect(held).toBeGreaterThanOrEqual(500);
    expect(held).toBeLessThan(500 + 66);
    expect(next!.at - start.at).toBe(held);
    expect(s.count('brow-next')).toBe(1);
  });

  it('hysteresis: scores in the band between release and raised thresholds keep a raise alive', () => {
    const s = armed();
    const onset = s.t + 1;
    s.at(onset, RAISED);
    s.at(onset + 200, BAND);
    s.at(onset + 400, BAND);
    s.at(onset + 510, BAND);
    expect(s.count('brow-next')).toBe(1);
  });

  it('a score in the band alone never starts a raise', () => {
    const s = armed();
    s.hold(2000, BAND);
    expect(s.events).toEqual([]);
    expect(s.g.status).toBe('neutral');
  });

  it('a drop to neutral on the frame that crosses 500 ms cancels (raise was not continuous)', () => {
    const s = armed();
    const onset = s.t + 1;
    s.at(onset, RAISED);
    s.at(onset + 480, RAISED);
    s.at(onset + 513, NEUTRAL);
    expect(s.count('brow-next')).toBe(0);
    expect(s.events.at(-1)).toMatchObject({ type: 'brow-cancel', reason: 'too-short', heldMs: 513 });
  });
});

describe('BrowGesture — latch and re-arm (GEST-03/04)', () => {
  it('GEST-03: a 2-second sustained raise yields one next total', () => {
    const s = armed();
    s.raised(2000);
    expect(s.count('brow-next')).toBe(1);
    expect(s.count('brow-start')).toBe(1);
    expect(s.g.status).toBe('latched');
    s.raised(3000);
    expect(s.count('brow-next')).toBe(1);
  });

  it('GEST-04: the next raise needs stable neutral (releaseMs) plus cooldown', () => {
    const s = armed();
    s.raised(600);
    expect(s.count('brow-next')).toBe(1);
    // Brief dip below release (< 250 ms), then raised again: still latched, no new raise.
    s.neutral(200);
    expect(s.g.status).toBe('latched');
    s.raised(800);
    expect(s.count('brow-next')).toBe(1);
    expect(s.count('brow-start')).toBe(1);
    // Stable release ≥ 250 ms → rearming.
    s.neutral(300);
    expect(s.g.status).toBe('rearming');
    // Raise during cooldown does not count and requires a stable release again.
    s.raised(600);
    expect(s.g.status).toBe('latched');
    expect(s.count('brow-next')).toBe(1);
    s.neutral(300);
    expect(s.g.status).toBe('rearming');
    s.neutral(540);
    expect(s.g.status).toBe('neutral');
    s.raised(600);
    expect(s.count('brow-next')).toBe(2);
    expect(s.count('brow-start')).toBe(2);
  });

  it('GEST-04: rearming waits for a neutral frame (band scores hold it) after cooldown', () => {
    const s = armed();
    s.raised(600);
    s.neutral(300);
    expect(s.g.status).toBe('rearming');
    s.hold(800, BAND);
    expect(s.g.status).toBe('rearming');
    s.neutral(33);
    expect(s.g.status).toBe('neutral');
  });

  it('GEST-04: reset() drops carryover — a raise held across a surface change never commits', () => {
    const s = armed();
    s.raised(300);
    expect(s.g.status).toBe('rising');
    s.g.reset();
    expect(s.g.status).toBe('neutral');
    s.raised(2000); // still raised after the new surface appears
    expect(s.count('brow-next')).toBe(0);
    expect(s.count('brow-start')).toBe(1); // only the pre-reset start
    s.neutral(66);
    s.raised(600);
    expect(s.count('brow-next')).toBe(1);
  });

  it('reset() from latched clears latch but still requires a neutral frame first', () => {
    const s = armed();
    s.raised(600);
    expect(s.g.status).toBe('latched');
    s.g.reset();
    s.raised(1000);
    expect(s.count('brow-next')).toBe(1);
    s.neutral(33);
    s.raised(600);
    expect(s.count('brow-next')).toBe(2);
  });

  it('a freshly constructed machine requires a neutral frame before the first raise', () => {
    const s = new Sim();
    s.raised(1500);
    expect(s.events).toEqual([]);
    s.neutral(33);
    s.raised(600);
    expect(s.types()).toEqual(['brow-start', 'brow-next']);
  });
});

describe('BrowGesture — invalidation (GEST-07)', () => {
  it('no face cancels a rising raise as face-lost; no command', () => {
    const s = armed();
    s.raised(300);
    s.hold(66, null, 0);
    expect(s.events.at(-1)).toMatchObject({ type: 'brow-cancel', reason: 'face-lost' });
    s.raised(1000);
    expect(s.count('brow-next')).toBe(0); // must see neutral after the cancel
  });

  it('a null score with one face cancels as face-lost', () => {
    const s = armed();
    s.raised(300);
    s.hold(33, null, 1);
    expect(s.events.at(-1)).toMatchObject({ type: 'brow-cancel', reason: 'face-lost' });
  });

  it('multiple faces cancel as ambiguous', () => {
    const s = armed();
    s.raised(300);
    s.hold(33, RAISED, 2);
    expect(s.events.at(-1)).toMatchObject({ type: 'brow-cancel', reason: 'ambiguous' });
    s.raised(1000);
    expect(s.count('brow-next')).toBe(0);
  });

  it('out-of-order and duplicate frames cancel as stale and are ignored', () => {
    const s = armed();
    s.raised(300);
    const last = s.t;
    s.at(last, RAISED); // duplicate timestamp
    expect(s.events.at(-1)).toMatchObject({ type: 'brow-cancel', reason: 'stale', at: last });
    s.t = last; // continue from the real clock
    s.neutral(33);
    s.raised(300);
    s.at(s.t - 100, RAISED); // out of order
    expect(s.events.at(-1)).toMatchObject({ type: 'brow-cancel', reason: 'stale' });
    expect(s.count('brow-next')).toBe(0);
  });

  it('a gap > 700 ms cancels as stale and never commits across it', () => {
    const s = armed();
    s.raised(200);
    s.at(s.t + 800, RAISED);
    expect(s.events.at(-1)).toMatchObject({ type: 'brow-cancel', reason: 'stale' });
    s.raised(1000);
    expect(s.count('brow-next')).toBe(0);
  });

  it('a gap ≤ 700 ms is tolerated (frame-time based, not frame count)', () => {
    const s = armed();
    const onset = s.t + 1;
    s.at(onset, RAISED);
    s.at(onset + 600, RAISED);
    expect(s.count('brow-next')).toBe(1);
  });

  it('a gap while latched does not count toward the stable release', () => {
    const s = armed();
    s.raised(600);
    s.neutral(200);
    s.at(s.t + 750, NEUTRAL); // gap: release timer restarts here
    expect(s.g.status).toBe('latched');
    s.neutral(300);
    expect(s.g.status).toBe('rearming');
  });

  it('face loss while latched keeps the latch (no repeat after reacquisition)', () => {
    const s = armed();
    s.raised(600);
    s.hold(300, null, 0);
    s.raised(1000);
    expect(s.count('brow-next')).toBe(1);
    expect(s.g.status).toBe('latched');
  });

  it('non-finite timestamps are ignored', () => {
    const s = armed();
    expect(s.g.push({ t: Number.NaN, faces: 1, score: RAISED })).toEqual([]);
    expect(s.g.status).toBe('neutral');
  });
});

describe('BrowGesture — external cancel', () => {
  it('cancel() during rising emits one cancel and requires neutral again', () => {
    const s = armed();
    s.raised(300);
    const ev = s.g.cancel('blink-preempted', s.t);
    expect(ev).toEqual([{ type: 'brow-cancel', at: s.t, heldMs: expect.any(Number), reason: 'blink-preempted' }]);
    expect(s.g.cancel('blink-preempted', s.t)).toEqual([]); // idempotent
    s.raised(1000);
    expect(s.count('brow-next')).toBe(0);
  });

  it('cancel() keeps latched/rearming state', () => {
    const s = armed();
    s.raised(600);
    expect(s.g.cancel('ambiguous', s.t)).toEqual([]);
    expect(s.g.status).toBe('latched');
    s.neutral(300);
    expect(s.g.status).toBe('rearming');
    expect(s.g.cancel('ambiguous', s.t)).toEqual([]);
    expect(s.g.status).toBe('rearming');
  });

  it('setCalibration applies new thresholds and copies scalars', () => {
    const s = armed();
    const cal = { ...DEFAULT_BROW_CALIBRATION, raisedThreshold: 0.8, releaseThreshold: 0.5 };
    s.g.setCalibration(cal);
    cal.raisedThreshold = 0.1; // mutation after set has no effect
    s.raised(1000); // 0.7 < 0.8: never starts
    expect(s.events).toEqual([]);
    s.hold(600, 0.9);
    expect(s.count('brow-next')).toBe(1);
    expect(s.g.calibration.raisedThreshold).toBe(0.8);
  });
});
