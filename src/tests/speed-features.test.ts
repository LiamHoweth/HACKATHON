// Speed features (SYNTHETIC frames, not hardware verification): hold to keep moving (eyebrow
// NEXT repeats), jaw drop = BACK, personal timing from calibration.
import { describe, expect, it } from 'vitest';
import { BrowGesture, BROW_TIMING, DEFAULT_BROW_CALIBRATION, type BrowEvent } from '@/access/brow-gesture';
import { DEFAULT_JAW_CONFIG, JawGesture, type JawEvent } from '@/access/jaw-gesture';
import { GestureArbiter, type ArbiterOutput } from '@/access/gesture-arbiter';
import { ScanController, stepIndexBack, type ScanConfig } from '@/access/scan-controller';
import {
  BROW_CALIBRATION_KEY, loadBrowCalibration, measureRiseTimes, PERSONAL_TIMING, personalBrowHoldMs, withPersonalBrowTiming,
} from '@/access/brow-calibration';

const NEUTRAL = 0.1;
const RAISED = 0.7;

/** Brow machine fed every 10 ms (fine resolution so step times are exact to the frame). */
function browSim() {
  const g = new BrowGesture(DEFAULT_BROW_CALIBRATION);
  let t = 1000;
  const events: BrowEvent[] = [];
  const hold = (ms: number, score: number | null, faces = 1) => {
    const end = t + ms;
    while (t + 10 <= end) {
      t += 10;
      events.push(...g.push({ t, faces, score }));
    }
  };
  hold(700, NEUTRAL); // stable face + neutral: armed
  const nexts = () => events.filter((e): e is Extract<BrowEvent, { type: 'brow-next' }> => e.type === 'brow-next');
  return { g, hold, events, nexts, now: () => t };
}

describe('Hold to keep moving (BrowGesture)', () => {
  it('steps at the hold, then +600 and +1200 ms while still raised', () => {
    const s = browSim();
    const onset = s.now() + 10;
    s.hold(1800, RAISED);
    const n = s.nexts();
    expect(n.map((e) => e.at - onset)).toEqual([500, 1100, 1700]);
    expect(n.map((e) => e.repeat)).toEqual([0, 1, 2]);
    expect(BROW_TIMING.repeatMs).toBe(600);
  });

  it('stops on release and needs a fresh raise to move again', () => {
    const s = browSim();
    s.hold(800, RAISED); // 500 → one step
    expect(s.nexts()).toHaveLength(1);
    s.hold(100, NEUTRAL); // relaxed (brief dip)
    s.hold(1500, RAISED); // raised again without a full release: no repeats, no new raise
    expect(s.nexts()).toHaveLength(1);
    s.hold(1000, NEUTRAL); // stable release + cooldown
    s.hold(600, RAISED);
    expect(s.nexts()).toHaveLength(2);
  });

  it('cancel (blink closure onset) stops repeats for the rest of the hold', () => {
    const s = browSim();
    s.hold(550, RAISED);
    expect(s.nexts()).toHaveLength(1);
    expect(s.g.repeating).toBe(true);
    s.g.cancel('blink-preempted', s.now());
    expect(s.g.repeating).toBe(false);
    s.hold(2000, RAISED);
    expect(s.nexts()).toHaveLength(1);
  });

  it('a face dropout stops repeats', () => {
    const s = browSim();
    s.hold(550, RAISED);
    s.hold(30, null, 0);
    s.hold(2000, RAISED);
    expect(s.nexts()).toHaveLength(1);
  });
});

function jawSim() {
  const g = new JawGesture();
  let t = 1000;
  const events: JawEvent[] = [];
  const hold = (ms: number, score: number | null, faces = 1) => {
    const end = t + ms;
    while (t + 33 <= end) {
      t += 33;
      events.push(...g.push({ t, faces, score }));
    }
  };
  hold(700, 0.05);
  return { g, hold, events, backs: () => events.filter((e) => e.type === 'jaw-back').length };
}

