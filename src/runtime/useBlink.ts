'use client';
// Face-gesture access adapter runtime. Implements BlinkRuntime (src/runtime/contract.ts).
// A plain engine object owns the camera, the lazily loaded detector, the pure gesture machines
// (BlinkGesture: long-blink SELECT; BrowGesture: 500 ms eyebrow-raise NEXT, 'brow-blink' mode
// only), the ONE GestureArbiter that turns their proposals into accepted commands, and the
// calibration stage driver. React subscribes through useSyncExternalStore and receives at most
// ~10 snapshots per second, so detection never re-renders the app every frame.
//
// Event flow per frame: detector → smoothing → BlinkGesture.push → arbiter.onBlink, then
// BrowGesture.push → arbiter.onBrow (blink first, so a closure that starts on the same frame as a
// brow NEXT always wins). Arbiter outputs: freeze/unfreeze/accept go to the single command handler
// (useStillHere); cancel-brow is applied here (brow.cancel); feedback becomes `feedback`. An
// "accepted" acknowledgement is shown only when the handler actually applied the command.
// Raw detector events still reach `subscribe` listeners (calibration / practice screens).
// No camera frame, image, or recording is stored or sent anywhere.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getSharedGestureMetrics } from '@/metrics/gesture-metrics';
import type { AccessMode } from '@/core/types';
import { newId } from '@/core/reducer';
import type {
  AcceptedGesture, BlinkCalibration, BlinkGestureEvent, BlinkRuntime, BlinkStatus, BrowCalibration, BrowStatus,
  CalibrationStage, GestureCommand, GestureFeedback,
} from './contract';
import { BlinkGesture, DEFAULT_GESTURE_CONFIG, smoothScore, type BlinkFrame, type GestureConfig } from '@/access/blink-gesture';
import {
  CALIBRATION_TIMING, ClosureSegmenter, computeBlinkCalibration, loadCalibration, provisionalThresholds, quantile, saveCalibration,
} from '@/access/blink-calibration';
import { BrowGesture, DEFAULT_BROW_CALIBRATION, type BrowEvent } from '@/access/brow-gesture';
import { computeBrowCalibration, heldRaiseLevel, loadBrowCalibration, saveBrowCalibration } from '@/access/brow-calibration';
import {
  blinkProgressFeedback, browProgressFeedback, GestureArbiter, type ArbiterOutput,
} from '@/access/gesture-arbiter';
import type { BlinkDetector, RawBlinkFrame } from '@/access/blink-detector';

const PUBLISH_MS = 100;
const WATCHDOG_MS = 500;
const STALL_MS = 1500;
/** How long a transient acknowledgement ("Next", "Selected", "not held long enough") shows. */
export const FEEDBACK_FLASH_MS = 1200;
/** Brow-raise score smoothing (EMA alpha). Lighter than eye smoothing: brows move slowly. */
export const BROW_SMOOTHING_ALPHA = 0.5;
/** Published calibration sample arrays are refreshed at most this often. */
const SAMPLE_VIEW_MS = 500;

/** Stages during which camera samples are being collected or practised (not normal use). */
export const CALIBRATING_STAGES: ReadonlySet<CalibrationStage> = new Set([
  'position', 'baseline', 'brow-neutral', 'brow-raise', 'brow-practice', 'natural', 'deliberate', 'review',
  'practice-select', 'practice-confirm',
]);

/** Stages where the brow machine must NOT run (brow samples are being recorded instead). */
const BROW_SAMPLING_STAGES: ReadonlySet<CalibrationStage> = new Set(['position', 'brow-neutral', 'brow-raise']);

/** Calibration stages whose accepted gestures are acknowledged as practice (never forwarded). */
const PRACTICE_STAGES: ReadonlySet<CalibrationStage> = new Set(['brow-practice', 'practice-select', 'practice-confirm']);

/** Eyebrow calibration timing (prototype values, not clinical). */
export const BROW_STAGE_TIMING = {
  /** Relaxed-brow recording time (only frames with one face count). */
  neutralMs: 3000,
  /** Rest before each raise prompt. */
  restMs: 1500,
  /** A prompt window ends after this long unless the brows are still up. */
  windowMs: 4000,
  /** Hard cap on a prompt window. */
  windowMaxMs: 6000,
  /** Successful (bar filled) raises wanted; the stage completes itself at this count. */
  raiseTarget: 5,
  /** The UI may continue (advance()) once this many raises completed. */
  raiseMinimum: 3,
  /** Maximum prompt windows before computing anyway. */
  maxWindows: 7,
  /** Provisional raised level above the relaxed p90 used only for the calibration hold bar. */
  provisionalMargin: 0.15,
} as const;

/** Message appended to an eyebrow calibration failure: honest alternatives, no blame. */
export const BROW_FALLBACK_ADVICE = 'You can switch to Auto-scan with blink selection, or use keyboard or switch input instead.';

type CalibratorView = {
  stage: CalibrationStage;
  progress: number;
  instructions: string;
  naturalSamplesMs: number[];
  deliberateSamplesMs: number[];
  proposed: BlinkCalibration | null;
  failureReason: string | null;
  browNeutralSamples: number[];
  browRaiseSamples: number[];
  browRaiseCount: number;
  proposedBrow: BrowCalibration | null;
};

export type BlinkEngineSnapshot = {
  status: BlinkStatus;
  message: string;
  closureProgress: number;
  eyeScore: number | null;
  faceCount: number;
  fps: number;
  calibration: BlinkCalibration | null;
  browCalibration: BrowCalibration | null;
  browStatus: BrowStatus;
  browProgress: number;
  browScore: number | null;
  lastAccepted: AcceptedGesture | null;
  feedback: GestureFeedback;
  cameraOn: boolean;
  cal: CalibratorView;
};

/** Why tracking was interrupted (tab hidden, device rotated, camera image stopped / ended). */
export type TrackingInterruptReason = 'hidden' | 'orientation' | 'stall' | 'camera';

/** Events the engine sends to the single command handler (useStillHere). */
export type FaceCommandEvent =
  | { type: 'freeze'; at: number }   // blink closure onset: freeze the highlight now
  | { type: 'unfreeze'; at: number }
  | { type: 'accept'; command: GestureCommand; at: number; cycleId: string }
  // Face lost (cause undefined) or tracking interrupted (cause set: tab hidden, rotation, camera
  // stall / ended). Pending gestures are already discarded; the handler pauses either way, so a
  // deliberate resume is required. (One event type so every handler treats both the same.)
  | { type: 'face-lost'; at: number; cause?: TrackingInterruptReason };

/**
 * Handler result. applied=false means refused (no "Next"/"Selected"). A refused 'freeze' voids
 * the closure in the engine (its SELECT can never be accepted). refusal 'highlight-moved' (the
 * highlight or screen changed too close to the closure onset) shows HIGHLIGHT_MOVED_FEEDBACK
 * when that closure would have selected, instead of failing silently.
 */
export type FaceCommandResult = { applied: boolean; targetId: string | null; refusal?: 'highlight-moved' };

/** Shown when a deliberate closure was voided because the highlight moved just before it. */
export const HIGHLIGHT_MOVED_FEEDBACK: GestureFeedback = { kind: 'ambiguous', label: 'Highlight just moved — nothing selected. Blink again.' };
export type FaceCommandHandler = (e: FaceCommandEvent) => FaceCommandResult | void;

const STATUS_MESSAGES: Record<BlinkStatus, string> = {
  off: 'Camera off — turn on the camera to use face gestures.',
  unsupported: 'Face gestures are not available here. Use keyboard or switch input.',
  'permission-denied': 'Camera permission was not given. Allow the camera in the browser, or use keyboard or switch.',
  starting: 'Starting camera…',
  'no-face': 'Position your face in view',
  'multiple-faces': 'More than one face — selection held', // legacy: the engine now follows one face instead
  ready: 'Ready — blink deliberately to select',
  closing: 'Keep eyes closed…',
  selected: 'Selected',
  cooldown: 'Re-arming…',
  'face-lost': 'Face lost — paused. Look at the screen, then blink to resume.',
};

