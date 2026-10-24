// Wave-3 gesture review fixes: attribution timing after a manual NEXT, voided closures with
// feedback, brow face-stability / reset latch, tracking interruptions, held-stretch brow
// calibration, and session publish throttling. Synthetic frames only (no camera, no DOM).
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_TIMING, attributeClosure, logHighlight, ScanController, type HighlightLogEntry, type ScanConfig,
} from '@/access/scan-controller';
import { BROW_TIMING, BrowGesture, DEFAULT_BROW_CALIBRATION, type BrowEvent } from '@/access/brow-gesture';
import { computeBrowCalibration, heldRaiseLevel } from '@/access/brow-calibration';
import {
  BlinkEngine, HIGHLIGHT_MOVED_FEEDBACK, proposeBrowCalibration,
  type FaceCommandEvent, type FaceCommandResult, type ScoreSample,
} from '@/runtime/useBlink';
import type { AccessMode } from '@/core/types';

const unguarded = () => false;
const MANUAL = { onRecentChange: 'discard' } as const;
const AUTO = { onRecentChange: 'previous' } as const;

describe('Fix 1: manual NEXT highlight timing vs closure onset', () => {
  it('log [A@0, B@1040], onset 980: manual mode discards (never credits A)', () => {
    const log: HighlightLogEntry[] = [{ id: 'A', at: 0, rev: 1 }, { id: 'B', at: 1040, rev: 1 }];
    expect(attributeClosure(log, 980, unguarded, ATTRIBUTION_TIMING, MANUAL)).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('a same-surface change just inside onset − recentChangeMs discards; one well before credits', () => {
    const r = ATTRIBUTION_TIMING.recentChangeMs;
    const log: HighlightLogEntry[] = [{ id: 'A', at: 0, rev: 1 }, { id: 'B', at: 2000, rev: 1 }];
    expect(attributeClosure(log, 2000 + r - 1, unguarded, ATTRIBUTION_TIMING, MANUAL)).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(attributeClosure(log, 2000 + r, unguarded, ATTRIBUTION_TIMING, MANUAL)).toMatchObject({ ok: true, targetId: 'B' });
  });

  it('a later entry from a different surface does not trigger the manual rule (the surface check handles it)', () => {
    const log: HighlightLogEntry[] = [{ id: 'A', at: 0, rev: 1 }, { id: 'X', at: 1040, rev: 2 }];
    expect(attributeClosure(log, 980, unguarded, ATTRIBUTION_TIMING, MANUAL)).toMatchObject({ ok: true, targetId: 'A' });
  });

  it('auto-scan behavior is unchanged (entries after the onset are ignored)', () => {
    const log: HighlightLogEntry[] = [{ id: 'A', at: 0, rev: 1 }, { id: 'B', at: 1040, rev: 1 }];
    expect(attributeClosure(log, 980, unguarded, ATTRIBUTION_TIMING, AUTO)).toMatchObject({ ok: true, targetId: 'A' });
  });

  it('manual: the only entry changed within recentChangeMs of the onset is not guessed either', () => {
    const log: HighlightLogEntry[] = [{ id: 'A', at: 900, rev: 1 }];
    expect(attributeClosure(log, 1000, unguarded, ATTRIBUTION_TIMING, MANUAL)).toMatchObject({ ok: false, reason: 'ambiguous' });
  });

  it('logHighlight keeps the log time-ordered when a step carries an earlier gesture time', () => {
    const log: HighlightLogEntry[] = [];
    logHighlight(log, { id: 'A', at: 0, rev: 1 });
    logHighlight(log, { id: 'S', at: 1000, rev: 2 });
    logHighlight(log, { id: 'B', at: 990, rev: 1 }); // NEXT frame captured before the surface log time
    expect(log.map((e) => e.id)).toEqual(['A', 'B', 'S']);
    for (let i = 0; i < 20; i++) logHighlight(log, { id: `x${i}`, at: 2000 + i, rev: 3 });
    expect(log).toHaveLength(16);
    expect(log.at(-1)?.id).toBe('x19');
  });

  it('ScanController.next(at) passes the gesture time to onChange; other changes pass none', () => {
    const seen: [string | null, number | null, number | undefined][] = [];
    const sc = new ScanController((id, rev, at) => seen.push([id, rev, at]), {
      now: () => 0, setTimeout: () => 0, clearTimeout: () => {},
    });
    const cfg: ScanConfig = { active: true, ids: ['a', 'b'], surfaceRevision: 7, intervalMs: 1000, readingPauseMs: 500, held: false, hidden: false, manual: true };
    sc.update(cfg);
    expect(sc.next(1234)).toBe('b');
    expect(seen).toEqual([['a', 7, undefined], ['b', 7, 1234]]);
  });
});

// ---- Engine harness (node: no camera, no storage) ----
type Frame = { eye: number; brow: number; faces?: number };
function engineSetup(handler: (e: FaceCommandEvent) => FaceCommandResult, mode: AccessMode = 'brow-blink') {
  const engine = new BlinkEngine(mode);
  (engine as unknown as { hardStatus: unknown }).hardStatus = null; // pretend the camera runs
  const events: FaceCommandEvent[] = [];
  engine.setCommandHandler((e) => {
    events.push(e);
    return handler(e);
  });
  let t = 1000;
  const run = (ms: number, f: Frame) => {
    const end = t + ms;
    for (; t < end; t += 50) engine.onFrame({ t, faces: f.faces ?? 1, score: f.eye, brow: f.brow });
  };
  const accepts = () => events.filter((e) => e.type === 'accept');
  return { engine, events, run, accepts };
}
const OPEN = { eye: 0.05, brow: 0.05 };
const CLOSED = { eye: 0.9, brow: 0.05 };

describe('Fix 2: a refused freeze voids the closure and says so', () => {
  it("refusal 'highlight-moved': SELECT is never forwarded and the feedback explains why", () => {
    const { engine, run, accepts } = engineSetup((e) =>
      e.type === 'freeze' ? { applied: false, targetId: null, refusal: 'highlight-moved' } : { applied: true, targetId: 'target' });
    run(1000, OPEN);
    run(800, CLOSED); // deliberate closure
    run(100, OPEN);
    expect(accepts()).toEqual([]);
    const snap = engine.getSnapshot();
    expect(snap.lastAccepted).toBeNull();
    expect(snap.feedback).toMatchObject({ kind: 'ambiguous', label: HIGHLIGHT_MOVED_FEEDBACK.label });
  });

  it('a voided ordinary (short) blink shows no "highlight moved" message', () => {
    const { engine, run, accepts } = engineSetup((e) =>
      e.type === 'freeze' ? { applied: false, targetId: null, refusal: 'highlight-moved' } : { applied: true, targetId: 'target' });
    run(1000, OPEN);
    run(200, CLOSED);
    run(100, OPEN);
    expect(accepts()).toEqual([]);
    expect(engine.getSnapshot().feedback.label).not.toBe(HIGHLIGHT_MOVED_FEEDBACK.label);
  });

  it('a refusal without a reason voids silently; the next closure (accepted freeze) selects normally', () => {
    let refuse = true;
    const { run, accepts } = engineSetup((e) =>
      e.type === 'freeze' ? { applied: !refuse, targetId: refuse ? null : 'target' } : { applied: true, targetId: 'target' });
    run(1000, OPEN);
    run(800, CLOSED);
    run(1200, OPEN); // re-arm (cooldown)
    expect(accepts()).toEqual([]);
    refuse = false;
    run(800, CLOSED);
    run(200, OPEN);
    expect(accepts().map((e) => (e as { command: string }).command)).toEqual(['SELECT']);
  });
});

describe('Fix 3: acknowledgements only for applied commands', () => {
  it('a refused NAV_NEXT (highlight did not move) produces no lastAccepted and no "Next" flash', () => {
    const { engine, run, accepts } = engineSetup((e) => ({ applied: e.type === 'freeze', targetId: null }));
    run(1000, OPEN);
    run(800, { eye: 0.05, brow: 0.8 });
    expect(accepts().map((e) => (e as { command: string }).command)).toEqual(['NAV_NEXT']);
    const snap = engine.getSnapshot();
    expect(snap.lastAccepted).toBeNull();
    expect(snap.feedback.kind).not.toBe('brow-accepted');
  });
});

describe('Fix 4: brow needs a stable single face before a raise can start', () => {
  const NEUTRAL = 0.1, RAISED = 0.7;
  function sim() {
    const g = new BrowGesture(DEFAULT_BROW_CALIBRATION);
    const events: BrowEvent[] = [];
    let t = 0;
    const hold = (ms: number, score: number | null, faces = 1) => {
      const end = t + ms;
      while (t + 33 <= end) {
        t += 33;
        events.push(...g.push({ t, faces, score }));
      }
    };
    return { g, events, hold, now: () => t };
  }

  it('a fresh machine: a raise right after the first neutral frames (< stableFaceMs) does not start', () => {
    const s = sim();
    s.hold(200, NEUTRAL);
    s.hold(1000, RAISED);
    expect(s.events).toEqual([]);
  });

  it('a no-face frame while NEUTRAL requires neutral again and a new stable period', () => {
    const s = sim();
    s.hold(800, NEUTRAL); // armed
    s.hold(33, null, 0); // dropout while neutral
    s.hold(1000, RAISED); // face back already raised: no neutral seen → nothing
    expect(s.events).toEqual([]);
    s.hold(100, NEUTRAL); // neutral, but the face has only been stable ~1.1 s… since the raise frames
    s.hold(700, RAISED);
    expect(s.events.map((e) => e.type)).toEqual(['brow-start', 'brow-next']);
  });

  it('after a dropout, neutral frames for less than stableFaceMs do not allow a raise', () => {
    const s = sim();
    s.hold(800, NEUTRAL);
    s.hold(66, NEUTRAL, 2); // two faces while neutral
    s.hold(200, NEUTRAL);
    s.hold(200, RAISED); // still < 500 ms of stable single face
    expect(s.events).toEqual([]);
  });

  it('a stale gap while NEUTRAL requires a fresh neutral frame and stable face', () => {
    const s = sim();
    s.hold(800, NEUTRAL);
    s.g.push({ t: s.now() + BROW_TIMING.staleGapMs + 100, faces: 1, score: RAISED });
    s.hold(1000, RAISED);
    expect(s.events).toEqual([]);
  });
});

describe('Fix 5: reset() keeps a latched or rearming raise latched', () => {
  it('rearming at reset: a raise right after needs the full release + cooldown again', () => {
    const g = new BrowGesture(DEFAULT_BROW_CALIBRATION);
    let t = 0;
    const out: BrowEvent[] = [];
    const hold = (ms: number, score: number) => {
      const end = t + ms;
      while (t + 33 <= end) {
        t += 33;
        out.push(...g.push({ t, faces: 1, score }));
      }
    };
    hold(800, 0.1);
    hold(600, 0.7);
    hold(400, 0.1); // released → rearming
    expect(g.status).toBe('rearming');
    g.reset();
    expect(g.status).toBe('latched');
    hold(600, 0.7);
    expect(out.filter((e) => e.type === 'brow-next')).toHaveLength(1);
  });
});

describe('Fix 6/7: tracking interruptions reach the handler (pause like face-lost)', () => {
  it('orientation change sends face-lost with a cause; pending closure is discarded', () => {
    const { engine, run, events, accepts } = engineSetup((e) => ({ applied: e.type !== 'unfreeze', targetId: 'target' }));
    (engine as unknown as { detector: unknown }).detector = { fps: 0, start() {}, pause() {}, close() {} };
    run(1000, OPEN);
    run(300, CLOSED); // closure in progress
    (engine as unknown as { onOrientation: () => void }).onOrientation();
    const kinds = events.map((e) => (e.type === 'face-lost' ? `face-lost:${e.cause ?? 'face'}` : e.type));
    expect(kinds).toEqual(['freeze', 'unfreeze', 'face-lost:orientation']);
    run(600, CLOSED);
    run(200, OPEN);
    expect(accepts()).toEqual([]); // the interrupted closure never selects
  });

  it('interruptions during calibration stages are not forwarded', () => {
    const { engine, run, events } = engineSetup(() => ({ applied: true, targetId: 'target' }));
    (engine as unknown as { stream: unknown }).stream = {};
    (engine as unknown as { detector: unknown }).detector = { fps: 0, start() {}, pause() {}, close() {} };
    engine.begin('brow-blink');
    run(300, OPEN);
    (engine as unknown as { onOrientation: () => void }).onOrientation();
    expect(events.filter((e) => e.type === 'face-lost')).toEqual([]);
  });
});

describe('Fix 8: brow calibration uses each window’s held stretch', () => {
  const neutral = Array.from({ length: 45 }, (_, i) => 0.08 + (i % 5) * 0.01); // 0.08…0.12
  /** One prompt window: relaxed for latencyMs, then held at `level` for holdMs, then relaxed. */
  function windowWith(latencyMs: number, holdMs = 800, level = 0.7): ScoreSample[] {
    const out: ScoreSample[] = [];
    const end = latencyMs + holdMs + 200;
    for (let t = 0; t <= end; t += 66) {
      const up = t >= latencyMs && t < latencyMs + holdMs;
      out.push({ t, score: up ? level + ((t / 66) % 2) * 0.02 : 0.1 });
    }
    return out;
  }

  for (const latency of [2000, 3000]) {
    it(`${latency / 1000} s reaction latency still calibrates with a sensible threshold`, () => {
      const windows = Array.from({ length: 5 }, () => windowWith(latency));
      const level = heldRaiseLevel(windows, 0.12);
      expect(level).toBeGreaterThan(0.65);
      const r = proposeBrowCalibration(neutral, windows);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // Midway between relaxed (~0.12) and held (~0.7): clearly above rest, clearly below held.
      expect(r.calibration.raisedThreshold).toBeGreaterThan(0.3);
      expect(r.calibration.raisedThreshold).toBeLessThan(0.55);
      expect(r.calibration.releaseThreshold).toBeLessThan(r.calibration.raisedThreshold);
      expect(r.calibration.releaseThreshold).toBeGreaterThan(0.15);
    });
  }

  it('the old p75-of-all-samples level would have failed on the same 3 s data', () => {
    const windows = Array.from({ length: 5 }, () => windowWith(3000));
    const all = windows.flatMap((w) => w.map((s) => s.score));
    expect(computeBrowCalibration(neutral, all, { raiseCount: 5 }).ok).toBe(false);
  });

  it('flickers shorter than minRunMs are not a held level; flat brows still fail honestly', () => {
    const flicker: ScoreSample[] = [{ t: 0, score: 0.1 }, { t: 66, score: 0.8 }, { t: 132, score: 0.1 }];
    expect(heldRaiseLevel([flicker, flicker], 0.12)).toBeNull();
    const flat = Array.from({ length: 5 }, () => windowWith(1000, 800, 0.14));
    expect(proposeBrowCalibration(neutral, flat).ok).toBe(false);
  });
});

describe('Fix 10: session snapshots are not republished for raw meter changes', () => {
  it('eye-score jitter below the closure threshold publishes (almost) nothing outside calibration', () => {
    const { engine, run } = engineSetup(() => ({ applied: true, targetId: 'target' }));
    run(2000, OPEN); // acquire, let transient feedback expire
    let publishes = 0;
    const unsub = engine.subscribeStore(() => {
      publishes += 1;
    });
    for (let i = 0; i < 40; i++) run(50, { eye: i % 2 ? 0.05 : 0.25, brow: 0.05 });
    unsub();
    expect(publishes).toBeLessThanOrEqual(1);
  });
});
