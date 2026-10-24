import { describe, expect, it } from 'vitest';
import { BlinkGesture, DEFAULT_GESTURE_CONFIG, type BlinkFrame } from '@/access/blink-gesture';
import type { BlinkGestureEvent } from '@/runtime/contract';

// Synthetic frame sequences at ~15 processed fps. Scores: 0.1 open, 0.9 closed.
const DT = 66;
const OPEN = 0.1;
const CLOSED = 0.9;

class Sim {
  g = new BlinkGesture(DEFAULT_GESTURE_CONFIG);
  t = 1000;
  events: BlinkGestureEvent[] = [];
  push(f: Omit<BlinkFrame, 't'>, t = this.t) {
    this.events.push(...this.g.push({ t, ...f }));
  }
  /** Feed frames for `ms` with a fixed face count and score. */
  hold(ms: number, score: number | null, faces = 1) {
    const end = this.t + ms;
    while (this.t < end) {
      this.t += DT;
      this.push({ faces, score });
    }
  }
  open(ms: number) { this.hold(ms, OPEN); }
  closed(ms: number) { this.hold(ms, CLOSED); }
  /** Acquire a face and arm (ready). */
  arm() {
    this.open(800);
    expect(this.g.snapshot().status).toBe('ready');
    this.events = [];
  }
  count(type: BlinkGestureEvent['type']) { return this.events.filter((e) => e.type === type).length; }
  discards() { return this.events.filter((e): e is Extract<BlinkGestureEvent, { type: 'discard' }> => e.type === 'discard').map((e) => e.reason); }
}

describe('ACCESS-10 blink gesture: ordinary, long, qualifying, stale, missing and multiple-face sequences', () => {
  it('ACCESS-10 ordinary blinks (150–300 ms) never select', () => {
    const s = new Sim();
    s.arm();
    for (const ms of [150, 200, 250, 300, 300, 150]) {
      s.closed(ms);
      s.open(700);
    }
    expect(s.count('select')).toBe(0);
    expect(s.count('closure-start')).toBe(6);
    expect(s.discards().every((r) => r === 'too-short')).toBe(true);
    expect(s.g.snapshot().status).toBe('ready');
  });

  it('ACCESS-10 a 900 ms closure selects exactly once', () => {
    const s = new Sim();
    s.arm();
    s.closed(900);
    expect(s.g.snapshot().status).toBe('closing');
    expect(s.g.snapshot().closureProgress).toBe(1);
    s.open(1500);
    expect(s.count('select')).toBe(1);
    expect(s.count('discard')).toBe(0);
    const sel = s.events.find((e) => e.type === 'select');
    expect(sel && sel.type === 'select' && sel.durationMs).toBeGreaterThanOrEqual(900);
    expect(sel && sel.type === 'select' && sel.durationMs).toBeLessThan(1100);
  });

  it('ACCESS-10 a closure held indefinitely never selects, even on a later reopen', () => {
    const s = new Sim();
    s.arm();
    s.closed(10_000);
    expect(s.discards()).toEqual(['too-long']);
    s.open(1000);
    expect(s.count('select')).toBe(0);
    expect(s.g.snapshot().status).toBe('ready');
  });

  it('ACCESS-10 face lost mid-closure discards and emits face-lost once', () => {
    const s = new Sim();
    s.arm();
    s.closed(400);
    s.hold(1500, null, 0);
    expect(s.discards()).toEqual(['face-lost']);
    expect(s.count('face-lost')).toBe(1);
    expect(s.g.snapshot().status).toBe('face-lost');
    // Face returns with eyes still closed then open: no selection from the old closure.
    s.closed(600);
    s.open(1000);
    expect(s.count('select')).toBe(0);
    expect(s.count('face-found')).toBe(1);
  });

  it('ACCESS-10 a brief face dropout (< 500 ms) does not raise face-lost', () => {
    const s = new Sim();
    s.arm();
    s.hold(300, null, 0);
    s.open(300);
    expect(s.count('face-lost')).toBe(0);
    expect(s.g.snapshot().status).toBe('ready');
  });

  it('ACCESS-10 two faces discard the closure and hold until one face is stable', () => {
    const s = new Sim();
    s.arm();
    s.closed(400);
    s.hold(200, CLOSED, 2);
    expect(s.discards()).toEqual(['multiple-faces']);
    expect(s.g.snapshot().status).toBe('multiple-faces');
    // While two faces persist, a long closure cannot select.
    s.hold(1500, CLOSED, 2);
    s.hold(500, OPEN, 2);
    expect(s.count('select')).toBe(0);
    expect(s.g.snapshot().status).toBe('multiple-faces');
    // One face, but not yet stable for 500 ms: still held.
    s.open(300);
    expect(s.g.snapshot().status).toBe('multiple-faces');
    s.open(600);
    expect(s.g.snapshot().status).toBe('ready');
    expect(s.count('select')).toBe(0);
  });

  it('ACCESS-10 a stale frame gap discards an in-progress closure', () => {
    const s = new Sim();
    s.arm();
    s.closed(400);
    s.t += 900; // gap > 700 ms
    s.push({ faces: 1, score: CLOSED });
    expect(s.discards()).toEqual(['stale']);
    s.closed(400);
    s.open(1000);
    expect(s.count('select')).toBe(0);
  });

  it('ACCESS-10 out-of-order timestamps are ignored and discard a pending closure', () => {
    const s = new Sim();
    s.arm();
    s.closed(400);
    s.push({ faces: 1, score: OPEN }, s.t - 200); // older frame: must not count as a reopen
    expect(s.count('select')).toBe(0);
    expect(s.discards()).toEqual(['stale']);
    s.push({ faces: 1, score: OPEN }, s.t); // duplicate timestamp also ignored
    s.closed(800);
    s.open(1000);
    expect(s.count('select')).toBe(0);
  });

  it('ACCESS-10 cooldown prevents a second select from one long flutter', () => {
    const s = new Sim();
    s.arm();
    s.closed(900);
    // Flutter: brief reopen then closed again within the cooldown, long enough to look valid.
    s.open(130);
    s.closed(900);
    s.open(1200);
    expect(s.count('select')).toBe(1);
  });

  it('ACCESS-10 recovery to READY requires open eyes after a selection', () => {
    const s = new Sim();
    s.arm();
    s.closed(900);
    s.open(66);
    expect(s.g.snapshot().status).toBe('selected');
    s.closed(2000); // eyes closed again through and beyond the cooldown
    expect(s.g.snapshot().status).toBe('cooldown');
    expect(s.g.snapshot().awaitingOpen).toBe(true);
    s.open(200);
    expect(s.g.snapshot().status).toBe('ready');
    expect(s.count('select')).toBe(1);
  });

  it('ACCESS-10 one-eye closures (winks) do not count when the score is the min of both eyes', () => {
    const s = new Sim();
    s.arm();
    // min(left=0.9, right=0.1) = 0.1
    s.hold(1000, Math.min(0.9, 0.1));
    expect(s.count('closure-start')).toBe(0);
  });

  it('ACCESS-10 an interruption (hidden tab) discards a pending closure as stale', () => {
    const s = new Sim();
    s.arm();
    s.closed(400);
    s.events.push(...s.g.interrupt());
    expect(s.discards()).toEqual(['stale']);
    s.t += 5000;
    s.closed(300);
    s.open(1000);
    expect(s.count('select')).toBe(0);
  });
});

