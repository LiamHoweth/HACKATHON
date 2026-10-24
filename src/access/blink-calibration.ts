// Pure blink calibration helpers: closure segmentation during calibration stages, the proposal
// computation (or an honest failure when ordinary and deliberate closures overlap), and scalar
// storage parsing. No DOM, no React. Only scalar settings are ever stored — never images.
// All numbers are prototype engineering defaults, not clinical recommendations.
import type { BlinkCalibration } from '@/runtime/contract';
import type { BlinkFrame } from './blink-gesture';

export const BLINK_CALIBRATION_KEY = 'still-here:blink-calibration:v1';

export const CALIBRATION_TIMING = {
  /** Exactly one face continuously for this long completes the position stage. */
  positionStableMs: 1000,
  /** Open-eye baseline recording time (only frames with one face count). */
  baselineMs: 3000,
  /** Natural blinking observation time. */
  naturalMs: 8000,
  /** Rest before each deliberate prompt. */
  deliberateRestMs: 1000,
  /** Window after each prompt in which a deliberate closure must begin. */
  deliberateWindowMs: 3000,
  /** A closure still in progress may extend its window up to this long. */
  deliberateWindowMaxMs: 5000,
  deliberateTarget: 4,
  deliberateMaxWindows: 8,
  /** Frame gaps longer than this do not count toward stage time (hidden tab, stalls). */
  maxCountedGapMs: 200,
} as const;

export const CALIBRATION_MINIMUMS = {
  baselineSamples: 15,
  deliberateSamples: 3,
  /** Closed peak must exceed the open-eye p90 by at least this much. */
  minSignalSpread: 0.15,
  /** Floor for the minimum deliberate closure. */
  minClosureFloorMs: 400,
  /** Cautious minimum closure used when no natural blinks were measured (separation unknown). */
  noNaturalDefaultMs: 600,
  /** The achievable minimum (cap) must be at least this multiple of the longest natural blink. */
  capOverNaturalMin: 1.5,
  /** Warn when the chosen minimum is below this multiple of the longest natural blink. */
  warnMinOverNatural: 1.3,
} as const;

export type CalibrationSamples = {
  baselineScores: number[];
  naturalDurationsMs: number[];
  naturalPeaks: number[];
  deliberateDurationsMs: number[];
  deliberatePeaks: number[];
};

export type CalibrationResult =
  | { ok: true; calibration: BlinkCalibration }
  | { ok: false; reason: string };

const round2 = (x: number) => Math.round(x * 100) / 100;

export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (xs: readonly number[]) => quantile(xs, 0.5);

/** Thresholds used only to segment closures during calibration, from the open-eye baseline. */
export function provisionalThresholds(baselineScores: readonly number[]): { closed: number; open: number } {
  const p90 = baselineScores.length ? quantile(baselineScores, 0.9) : 0.1;
  const closed = Math.min(0.6, Math.max(0.3, p90 + 0.3));
  const open = Math.min(closed - 0.1, Math.max(0.15, p90 + 0.12));
  return { closed: round2(closed), open: round2(open) };
}

export type Closure = { onset: number; end: number; durationMs: number; peak: number };

/** Segments eye closures with hysteresis. A closure is dropped if the face is lost or ambiguous. */
export class ClosureSegmenter {
  private onset: number | null = null;
  private peak = 0;
  private lastT: number | null = null;

  constructor(private closed: number, private open: number, private maxGapMs = 700) {}

  get closing(): boolean {
    return this.onset !== null;
  }

  get closingSince(): number | null {
    return this.onset;
  }

  reset(): void {
    this.onset = null;
    this.peak = 0;
    this.lastT = null;
  }

  push(f: BlinkFrame): Closure | null {
    if (this.lastT !== null && (f.t <= this.lastT || f.t - this.lastT > this.maxGapMs)) {
      this.onset = null; // stale or out of order: drop any pending closure
      if (f.t <= this.lastT) return null;
    }
    this.lastT = f.t;
    if (f.faces !== 1 || f.score === null) {
      this.onset = null;
      return null;
    }
    if (this.onset === null) {
      if (f.score >= this.closed) {
        this.onset = f.t;
        this.peak = f.score;
      }
      return null;
    }
    this.peak = Math.max(this.peak, f.score);
    if (f.score <= this.open) {
      const c = { onset: this.onset, end: f.t, durationMs: f.t - this.onset, peak: this.peak };
      this.onset = null;
      return c;
    }
    return null;
  }
}

