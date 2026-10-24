// Face runtime: manual (eyebrow) highlight stepping, keyboard NAV_NEXT fallback, brow score
// extraction, brow calibration windows, feedback composition, orientation/visibility interrupts,
// and the engine's detector → gesture → arbiter → command-handler wiring (synthetic frames).
// Deterministic fake-clock / synthetic-frame tests prove logic only — not physical reliability.
import { describe, expect, it } from 'vitest';
import { attributeClosure, ScanController, stepIndex, type HighlightLogEntry, type ScanConfig } from '@/access/scan-controller';
import { hasHighlight, InputController, isManualNavMode, isNavNextKey, isScanMode } from '@/access/input-controller';
import { browRaiseFromCategories, eyeClosureFromCategories } from '@/access/blink-detector';
import { BlinkGesture } from '@/access/blink-gesture';
import { BrowGesture } from '@/access/brow-gesture';
import type { AccessMode } from '@/core/types';
import {
  BlinkEngine, BROW_FALLBACK_ADVICE, composeFeedback, countHeldRaises, faceInputActive, interruptGestures, longestHoldMs,
  proposeBrowCalibration, type FaceCommandEvent, type FeedbackInput, type ScoreSample,
} from '@/runtime/useBlink';

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
  get pending() {
    return this.timers.size;
  }
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

function manualSetup(over: Partial<ScanConfig> = {}) {
  const clock = new FakeClock();
  const log: HighlightLogEntry[] = [];
  const sc = new ScanController((id, rev) => log.push({ id, at: clock.t, rev }), clock);
  let cfg: ScanConfig = {
    active: true, ids: ['a', 'b', 'c'], surfaceRevision: 1, intervalMs: 1000, readingPauseMs: 1500, held: false, pin: null, hidden: false,
    manual: true, ...over,
  };
  sc.update(cfg);
  const update = (patch: Partial<ScanConfig>) => {
    cfg = { ...cfg, ...patch };
    sc.update(cfg);
  };
  return { clock, log, sc, update };
}

describe('Manual (eyebrow) highlight stepping', () => {
  it('stepIndex wraps and recovers from invalid indices', () => {
    expect(stepIndex(0, 3)).toBe(1);
    expect(stepIndex(2, 3)).toBe(0);
    expect(stepIndex(-1, 3)).toBe(0);
    expect(stepIndex(7, 3)).toBe(0);
    expect(stepIndex(0, 0)).toBe(-1);
  });

  it('starts on the first (safe) target and never auto-advances', () => {
    const { clock, sc } = manualSetup();
    expect(sc.current).toBe('a');
    clock.advance(30_000);
    expect(sc.current).toBe('a');
    expect(clock.pending).toBe(0);
  });

  it('next() moves exactly one step per call and wraps', () => {
    const { sc } = manualSetup();
    expect(sc.next()).toBe('b');
    expect(sc.next()).toBe('c');
    expect(sc.next()).toBe('a');
  });

  it('next() is refused while held (blink closure / switch press) or hidden', () => {
    const { sc, update } = manualSetup();
    update({ held: true, pin: 'a' });
    expect(sc.next()).toBeNull();
    expect(sc.current).toBe('a');
    update({ held: false, pin: null, hidden: true });
    expect(sc.next()).toBeNull();
    update({ hidden: false });
    expect(sc.next()).toBe('b');
  });

  it('a surface change resets to the first target (no carryover)', () => {
    const { sc, update, log } = manualSetup();
    sc.next();
    update({ surfaceRevision: 2, ids: ['x', 'y'] });
    expect(sc.current).toBe('x');
    expect(log.at(-1)).toEqual({ id: 'x', at: 0, rev: 2 });
  });

  it('next() is refused in timed auto-scan mode, and switching to manual cancels the timer', () => {
    const { clock, sc, update } = manualSetup({ manual: false });
    expect(sc.next()).toBeNull();
    expect(clock.pending).toBe(1);
    update({ manual: true });
    expect(clock.pending).toBe(0);
    expect(sc.current).toBe('a');
  });

  it('a one-target surface logs nothing new on next()', () => {
    const { sc, log } = manualSetup({ ids: ['pa-resume'] });
    const n = log.length;
    expect(sc.next()).toBe('pa-resume');
    expect(log.length).toBe(n);
  });
});

