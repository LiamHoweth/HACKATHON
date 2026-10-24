import { describe, expect, it } from 'vitest';
import {
  BLINK_CALIBRATION_KEY, ClosureSegmenter, type Closure, computeBlinkCalibration, loadCalibration, parseStoredCalibration,
  provisionalThresholds, saveCalibration, type CalibrationSamples, CALIBRATION_WARNING_TEXT, calibrationWarnings,
} from '@/access/blink-calibration';

const baseline = Array.from({ length: 45 }, (_, i) => 0.05 + (i % 10) * 0.01); // 0.05..0.14

function samples(over: Partial<CalibrationSamples> = {}): CalibrationSamples {
  return {
    baselineScores: baseline,
    naturalDurationsMs: [180, 220, 260],
    naturalPeaks: [0.6, 0.7, 0.65],
    deliberateDurationsMs: [850, 950, 1100, 1000],
    deliberatePeaks: [0.85, 0.9, 0.88, 0.92],
    ...over,
  };
}

describe('ACCESS-10 blink calibration proposal', () => {
  it('ACCESS-10 separable natural and deliberate closures produce a calibration', () => {
    const r = computeBlinkCalibration(samples(), 123);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.calibration;
    expect(c.closedThreshold).toBeGreaterThan(c.openThreshold);
    expect(c.openThreshold).toBeGreaterThan(0.14); // above the open-eye p90
    expect(c.closedThreshold).toBeLessThan(0.85); // below every deliberate peak
    expect(c.minClosureMs).toBeGreaterThanOrEqual(416); // ≥ 1.6 × natural max (260)
    expect(c.minClosureMs).toBeLessThanOrEqual(0.8 * 850);
    expect(c.maxClosureMs).toBe(2200); // max(2000, 2 × 1100)
    expect(c.cooldownMs).toBe(800);
    expect(c.naturalMaxMs).toBe(260);
    expect(c.deliberateMinMs).toBe(850);
    expect(c.calibratedAt).toBe(123);
  });

  it('ACCESS-10 overlapping natural and deliberate closures fail honestly', () => {
    const r = computeBlinkCalibration(samples({ naturalDurationsMs: [200, 500], deliberateDurationsMs: [600, 700, 650] }), 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/overlapped/);
    expect(r.reason).toMatch(/Keyboard or switch/);
  });

  it('ACCESS-10 too few deliberate samples or baseline frames fail', () => {
    const few = computeBlinkCalibration(samples({ deliberateDurationsMs: [900, 1000], deliberatePeaks: [0.9, 0.9] }), 1);
    expect(few.ok).toBe(false);
    if (!few.ok) expect(few.reason).toMatch(/at least 3/);
    const noBase = computeBlinkCalibration(samples({ baselineScores: [0.1, 0.1] }), 1);
    expect(noBase.ok).toBe(false);
  });

  it('ACCESS-10 a weak closure signal fails instead of forcing a pass', () => {
    const r = computeBlinkCalibration(samples({ deliberatePeaks: [0.22, 0.25, 0.24, 0.23] }), 1);
    expect(r.ok).toBe(false);
  });

  it('ACCESS-10 short deliberate closures that cannot clear the 400 ms floor fail', () => {
    const r = computeBlinkCalibration(samples({ naturalDurationsMs: [150], deliberateDurationsMs: [420, 450, 480] }), 1);
    expect(r.ok).toBe(false);
  });

  it('ACCESS-10 no natural blinks observed uses a cautious 600 ms default (not the 400 ms floor), reports null, and warns', () => {
    const r = computeBlinkCalibration(samples({ naturalDurationsMs: [], naturalPeaks: [] }), 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.calibration.minClosureMs).toBeGreaterThanOrEqual(600);
      expect(r.calibration.minClosureMs).toBeLessThanOrEqual(0.8 * 850);
      expect(r.calibration.naturalMaxMs).toBeNull();
      expect(calibrationWarnings(r.calibration)).toEqual(['no-natural-blinks']);
      expect(CALIBRATION_WARNING_TEXT['no-natural-blinks']).toContain('No natural blinks were measured');
    }
  });

  it('ACCESS-10 no natural blinks and deliberate closures too short for the cautious default fail honestly', () => {
    const r = computeBlinkCalibration(samples({ naturalDurationsMs: [], naturalPeaks: [], deliberateDurationsMs: [700, 720, 740] }), 1);
    expect(r.ok).toBe(false); // cap 560 < 600
    if (!r.ok) expect(r.reason).toMatch(/Keyboard or switch/);
  });
});