function stageInstructions(stage: CalibrationStage, extra: {
  mode?: AccessMode; deliberateCount?: number; resting?: boolean; proposed?: BlinkCalibration | null; proposedBrow?: BrowCalibration | null;
  failure?: string | null; browRaises?: number; browResting?: boolean; browPracticeCount?: number; browWarning?: string | null;
}): string {
  const brow = extra.mode === 'brow-blink';
  switch (stage) {
    case 'consent':
      return brow
        ? 'Eyebrow and blink control uses the camera on this device only. No video or photos are saved or sent.'
        : 'Blink selection uses the camera on this device only. No video or photos are saved or sent.';
    case 'position':
      return 'Sit so your whole face is in the frame and hold still.';
    case 'baseline':
      return 'Look at the screen normally with your eyes open.';
    case 'brow-neutral':
      return 'Keep your eyebrows relaxed and look at the screen.';
    case 'brow-raise': {
      const n = Math.min(BROW_STAGE_TIMING.raiseTarget, (extra.browRaises ?? 0) + 1);
      return extra.browResting
        ? `Relax your eyebrows — get ready (${n} of ${BROW_STAGE_TIMING.raiseTarget}).`
        : `Raise both eyebrows and hold until the bar fills (${n} of ${BROW_STAGE_TIMING.raiseTarget}).`;
    }
    case 'brow-practice': {
      const k = extra.browPracticeCount ?? 0;
      const base = 'Practice: raise both eyebrows and hold until the bar fills. Each raise moves one step; holding longer does not repeat. Relax between raises.';
      const count = k > 0 ? ` Moves so far: ${k}.` : '';
      return `${base}${count}${extra.browWarning ? ` ${extra.browWarning}` : ''}`;
    }
    case 'natural':
      return 'Keep looking at the screen and blink naturally.';
    case 'deliberate': {
      const n = Math.min(CALIBRATION_TIMING.deliberateTarget, (extra.deliberateCount ?? 0) + 1);
      return extra.resting
        ? `Eyes open — get ready (${n} of ${CALIBRATION_TIMING.deliberateTarget}).`
        : `Now close your eyes for about one second, then open them (${n} of ${CALIBRATION_TIMING.deliberateTarget}).`;
    }
    case 'review': {
      const p = extra.proposed;
      if (!p) return 'Working out your timing…';
      const blinkLine = `A selection needs the eyes closed for at least ${p.minClosureMs} ms. Shorter blinks are ignored.`;
      if (!brow) return blinkLine;
      return extra.proposedBrow
        ? `Hold both eyebrows up for half a second to move one step. ${blinkLine}`
        : blinkLine;
    }
    case 'practice-select':
      return brow
        ? 'Practice: raise your eyebrows to move the highlight, then close your eyes deliberately to select it.'
        : 'Practice: wait for the highlight, then close your eyes deliberately to select it.';
    case 'practice-confirm':
      return 'Now confirm with a second, separate deliberate blink.';
    case 'done':
      return brow ? 'Calibration saved. Eyebrow Next and blink Select are ready.' : 'Calibration saved. Blink selection is ready.';
    case 'failed':
      return extra.failure ?? 'Calibration did not work this time. Keyboard or switch input works the same way.';
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const q = (x: number, step: number) => Math.round(x / step) * step;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in src/tests/face-runtime.test.ts)

export type ScoreSample = { t: number; score: number };

/**
 * Longest continuous hold in a time-ordered window: starts when score ≥ raised and continues
 * while score > release (same hysteresis as BrowGesture). A gap longer than maxGapMs breaks it.
 */
export function longestHoldMs(samples: readonly ScoreSample[], raised: number, release: number, maxGapMs = 700): number {
  let best = 0;
  let since: number | null = null;
  let lastT: number | null = null;
  for (const s of samples) {
    if (lastT !== null && s.t - lastT > maxGapMs) since = null;
    if (since === null) {
      if (s.score >= raised) since = s.t;
    } else if (s.score <= release) {
      since = null;
    } else {
      best = Math.max(best, s.t - since);
    }
    lastT = s.t;
  }
  return best;
}

/** Number of prompt windows containing a raise held ≥ holdMs at the given thresholds. */
export function countHeldRaises(windows: readonly (readonly ScoreSample[])[], raised: number, release: number, holdMs: number): number {
  return windows.filter((w) => longestHoldMs(w, raised, release) >= holdMs).length;
}

/**
 * Brow proposal from the calibration samples. Uses computeBrowCalibration for thresholds, then
 * requires that at least two prompted raises would actually have been HELD for holdMs at those
 * thresholds (a raise that only flickered up does not prove the gesture is usable). Failures
 * carry the honest fallback advice.
 */
export function proposeBrowCalibration(
  neutral: readonly number[], windows: readonly (readonly ScoreSample[])[],
): { ok: true; calibration: BrowCalibration; warnings: string[] } | { ok: false; reason: string } {
  const raise = windows.flatMap((w) => w.map((s) => s.score));
  // Raised level from each window's held stretch, not a p75 of all samples (late reactions).
  const cleanNeutral = neutral.filter((x) => Number.isFinite(x));
  const raisedLevel = cleanNeutral.length ? heldRaiseLevel(windows, quantile(cleanNeutral.map((x) => Math.min(1, Math.max(0, x))), 0.9)) : null;
  const first = computeBrowCalibration([...neutral], raise, { raiseCount: windows.length, raisedLevel });
  if (!first.ok) return { ok: false, reason: `${first.reason} ${BROW_FALLBACK_ADVICE}` };
  const c = first.calibration;
  const held = countHeldRaises(windows, c.raisedThreshold, c.releaseThreshold, c.holdMs);
  const r = computeBrowCalibration([...neutral], raise, { raiseCount: held, raisedLevel });
  if (!r.ok) {
    return {
      ok: false,
      reason: `Eyebrow raises were not held for half a second at a level clearly above relaxed (${held} held). ${BROW_FALLBACK_ADVICE}`,
    };
  }
  return r;
}

export type FeedbackInput = {
  hard: Extract<BlinkStatus, 'off' | 'unsupported' | 'permission-denied' | 'starting'> | null;
  stalled: boolean;
  status: BlinkStatus;
  mode: AccessMode;
  browStatus: BrowStatus;
  browProgress: number;
  closureProgress: number;
  /** Unexpired transient acknowledgement, if any. */
  transient: GestureFeedback | null;
  calibrated: boolean;
};

/**
 * The single feedback line for the compact preview. Priority: camera/tracking problems →
 * active progress (closure, brow hold) → transient acknowledgement → re-arming → ready.
 * "Next"/"Selected" only ever arrive as a transient set after an APPLIED accepted command.
 */
export function composeFeedback(i: FeedbackInput): GestureFeedback {
  if (i.hard === 'off') return { kind: 'camera-off', label: 'Camera off' };
  if (i.hard === 'unsupported') return { kind: 'camera-off', label: 'Camera input unavailable' };
  if (i.hard === 'permission-denied') return { kind: 'camera-off', label: 'Camera permission needed' };
  if (i.hard === 'starting') return { kind: 'acquiring', label: 'Starting camera…' };
  if (i.stalled) return { kind: 'tracking-paused', label: 'Camera image stopped — paused' };
  if (i.status === 'face-lost') return { kind: 'tracking-paused', label: 'Tracking lost — Paused' };
  if (i.status === 'no-face') return { kind: 'acquiring', label: 'Position your face' };
  if (i.status === 'multiple-faces') return { kind: 'ambiguous', label: 'More than one face — held' };
  if (i.status === 'closing') return blinkProgressFeedback(i.closureProgress);
  if (i.mode === 'brow-blink' && i.browStatus === 'rising') return browProgressFeedback(i.browProgress);
  if (i.transient) return i.transient;
  if (i.mode === 'brow-blink' && (i.browStatus === 'latched' || i.browStatus === 'rearming')) {
    return { kind: 'cooldown', label: 'Lower your eyebrows to re-arm' };
  }
  if (i.status === 'cooldown' || i.status === 'selected') return { kind: 'cooldown', label: 'Re-arming — open your eyes' };
  if (!i.calibrated) return { kind: 'face-detected', label: 'Face detected — calibrate to use gestures' };
  return i.mode === 'brow-blink'
    ? { kind: 'face-detected', label: 'Raise eyebrows to move · long blink to select' }
    : { kind: 'face-detected', label: 'Ready — long blink to select' };
}

const sameFeedback = (a: GestureFeedback, b: GestureFeedback) => a.kind === b.kind && a.label === b.label && a.progress01 === b.progress01;

/**
 * Interrupt both gesture machines (tab hidden, camera stall, orientation change): a pending
 * closure is discarded as stale (never selects) and a pending raise is cancelled as stale.
 * Returns the events so the caller routes them through the arbiter.
 */
export function interruptGestures(blink: BlinkGesture, brow: BrowGesture, at: number): { blink: BlinkGestureEvent[]; brow: BrowEvent[] } {
  return { blink: blink.interrupt(), brow: brow.cancel('stale', at) };
}

// ---------------------------------------------------------------------------

export class BlinkEngine {
  // ---- Camera / detector ----
  private gen = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private previews = new Set<HTMLVideoElement>();
  private detector: BlinkDetector | null = null;
  private hardStatus: Extract<BlinkStatus, 'off' | 'unsupported' | 'permission-denied' | 'starting'> | null = 'off';
  private hardMessage: string | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;
  private stalled = false;
  private wakeLock: WakeLockSentinel | null = null;
  private reacquiring = false;
  private trackEndedWhileHidden = false;

  // ---- Detection state ----
  /** Access mode from settings. */
  private mode: AccessMode;
  /** Mode being calibrated (begin(mode) / restart(mode)); used while a calibration stage runs. */
  private calMode: AccessMode;
  private gesture: BlinkGesture;
  private brow: BrowGesture;
  private browRunning = false;
  private arbiter: GestureArbiter;
  private smoothed: number | null = null;
  private browSmoothed: number | null = null;
  private faceCount = 0;
  private lastT = 0;
  private listeners = new Set<(e: BlinkGestureEvent) => void>();
  private handler: FaceCommandHandler | null = null;
  private transient: { feedback: GestureFeedback; until: number } | null = null;
  private lastAccepted: AcceptedGesture | null = null;
  private lastAcceptApplied = false;
  /** The current closure's freeze was refused: its SELECT is void (set at freeze, cleared at unfreeze). */
  private closureVoid: { feedback: boolean } | null = null;

  // ---- Calibration ----
  private calibration: BlinkCalibration | null;
  private browCalibration: BrowCalibration | null;
  private stage: CalibrationStage;
  private stageProgress = 0;
  private stageElapsed = 0;
  private stageLastT: number | null = null;
  private positionSince: number | null = null;
  private baselineScores: number[] = [];
  private naturalDurations: number[] = [];
  private naturalPeaks: number[] = [];
  private deliberateDurations: number[] = [];
  private deliberatePeaks: number[] = [];
  private segmenter: ClosureSegmenter | null = null;
  private delibWindowStart: number | null = null;
  private delibRestUntil: number | null = null;
  private delibBest: { durationMs: number; peak: number } | null = null;
  private delibWindows = 0;
  private proposed: BlinkCalibration | null = null;
  private failureReason: string | null = null;
  // Brow calibration
  private browNeutral: number[] = [];
  private browWindows: ScoreSample[][] = [];
  /** Every brow-raise-stage frame score in time order (published as browRaiseSamples). */
  private browRaiseAll: number[] = [];
  private browWindow: ScoreSample[] | null = null;
  private browWindowStart: number | null = null;
  private browRestUntil: number | null = null;
  private browHoldSince: number | null = null;
  private browHoldProgress = 0;
  private browFilled = 0;
  private proposedBrow: BrowCalibration | null = null;
  private browWarnings: string[] = [];
  private browPracticeCount = 0;
  private sampleView: { neutral: number[]; raise: number[]; at: number } = { neutral: [], raise: [], at: -Infinity };

  // ---- Store ----
  private snap: BlinkEngineSnapshot;
  private storeListeners = new Set<() => void>();
  private lastPublish = 0;

  constructor(mode: AccessMode = 'brow-blink') {
    this.mode = mode;
    this.calMode = mode;
    const st = typeof window !== 'undefined' ? storage() : null;
    this.calibration = st ? loadCalibration(st) : null;
    this.browCalibration = st ? loadBrowCalibration(st) : null;
    this.stage = this.requiredCalibrated() ? 'done' : 'consent';
    this.gesture = new BlinkGesture(this.calibration ?? DEFAULT_GESTURE_CONFIG);
    this.brow = new BrowGesture(this.browCalibration ?? DEFAULT_BROW_CALIBRATION);
    this.arbiter = new GestureArbiter({ newId, browEnabled: () => this.effMode() === 'brow-blink' });
    this.snap = this.build();
  }

  /** The mode gestures run in: the calibrated mode during calibration, else the settings mode. */
  private effMode(): AccessMode {
    return CALIBRATING_STAGES.has(this.stage) ? this.calMode : this.mode;
  }

  private requiredCalibrated(): boolean {
    if (!this.calibration) return false;
    return this.mode !== 'brow-blink' || this.browCalibration !== null;
  }

  // ===== Mode =====
  /** Access mode from settings. Brow input runs only in 'brow-blink'. */
  readonly setMode = (mode: AccessMode): void => {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!CALIBRATING_STAGES.has(this.stage)) {
      // A calibration in progress keeps its own mode (begin(mode)); otherwise re-arm everything.
      this.calMode = mode;
      this.brow.reset();
      this.browRunning = false;
      this.arbiter.reset();
    }
    if (this.stage === 'done' && !this.requiredCalibrated()) this.stage = 'consent';
    else if (this.stage === 'consent' && this.requiredCalibrated() && !this.stream) this.stage = 'done';
    this.publish(true);
  };

  /** The single consumer of accepted commands (useStillHere). */
  readonly setCommandHandler = (fn: FaceCommandHandler | null): void => {
    this.handler = fn;
  };

  /** New surface / revision / session: no gesture carries across (closure discarded, raise re-armed). */
  readonly resetGestures = (): void => {
    if (this.gesture.snapshot().status === 'closing') this.routeBlink(this.gesture.interrupt());
    this.arbiter.reset();
    this.brow.reset();
    this.transient = null;
    this.publish(true);
  };

  // ===== External store =====
  readonly subscribeStore = (fn: () => void) => {
    this.storeListeners.add(fn);
    return () => {
      this.storeListeners.delete(fn);
    };
  };

  readonly getSnapshot = (): BlinkEngineSnapshot => this.snap;

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private build(): BlinkEngineSnapshot {
    const g = this.gesture.snapshot();
    const running = this.hardStatus === null;
    const status: BlinkStatus = running ? g.status : (this.hardStatus as BlinkStatus);
    let message = this.hardMessage ?? STATUS_MESSAGES[status];
    const calibrating = CALIBRATING_STAGES.has(this.stage);
    const mode = this.effMode();
    if (running) {
      if (this.stalled) message = 'Camera image stopped updating — selection held.';
      else if (status === 'cooldown' && g.lastDiscard === 'too-long') message = 'Closed too long — not selected. Open your eyes to re-arm.';
      else if (status === 'cooldown' && g.awaitingOpen) message = 'Re-arming… open your eyes.';
      else if (status === 'ready' && !this.requiredCalibrated() && !calibrating) message = 'Face found — calibrate before using face gestures.';
      else if (status === 'ready' && mode === 'brow-blink') message = 'Ready — raise eyebrows to move, long blink to select';
      if (this.faceCount > 1 && (status === 'ready' || status === 'cooldown' || status === 'closing' || status === 'selected')) {
        message = `${this.faceCount} faces — following the centre one`;
      }
    }
    const browOn = running && mode === 'brow-blink' && this.browRunning;
    const browStatus: BrowStatus = browOn ? this.brow.status : 'disabled';
    const browProgress = !running || mode !== 'brow-blink' ? 0
      : this.stage === 'brow-raise' ? this.browHoldProgress
        : browOn ? this.brow.progress(this.lastT) : 0;
    const now = this.nowMs();
    const transient = this.transient && now < this.transient.until ? this.transient.feedback : null;
    // In a session progress moves in 10 steps (fewer app re-renders); calibration keeps 20.
    const progressStep = calibrating ? 0.05 : 0.1;
    const closureProgress = running ? q(g.closureProgress, progressStep) : 0;
    const qBrowProgress = q(clamp01(browProgress), progressStep);
    const nextFeedback = composeFeedback({
      hard: this.hardStatus, stalled: this.stalled, status, mode, browStatus, browProgress: qBrowProgress,
      closureProgress, transient, calibrated: this.requiredCalibrated() || calibrating,
    });
    const prev = this.snap as BlinkEngineSnapshot | undefined;
    const feedback = prev && sameFeedback(prev.feedback, nextFeedback) ? prev.feedback : nextFeedback;

    // Calibration sample arrays: refreshed copies, throttled (they grow every frame).
    const sv = this.sampleView;
    if ((sv.neutral.length !== this.browNeutral.length || sv.raise.length !== this.browRaiseAll.length)
      && (now - sv.at >= SAMPLE_VIEW_MS || this.stage !== 'brow-neutral' && this.stage !== 'brow-raise')) {
      this.sampleView = { neutral: [...this.browNeutral], raise: [...this.browRaiseAll], at: now };
    }

    return {
      status,
      message,
      closureProgress,
      eyeScore: running && this.smoothed !== null ? q(this.smoothed, calibrating ? 0.01 : 0.05) : null,
      faceCount: running ? this.faceCount : 0,
      fps: running && this.detector ? Math.round(this.detector.fps) : 0,
      calibration: this.calibration,
      browCalibration: this.browCalibration,
      browStatus,
      browProgress: qBrowProgress,
      browScore: running && mode === 'brow-blink' && this.browSmoothed !== null ? q(this.browSmoothed, calibrating ? 0.01 : 0.05) : null,
      lastAccepted: this.lastAccepted,
      feedback,
      cameraOn: this.stream !== null,
      cal: {
        stage: this.stage,
        progress: q(clamp01(this.stageProgress), 0.01),
        instructions: stageInstructions(this.stage, {
          mode,
          deliberateCount: this.deliberateDurations.length,
          resting: this.delibRestUntil !== null,
          proposed: this.proposed,
          proposedBrow: this.proposedBrow,
          failure: this.failureReason,
          browRaises: this.browFilled,
          browResting: this.browRestUntil !== null,
          browPracticeCount: this.browPracticeCount,
          browWarning: this.browWarnings[0] ?? null,
        }),
        naturalSamplesMs: this.naturalDurations,
        deliberateSamplesMs: this.deliberateDurations,
        proposed: this.proposed,
        failureReason: this.failureReason,
        browNeutralSamples: this.sampleView.neutral,
        browRaiseSamples: this.sampleView.raise,
        browRaiseCount: this.browFilled,
        proposedBrow: this.proposedBrow,
      },
    };
  }

  private publish(force = false) {
    const now = this.nowMs();
    const next = this.build();
    const prev = this.snap;
    const structural = next.status !== prev.status || next.message !== prev.message || next.cal.stage !== prev.cal.stage
      || next.calibration !== prev.calibration || next.cal.proposed !== prev.cal.proposed || next.cameraOn !== prev.cameraOn
      || next.cal.naturalSamplesMs !== prev.cal.naturalSamplesMs || next.cal.deliberateSamplesMs !== prev.cal.deliberateSamplesMs
      || next.cal.failureReason !== prev.cal.failureReason || next.cal.instructions !== prev.cal.instructions || next.faceCount !== prev.faceCount
      || next.browCalibration !== prev.browCalibration || next.browStatus !== prev.browStatus || next.lastAccepted !== prev.lastAccepted
      || next.cal.proposedBrow !== prev.cal.proposedBrow || next.cal.browRaiseCount !== prev.cal.browRaiseCount || next.feedback.kind !== prev.feedback.kind || next.feedback.label !== prev.feedback.label;
    if (!force && !structural) {
      if (now - this.lastPublish < PUBLISH_MS) return;
      // Raw meters (eye/brow score, fps) only drive a publish during calibration, where they are
      // shown; in a session only status / feedback / progress changes re-render the app.
      const meters = !CALIBRATING_STAGES.has(next.cal.stage)
        || (next.eyeScore === prev.eyeScore && next.fps === prev.fps && next.browScore === prev.browScore);
      const same = meters && next.closureProgress === prev.closureProgress
        && next.cal.progress === prev.cal.progress && next.browProgress === prev.browProgress
        && next.feedback === prev.feedback && next.cal.browNeutralSamples === prev.cal.browNeutralSamples
        && next.cal.browRaiseSamples === prev.cal.browRaiseSamples;
      if (same) return;
    }
    this.lastPublish = now;
    this.snap = next;
    this.storeListeners.forEach((fn) => fn());
  }

  // ===== Gesture events =====
  readonly subscribe = (listener: (e: BlinkGestureEvent) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emitRaw(e: BlinkGestureEvent) {
    for (const fn of [...this.listeners]) {
      try {
        fn(e);
      } catch (err) {
        console.error('gesture listener failed', err);
      }
    }
  }

  private send(e: FaceCommandEvent): FaceCommandResult {
    if (!this.handler) return { applied: false, targetId: null };
    try {
      return this.handler(e) ?? { applied: false, targetId: null };
    } catch (err) {
      console.error('gesture command handler failed', err);
      return { applied: false, targetId: null };
    }
  }

  private routeBlink(events: BlinkGestureEvent[]) {
    for (const e of events) {
      this.emitRaw(e);
      if (this.liveMetrics()) getSharedGestureMetrics().recordGesture(e);
      this.apply(this.arbiter.onBlink(e));
      if (e.type === 'face-lost') this.send({ type: 'face-lost', at: e.at });
    }
  }

  private routeBrow(events: BrowEvent[]) {
    for (const e of events) {
      this.emitRaw(e);
      if (this.liveMetrics()) getSharedGestureMetrics().recordGesture(e);
      this.apply(this.arbiter.onBrow(e));
    }
  }

  /** Measurement records real-session gestures only (never calibration or practice). */
  private liveMetrics(): boolean {
    return !CALIBRATING_STAGES.has(this.stage) && !PRACTICE_STAGES.has(this.stage);
  }

  private flash(feedback: GestureFeedback) {
    this.transient = { feedback, until: this.nowMs() + FEEDBACK_FLASH_MS };
  }

  private apply(outputs: ArbiterOutput[]) {
    for (const o of outputs) {
      switch (o.type) {
        case 'freeze': {
          this.closureVoid = null;
          if (CALIBRATING_STAGES.has(this.stage)) break;
          const r = this.send({ type: 'freeze', at: o.at });
          // Refused (no attributable target, highlight just moved, another input owns the cycle):
          // this closure can never select. Say so only if it turns into a deliberate select.
          if (!r.applied) this.closureVoid = { feedback: r.refusal === 'highlight-moved' };
          break;
        }
        case 'unfreeze':
          this.closureVoid = null;
          if (!CALIBRATING_STAGES.has(this.stage)) this.send({ type: 'unfreeze', at: o.at });
          break;
        case 'cancel-brow':
          // The arbiter has already cleared its pending raise; the brow machine re-arms.
          this.routeBrow(this.brow.cancel(o.reason, this.lastT));
          break;
        case 'accept': {
          let r: FaceCommandResult;
          if (PRACTICE_STAGES.has(this.stage)) {
            // Practice: acknowledged on screen (lastAccepted gets a new `at`), never forwarded.
            r = { applied: true, targetId: null };
            if (o.command === 'NAV_NEXT' && this.stage === 'brow-practice') this.browPracticeCount += 1;
          } else if (CALIBRATING_STAGES.has(this.stage)) {
            r = { applied: false, targetId: null }; // sampling stages: gestures do nothing
          } else if (o.command === 'SELECT' && this.closureVoid) {
            // The freeze was refused: never forward this closure's SELECT.
            r = { applied: false, targetId: null, refusal: this.closureVoid.feedback ? 'highlight-moved' : undefined };
          } else {
            r = this.send({ type: 'accept', command: o.command, at: o.at, cycleId: o.cycleId });
            getSharedGestureMetrics().record({ kind: 'gesture-accept', t: o.at, command: o.command, applied: r.applied });
          }
          if (!r.applied && r.refusal === 'highlight-moved') this.flash(HIGHLIGHT_MOVED_FEEDBACK);
          this.lastAcceptApplied = r.applied;
          if (r.applied) this.lastAccepted = { command: o.command, at: o.at, targetId: r.targetId };
          break;
        }
        case 'feedback': {
          const k = o.feedback.kind;
          if (k === 'brow-accepted' || k === 'blink-accepted') {
            if (this.lastAcceptApplied) this.flash(o.feedback);
            this.lastAcceptApplied = false;
          } else if (k !== 'brow-progress' && k !== 'blink-progress') {
            this.flash(o.feedback); // ambiguous / too-short / face found / tracking paused
          }
          break;
        }
      }
    }
  }

  // ===== Camera lifecycle =====
  readonly startCamera = async (): Promise<void> => {
    if (this.stream || this.hardStatus === 'starting') return;
    const gen = ++this.gen;
    if (typeof window === 'undefined' || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.setHard('unsupported', 'Face gestures need a camera and a secure (https or localhost) page. Use keyboard or switch input.');
      return;
    }
    // Hands-free users never touch the screen, so iPad auto-lock would end the camera session.
    // Requested before the first await, while still inside the click that started the camera.
    this.requestWakeLock();
    this.setHard('starting', null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    } catch (e) {
      if (gen !== this.gen) return;
      this.releaseWakeLock(); // no camera session: do not keep the screen awake
      const name = (e as { name?: string } | null)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') this.setHard('permission-denied', null);
      else this.setHard('unsupported', name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'No usable camera was found. Use keyboard or switch input.'
        : 'The camera could not be started. Use keyboard or switch input.');
      return;
    }
    if (gen !== this.gen) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    this.watchTracks(stream);
    // Detection runs on an offscreen video element owned here, so preview elements can mount,
    // unmount and re-render freely without ever re-requesting the camera.
    const video = document.createElement('video');
    prepareVideo(video);
    video.setAttribute('aria-hidden', 'true');
    // WebKit may pause fully invisible / offscreen muted video: keep it 1×1 px, inside the
    // viewport, barely visible, and resume it if the browser pauses it anyway.
    video.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    video.srcObject = stream;
    video.addEventListener('pause', this.onHiddenVideoPause);
    document.body.appendChild(video);
    this.video = video;
    try {
      await video.play();
    } catch {
      /* muted inline playback normally succeeds; the detector waits for readyState */
    }
    this.prunePreviews();
    this.previews.forEach((el) => this.bindPreview(el));

    let detector: BlinkDetector;
    try {
      const mod = await import('@/access/blink-detector');
      detector = await mod.BlinkDetector.create(video, {
        onFrame: this.onFrame,
        onError: (err) => console.warn('face detection frame failed', err),
      });
    } catch (err) {
      console.warn('face detector failed to load', err);
      if (gen !== this.gen) return;
      this.releaseCamera();
      this.setHard('unsupported', 'The face model could not be loaded. Use keyboard or switch input.');
      return;
    }
    if (gen !== this.gen) {
      detector.close();
      return;
    }
    this.detector = detector;
    this.gesture.reset();
    this.brow.reset();
    this.arbiter.reset();
    this.smoothed = null;
    this.browSmoothed = null;
    this.faceCount = 0;
    this.hardStatus = null;
    this.hardMessage = null;
    this.lastFrameAt = performance.now();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('orientationchange', this.onOrientation);
    if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.addEventListener === 'function') {
      screen.orientation.addEventListener('change', this.onOrientation);
    }
    this.watchdog = setInterval(this.onWatchdog, WATCHDOG_MS);
    if (!document.hidden) detector.start();
    this.publish(true);
  };

  readonly stopCamera = (): void => {
    this.gen++;
    this.routeBlink(this.gesture.interrupt());
    this.routeBrow(this.brow.cancel('stale', this.lastT));
    this.releaseCamera();
    this.gesture.reset();
    this.brow.reset();
    this.arbiter.reset();
    this.transient = null;
    this.lastAccepted = null;
    if (this.stage !== 'done' && this.stage !== 'failed' && this.stage !== 'consent') this.resetCalibrator('consent');
    this.setHard('off', null);
  };

  /** Full teardown (component unmount). */
  readonly dispose = (): void => {
    this.stopCamera();
    this.listeners.clear();
    this.handler = null;
  };

  /**
   * Attach a <video> for a live preview (calibration framing view or the compact main-UI
   * self-view). Several may be attached at once; all share the one stream. Returns a detach
   * function (usable as a React 19 ref-callback cleanup). attachPreview(null) detaches elements
   * that are no longer in the document (effect-cleanup style).
   */
  readonly attachPreview = (el: HTMLVideoElement | null): (() => void) => {
    this.prunePreviews();
    if (!el) return () => {};
    this.previews.add(el);
    prepareVideo(el);
    this.bindPreview(el);
    return () => this.detachPreview(el);
  };

  private detachPreview(el: HTMLVideoElement) {
    if (!this.previews.delete(el)) return;
    try {
      el.srcObject = null;
    } catch {
      /* detached */
    }
  }

  private prunePreviews() {
    for (const el of [...this.previews]) if (!el.isConnected) this.detachPreview(el);
  }

  private bindPreview(el: HTMLVideoElement) {
    if (!this.stream) return;
    if (el.srcObject !== this.stream) el.srcObject = this.stream;
    void el.play().catch(() => {});
  }

  private releaseCamera() {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    if (typeof window !== 'undefined') window.removeEventListener('orientationchange', this.onOrientation);
    if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.removeEventListener === 'function') {
      screen.orientation.removeEventListener('change', this.onOrientation);
    }
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    this.detector?.close();
    this.detector = null;
    this.stream?.getTracks().forEach(stopTrack);
    this.stream = null;
    if (this.video) {
      this.video.removeEventListener('pause', this.onHiddenVideoPause);
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    this.releaseWakeLock();
    this.trackEndedWhileHidden = false;
    for (const el of this.previews) {
      try {
        el.srcObject = null;
      } catch {
        /* detached */
      }
    }
    this.smoothed = null;
    this.browSmoothed = null;
    this.faceCount = 0;
    this.stalled = false;
    this.browRunning = false;
  }

  private setHard(status: Extract<BlinkStatus, 'off' | 'unsupported' | 'permission-denied' | 'starting'>, message: string | null) {
    this.hardStatus = status;
    this.hardMessage = message;
    if ((status === 'unsupported' || status === 'permission-denied') && CALIBRATING_STAGES.has(this.stage)) {
      this.failCalibration(message ?? STATUS_MESSAGES[status]);
    }
    this.publish(true);
  }

  /**
   * Tab hidden, stall, orientation change, camera muted / ended: cancel pending gestures (nothing
   * completes across) and tell the handler, which pauses like face-lost (deliberate resume).
   */
  private interruptAll(reason: TrackingInterruptReason) {
    const ev = interruptGestures(this.gesture, this.brow, this.lastT);
    this.routeBlink(ev.blink);
    this.routeBrow(ev.brow);
    this.closureVoid = null;
    if (!CALIBRATING_STAGES.has(this.stage)) this.send({ type: 'face-lost', at: this.lastT, cause: reason });
    this.smoothed = null;
    this.browSmoothed = null;
    this.segmenter?.reset();
    this.stageLastT = null;
    this.positionSince = null;
    this.browHoldSince = null;
    this.browHoldProgress = 0;
  }

  private readonly onVisibility = () => {
    if (!this.detector) return;
    if (document.hidden) {
      // Hidden tab: stop processing; a pending closure / raise is discarded and can never commit.
      this.detector.pause();
      this.interruptAll('hidden');
      this.publish(true);
    } else {
      this.lastFrameAt = performance.now();
      this.requestWakeLock(); // the system releases screen wake locks when the page is hidden
      if (this.trackEndedWhileHidden) {
        this.trackEndedWhileHidden = false;
        void this.reacquire();
      }
      this.detector.start();
    }
  };

  // ===== iPad Safari resilience =====
  private requestWakeLock() {
    if (this.wakeLock || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const gen = this.gen;
    navigator.wakeLock.request('screen').then((sentinel) => {
      // Resolved after the camera failed / stopped (or after a newer start superseded it with no
      // stream yet): release it rather than keeping the screen awake with no camera session.
      if ((gen !== this.gen || this.hardStatus !== 'starting') && !this.stream) {
        void sentinel.release().catch(() => {});
        return;
      }
      if (this.wakeLock) {
        void sentinel.release().catch(() => {});
        return;
      }
      this.wakeLock = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.wakeLock === sentinel) this.wakeLock = null;
      });
    }).catch(() => {
      /* unsupported / denied / not visible: the UI shows an Auto-Lock tip instead */
    });
  }

  private releaseWakeLock() {
    const w = this.wakeLock;
    this.wakeLock = null;
    if (w) void w.release().catch(() => {});
  }

  private watchTracks(stream: MediaStream) {
    for (const track of stream.getVideoTracks()) {
      track.onmute = () => {
        if (this.stream !== stream) return;
        // No new frames are coming: anything pending is stale. The watchdog holds input.
        this.interruptAll('stall');
        this.publish(true);
      };
      track.onunmute = () => {
        if (this.stream !== stream) return;
        this.lastFrameAt = performance.now();
        void this.video?.play().catch(() => {});
      };
      track.onended = () => {
        if (this.stream !== stream) return;
        this.interruptAll('camera');
        if (typeof document !== 'undefined' && document.hidden) this.trackEndedWhileHidden = true;
        else void this.reacquire();
        this.publish(true);
      };
    }
  }

  /** The camera track ended (iPadOS can end it after interruptions): request the camera once more. */
  private async reacquire(): Promise<void> {
    if (this.reacquiring || !this.stream) return;
    this.reacquiring = true;
    const gen = this.gen;
    try {
      const next = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      if (gen !== this.gen || !this.stream) {
        next.getTracks().forEach(stopTrack);
        return;
      }
      this.stream.getTracks().forEach(stopTrack);
      this.stream = next;
      this.watchTracks(next);
      if (this.video) {
        this.video.srcObject = next;
        void this.video.play().catch(() => {});
      }
      this.prunePreviews();
      this.previews.forEach((el) => this.bindPreview(el));
      this.lastFrameAt = performance.now();
      this.publish(true);
    } catch {
      if (gen !== this.gen) return;
      this.releaseCamera();
      this.gesture.reset();
      this.brow.reset();
      this.arbiter.reset();
      this.setHard('off', 'The camera stopped. Turn the camera on again, or use keyboard or switch input.');
    } finally {
      this.reacquiring = false;
    }
  }

  private readonly onHiddenVideoPause = () => {
    const v = this.video;
    if (!v || !this.stream || (typeof document !== 'undefined' && document.hidden)) return;
    void v.play().catch(() => {});
  };

  private readonly onOrientation = () => {
    if (!this.detector) return;
    // The face moves in the frame: pending gestures are stale; the brow machine needs a fresh
    // neutral frame before another raise can start.
    this.interruptAll('orientation');
    this.brow.reset();
    this.publish(true);
  };

  private readonly onWatchdog = () => {
    if (!this.detector || document.hidden) return;
    const stalled = performance.now() - this.lastFrameAt > STALL_MS;
    if (stalled && !this.stalled) {
      this.stalled = true;
      this.interruptAll('stall');
      this.publish(true);
    }
    if (stalled) {
      // WebKit may have paused the video element: try playing again before anything else.
      void this.video?.play().catch(() => {});
      this.previews.forEach((el) => void el.play().catch(() => {}));
    }
    // Detection errors that persist mean the adapter is not usable here.
    if (this.detector.errorCount >= 90) {
      this.releaseCamera();
      this.gesture.reset();
      this.brow.reset();
      this.arbiter.reset();
      this.setHard('unsupported', 'Face detection stopped working in this browser. Use keyboard or switch input.');
    }
  };

  // ===== Frames =====
  /** Per-frame entry point (detector callback). Public so tests can drive the engine with synthetic frames. */
  readonly onFrame = (raw: RawBlinkFrame) => {
    if (raw.switched) {
      // The followed face is now a different person: feed one dropout frame so any in-progress
      // closure/raise is discarded and the brow machine needs a fresh stable-face period, then
      // process the real frame a hair later (timestamps must stay strictly increasing).
      this.processFrame({ t: raw.t, faces: 0, score: null, brow: null, faceCount: raw.faceCount });
      this.processFrame({ ...raw, t: raw.t + 0.01, switched: false });
      return;
    }
    this.processFrame(raw);
  };

  private processFrame(raw: RawBlinkFrame) {
    this.lastFrameAt = this.nowMs(); // processing time; raw.t may be the earlier capture time
    this.stalled = false;
    this.lastT = raw.t;
    this.faceCount = raw.faceCount ?? raw.faces;
    const single = raw.faces === 1 && raw.score !== null;
    this.smoothed = single ? smoothScore(this.smoothed, raw.score as number) : null;
    const browSingle = raw.faces === 1 && raw.brow !== null && raw.brow !== undefined;
    this.browSmoothed = browSingle ? smoothScore(this.browSmoothed, raw.brow as number, BROW_SMOOTHING_ALPHA) : null;
    const frame: BlinkFrame = { t: raw.t, faces: raw.faces, score: single ? this.smoothed : null };
    this.calibrationFrame(frame, browSingle ? this.browSmoothed : null);
    // Blink first: a closure starting on this frame pre-empts a brow NEXT on the same frame.
    this.routeBlink(this.gesture.push(frame));
    const browWanted = this.effMode() === 'brow-blink' && !BROW_SAMPLING_STAGES.has(this.stage);
    if (browWanted) {
      if (!this.browRunning) {
        this.brow.reset(); // needs a fresh neutral frame: no raise carried from sampling stages
        this.browRunning = true;
      }
      this.routeBrow(this.brow.push({ t: raw.t, faces: raw.faces, score: browSingle ? this.browSmoothed : null }));
    } else if (this.browRunning) {
      this.routeBrow(this.brow.cancel('stale', raw.t));
      this.browRunning = false;
    }
    this.publish();
  }

  // ===== Calibration driver =====
  private resetCalibrator(stage: CalibrationStage) {
    this.stage = stage;
    this.stageProgress = 0;
    this.stageElapsed = 0;
    this.stageLastT = null;
    this.positionSince = null;
    this.baselineScores = [];
    this.naturalDurations = [];
    this.naturalPeaks = [];
    this.deliberateDurations = [];
    this.deliberatePeaks = [];
    this.segmenter = null;
    this.delibWindowStart = null;
    this.delibRestUntil = null;
    this.delibBest = null;
    this.delibWindows = 0;
    this.proposed = null;
    this.failureReason = null;
    this.browNeutral = [];
    this.browWindows = [];
    this.browRaiseAll = [];
    this.browWindow = null;
    this.browWindowStart = null;
    this.browRestUntil = null;
    this.browHoldSince = null;
    this.browHoldProgress = 0;
    this.browFilled = 0;
    this.proposedBrow = null;
    this.browWarnings = [];
    this.browPracticeCount = 0;
    this.sampleView = { neutral: [], raise: [], at: -Infinity };
    this.gesture.setConfig(this.calibration ?? DEFAULT_GESTURE_CONFIG);
    this.brow.setCalibration(this.browCalibration ?? DEFAULT_BROW_CALIBRATION);
  }

  private enterStage(stage: CalibrationStage, t: number | null = null) {
    this.stage = stage;
    this.stageProgress = 0;
    this.stageElapsed = 0;
    this.stageLastT = t;
    if (stage === 'natural' || stage === 'deliberate') {
      const p = provisionalThresholds(this.baselineScores);
      this.segmenter = new ClosureSegmenter(p.closed, p.open);
    }
    if (stage === 'deliberate') {
      this.delibWindows = 0;
      this.delibBest = null;
      this.delibWindowStart = null;
      this.delibRestUntil = t === null ? null : t + CALIBRATION_TIMING.deliberateRestMs;
    }
    if (stage === 'brow-raise') {
      this.browWindows = [];
      this.browRaiseAll = [];
      this.browWindow = null;
      this.browWindowStart = null;
      this.browRestUntil = t === null ? null : t + BROW_STAGE_TIMING.restMs;
      this.browHoldSince = null;
      this.browHoldProgress = 0;
      this.browFilled = 0;
    }
    if (stage === 'brow-practice') this.browPracticeCount = 0;
    if (stage === 'review') this.computeProposal();
    this.publish(true);
  }

  private failCalibration(reason: string) {
    this.stage = 'failed';
    this.failureReason = reason;
    this.proposed = null;
    this.proposedBrow = null;
    this.gesture.setConfig(this.calibration ?? DEFAULT_GESTURE_CONFIG);
    this.brow.setCalibration(this.browCalibration ?? DEFAULT_BROW_CALIBRATION);
  }

  private computeProposal() {
    const r = computeBlinkCalibration({
      baselineScores: this.baselineScores,
      naturalDurationsMs: this.naturalDurations,
      naturalPeaks: this.naturalPeaks,
      deliberateDurationsMs: this.deliberateDurations,
      deliberatePeaks: this.deliberatePeaks,
    }, Date.now());
    if (r.ok) {
      this.proposed = r.calibration;
      this.failureReason = null;
    } else {
      this.failCalibration(r.reason);
    }
  }

  private computeBrowProposal(t: number | null) {
    if (this.browWindow && this.browWindow.length) this.browWindows.push(this.browWindow);
    this.browWindow = null;
    const r = proposeBrowCalibration(this.browNeutral, this.browWindows);
    if (!r.ok) {
      this.failCalibration(r.reason);
      this.publish(true);
      return;
    }
    this.proposedBrow = r.calibration;
    this.browWarnings = r.warnings;
    this.brow.setCalibration(r.calibration); // practice uses the proposed thresholds
    this.enterStage('brow-practice', t);
  }

  /** Counts frame time toward a stage only while one face is present and frames are contiguous. */
  private countTime(frame: BlinkFrame): number {
    const last = this.stageLastT;
    this.stageLastT = frame.t;
    if (last === null || frame.faces !== 1 || frame.score === null) return 0;
    const dt = frame.t - last;
    return dt > 0 && dt <= CALIBRATION_TIMING.maxCountedGapMs ? dt : 0;
  }

  private calibrationFrame(f: BlinkFrame, browScore: number | null) {
    switch (this.stage) {
      case 'position': {
        if (f.faces === 1 && f.score !== null) {
          if (this.positionSince === null) this.positionSince = f.t;
          this.stageProgress = (f.t - this.positionSince) / CALIBRATION_TIMING.positionStableMs;
          if (this.stageProgress >= 1) this.enterStage(this.calMode === 'brow-blink' ? 'brow-neutral' : 'baseline', f.t);
        } else {
          this.positionSince = null;
          this.stageProgress = 0;
        }
        return;
      }
      case 'baseline': {
        const dt = this.countTime(f);
        if (f.faces === 1 && f.score !== null) this.baselineScores.push(f.score);
        this.stageElapsed += dt;
        this.stageProgress = this.stageElapsed / CALIBRATION_TIMING.baselineMs;
        if (this.stageProgress >= 1) this.enterStage('natural', f.t);
        return;
      }
      case 'brow-neutral': {
        const dt = browScore === null ? (this.stageLastT = f.t, 0) : this.countTime(f);
        if (browScore !== null && f.faces === 1) this.browNeutral.push(browScore);
        this.stageElapsed += dt;
        this.stageProgress = this.stageElapsed / BROW_STAGE_TIMING.neutralMs;
        if (this.stageProgress >= 1) this.enterStage('brow-raise', f.t);
        return;
      }
      case 'brow-raise':
        if (browScore !== null && f.faces === 1) this.browRaiseAll.push(browScore);
        this.browRaiseFrame(f, browScore);
        return;
      case 'natural': {
        const dt = this.countTime(f);
        const c = this.segmenter?.push(f);
        if (c) {
          this.naturalDurations = [...this.naturalDurations, Math.round(c.durationMs)];
          this.naturalPeaks.push(c.peak);
        }
        this.stageElapsed += dt;
        this.stageProgress = this.stageElapsed / CALIBRATION_TIMING.naturalMs;
        if (this.stageProgress >= 1 && !this.segmenter?.closing) this.enterStage('deliberate', f.t);
        return;
      }
      case 'deliberate':
        this.deliberateFrame(f);
        return;
      default:
        return;
    }
  }

  private browProvisional(): { raised: number; release: number } {
    const p90 = this.browNeutral.length ? quantile(this.browNeutral, 0.9) : DEFAULT_BROW_CALIBRATION.neutral;
    const raised = Math.min(0.95, p90 + BROW_STAGE_TIMING.provisionalMargin);
    return { raised, release: p90 + BROW_STAGE_TIMING.provisionalMargin / 2 };
  }

  private browRaiseFrame(f: BlinkFrame, score: number | null) {
    const T = BROW_STAGE_TIMING;
    const { raised, release } = this.browProvisional();
    if (this.browRestUntil === null && this.browWindowStart === null) this.browRestUntil = f.t + T.restMs;
    if (this.browRestUntil !== null) {
      this.browHoldSince = null;
      this.browHoldProgress = 0;
      if (f.t >= this.browRestUntil && (score === null || score <= release)) {
        this.browRestUntil = null;
        this.browWindowStart = f.t;
        this.browWindow = [];
      }
    } else if (this.browWindowStart !== null) {
      const start = this.browWindowStart;
      if (score !== null && f.faces === 1) {
        this.browWindow?.push({ t: f.t, score });
        // Hold bar (provisional thresholds): fills over a continuous 500 ms raise.
        if (this.browHoldSince === null) {
          if (score >= raised) this.browHoldSince = f.t;
        } else if (score <= release) {
          this.browHoldSince = null;
        }
        // A filled bar stays filled for the rest of the window; an unfinished hold resets.
        if (this.browHoldSince !== null) {
          this.browHoldProgress = Math.max(this.browHoldProgress, clamp01((f.t - this.browHoldSince) / DEFAULT_BROW_CALIBRATION.holdMs));
        } else if (this.browHoldProgress < 1) {
          this.browHoldProgress = 0;
        }
      } else {
        this.browHoldSince = null; // face missing: a hold cannot be measured across it
        if (this.browHoldProgress < 1) this.browHoldProgress = 0;
      }
      const filled = this.browHoldProgress >= 1;
      const up = score !== null && score > release;
      const elapsed = f.t - start;
      const done = (filled && !up) || (elapsed >= T.windowMs && !up) || elapsed >= T.windowMaxMs;
      if (done) {
        if (this.browWindow && this.browWindow.length) this.browWindows.push(this.browWindow);
        this.browWindow = null;
        if (filled) this.browFilled += 1;
        this.browWindowStart = null;
        this.browRestUntil = f.t + T.restMs;
        this.browHoldSince = null;
        this.browHoldProgress = 0;
        if (this.browFilled >= T.raiseTarget || this.browWindows.length >= T.maxWindows) {
          this.computeBrowProposal(f.t);
          return;
        }
        this.publish(true);
      }
    }
    this.stageProgress = this.browFilled / T.raiseTarget;
  }

  private deliberateFrame(f: BlinkFrame) {
    const T = CALIBRATION_TIMING;
    const c = this.segmenter?.push(f) ?? null;
    if (this.delibRestUntil === null && this.delibWindowStart === null) this.delibRestUntil = f.t + T.deliberateRestMs;
    if (this.delibRestUntil !== null) {
      if (f.t >= this.delibRestUntil && !this.segmenter?.closing) {
        this.delibRestUntil = null;
        this.delibWindowStart = f.t;
        this.delibBest = null;
      }
    } else if (this.delibWindowStart !== null) {
      const start = this.delibWindowStart;
      // The longest closure that began in this prompt window is the deliberate sample; ordinary
      // blinks in the same window are shorter and therefore ignored without hiding overlap.
      if (c && c.onset >= start && (!this.delibBest || c.durationMs > this.delibBest.durationMs)) {
        this.delibBest = { durationMs: c.durationMs, peak: c.peak };
      }
      const elapsed = f.t - start;
      const closingInWindow = !!this.segmenter?.closing && (this.segmenter.closingSince ?? -Infinity) >= start;
      if ((elapsed >= T.deliberateWindowMs && !closingInWindow) || elapsed >= T.deliberateWindowMaxMs) {
        this.delibWindows += 1;
        if (this.delibBest) {
          this.deliberateDurations = [...this.deliberateDurations, Math.round(this.delibBest.durationMs)];
          this.deliberatePeaks.push(this.delibBest.peak);
        }
        this.delibBest = null;
        this.delibWindowStart = null;
        this.delibRestUntil = f.t + T.deliberateRestMs;
        if (this.deliberateDurations.length >= T.deliberateTarget || this.delibWindows >= T.deliberateMaxWindows) {
          this.enterStage('review', f.t);
          return;
        }
      }
    }
    this.stageProgress = this.deliberateDurations.length / T.deliberateTarget;
  }

  // ===== Calibrator controls =====
  readonly begin = (mode?: AccessMode): void => {
    if (this.stage !== 'consent' && this.stage !== 'failed' && this.stage !== 'done') return;
    this.calMode = mode ?? this.mode;
    this.browRunning = false;
    this.arbiter.reset();
    this.resetCalibrator('position');
    this.publish(true);
    if (!this.stream) void this.startCamera();
  };

  readonly advance = (): void => {
    const t = this.stageLastT;
    switch (this.stage) {
      case 'consent':
        this.begin(this.calMode);
        return;
      case 'position':
        this.enterStage(this.calMode === 'brow-blink' ? 'brow-neutral' : 'baseline', null);
        return;
      case 'baseline':
        this.enterStage('natural', null);
        return;
      case 'brow-neutral':
        this.enterStage('brow-raise', null);
        return;
      case 'brow-raise':
        // The UI offers Continue once BROW_STAGE_TIMING.raiseMinimum raises completed.
        this.computeBrowProposal(t);
        return;
      case 'brow-practice':
        this.enterStage('baseline', null);
        return;
      case 'natural':
        this.enterStage('deliberate', null);
        return;
      case 'deliberate':
        this.enterStage('review', t);
        return;
      case 'review':
        this.accept();
        return;
      case 'practice-select':
        this.stage = 'practice-confirm';
        this.publish(true);
        return;
      case 'practice-confirm':
        this.finishPractice();
        return;
      default:
        return;
    }
  };

  readonly restart = (mode?: AccessMode): void => {
    this.calMode = mode ?? this.mode;
    this.browRunning = false;
    this.arbiter.reset();
    this.resetCalibrator(this.stream ? 'position' : 'consent');
    this.publish(true);
  };

  private browProposalNeeded(): boolean {
    return this.calMode === 'brow-blink';
  }

  readonly accept = (): void => {
    if (this.stage !== 'review' || !this.proposed) return;
    if (this.browProposalNeeded() && !this.proposedBrow) return;
    this.gesture.setConfig(this.proposed); // practice uses the proposed timing
    if (this.proposedBrow) this.brow.setCalibration(this.proposedBrow);
    this.stage = 'practice-select';
    this.publish(true);
  };

  readonly finishPractice = (): void => {
    if ((this.stage !== 'practice-select' && this.stage !== 'practice-confirm') || !this.proposed) return;
    if (this.browProposalNeeded() && !this.proposedBrow) return;
    const c: BlinkCalibration = { ...this.proposed, calibratedAt: Date.now() };
    this.calibration = c;
    saveCalibration(storage(), c);
    this.gesture.setConfig(c);
    if (this.proposedBrow && this.calMode === 'brow-blink') {
      const b: BrowCalibration = { ...this.proposedBrow };
      this.browCalibration = b;
      saveBrowCalibration(b, storage());
      this.brow.setCalibration(b);
    }
    this.stage = 'done';
    this.publish(true);
  };

  readonly setMinClosureMs = (ms: number): void => {
    const p = this.proposed;
    if (!p || !Number.isFinite(ms)) return;
    const minClosureMs = Math.round(Math.min(p.maxClosureMs - 100, Math.max(250, ms)));
    this.proposed = { ...p, minClosureMs };
    if (this.stage === 'practice-select' || this.stage === 'practice-confirm') this.gesture.setConfig(this.proposed);
    this.publish(true);
  };

  /** Current gesture configuration (for diagnostics). */
  get gestureConfig(): GestureConfig {
    return this.gesture.config;
  }
}