/**
 * Proposes a calibration from recorded samples, or fails honestly.
 * closedThreshold sits between the open-eye p90 and the deliberate closed peaks; minClosureMs
 * sits above the longest natural blink and below the shortest deliberate closure.
 */
export function computeBlinkCalibration(s: CalibrationSamples, calibratedAt: number, cooldownMs = 800): CalibrationResult {
  const fallback = ' Keyboard or switch scanning works the same way.';
  if (s.baselineScores.length < CALIBRATION_MINIMUMS.baselineSamples) {
    return { ok: false, reason: 'Not enough open-eye frames were seen to measure a baseline. Check lighting and that the face stays in view.' + fallback };
  }
  if (s.deliberateDurationsMs.length < CALIBRATION_MINIMUMS.deliberateSamples || s.deliberatePeaks.length < CALIBRATION_MINIMUMS.deliberateSamples) {
    return {
      ok: false,
      reason: `Only ${s.deliberateDurationsMs.length} deliberate closure${s.deliberateDurationsMs.length === 1 ? ' was' : 's were'} detected; at least ${CALIBRATION_MINIMUMS.deliberateSamples} are needed.` + fallback,
    };
  }

  const baseP90 = quantile(s.baselineScores, 0.9);
  const closedMedian = median(s.deliberatePeaks);
  const closedMin = Math.min(...s.deliberatePeaks);
  if (closedMedian - baseP90 < CALIBRATION_MINIMUMS.minSignalSpread) {
    return { ok: false, reason: 'The eye-closure signal was too close to the open-eye level to separate reliably (lighting, glasses, or camera angle can cause this).' + fallback };
  }
  let closedThreshold = baseP90 + 0.6 * (closedMedian - baseP90);
  closedThreshold = Math.min(closedThreshold, closedMin - 0.05);
  if (closedThreshold < baseP90 + 0.1) {
    return { ok: false, reason: 'Some deliberate closures barely rose above the open-eye level, so they could not be detected reliably.' + fallback };
  }
  const openThreshold = baseP90 + 0.4 * (closedThreshold - baseP90);

  const naturalMax = s.naturalDurationsMs.length ? Math.max(...s.naturalDurationsMs) : null;
  const deliberateMin = Math.min(...s.deliberateDurationsMs);
  const deliberateMax = Math.max(...s.deliberateDurationsMs);
  const nat = naturalMax ?? 0;

  if (nat * 1.3 >= deliberateMin) {
    return {
      ok: false,
      reason: `Ordinary blinks (up to ${Math.round(nat)} ms) and deliberate closures (from ${Math.round(deliberateMin)} ms) overlapped, so ordinary blinks could select by mistake.` + fallback,
    };
  }
  const cap = 0.8 * deliberateMin;
  if (cap < CALIBRATION_MINIMUMS.minClosureFloorMs) {
    return {
      ok: false,
      reason: `Deliberate closures were short (shortest ${Math.round(deliberateMin)} ms), too close to ordinary blinks to separate safely. Holding a little longer may help.` + fallback,
    };
  }
  if (naturalMax !== null && cap < CALIBRATION_MINIMUMS.capOverNaturalMin * naturalMax) {
    return {
      ok: false,
      reason: `Deliberate closures (from ${Math.round(deliberateMin)} ms) were not clearly longer than ordinary blinks (up to ${Math.round(naturalMax)} ms), so ordinary blinks could select by mistake. Holding a little longer may help.` + fallback,
    };
  }
  let minClosureMs: number;
  if (naturalMax === null) {
    // Separation from ordinary blinks is unknown: use a cautious default, never the bare floor.
    if (cap < CALIBRATION_MINIMUMS.noNaturalDefaultMs) {
      return {
        ok: false,
        reason: `No natural blinks were measured, and deliberate closures (shortest ${Math.round(deliberateMin)} ms) were too short for a cautious minimum. Redo and hold each closure a little longer.` + fallback,
      };
    }
    minClosureMs = CALIBRATION_MINIMUMS.noNaturalDefaultMs;
  } else {
    minClosureMs = Math.min(cap, Math.max(CALIBRATION_MINIMUMS.minClosureFloorMs, naturalMax * 1.6));
  }
  const maxClosureMs = Math.max(2000, deliberateMax * 2);

  return {
    ok: true,
    calibration: {
      closedThreshold: round2(closedThreshold),
      openThreshold: round2(openThreshold),
      minClosureMs: Math.round(minClosureMs),
      maxClosureMs: Math.round(maxClosureMs),
      cooldownMs,
      calibratedAt,
      naturalMaxMs: naturalMax === null ? null : Math.round(naturalMax),
      deliberateMinMs: Math.round(deliberateMin),
    },
  };
}