describe('Closure attribution in manual mode', () => {
  const log: HighlightLogEntry[] = [
    { id: 'a', at: 0, rev: 1 },
    { id: 'b', at: 1000, rev: 1 },
  ];
  const noArm = () => false;
  it('auto-scan credits the previous target for a closure just after a move', () => {
    const r = attributeClosure(log, 1100, noArm);
    expect(r).toMatchObject({ ok: true, targetId: 'a', credited: 'previous' });
  });
  it('manual stepping discards a closure just after a deliberate move as ambiguous', () => {
    const r = attributeClosure(log, 1100, noArm, undefined, { onRecentChange: 'discard' });
    expect(r).toEqual({ ok: false, reason: 'ambiguous' });
  });
  it('manual stepping credits the current target once it has been highlighted a while', () => {
    const r = attributeClosure(log, 1500, noArm, undefined, { onRecentChange: 'discard' });
    expect(r).toMatchObject({ ok: true, targetId: 'b', credited: 'current' });
  });
});

type FakeKey = {
  key: string; code: string; repeat?: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: unknown;
};
function keyEvent(k: FakeKey) {
  const e = {
    shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, target: null, ...k,
    defaultPrevented: false,
    preventDefault() {
      e.defaultPrevented = true;
    },
    stopPropagation() {},
  };
  return e;
}

function inputSetup(mode: AccessMode) {
  let t = 0;
  const calls = { nav: 0, activate: [] as string[] };
  const input = new InputController({
    getMode: () => mode,
    getHighlighted: () => 'cand-1',
    getSurfaceRevision: () => 1,
    newId: () => `id${++t}`,
    onSwitchActivate: ({ targetId }) => calls.activate.push(targetId),
    onHeldChange: () => {},
    onSafetyPause: () => {},
    onNavNext: () => {
      calls.nav += 1;
    },
    now: () => 10_000,
    cooldownMs: 0,
  });
  const down = (k: FakeKey) => {
    const e = keyEvent(k);
    input.onKeyDown(e as unknown as KeyboardEvent);
    return e;
  };
  const up = (k: FakeKey) => {
    const e = keyEvent(k);
    input.onKeyUp(e as unknown as KeyboardEvent);
    return e;
  };
  return { calls, down, up };
}

