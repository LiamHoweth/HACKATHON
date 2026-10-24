// Pure eyebrow-raise calibration helpers: the proposal computation (or an honest failure when
// neutral and raised brows cannot be separated) and scalar storage. No DOM, no React. Only scalar
// settings are ever stored — never images or landmark data. Numbers are prototype engineering
// defaults, not clinical recommendations.
//
// Inputs are brow-raise scores (0..1) from frames with exactly one face:
// - neutralSamples: per-frame scores while the person relaxes their brows (brow-neutral stage).
// - raiseSamples: per-frame scores in time order during the brow-raise stage (prompted raises
//   plus the relaxed frames between them). Distinct raises are counted as episodes that reach
//   the proposed raised threshold after dropping to the release threshold. If the caller has
//   segmented raises itself (e.g. passes one peak per raise), pass opts.raiseCount instead.
// - When the caller has the prompt windows, it should pass opts.raisedLevel from
//   heldRaiseLevel(): the level the brows were actually HELD at in each window. A p75 over all
//   window samples is dominated by the relaxed frames before a late (2–3 s) reaction.
import type { BrowCalibration } from '@/runtime/contract';
import { median, quantile } from './blink-calibration';

export const BROW_CALIBRATION_KEY = 'still-here:brow-calibration:v1';

export const BROW_CALIBRATION_MINIMUMS = {
  neutralSamples: 15,
  raises: 2,
  /** raisedPeak (held-stretch level, else p75 of raise samples) must exceed the neutral p90 by at least this much. */
  minSeparation: 0.15,
  /** Separation below this works but is marginal: warn. */
  warnSeparation: 0.25,
  /** Neutral p90 − median above this means a noisy resting signal: warn. */
  warnNeutralSpread: 0.1,
} as const;

/** Fixed timings: holdMs is the user-requested 500 ms; release/cooldown are provisional. */
export const BROW_CALIBRATION_TIMING = { holdMs: 500, releaseMs: 250, cooldownMs: 500 } as const;

export type BrowCalibrationResult =
  | { ok: true; calibration: BrowCalibration; warnings: string[] }
  | { ok: false; reason: string };

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** One time-stamped brow score (monotonic ms, 0..1). */
export type BrowScoreSample = { t: number; score: number };

export const HELD_RAISE = {
  /** A held stretch is a run of samples above neutral p90 + this margin. */
  provisionalMargin: 0.15,
  /** Runs shorter than this are flickers, not held raises, and are ignored. */
  minRunMs: 250,
  /** A frame gap longer than this breaks a run. */
  maxGapMs: 700,
} as const;

/**
 * Raised level from the prompt windows: in each window, the longest continuous run of samples
 * above the provisional threshold (neutral p90 + margin) is that window's held stretch; its median
 * is the window's level. Returns the median over windows that had a held stretch, or null when no
 * window did (the caller then fails honestly). Independent of how long the person took to react.
 */
export function heldRaiseLevel(
  windows: readonly (readonly BrowScoreSample[])[],
  neutralP90: number,
  margin: number = HELD_RAISE.provisionalMargin,
): number | null {
  const threshold = neutralP90 + margin;
  const levels: number[] = [];
  for (const w of windows) {
    let best: number[] = [];
    let bestMs = -1;
    let run: number[] = [];
    let runStart = 0;
    let lastT: number | null = null;
    const close = (endT: number) => {
      const ms = endT - runStart;
      if (run.length && ms > bestMs) {
        best = run;
        bestMs = ms;
      }
      run = [];
    };
    for (const s of w) {
      if (!isNum(s?.t) || !isNum(s?.score)) continue;
      if (lastT !== null && s.t - lastT > HELD_RAISE.maxGapMs && run.length) close(lastT);
      if (s.score > threshold) {
        if (!run.length) runStart = s.t;
        run.push(Math.min(1, Math.max(0, s.score)));
      } else if (run.length) {
        close(lastT ?? s.t);
      }
      lastT = s.t;
    }
    if (run.length && lastT !== null) close(lastT);
    if (best.length && bestMs >= HELD_RAISE.minRunMs) levels.push(median(best));
  }
  return levels.length ? median(levels) : null;
}
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clean = (xs: readonly number[]) => xs.filter(isNum).map((x) => Math.min(1, Math.max(0, x)));

/** Count distinct raises: upward crossings of `raised` after the score dropped to ≤ `release`. */
export function countRaiseEpisodes(samples: readonly number[], raised: number, release: number): number {
  let count = 0;
  let armed = true; // the stage starts relaxed; a raise already up at the first frame counts once
  for (const s of samples) {
    if (!isNum(s)) continue;
    if (armed && s >= raised) {
      count += 1;
      armed = false;
    } else if (!armed && s <= release) {
      armed = true;
    }
  }
  return count;
}