export type CalibrationWarning = 'no-natural-blinks' | 'min-near-natural';

export const CALIBRATION_WARNING_TEXT: Record<CalibrationWarning, string> = {
  'no-natural-blinks': 'No natural blinks were measured — the minimum uses a cautious default.',
  'min-near-natural': 'This minimum is close to (or below) the longest natural blink, so ordinary blinks could select. Consider a longer minimum.',
};

/** Warnings to show in the review stage for a proposed (possibly hand-adjusted) calibration. */
export function calibrationWarnings(c: Pick<BlinkCalibration, 'minClosureMs' | 'naturalMaxMs'>): CalibrationWarning[] {
  const out: CalibrationWarning[] = [];
  if (c.naturalMaxMs === null) out.push('no-natural-blinks');
  else if (c.minClosureMs < CALIBRATION_MINIMUMS.warnMinOverNatural * c.naturalMaxMs) out.push('min-near-natural');
  return out;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Validates a stored calibration; anything malformed or unsafe is rejected (null). */
export function parseStoredCalibration(raw: string | null): BlinkCalibration | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    const { closedThreshold, openThreshold, minClosureMs, maxClosureMs, cooldownMs, calibratedAt } = o;
    if (!isNum(closedThreshold) || !isNum(openThreshold) || !isNum(minClosureMs) || !isNum(maxClosureMs) || !isNum(cooldownMs) || !isNum(calibratedAt)) return null;
    if (!(closedThreshold > openThreshold && openThreshold >= 0 && closedThreshold <= 1)) return null;
    if (!(minClosureMs >= 200 && maxClosureMs > minClosureMs && maxClosureMs <= 10000 && cooldownMs >= 0 && cooldownMs <= 5000)) return null;
    const naturalMaxMs = isNum(o.naturalMaxMs) ? o.naturalMaxMs : null;
    const deliberateMinMs = isNum(o.deliberateMinMs) ? o.deliberateMinMs : null;
    return { closedThreshold, openThreshold, minClosureMs, maxClosureMs, cooldownMs, calibratedAt, naturalMaxMs, deliberateMinMs };
  } catch {
    return null;
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadCalibration(storage: StorageLike | null | undefined): BlinkCalibration | null {
  try {
    return parseStoredCalibration(storage?.getItem(BLINK_CALIBRATION_KEY) ?? null);
  } catch {
    return null;
  }
}

export function saveCalibration(storage: StorageLike | null | undefined, c: BlinkCalibration): boolean {
  try {
    if (!storage) return false;
    const scalar: BlinkCalibration = {
      closedThreshold: c.closedThreshold, openThreshold: c.openThreshold, minClosureMs: c.minClosureMs,
      maxClosureMs: c.maxClosureMs, cooldownMs: c.cooldownMs, calibratedAt: c.calibratedAt,
      naturalMaxMs: c.naturalMaxMs, deliberateMinMs: c.deliberateMinMs,
    };
    storage.setItem(BLINK_CALIBRATION_KEY, JSON.stringify(scalar));
    return true;
  } catch {
    return false;
  }
}