describe('Keyboard fallbacks in face modes', () => {
  it('mode helpers', () => {
    expect(isScanMode('brow-blink')).toBe(false);
    expect(isManualNavMode('brow-blink')).toBe(true);
    expect(hasHighlight('brow-blink')).toBe(true);
    expect(hasHighlight('blink')).toBe(true);
    expect(hasHighlight('pointer')).toBe(false);
  });

  it('isNavNextKey: Tab (not Shift+Tab) and ArrowRight only', () => {
    expect(isNavNextKey({ key: 'Tab', code: 'Tab', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(isNavNextKey({ key: 'Tab', code: 'Tab', shiftKey: true, ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
    expect(isNavNextKey({ key: 'ArrowRight', code: 'ArrowRight', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(isNavNextKey({ key: 'ArrowRight', code: 'ArrowRight', shiftKey: false, ctrlKey: true, metaKey: false, altKey: false })).toBe(false);
  });

  it('brow-blink: Tab / ArrowRight step once per press, repeats ignored, default prevented', () => {
    const { calls, down } = inputSetup('brow-blink');
    expect(down({ key: 'Tab', code: 'Tab' }).defaultPrevented).toBe(true);
    expect(down({ key: 'Tab', code: 'Tab', repeat: true }).defaultPrevented).toBe(true);
    down({ key: 'ArrowRight', code: 'ArrowRight' });
    expect(calls.nav).toBe(2);
  });

  it('brow-blink: Space press/release selects the current highlight once', () => {
    const { calls, down, up } = inputSetup('brow-blink');
    down({ key: ' ', code: 'Space' });
    down({ key: ' ', code: 'Space', repeat: true });
    up({ key: ' ', code: 'Space' });
    expect(calls.activate).toEqual(['cand-1']);
  });

  it('auto-scan blink mode keeps native Tab (no NAV_NEXT)', () => {
    const { calls, down } = inputSetup('blink');
    expect(down({ key: 'Tab', code: 'Tab' }).defaultPrevented).toBe(false);
    expect(calls.nav).toBe(0);
  });
});

describe('Detector brow-raise score', () => {
  const cats = (o: Record<string, number>) => Object.entries(o).map(([categoryName, score]) => ({ categoryName, score }));
  it('max(browInnerUp, mean(outer pair))', () => {
    expect(browRaiseFromCategories(cats({ browInnerUp: 0.2, browOuterUpLeft: 0.8, browOuterUpRight: 0.6 }))).toBeCloseTo(0.7);
    expect(browRaiseFromCategories(cats({ browInnerUp: 0.9, browOuterUpLeft: 0.1, browOuterUpRight: 0.1 }))).toBeCloseTo(0.9);
  });
  it('a one-sided outer raise counts only half', () => {
    expect(browRaiseFromCategories(cats({ browInnerUp: 0, browOuterUpLeft: 0.8, browOuterUpRight: 0 }))).toBeCloseTo(0.4);
  });
  it('missing blendshapes → null; eye score still min of both eyes', () => {
    expect(browRaiseFromCategories(cats({ browInnerUp: 0.5 }))).toBeNull();
    expect(eyeClosureFromCategories(cats({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.2 }))).toBeCloseTo(0.2);
  });
});

const series = (from: number, to: number, step: number, score: number): ScoreSample[] => {
  const out: ScoreSample[] = [];
  for (let t = from; t <= to; t += step) out.push({ t, score });
  return out;
};

describe('Brow calibration windows', () => {
  it('longestHoldMs uses hysteresis and breaks on long gaps', () => {
    const w = [...series(0, 200, 50, 0.1), ...series(250, 900, 50, 0.7), ...series(950, 1100, 50, 0.1)];
    expect(longestHoldMs(w, 0.4, 0.25)).toBe(650);
    const gap = [{ t: 0, score: 0.7 }, { t: 300, score: 0.7 }, { t: 2000, score: 0.7 }, { t: 2100, score: 0.7 }];
    expect(longestHoldMs(gap, 0.4, 0.25)).toBe(300);
  });

  it('countHeldRaises counts only windows held ≥ holdMs', () => {
    const held = series(0, 700, 50, 0.7);
    const flick = series(0, 200, 50, 0.7);
    expect(countHeldRaises([held, flick, held], 0.4, 0.25, 500)).toBe(2);
  });

  const neutral = Array.from({ length: 45 }, (_, i) => 0.05 + (i % 5) * 0.01);
  const window = () => [...series(0, 300, 66, 0.06), ...series(366, 1300, 66, 0.75), ...series(1366, 1600, 66, 0.06)];

  it('proposes thresholds between relaxed and raised', () => {
    const r = proposeBrowCalibration(neutral, [window(), window(), window()]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.calibration.raisedThreshold).toBeGreaterThan(r.calibration.releaseThreshold);
      expect(r.calibration.releaseThreshold).toBeGreaterThan(0.09);
      expect(r.calibration.raisedThreshold).toBeLessThan(0.75);
      expect(r.calibration.holdMs).toBe(500);
    }
  });

  it('fails honestly (with fallback advice) when raises cannot be separated', () => {
    const flat = () => series(0, 1600, 66, 0.09);
    const r = proposeBrowCalibration(neutral, [flat(), flat(), flat()]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(BROW_FALLBACK_ADVICE);
  });

  it('fails when raises are clearly higher but never held for half a second', () => {
    const flicks = () => [...series(0, 300, 66, 0.06), ...series(366, 566, 66, 0.75), ...series(632, 1600, 66, 0.06)];
    const r = proposeBrowCalibration(neutral, [flicks(), flicks(), flicks(), flicks()]);
    expect(r.ok).toBe(false);
  });
});

describe('Feedback composition', () => {
  const base: FeedbackInput = {
    hard: null, stalled: false, status: 'ready', mode: 'brow-blink', browStatus: 'neutral', browProgress: 0,
    closureProgress: 0, transient: null, calibrated: true,
  };
  it('camera off / acquiring / tracking lost', () => {
    expect(composeFeedback({ ...base, hard: 'off' }).kind).toBe('camera-off');
    expect(composeFeedback({ ...base, status: 'no-face' }).kind).toBe('acquiring');
    expect(composeFeedback({ ...base, status: 'face-lost' }).label).toBe('Tracking lost — Paused');
  });
  it('progress beats transient; transient beats re-arming; idle instruction last', () => {
    const next = { kind: 'brow-accepted' as const, label: 'Eyebrow raise detected — Next' };
    expect(composeFeedback({ ...base, browStatus: 'rising', browProgress: 0.4, transient: next })).toMatchObject({ kind: 'brow-progress', progress01: 0.4 });
    expect(composeFeedback({ ...base, browStatus: 'latched', transient: next })).toBe(next);
    expect(composeFeedback({ ...base, browStatus: 'latched' }).kind).toBe('cooldown');
    expect(composeFeedback(base).label).toBe('Raise eyebrows to move · long blink to select');
    expect(composeFeedback({ ...base, mode: 'blink', browStatus: 'disabled' }).label).toBe('Ready — long blink to select');
  });
  it('closure progress is shown while the eyes are closed', () => {
    expect(composeFeedback({ ...base, status: 'closing', closureProgress: 0.5 })).toMatchObject({ kind: 'blink-progress', progress01: 0.5 });
  });
});

describe('Orientation / visibility interrupt', () => {
  it('discards a pending closure and cancels a pending raise as stale', () => {
    const blink = new BlinkGesture();
    const brow = new BrowGesture();
    let t = 0;
    for (; t <= 800; t += 50) {
      blink.push({ t, faces: 1, score: 0.05 });
      brow.push({ t, faces: 1, score: 0.05 });
    }
    blink.push({ t, faces: 1, score: 0.9 }); // closure starts
    brow.push({ t, faces: 1, score: 0.8 }); // raise starts
    const ev = interruptGestures(blink, brow, t + 10);
    expect(ev.blink).toEqual([expect.objectContaining({ type: 'discard', reason: 'stale' })]);
    expect(ev.brow).toEqual([expect.objectContaining({ type: 'brow-cancel', reason: 'stale' })]);
  });
});

describe('faceInputActive', () => {
  const cal = { closedThreshold: 0.5, openThreshold: 0.3, minClosureMs: 600, maxClosureMs: 2500, cooldownMs: 800, calibratedAt: 1, naturalMaxMs: null, deliberateMinMs: null };
  const brow = { neutral: 0.1, raisedThreshold: 0.45, releaseThreshold: 0.3, holdMs: 500, releaseMs: 250, cooldownMs: 500 };
  it('brow-blink needs both calibrations; blink needs only blink', () => {
    expect(faceInputActive('brow-blink', cal, null)).toBe(false);
    expect(faceInputActive('brow-blink', cal, brow)).toBe(true);
    expect(faceInputActive('blink', cal, null)).toBe(true);
    expect(faceInputActive('keyboard', cal, brow)).toBe(false);
  });
});

// ---- Engine wiring with synthetic frames (node: no camera, no storage) ----

type Frame = { eye: number; brow: number; faces?: number };
function engineSetup(mode: AccessMode = 'brow-blink') {
  const engine = new BlinkEngine(mode);
  // Simulate a running camera (node has none): status comes from the gesture machines.
  (engine as unknown as { hardStatus: unknown }).hardStatus = null;
  const events: FaceCommandEvent[] = [];
  engine.setCommandHandler((e) => {
    events.push(e);
    return { applied: e.type === 'accept' || e.type === 'freeze', targetId: e.type === 'accept' ? 'target' : null };
  });
  let t = 1000;
  const run = (ms: number, f: Frame) => {
    const end = t + ms;
    for (; t < end; t += 50) engine.onFrame({ t, faces: f.faces ?? 1, score: f.eye, brow: f.brow });
  };
  return { engine, events, run, accepts: () => events.filter((e) => e.type === 'accept').map((e) => (e as { command: string }).command) };
}

describe('Engine: detector → gestures → ONE arbiter → command handler', () => {
  it('a 500 ms eyebrow raise yields exactly one NAV_NEXT even when held 2 s', () => {
    const { engine, run, accepts } = engineSetup();
    run(1000, { eye: 0.05, brow: 0.05 }); // face acquired, neutral seen
    run(2000, { eye: 0.05, brow: 0.8 });
    expect(accepts()).toEqual(['NAV_NEXT']);
    const snap = engine.getSnapshot();
    expect(snap.lastAccepted).toMatchObject({ command: 'NAV_NEXT', targetId: 'target' });
    run(400, { eye: 0.05, brow: 0.05 }); // release + cooldown
    run(800, { eye: 0.05, brow: 0.05 });
    run(700, { eye: 0.05, brow: 0.8 });
    expect(accepts()).toEqual(['NAV_NEXT', 'NAV_NEXT']);
  });

  it('a short raise gives progress but no command', () => {
    const { engine, run, accepts } = engineSetup();
    run(1000, { eye: 0.05, brow: 0.05 });
    run(250, { eye: 0.05, brow: 0.8 });
    expect(engine.getSnapshot().browStatus).toBe('rising');
    run(300, { eye: 0.05, brow: 0.05 });
    expect(accepts()).toEqual([]);
  });

  it('a long blink: freeze at onset, then SELECT accept before unfreeze', () => {
    const { run, events } = engineSetup();
    run(1000, { eye: 0.05, brow: 0.05 });
    run(800, { eye: 0.9, brow: 0.05 });
    run(200, { eye: 0.05, brow: 0.05 });
    const kinds = events.map((e) => (e.type === 'accept' ? `accept:${e.command}` : e.type));
    expect(kinds).toEqual(['freeze', 'accept:SELECT', 'unfreeze']);
  });

  it('a raise completing during a closure never moves the highlight', () => {
    const { run, accepts } = engineSetup();
    run(1000, { eye: 0.05, brow: 0.05 });
    run(300, { eye: 0.05, brow: 0.8 }); // raise starts first (well outside the ambiguity window)
    run(900, { eye: 0.9, brow: 0.8 }); // closure pre-empts it
    run(200, { eye: 0.05, brow: 0.05 });
    expect(accepts()).toEqual(['SELECT']);
  });

  it("'blink' mode ignores eyebrows entirely", () => {
    const { engine, run, accepts } = engineSetup('blink');
    run(1000, { eye: 0.05, brow: 0.05 });
    run(1000, { eye: 0.05, brow: 0.8 });
    expect(accepts()).toEqual([]);
    expect(engine.getSnapshot().browStatus).toBe('disabled');
  });

  it('resetGestures (new surface) re-arms the brow: a raise held across it does not navigate', () => {
    const { engine, run, accepts } = engineSetup();
    run(1000, { eye: 0.05, brow: 0.05 });
    run(300, { eye: 0.05, brow: 0.8 });
    engine.resetGestures();
    run(1000, { eye: 0.05, brow: 0.8 });
    expect(accepts()).toEqual([]);
  });
});

describe('Engine: brow-blink calibration stages', () => {
  it('position → brow-neutral → brow-raise (5 raises) → brow-practice → baseline; practice is never forwarded', () => {
    const { engine, run, events } = engineSetup();
    // Pretend the camera is on so begin() does not try to open one (node has no camera).
    (engine as unknown as { stream: unknown }).stream = {};
    engine.begin('brow-blink');
    expect(engine.getSnapshot().cal.stage).toBe('position');
    run(1100, { eye: 0.05, brow: 0.05 });
    expect(engine.getSnapshot().cal.stage).toBe('brow-neutral');
    run(3300, { eye: 0.05, brow: 0.06 });
    expect(engine.getSnapshot().cal.stage).toBe('brow-raise');
    for (let i = 0; i < 5; i++) {
      run(1700, { eye: 0.05, brow: 0.06 }); // rest
      run(900, { eye: 0.05, brow: 0.75 }); // hold until the bar fills
      run(300, { eye: 0.05, brow: 0.06 }); // relax → window ends
    }
    const snap = engine.getSnapshot();
    expect(snap.cal.stage).toBe('brow-practice');
    expect(snap.cal.browRaiseCount).toBe(5);
    expect(snap.cal.proposedBrow).not.toBeNull();
    expect(snap.cal.browRaiseSamples.length).toBeGreaterThan(50);

    run(1200, { eye: 0.05, brow: 0.06 });
    run(800, { eye: 0.05, brow: 0.75 });
    const practice = engine.getSnapshot();
    expect(practice.lastAccepted?.command).toBe('NAV_NEXT');
    expect(events.filter((e) => e.type === 'accept')).toEqual([]); // practice never reaches the app

    engine.advance();
    expect(engine.getSnapshot().cal.stage).toBe('baseline');
  });

  it('flat brows fail honestly with the fallback advice', () => {
    const { engine, run } = engineSetup();
    (engine as unknown as { stream: unknown }).stream = {};
    engine.begin('brow-blink');
    run(1100, { eye: 0.05, brow: 0.05 });
    run(3300, { eye: 0.05, brow: 0.06 });
    for (let i = 0; i < 8; i++) run(6500, { eye: 0.05, brow: 0.07 });
    const snap = engine.getSnapshot();
    expect(snap.cal.stage).toBe('failed');
    expect(snap.cal.failureReason).toContain(BROW_FALLBACK_ADVICE);
  });

  it("begin('blink') skips the brow stages", () => {
    const { engine, run } = engineSetup();
    (engine as unknown as { stream: unknown }).stream = {};
    engine.begin('blink');
    run(1100, { eye: 0.05, brow: 0.05 });
    expect(engine.getSnapshot().cal.stage).toBe('baseline');
  });
});
