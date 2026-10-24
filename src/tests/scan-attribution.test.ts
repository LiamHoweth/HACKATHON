import { describe, expect, it } from 'vitest';
import {
  ACQUIRE_HOLD_MAX_MS, acquireHoldActive, ATTRIBUTION_TIMING, attributeClosure, MIN_RESUME_MS, nextAcquireHold, ScanController,
  type AcquireHold, type HighlightLogEntry, type ScanConfig,
} from '@/access/scan-controller';

// Deterministic fake clock for the scan controller (one pending timer at a time is enough).
class FakeClock {
  t = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private seq = 0;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  };
  clearTimeout = (h: unknown) => {
    this.timers.delete(h as number);
  };
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}

function setup(over: Partial<ScanConfig> = {}) {
  const clock = new FakeClock();
  const log: HighlightLogEntry[] = [];
  const sc = new ScanController((id, rev) => log.push({ id, at: clock.t, rev }), clock);
  let cfg: ScanConfig = {
    active: true, ids: ['a', 'b', 'c'], surfaceRevision: 1, intervalMs: 1000, readingPauseMs: 1500, held: false, pin: null, hidden: false,
    ...over,
  };
  sc.update(cfg);
  const update = (patch: Partial<ScanConfig>) => {
    cfg = { ...cfg, ...patch };
    sc.update(cfg);
  };
  return { clock, log, sc, update };
}

describe('Scan controller: highlight log carries the scan config revision (audit finding 2)', () => {
  it('a revision bump that keeps the same first id still logs the new revision', () => {
    const { log, update } = setup({ ids: ['pa-resume'], surfaceRevision: 7 });
    expect(log).toEqual([{ id: 'pa-resume', at: 0, rev: 7 }]);
    update({ surfaceRevision: 8 });
    expect(log.at(-1)).toEqual({ id: 'pa-resume', at: 0, rev: 8 });
  });

  it('Resume-by-blink on the paused surface is attributable after a revision bump', () => {
    const { clock, log, update } = setup({ ids: ['pa-resume'], surfaceRevision: 7 });
    clock.advance(2000);
    update({ surfaceRevision: 8 });
    clock.advance(2000);
    const a = attributeClosure(log, clock.t, () => false);
    expect(a).toMatchObject({ ok: true, targetId: 'pa-resume', surfaceRevision: 8 });
  });

  it('timer ticks log the revision of the controller config, not an outside value', () => {
    const { clock, log, update } = setup();
    clock.advance(1500); // reading pause → 'b'
    update({ surfaceRevision: 2, ids: ['x', 'y'] });
    clock.advance(1500); // new surface reading pause → 'y'
    expect(log.map((e) => [e.id, e.rev])).toEqual([['a', 1], ['b', 1], ['x', 2], ['y', 2]]);
  });
});

