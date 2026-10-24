import { describe, expect, it } from 'vitest';
import {
  BROW_CALIBRATION_KEY,
  computeBrowCalibration,
  countRaiseEpisodes,
  loadBrowCalibration,
  parseStoredBrowCalibration,
  saveBrowCalibration,
} from '@/access/brow-calibration';
import { DEFAULT_BROW_CALIBRATION } from '@/access/brow-gesture';

/** Neutral frames jittering around 0.1. */
const neutral = (n = 30, base = 0.1) => Array.from({ length: n }, (_, i) => base + ((i % 5) - 2) * 0.01);
/** Per-frame raise stage: `raises` raises of 8 frames at `peak`, with 6 relaxed frames between. */
function raiseStage(raises: number, peak = 0.7, rest = 0.1): number[] {
  const out: number[] = [];
  for (let r = 0; r < raises; r++) {
    out.push(...Array(6).fill(rest), ...Array(8).fill(peak));
  }
  return out;
}

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('computeBrowCalibration', () => {
  it('derives thresholds from neutral p90 and raise p75 with fixed timings', () => {
    const n = neutral();
    const r = raiseStage(3);
    const res = computeBrowCalibration(n, r);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const c = res.calibration;
    // neutral median 0.1, p90 0.12; raise p75 0.7 → separation 0.58
    expect(c.neutral).toBeCloseTo(0.1, 3);
    expect(c.raisedThreshold).toBeCloseTo(0.12 + 0.5 * 0.58, 3);
    expect(c.releaseThreshold).toBeCloseTo(0.12 + 0.25 * 0.58, 3);
    expect(c.raisedThreshold).toBeGreaterThan(c.releaseThreshold);
    expect(c.releaseThreshold).toBeGreaterThan(c.neutral);
    expect({ holdMs: c.holdMs, releaseMs: c.releaseMs, cooldownMs: c.cooldownMs }).toEqual({ holdMs: 500, releaseMs: 250, cooldownMs: 500 });
    expect(res.warnings).toEqual([]);
  });

  it('rejects too few neutral frames', () => {
    const res = computeBrowCalibration(neutral(14), raiseStage(3));
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.reason).toMatch(/relaxed-brow frames \(14 of 15\)/);
  });

  it('rejects when raised and neutral cannot be separated (< 0.15)', () => {
    const res = computeBrowCalibration(neutral(), raiseStage(3, 0.25));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/could not be told apart/);
  });

  it('rejects fewer than two distinct raises (one long raise is one raise)', () => {
    const oneLong = [...Array(6).fill(0.1), ...Array(40).fill(0.7)];
    const res = computeBrowCalibration(neutral(), oneLong);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/Only 1 distinct eyebrow raise was seen/);
    expect(computeBrowCalibration(neutral(), [0.7]).ok).toBe(false);
  });

  it('accepts caller-segmented raises via opts.raiseCount (e.g. one peak per raise)', () => {
    const peaks = [0.68, 0.72, 0.7];
    expect(computeBrowCalibration(neutral(), peaks).ok).toBe(false); // contiguous peaks = 1 episode
    expect(computeBrowCalibration(neutral(), peaks, { raiseCount: 3 }).ok).toBe(true);
    expect(computeBrowCalibration(neutral(), peaks, { raiseCount: 1 }).ok).toBe(false);
  });

  it('warns on marginal separation and noisy neutral', () => {
    const marginal = computeBrowCalibration(neutral(), raiseStage(3, 0.33));
    expect(marginal.ok).toBe(true);
    if (marginal.ok) expect(marginal.warnings.some((w) => /small/.test(w))).toBe(true);
    const noisy = [...Array(20).fill(0.05), ...Array(10).fill(0.25)];
    const res = computeBrowCalibration(noisy, raiseStage(3, 0.9));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.warnings.some((w) => /unsteady/.test(w))).toBe(true);
  });

  it('ignores non-finite samples', () => {
    const n = [...neutral(), Number.NaN, Number.POSITIVE_INFINITY];
    const res = computeBrowCalibration(n, [...raiseStage(2), Number.NaN]);
    expect(res.ok).toBe(true);
  });

  it('countRaiseEpisodes uses hysteresis', () => {
    expect(countRaiseEpisodes([0.1, 0.6, 0.4, 0.6, 0.1, 0.6], 0.5, 0.3)).toBe(2);
    expect(countRaiseEpisodes([0.6, 0.6, 0.1, 0.6], 0.5, 0.3)).toBe(2);
  });
});

describe('brow calibration storage', () => {
  it('round-trips scalars only under the v1 key', () => {
    const s = new MemStorage();
    const withExtra = { ...DEFAULT_BROW_CALIBRATION, image: 'data:...' } as typeof DEFAULT_BROW_CALIBRATION;
    expect(saveBrowCalibration(withExtra, s)).toBe(true);
    const raw = s.getItem(BROW_CALIBRATION_KEY)!;
    expect(raw).not.toContain('image');
    expect(BROW_CALIBRATION_KEY).toBe('still-here:brow-calibration:v1');
    expect(loadBrowCalibration(s)).toEqual(DEFAULT_BROW_CALIBRATION);
  });

  it('rejects malformed or unsafe stored values', () => {
    expect(parseStoredBrowCalibration(null)).toBeNull();
    expect(parseStoredBrowCalibration('not json')).toBeNull();
    expect(parseStoredBrowCalibration(JSON.stringify({ ...DEFAULT_BROW_CALIBRATION, holdMs: 'x' }))).toBeNull();
    expect(parseStoredBrowCalibration(JSON.stringify({ ...DEFAULT_BROW_CALIBRATION, raisedThreshold: 0.2 }))).toBeNull(); // ≤ release
    expect(parseStoredBrowCalibration(JSON.stringify({ ...DEFAULT_BROW_CALIBRATION, holdMs: 50 }))).toBeNull();
    const s = new MemStorage();
    expect(saveBrowCalibration({ ...DEFAULT_BROW_CALIBRATION, raisedThreshold: 1.5 }, s)).toBe(false);
    expect(s.getItem(BROW_CALIBRATION_KEY)).toBeNull();
  });

  it('never throws when storage is missing or throws', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadBrowCalibration(throwing)).toBeNull();
    expect(saveBrowCalibration(DEFAULT_BROW_CALIBRATION, throwing)).toBe(false);
    expect(loadBrowCalibration(null)).toBeNull();
    expect(saveBrowCalibration(DEFAULT_BROW_CALIBRATION, null)).toBe(false);
    // Default (global localStorage) path: absent in the node test env → null/false, no throw.
    expect(() => loadBrowCalibration()).not.toThrow();
    expect(() => saveBrowCalibration(DEFAULT_BROW_CALIBRATION)).not.toThrow();
  });
});