describe('ACCESS-11 blink gesture: closure-onset selection once, reacquisition needs a new gesture', () => {
  it('ACCESS-11 the integration selects the target captured at closure onset, exactly once', () => {
    // Mirrors useStillHere: snapshot at closure-start, commit on select, scanning advancing meanwhile.
    const s = new Sim();
    s.arm();
    let highlighted = 'a';
    let snapshot: string | null = null;
    const committed: string[] = [];
    const onEvents = (evs: BlinkGestureEvent[]) => {
      for (const e of evs) {
        if (e.type === 'closure-start') snapshot = highlighted;
        if (e.type === 'select' && snapshot) { committed.push(snapshot); snapshot = null; }
        if (e.type === 'discard') snapshot = null;
      }
    };
    const end = s.t + 900;
    while (s.t < end) {
      s.t += DT;
      onEvents(s.g.push({ t: s.t, faces: 1, score: CLOSED }));
      highlighted = 'b'; // highlight would have moved on during the closure
    }
    for (let i = 0; i < 20; i++) {
      s.t += DT;
      onEvents(s.g.push({ t: s.t, faces: 1, score: OPEN }));
    }
    expect(committed).toEqual(['a']);
  });

  it('ACCESS-11 after face-lost, reacquisition alone selects nothing; a new deliberate closure is required', () => {
    const s = new Sim();
    s.arm();
    s.hold(1000, null, 0);
    expect(s.count('face-lost')).toBe(1);
    s.events = [];
    s.open(2000); // face found again, eyes open: no event selects
    expect(s.count('face-found')).toBe(1);
    expect(s.count('select')).toBe(0);
    expect(s.g.snapshot().status).toBe('ready');
    s.closed(900);
    s.open(500);
    expect(s.count('select')).toBe(1); // the deliberate resume gesture
  });

  it('ACCESS-11 a face that reappears with eyes closed cannot select on reopening', () => {
    const s = new Sim();
    s.arm();
    s.hold(1000, null, 0);
    s.closed(1200);
    s.open(800);
    expect(s.count('select')).toBe(0);
  });
});

describe('Blink gesture: short dropout mid-closure (audit finding 6)', () => {
  it('a single no-face frame mid-closure discards it as face-lost without a face-lost pause', () => {
    const s = new Sim();
    s.arm();
    s.closed(400);
    s.hold(66, null, 0); // one frame, far below the 500 ms face-lost rule
    expect(s.discards()).toEqual(['face-lost']);
    expect(s.count('face-lost')).toBe(0);
    // The face returns with eyes still closed long enough to look valid: the old closure never selects.
    s.closed(800);
    s.open(1000);
    expect(s.count('select')).toBe(0);
    expect(s.count('face-lost')).toBe(0);
    expect(s.g.snapshot().status).toBe('ready');
    // A fresh deliberate closure still works.
    s.closed(900);
    s.open(500);
    expect(s.count('select')).toBe(1);
  });

  it('a face without a score mid-closure discards it as stale without a face-lost pause', () => {
    const s = new Sim();
    s.arm();
    s.closed(400);
    s.hold(132, null, 1);
    expect(s.discards()).toEqual(['stale']);
    expect(s.count('face-lost')).toBe(0);
    s.closed(500);
    s.open(500);
    expect(s.count('select')).toBe(0);
  });

  it('a dropout that lasts past 500 ms still raises exactly one face-lost after the discard', () => {
    const s = new Sim();
    s.arm();
    s.closed(300);
    s.hold(700, null, 0);
    expect(s.discards()).toEqual(['face-lost']);
    expect(s.count('face-lost')).toBe(1);
    expect(s.g.snapshot().status).toBe('face-lost');
  });
});