/** Front camera, modest resolution (inference runs ~15 fps on 640×480). No hard constraints. */
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  audio: false,
};

function stopTrack(t: MediaStreamTrack) {
  t.onended = null;
  t.onmute = null;
  t.onunmute = null;
  t.stop();
}

/** iPad Safari inline camera video: muted + playsinline + autoplay, set as properties AND attributes. */
function prepareVideo(el: HTMLVideoElement) {
  el.muted = true;
  el.playsInline = true;
  el.autoplay = true;
  el.setAttribute('muted', '');
  el.setAttribute('playsinline', '');
  el.setAttribute('autoplay', '');
}

const SERVER_SNAPSHOT: BlinkEngineSnapshot = {
  status: 'off',
  message: STATUS_MESSAGES.off,
  closureProgress: 0,
  eyeScore: null,
  faceCount: 0,
  fps: 0,
  calibration: null,
  browCalibration: null,
  browStatus: 'disabled',
  browProgress: 0,
  browScore: null,
  lastAccepted: null,
  feedback: { kind: 'camera-off', label: 'Camera off' },
  cameraOn: false,
  cal: {
    stage: 'consent', progress: 0, instructions: stageInstructions('consent', {}),
    naturalSamplesMs: [], deliberateSamplesMs: [], proposed: null, failureReason: null,
    browNeutralSamples: [], browRaiseSamples: [], browRaiseCount: 0, proposedBrow: null,
  },
};
const getServerSnapshot = () => SERVER_SNAPSHOT;