export function computeBrowCalibration(
  neutralSamples: number[],
  raiseSamples: number[],
  opts: { raiseCount?: number; raisedLevel?: number | null } = {},
): BrowCalibrationResult {
  const m = BROW_CALIBRATION_MINIMUMS;
  const neutral = clean(neutralSamples);
  const raise = clean(raiseSamples);
  if (neutral.length < m.neutralSamples) {
    return { ok: false, reason: `Not enough relaxed-brow frames (${neutral.length} of ${m.neutralSamples}). Keep your face in view with brows relaxed and try again.` };
  }
  if (raise.length < m.raises) {
    return { ok: false, reason: `Not enough eyebrow-raise data (${raise.length} frames). Raise both eyebrows at least ${m.raises} times when prompted.` };
  }

  const neutralMedian = median(neutral);
  const neutralP90 = quantile(neutral, 0.9);
  // Prefer the held-stretch level (heldRaiseLevel) when the caller has prompt windows.
  const raisedPeak = isNum(opts.raisedLevel) ? opts.raisedLevel : quantile(raise, 0.75);
  const separation = raisedPeak - neutralP90;
  if (!(separation >= m.minSeparation)) {
    return {
      ok: false,
      reason: `Raised and relaxed brows could not be told apart reliably (difference ${round3(Math.max(0, separation))}, need ${m.minSeparation}). Eyebrow navigation may not suit this setup; try better lighting or framing, or use another input method.`,
    };
  }

  const raisedThreshold = round3(neutralP90 + 0.5 * separation);
  const releaseThreshold = round3(neutralP90 + 0.25 * separation);
  const raises = isNum(opts.raiseCount) ? Math.floor(opts.raiseCount) : countRaiseEpisodes(raise, raisedThreshold, releaseThreshold);
  if (raises < m.raises) {
    return { ok: false, reason: `Only ${Math.max(0, raises)} distinct eyebrow raise${raises === 1 ? ' was' : 's were'} seen; at least ${m.raises} are needed, relaxing in between.` };
  }

  const warnings: string[] = [];
  if (separation < m.warnSeparation) warnings.push('The difference between raised and relaxed brows is small; navigation may be unreliable. Practice before relying on it.');
  if (neutralP90 - neutralMedian > m.warnNeutralSpread) warnings.push('The relaxed-brow signal was unsteady (talking or moving?); brief brow movements might start a raise.');

  return {
    ok: true,
    calibration: {
      neutral: round3(neutralMedian),
      raisedThreshold,
      releaseThreshold,
      holdMs: BROW_CALIBRATION_TIMING.holdMs,
      releaseMs: BROW_CALIBRATION_TIMING.releaseMs,
      cooldownMs: BROW_CALIBRATION_TIMING.cooldownMs,
    },
    warnings,
  };
}

/** Validates a stored brow calibration; anything malformed or unsafe is rejected (null). */
export function parseStoredBrowCalibration(raw: string | null): BrowCalibration | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    const { neutral, raisedThreshold, releaseThreshold, holdMs, releaseMs, cooldownMs } = o;
    if (![neutral, raisedThreshold, releaseThreshold, holdMs, releaseMs, cooldownMs].every(isNum)) return null;
    const c = { neutral, raisedThreshold, releaseThreshold, holdMs, releaseMs, cooldownMs } as BrowCalibration;
    if (!(c.neutral >= 0 && c.releaseThreshold >= c.neutral && c.raisedThreshold > c.releaseThreshold && c.raisedThreshold <= 1)) return null;
    if (!(c.holdMs >= 200 && c.holdMs <= 5000 && c.releaseMs >= 0 && c.releaseMs <= 5000 && c.cooldownMs >= 0 && c.cooldownMs <= 5000)) return null;
    return c;
  } catch {
    return null;
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis ? globalThis.localStorage : null;
  } catch {
    return null; // access can throw (private mode / blocked storage)
  }
}

export function loadBrowCalibration(storage: StorageLike | null | undefined = defaultStorage()): BrowCalibration | null {
  try {
    return parseStoredBrowCalibration(storage?.getItem(BROW_CALIBRATION_KEY) ?? null);
  } catch {
    return null;
  }
}

export function saveBrowCalibration(c: BrowCalibration, storage: StorageLike | null | undefined = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    const scalar: BrowCalibration = {
      neutral: c.neutral, raisedThreshold: c.raisedThreshold, releaseThreshold: c.releaseThreshold,
      holdMs: c.holdMs, releaseMs: c.releaseMs, cooldownMs: c.cooldownMs,
    };
    if (parseStoredBrowCalibration(JSON.stringify(scalar)) === null) return false;
    storage.setItem(BROW_CALIBRATION_KEY, JSON.stringify(scalar));
    return true;
  } catch {
    return false;
  }
}