describe('Jaw drop = BACK (JawGesture)', () => {
  it('short (talking-length) opens are ignored', () => {
    const s = jawSim();
    for (let i = 0; i < 6; i++) {
      s.hold(250, 0.7);
      s.hold(150, 0.05);
    }
    expect(s.backs()).toBe(0);
    expect(s.events.filter((e) => e.type === 'jaw-cancel' && e.reason === 'too-short').length).toBe(6);
  });

  it('a deliberate hold ≥ 400 ms then close → back exactly once, never while still open', () => {
    const s = jawSim();
    s.hold(2 * DEFAULT_JAW_CONFIG.minHoldMs, 0.8);
    expect(s.backs()).toBe(0);
    s.hold(100, 0.05);
    expect(s.backs()).toBe(1);
    s.hold(100, 0.05);
    expect(s.backs()).toBe(1);
  });

  it('a yawn-length open (> maxHoldMs) never goes back', () => {
    const s = jawSim();
    s.hold(2500, 0.9);
    s.hold(1000, 0.05);
    expect(s.backs()).toBe(0);
    expect(s.events.some((e) => e.type === 'jaw-cancel' && e.reason === 'too-long')).toBe(true);
  });

  it('cooldown: a second drop right after a back is ignored; after the cooldown it counts', () => {
    const s = jawSim();
    s.hold(600, 0.8);
    s.hold(100, 0.05);
    expect(s.backs()).toBe(1);
    s.hold(600, 0.8); // inside the 700 ms cooldown: never starts
    s.hold(100, 0.05);
    expect(s.backs()).toBe(1);
    s.hold(800, 0.05);
    s.hold(600, 0.8);
    s.hold(100, 0.05);
    expect(s.backs()).toBe(2);
  });

  it('hysteresis: dipping into the band (between release and open) keeps the drop going', () => {
    const s = jawSim();
    s.hold(200, 0.8);
    s.hold(200, 0.4); // between 0.3 and 0.5: still open
    s.hold(100, 0.8);
    s.hold(100, 0.05);
    expect(s.backs()).toBe(1);
  });

  it('band-level opens never start a drop', () => {
    const s = jawSim();
    s.hold(800, 0.45);
    s.hold(100, 0.05);
    expect(s.backs()).toBe(0);
  });
});