describe('Scan controller: holds pause the dwell instead of restarting it (audit finding 3)', () => {
  it('a short blink hold resumes with the remaining time, not a fresh full interval', () => {
    const { clock, sc, update } = setup({ readingPauseMs: 1000 });
    clock.advance(700); // 300 ms left on 'a'
    update({ held: true, pin: 'a' });
    clock.advance(200); // ordinary blink
    update({ held: false, pin: null });
    expect(sc.current).toBe('a');
    clock.advance(299);
    expect(sc.current).toBe('a');
    clock.advance(1);
    expect(sc.current).toBe('b'); // total delay = only the 200 ms hold
  });

  it('frequent natural blinks cannot stall scanning', () => {
    const { clock, sc, update } = setup({ readingPauseMs: 1000 });
    // A 200 ms blink every 500 ms for 3 s. Old behavior restarted a full 1000 ms interval each time.
    const seen = new Set<string | null>([sc.current]);
    for (let i = 0; i < 6; i++) {
      clock.advance(300);
      seen.add(sc.current);
      update({ held: true, pin: sc.current });
      clock.advance(200);
      update({ held: false, pin: null });
      seen.add(sc.current);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    expect(seen.has('b')).toBe(true);
  });

  it('a hold released with almost no time left waits at least MIN_RESUME_MS', () => {
    const { clock, sc, update } = setup({ readingPauseMs: 1000 });
    clock.advance(980);
    update({ held: true, pin: 'a' });
    clock.advance(300);
    update({ held: false, pin: null });
    clock.advance(MIN_RESUME_MS - 1);
    expect(sc.current).toBe('a');
    clock.advance(1);
    expect(sc.current).toBe('b');
  });

  it('a surface opened while held keeps its reading pause for after the release', () => {
    const { clock, sc, update } = setup({ held: true, readingPauseMs: 1500 });
    clock.advance(10_000);
    expect(sc.current).toBe('a'); // held (e.g. waiting for a face): no advance
    update({ held: false });
    clock.advance(1499);
    expect(sc.current).toBe('a');
    clock.advance(1);
    expect(sc.current).toBe('b');
  });

  it('returning from a hidden tab still starts a fresh full interval', () => {
    const { clock, sc, update } = setup({ readingPauseMs: 1000 });
    clock.advance(900);
    update({ hidden: true });
    clock.advance(5000);
    update({ hidden: false });
    clock.advance(999);
    expect(sc.current).toBe('a');
    clock.advance(1);
    expect(sc.current).toBe('b');
  });
});

describe('Closure attribution guard (audit finding 1)', () => {
  const arming = new Set(['rv-speak', 'cf-confirm', 'end-confirm', 'cc-clear']);
  const requiresArming = (id: string) => arming.has(id);
  // Review surface: Cancel highlighted first, then Speak.
  const review: HighlightLogEntry[] = [
    { id: 'rv-cancel', at: 0, rev: 5 },
    { id: 'rv-speak', at: 1000, rev: 5 },
  ];

  it('a closure detected 100–250 ms after Speak was highlighted is credited to Cancel (where it began)', () => {
    for (const lag of [100, 150, 250, 299]) {
      const a = attributeClosure(review, 1000 + lag, requiresArming);
      expect(a).toMatchObject({ ok: true, targetId: 'rv-cancel', credited: 'previous', surfaceRevision: 5 });
    }
  });

  it('Speak is credited only once it has been highlighted for ≥ 300 ms at onset', () => {
    expect(attributeClosure(review, 1300, requiresArming)).toMatchObject({ ok: true, targetId: 'rv-speak', credited: 'current' });
    expect(attributeClosure(review, 1300, requiresArming)).toMatchObject({ highlightedFor: 300 });
  });

  it('a guarded previous target that was highlighted < 300 ms is discarded, not selected', () => {
    const log: HighlightLogEntry[] = [
      { id: 'cf-cancel', at: 0, rev: 3 },
      { id: 'cf-confirm', at: 1000, rev: 3 },
      { id: 'cf-back', at: 1200, rev: 3 }, // Confirm was highlighted only 200 ms
    ];
    expect(attributeClosure(log, 1300, requiresArming)).toEqual({ ok: false, reason: 'not-armed' });
    // An unguarded target in the same position is fine.
    expect(attributeClosure(log, 1300, () => false)).toMatchObject({ ok: true, targetId: 'cf-confirm' });
  });

  it('a guarded first target on a brand-new scan (no previous entry) needs the 300 ms dwell', () => {
    const log: HighlightLogEntry[] = [{ id: 'end-confirm', at: 0, rev: 9 }];
    expect(attributeClosure(log, 100, requiresArming)).toEqual({ ok: false, reason: 'not-armed' });
    expect(attributeClosure(log, ATTRIBUTION_TIMING.armedDwellMs, requiresArming)).toMatchObject({ ok: true, targetId: 'end-confirm' });
  });

  it('a surface change just before the onset is never credited to either surface', () => {
    const log: HighlightLogEntry[] = [
      { id: 'cmp-review', at: 0, rev: 4 },
      { id: 'rv-cancel', at: 1000, rev: 5 },
    ];
    expect(attributeClosure(log, 1100, () => false)).toEqual({ ok: false, reason: 'surface-changed' });
    expect(attributeClosure(log, 1400, () => false)).toMatchObject({ ok: true, targetId: 'rv-cancel', surfaceRevision: 5 });
  });

  it('no highlight (or none before the onset) attributes nothing', () => {
    expect(attributeClosure([], 100, () => false)).toEqual({ ok: false, reason: 'no-target' });
    expect(attributeClosure([{ id: 'a', at: 500, rev: 1 }], 100, () => false)).toEqual({ ok: false, reason: 'no-target' });
    expect(attributeClosure([{ id: null, at: 0, rev: null }], 900, () => false)).toEqual({ ok: false, reason: 'no-target' });
  });

  it('end to end with the controller: a closure right after an advance credits the earlier target', () => {
    const { clock, log } = setup({ ids: ['rv-cancel', 'rv-speak'], surfaceRevision: 5, readingPauseMs: 1500 });
    clock.advance(1500); // → rv-speak
    clock.advance(150); // detection lag
    expect(attributeClosure(log, clock.t, requiresArming)).toMatchObject({ ok: true, targetId: 'rv-cancel' });
  });
});

describe('Face-acquisition scanner hold (audit finding 5)', () => {
  const start: AcquireHold = { acquiring: false, released: false };

  it('holds while acquiring, releases after the timeout, and re-applies on the next episode', () => {
    let h = nextAcquireHold(start, { type: 'acquiring', value: true });
    expect(acquireHoldActive(h)).toBe(true);
    h = nextAcquireHold(h, { type: 'timeout' });
    expect(acquireHoldActive(h)).toBe(false);
    h = nextAcquireHold(h, { type: 'acquiring', value: false }); // face found
    h = nextAcquireHold(h, { type: 'acquiring', value: true }); // e.g. a second face appears later
    expect(acquireHoldActive(h)).toBe(true);
    expect(ACQUIRE_HOLD_MAX_MS).toBe(5000);
  });

  it('any keyboard switch press releases the hold; presses outside acquisition change nothing', () => {
    expect(nextAcquireHold(start, { type: 'switch-press' })).toBe(start);
    const held = nextAcquireHold(start, { type: 'acquiring', value: true });
    expect(acquireHoldActive(nextAcquireHold(held, { type: 'switch-press' }))).toBe(false);
  });

  it('once released, the scanner advances (keyboard fallback can scan) with the deferred reading pause', () => {
    const { clock, sc, update } = setup({ held: true, readingPauseMs: 1500 });
    clock.advance(ACQUIRE_HOLD_MAX_MS);
    expect(sc.current).toBe('a');
    update({ held: false }); // hold released by timeout or switch press
    clock.advance(1500);
    expect(sc.current).toBe('b');
    clock.advance(1000);
    expect(sc.current).toBe('c');
  });
});