/** Face input is usable for this mode once the required calibrations exist. */
export function faceInputActive(mode: AccessMode, blink: BlinkCalibration | null, brow: BrowCalibration | null): boolean {
  if (mode === 'blink') return blink !== null;
  if (mode === 'brow-blink') return blink !== null && brow !== null;
  return false;
}

export function useBlink(accessMode: AccessMode): BlinkRuntime & { engine: BlinkEngine; cameraOn: boolean } {
  const [engine] = useState(() => new BlinkEngine(accessMode));
  const snap = useSyncExternalStore(engine.subscribeStore, engine.getSnapshot, getServerSnapshot);
  useEffect(() => {
    engine.setMode(accessMode);
  }, [engine, accessMode]);
  // Unmount: stop every camera track and the frame loop.
  useEffect(() => () => engine.stopCamera(), [engine]);

  const calibrator = useMemo(
    () => ({
      ...snap.cal,
      begin: engine.begin,
      advance: engine.advance,
      restart: engine.restart,
      accept: engine.accept,
      finishPractice: engine.finishPractice,
      setMinClosureMs: engine.setMinClosureMs,
    }),
    [snap.cal, engine],
  );

  return useMemo(
    () => ({
      status: snap.status,
      message: snap.message,
      closureProgress: snap.closureProgress,
      eyeScore: snap.eyeScore,
      faceCount: snap.faceCount,
      fps: snap.fps,
      calibration: snap.calibration,
      browCalibration: snap.browCalibration,
      browStatus: snap.browStatus,
      browProgress: snap.browProgress,
      browScore: snap.browScore,
      lastAccepted: snap.lastAccepted,
      feedback: snap.feedback,
      active: faceInputActive(accessMode, snap.calibration, snap.browCalibration),
      startCamera: engine.startCamera,
      stopCamera: engine.stopCamera,
      attachPreview: engine.attachPreview,
      subscribe: engine.subscribe,
      calibrator,
      engine,
      cameraOn: snap.cameraOn,
    }),
    [snap, accessMode, engine, calibrator],
  );
}