describe('Arbiter: repeats and jaw', () => {
  const mk = () => {
    let n = 0;
    return new GestureArbiter({ newId: () => `c${++n}`, browEnabled: () => true });
  };
  const accepts = (o: ArbiterOutput[]) => o.filter((x) => x.type === 'accept').map((x) => (x as { command: string }).command);
  const idle = { browRaised: false };

  it('repeats are accepted only after the first NEXT of the same raise was accepted', () => {
    const a = mk();
    expect(accepts(a.onBrow({ type: 'brow-next', at: 100, heldMs: 500, repeat: 1 }))).toEqual([]); // no start seen
    a.onBrow({ type: 'brow-start', at: 1000 });
    expect(accepts(a.onBrow({ type: 'brow-next', at: 1500, heldMs: 500, repeat: 0 }))).toEqual(['NAV_NEXT']);
    expect(accepts(a.onBrow({ type: 'brow-next', at: 2100, heldMs: 1100, repeat: 1 }))).toEqual(['NAV_NEXT']);
    a.reset();
    expect(accepts(a.onBrow({ type: 'brow-next', at: 2700, heldMs: 1700, repeat: 2 }))).toEqual([]);
  });

  it('blink closure onset stops repeats (and tells the brow machine to cancel)', () => {
    const a = mk();
    a.onBrow({ type: 'brow-start', at: 1000 });
    a.onBrow({ type: 'brow-next', at: 1500, heldMs: 500, repeat: 0 });
    const out = a.onBlink({ type: 'closure-start', at: 1800 });
    expect(out.some((o) => o.type === 'freeze')).toBe(true);
    expect(out.some((o) => o.type === 'cancel-brow')).toBe(true);
    a.onBlink({ type: 'discard', at: 1900, durationMs: 100, reason: 'too-short' });
    expect(accepts(a.onBrow({ type: 'brow-next', at: 2100, heldMs: 1100, repeat: 1 }))).toEqual([]);
  });

  it('jaw drop alone → NAV_PREV; during a closure → nothing', () => {
    const a = mk();
    a.onJaw({ type: 'jaw-start', at: 1000 }, idle);
    expect(accepts(a.onJaw({ type: 'jaw-back', at: 1500, heldMs: 500 }, idle))).toEqual(['NAV_PREV']);
    a.onJaw({ type: 'jaw-start', at: 3000 }, idle);
    a.onBlink({ type: 'closure-start', at: 3100 });
    a.onBlink({ type: 'discard', at: 3200, durationMs: 100, reason: 'too-short' });
    expect(accepts(a.onJaw({ type: 'jaw-back', at: 3500, heldMs: 500 }, idle))).toEqual([]);
  });

  it('jaw-back without its jaw-start (old cycle) or with brows raised → nothing', () => {
    const a = mk();
    expect(accepts(a.onJaw({ type: 'jaw-back', at: 1500, heldMs: 500 }, idle))).toEqual([]);
    a.onJaw({ type: 'jaw-start', at: 2000 }, idle);
    expect(accepts(a.onJaw({ type: 'jaw-back', at: 2500, heldMs: 500 }, { browRaised: true }))).toEqual([]);
  });

  it('brows and jaw together (surprise): neither moves', () => {
    const a = mk();
    a.onJaw({ type: 'jaw-start', at: 1000 }, idle);
    const out = a.onBrow({ type: 'brow-start', at: 1100 });
    expect(out).toContainEqual({ type: 'cancel-brow', reason: 'ambiguous' });
    expect(accepts(a.onBrow({ type: 'brow-next', at: 1600, heldMs: 500, repeat: 0 }))).toEqual([]);
    expect(accepts(a.onJaw({ type: 'jaw-back', at: 1700, heldMs: 700 }, idle))).toEqual([]);

    const b = mk();
    b.onBrow({ type: 'brow-start', at: 1000 });
    expect(b.onJaw({ type: 'jaw-start', at: 1100 }, { browRaised: true })).toContainEqual({ type: 'cancel-brow', reason: 'ambiguous' });
    expect(accepts(b.onBrow({ type: 'brow-next', at: 1500, heldMs: 500, repeat: 0 }))).toEqual([]);
    expect(accepts(b.onJaw({ type: 'jaw-back', at: 1700, heldMs: 600 }, idle))).toEqual([]);
  });

  it('a jaw drop during a held (repeating) raise stops the repeats and does not go back', () => {
    const a = mk();
    a.onBrow({ type: 'brow-start', at: 1000 });
    a.onBrow({ type: 'brow-next', at: 1500, heldMs: 500, repeat: 0 });
    expect(a.onJaw({ type: 'jaw-start', at: 1700 }, { browRaised: true })).toContainEqual({ type: 'cancel-brow', reason: 'ambiguous' });
    expect(accepts(a.onBrow({ type: 'brow-next', at: 2100, heldMs: 1100, repeat: 1 }))).toEqual([]);
    expect(accepts(a.onJaw({ type: 'jaw-back', at: 2300, heldMs: 600 }, idle))).toEqual([]);
  });
});