describe('Blink calibration margin (audit finding 4)', () => {
  it('fails when the achievable cap is below 1.5 × the longest natural blink', () => {
    // natural max 400: 1.3 × 400 = 520 < 700, so the old overlap check passed; cap 0.8 × 700 = 560 < 600.
    const r = computeBlinkCalibration(samples({ naturalDurationsMs: [250, 400], deliberateDurationsMs: [700, 800, 900] }), 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Keyboard or switch/);
  });

  it('passes just above the 1.5 × margin and the proposal clears 1.3 × natural max without a warning', () => {
    // natural max 400, cap 0.8 × 760 = 608 ≥ 600.
    const r = computeBlinkCalibration(samples({ naturalDurationsMs: [250, 400], deliberateDurationsMs: [760, 800, 900] }), 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calibration.minClosureMs).toBeGreaterThanOrEqual(600);
    expect(r.calibration.minClosureMs).toBeLessThanOrEqual(608);
    expect(calibrationWarnings(r.calibration)).toEqual([]);
  });

  it('warns in review when the (hand-adjusted) minimum drops below 1.3 × natural max', () => {
    expect(calibrationWarnings({ minClosureMs: 500, naturalMaxMs: 400 })).toEqual(['min-near-natural']); // 500 < 520
    expect(calibrationWarnings({ minClosureMs: 520, naturalMaxMs: 400 })).toEqual([]);
    expect(calibrationWarnings({ minClosureMs: 300, naturalMaxMs: 400 })).toEqual(['min-near-natural']);
  });
});

describe('Blink calibration helpers', () => {
  it('provisional thresholds sit above the baseline with hysteresis', () => {
    const p = provisionalThresholds(baseline);
    expect(p.closed).toBeGreaterThan(p.open);
    expect(p.open).toBeGreaterThan(0.14);
  });

  it('segmenter measures closure duration and peak, and drops closures on face loss', () => {
    const seg = new ClosureSegmenter(0.4, 0.22);
    let t = 0;
    const out: Closure[] = [];
    const feed = (score: number | null, faces = 1) => { t += 66; const c = seg.push({ t, faces, score }); if (c) out.push(c); };
    feed(0.1); feed(0.8); feed(0.9); feed(0.85); feed(0.1);
    expect(out).toHaveLength(1);
    expect(out[0].durationMs).toBe(198);
    expect(out[0].peak).toBe(0.9);
    feed(0.8); feed(null, 0); feed(0.1);
    expect(out).toHaveLength(1);
  });

  it('stores only scalar settings and rejects malformed values', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const r = computeBlinkCalibration(samples(), 5);
    if (!r.ok) throw new Error('expected pass');
    expect(saveCalibration(storage, { ...r.calibration, image: 'data:...' } as typeof r.calibration)).toBe(true);
    const raw = mem.get(BLINK_CALIBRATION_KEY) ?? '';
    expect(raw).not.toMatch(/image/);
    expect(loadCalibration(storage)).toEqual(r.calibration);
    expect(parseStoredCalibration('{"closedThreshold":0.2,"openThreshold":0.5}')).toBeNull();
    expect(parseStoredCalibration('not json')).toBeNull();
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    expect(loadCalibration(throwing)).toBeNull();
    expect(saveCalibration(throwing, r.calibration)).toBe(false);
  });
});