describe('ScanController.previous (jaw BACK)', () => {
  const clock = { now: () => 0, setTimeout: () => null, clearTimeout: () => {} };
  const cfg = (over: Partial<ScanConfig> = {}): ScanConfig => ({
    active: true, ids: ['a', 'b', 'c'], surfaceRevision: 1, intervalMs: 1000, readingPauseMs: 500, held: false, hidden: false, manual: true, ...over,
  });

  it('stepIndexBack wraps to the last; empty stays -1', () => {
    expect(stepIndexBack(0, 3)).toBe(2);
    expect(stepIndexBack(2, 3)).toBe(1);
    expect(stepIndexBack(5, 3)).toBe(0);
    expect(stepIndexBack(0, 0)).toBe(-1);
  });

  it('moves back one step (wrapping), and is refused while held or not manual', () => {
    const seen: (string | null)[] = [];
    const sc = new ScanController((id) => seen.push(id), clock);
    sc.update(cfg());
    expect(sc.current).toBe('a');
    expect(sc.previous(10)).toBe('c');
    expect(sc.previous(20)).toBe('b');
    expect(sc.next(30)).toBe('c');
    sc.update(cfg({ held: true, pin: 'c' }));
    expect(sc.previous(40)).toBeNull();
    expect(sc.current).toBe('c');
    sc.update(cfg({ manual: false }));
    expect(sc.previous(50)).toBeNull();
  });
});

describe('Personal timing', () => {
  const win = (riseMs: number) => {
    const out: { t: number; score: number }[] = [];
    for (let t = 0; t <= 300 + riseMs + 1500; t += 10) {
      const score = t < 300 ? 0.1 : t < 300 + riseMs ? 0.1 + (0.7 - 0.1) * ((t - 300) / riseMs) : t < 300 + riseMs + 1000 ? 0.7 : 0.1;
      out.push({ t, score });
    }
    return out;
  };
  const cal = { ...DEFAULT_BROW_CALIBRATION, raisedThreshold: 0.45, releaseThreshold: 0.3 };

  it('personalBrowHoldMs clamps to [350, 500] and defaults to 500 with too little data', () => {
    expect(personalBrowHoldMs([])).toBe(500);
    expect(personalBrowHoldMs([60])).toBe(500); // one raise is not enough
    expect(personalBrowHoldMs([20, 30, 40])).toBe(PERSONAL_TIMING.minHoldMs);
    expect(personalBrowHoldMs([900, 900])).toBe(PERSONAL_TIMING.maxHoldMs);
    const mid = personalBrowHoldMs([275, 275]);
    expect(mid).toBeGreaterThan(350);
    expect(mid).toBeLessThan(500);
  });

  it('measures rise times from the prompt windows', () => {
    const r = measureRiseTimes([win(100), win(100)], 0.45, 0.3);
    expect(r).toHaveLength(2);
    for (const x of r) expect(x).toBeGreaterThan(20);
  });

  it('quick decisive raises shorten the hold (and brow cooldown, ≥ 400); slow raises or warnings keep defaults', () => {
    const fast = withPersonalBrowTiming(cal, [win(60), win(60), win(60)], []);
    expect(fast.holdMs).toBeGreaterThanOrEqual(350);
    expect(fast.holdMs).toBeLessThan(500);
    expect(fast.cooldownMs).toBeGreaterThanOrEqual(400);
    // Linear ramp: the release→raised band (0.3→0.45) is a quarter of the ramp; 1800 ms → 450 ms rise.
    const slow = withPersonalBrowTiming(cal, [win(1800), win(1800)], []);
    expect(slow.holdMs).toBe(500);
    expect(slow.cooldownMs).toBe(cal.cooldownMs);
    expect(withPersonalBrowTiming(cal, [win(60), win(60)], ['marginal']).holdMs).toBe(500);
  });

  it('old saved brow calibrations (500 ms hold) load unchanged; a saved personal hold loads too', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    store.set(BROW_CALIBRATION_KEY, JSON.stringify({ neutral: 0.1, raisedThreshold: 0.45, releaseThreshold: 0.3, holdMs: 500, releaseMs: 250, cooldownMs: 500 }));
    expect(loadBrowCalibration(storage)?.holdMs).toBe(500);
    store.set(BROW_CALIBRATION_KEY, JSON.stringify({ neutral: 0.1, raisedThreshold: 0.45, releaseThreshold: 0.3, holdMs: 400, releaseMs: 250, cooldownMs: 400 }));
    expect(loadBrowCalibration(storage)).toMatchObject({ holdMs: 400, cooldownMs: 400 });
  });
});
