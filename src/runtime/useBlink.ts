'use client';
// Blink-first access adapter runtime. Implements BlinkRuntime (src/runtime/contract.ts).
// A plain engine object owns the camera, the lazily loaded detector, the pure gesture machine,
// and the calibration stage driver; React subscribes through useSyncExternalStore and receives
// at most ~10 snapshots per second, so detection never re-renders the app every frame.
// Gesture events are delivered synchronously to subscribers (useStillHere, practice screens).
// No camera frame, image, or recording is stored or sent anywhere.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { AccessMode } from '@/core/types';
import type { BlinkCalibration, BlinkGestureEvent, BlinkRuntime, BlinkStatus, CalibrationStage } from './contract';
import { BlinkGesture, DEFAULT_GESTURE_CONFIG, smoothScore, type BlinkFrame, type GestureConfig } from '@/access/blink-gesture';
import {
  CALIBRATION_TIMING, ClosureSegmenter, computeBlinkCalibration, loadCalibration, provisionalThresholds, saveCalibration,
} from '@/access/blink-calibration';
import type { BlinkDetector, RawBlinkFrame } from '@/access/blink-detector';

const PUBLISH_MS = 100;
const WATCHDOG_MS = 500;
const STALL_MS = 1500;

/** Stages during which camera samples are being collected or practised (not normal use). */
export const CALIBRATING_STAGES: ReadonlySet<CalibrationStage> = new Set([
  'position', 'baseline', 'natural', 'deliberate', 'review', 'practice-select', 'practice-confirm',
]);

type CalibratorView = {
  stage: CalibrationStage;
  progress: number;
  instructions: string;
  naturalSamplesMs: number[];
  deliberateSamplesMs: number[];
  proposed: BlinkCalibration | null;
  failureReason: string | null;
};

export type BlinkEngineSnapshot = {
  status: BlinkStatus;
  message: string;
  closureProgress: number;
  eyeScore: number | null;
  faceCount: number;
  fps: number;
  calibration: BlinkCalibration | null;
  cameraOn: boolean;
  cal: CalibratorView;
};

const STATUS_MESSAGES: Record<BlinkStatus, string> = {
  off: 'Camera off — turn on the camera to use blink selection.',
  unsupported: 'Blink selection is not available here. Use keyboard or switch scanning.',
  'permission-denied': 'Camera permission was not given. Allow the camera in the browser, or use keyboard or switch.',
  starting: 'Starting camera…',
  'no-face': 'Position your face in view',
  'multiple-faces': 'More than one face — selection held',
  ready: 'Ready — blink deliberately to select',
  closing: 'Keep eyes closed…',
  selected: 'Selected',
  cooldown: 'Re-arming…',
  'face-lost': 'Face lost — paused. Look at the screen, then blink to resume.',
};

function stageInstructions(stage: CalibrationStage, extra: { deliberateCount?: number; resting?: boolean; proposed?: BlinkCalibration | null; failure?: string | null }): string {
  switch (stage) {
    case 'consent':
      return 'Blink selection uses the camera on this device only. No video or photos are saved or sent.';
    case 'position':
      return 'Sit so your whole face is in the frame and hold still.';
    case 'baseline':
      return 'Look at the screen normally with your eyes open.';
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
      return p
        ? `A selection needs the eyes closed for at least ${p.minClosureMs} ms. Shorter blinks are ignored.`
        : 'Working out your timing…';
    }
    case 'practice-select':
      return 'Practice: wait for the highlight, then close your eyes deliberately to select it.';
    case 'practice-confirm':
      return 'Now confirm with a second, separate deliberate blink.';
    case 'done':
      return 'Calibration saved. Blink selection is ready.';
    case 'failed':
      return extra.failure ?? 'Blink calibration did not work this time. Keyboard or switch scanning works the same way.';
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

export class BlinkEngine {
  // ---- Camera / detector ----
  private gen = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private preview: HTMLVideoElement | null = null;
  private detector: BlinkDetector | null = null;
  private hardStatus: Extract<BlinkStatus, 'off' | 'unsupported' | 'permission-denied' | 'starting'> | null = 'off';
  private hardMessage: string | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;
  private stalled = false;

  // ---- Detection state ----
  private gesture: BlinkGesture;
  private smoothed: number | null = null;
  private faceCount = 0;
  private listeners = new Set<(e: BlinkGestureEvent) => void>();

  // ---- Calibration ----
  private calibration: BlinkCalibration | null;
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

  // ---- Store ----
  private snap: BlinkEngineSnapshot;
  private storeListeners = new Set<() => void>();
  private lastPublish = 0;

  constructor() {
    this.calibration = typeof window !== 'undefined' ? loadCalibration(storage()) : null;
    this.stage = this.calibration ? 'done' : 'consent';
    this.gesture = new BlinkGesture(this.calibration ?? DEFAULT_GESTURE_CONFIG);
    this.snap = this.build();
  }

  // ===== External store =====
  readonly subscribeStore = (fn: () => void) => {
    this.storeListeners.add(fn);
    return () => {
      this.storeListeners.delete(fn);
    };
  };

  readonly getSnapshot = (): BlinkEngineSnapshot => this.snap;

  private build(): BlinkEngineSnapshot {
    const g = this.gesture.snapshot();
    const running = this.hardStatus === null;
    const status: BlinkStatus = running ? g.status : (this.hardStatus as BlinkStatus);
    let message = this.hardMessage ?? STATUS_MESSAGES[status];
    if (running) {
      if (this.stalled) message = 'Camera image stopped updating — selection held.';
      else if (status === 'cooldown' && g.lastDiscard === 'too-long') message = 'Closed too long — not selected. Open your eyes to re-arm.';
      else if (status === 'cooldown' && g.awaitingOpen) message = 'Re-arming… open your eyes.';
      else if (status === 'ready' && !this.calibration && !CALIBRATING_STAGES.has(this.stage)) message = 'Face found — calibrate before using blink selection.';
    }
    const calibrating = CALIBRATING_STAGES.has(this.stage);
    return {
      status,
      message,
      closureProgress: running ? q(g.closureProgress, 0.05) : 0,
      eyeScore: running && this.smoothed !== null ? q(this.smoothed, calibrating ? 0.01 : 0.05) : null,
      faceCount: running ? this.faceCount : 0,
      fps: running && this.detector ? Math.round(this.detector.fps) : 0,
      calibration: this.calibration,
      cameraOn: this.stream !== null,
      cal: {
        stage: this.stage,
        progress: q(clamp01(this.stageProgress), 0.01),
        instructions: stageInstructions(this.stage, {
          deliberateCount: this.deliberateDurations.length,
          resting: this.delibRestUntil !== null,
          proposed: this.proposed,
          failure: this.failureReason,
        }),
        naturalSamplesMs: this.naturalDurations,
        deliberateSamplesMs: this.deliberateDurations,
        proposed: this.proposed,
        failureReason: this.failureReason,
      },
    };
  }

  private publish(force = false) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const next = this.build();
    const prev = this.snap;
    const structural = next.status !== prev.status || next.message !== prev.message || next.cal.stage !== prev.cal.stage
      || next.calibration !== prev.calibration || next.cal.proposed !== prev.cal.proposed || next.cameraOn !== prev.cameraOn
      || next.cal.naturalSamplesMs !== prev.cal.naturalSamplesMs || next.cal.deliberateSamplesMs !== prev.cal.deliberateSamplesMs
      || next.cal.failureReason !== prev.cal.failureReason || next.cal.instructions !== prev.cal.instructions || next.faceCount !== prev.faceCount;
    if (!force && !structural) {
      if (now - this.lastPublish < PUBLISH_MS) return;
      const same = next.closureProgress === prev.closureProgress && next.eyeScore === prev.eyeScore && next.fps === prev.fps
        && next.cal.progress === prev.cal.progress;
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

  private emit(events: BlinkGestureEvent[]) {
    for (const e of events) {
      for (const fn of [...this.listeners]) {
        try {
          fn(e);
        } catch (err) {
          console.error('blink listener failed', err);
        }
      }
    }
  }

  // ===== Camera lifecycle =====
  readonly startCamera = async (): Promise<void> => {
    if (this.stream || this.hardStatus === 'starting') return;
    const gen = ++this.gen;
    if (typeof window === 'undefined' || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.setHard('unsupported', 'Blink selection needs a camera and a secure (https or localhost) page. Use keyboard or switch scanning.');
      return;
    }
    this.setHard('starting', null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
    } catch (e) {
      if (gen !== this.gen) return;
      const name = (e as { name?: string } | null)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') this.setHard('permission-denied', null);
      else this.setHard('unsupported', name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'No usable camera was found. Use keyboard or switch scanning.'
        : 'The camera could not be started. Use keyboard or switch scanning.');
      return;
    }
    if (gen !== this.gen) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1;';
    video.srcObject = stream;
    document.body.appendChild(video);
    this.video = video;
    try {
      await video.play();
    } catch {
      /* muted inline playback normally succeeds; the detector waits for readyState */
    }
    if (this.preview) this.bindPreview(this.preview);

    let detector: BlinkDetector;
    try {
      const mod = await import('@/access/blink-detector');
      detector = await mod.BlinkDetector.create(video, {
        onFrame: this.onFrame,
        onError: (err) => console.warn('blink detection frame failed', err),
      });
    } catch (err) {
      console.warn('blink detector failed to load', err);
      if (gen !== this.gen) return;
      this.releaseCamera();
      this.setHard('unsupported', 'The face model could not be loaded. Use keyboard or switch scanning.');
      return;
    }
    if (gen !== this.gen) {
      detector.close();
      return;
    }
    this.detector = detector;
    this.gesture.reset();
    this.smoothed = null;
    this.faceCount = 0;
    this.hardStatus = null;
    this.hardMessage = null;
    this.lastFrameAt = performance.now();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.watchdog = setInterval(this.onWatchdog, WATCHDOG_MS);
    if (!document.hidden) detector.start();
    this.publish(true);
  };

  readonly stopCamera = (): void => {
    this.gen++;
    this.emit(this.gesture.interrupt());
    this.releaseCamera();
    this.gesture.reset();
    if (this.stage !== 'done' && this.stage !== 'failed' && this.stage !== 'consent') this.resetCalibrator('consent');
    this.setHard('off', null);
  };

  /** Full teardown (component unmount). */
  readonly dispose = (): void => {
    this.stopCamera();
    this.listeners.clear();
  };

  readonly attachPreview = (el: HTMLVideoElement | null): void => {
    if (this.preview && this.preview !== el) {
      try {
        this.preview.srcObject = null;
      } catch {
        /* detached */
      }
    }
    this.preview = el;
    if (el) this.bindPreview(el);
  };

  private bindPreview(el: HTMLVideoElement) {
    if (!this.stream) return;
    el.muted = true;
    el.playsInline = true;
    if (el.srcObject !== this.stream) el.srcObject = this.stream;
    void el.play().catch(() => {});
  }

  private releaseCamera() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    this.detector?.close();
    this.detector = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    if (this.preview) {
      try {
        this.preview.srcObject = null;
      } catch {
        /* detached */
      }
    }
    this.smoothed = null;
    this.faceCount = 0;
    this.stalled = false;
  }

  private setHard(status: Extract<BlinkStatus, 'off' | 'unsupported' | 'permission-denied' | 'starting'>, message: string | null) {
    this.hardStatus = status;
    this.hardMessage = message;
    if ((status === 'unsupported' || status === 'permission-denied') && CALIBRATING_STAGES.has(this.stage)) {
      this.failCalibration(message ?? STATUS_MESSAGES[status]);
    }
    this.publish(true);
  }

  private readonly onVisibility = () => {
    if (!this.detector) return;
    if (document.hidden) {
      // Hidden tab: stop processing; any pending closure is discarded and can never select.
      this.detector.pause();
      this.emit(this.gesture.interrupt());
      this.smoothed = null;
      this.segmenter?.reset();
      this.stageLastT = null;
      this.publish(true);
    } else {
      this.lastFrameAt = performance.now();
      this.detector.start();
    }
  };

  private readonly onWatchdog = () => {
    if (!this.detector || document.hidden) return;
    const stalled = performance.now() - this.lastFrameAt > STALL_MS;
    if (stalled && !this.stalled) {
      this.stalled = true;
      this.emit(this.gesture.interrupt());
      this.smoothed = null;
      this.publish(true);
    }
    // Detection errors that persist mean the adapter is not usable here.
    if (this.detector.errorCount >= 90) {
      this.releaseCamera();
      this.gesture.reset();
      this.setHard('unsupported', 'Face detection stopped working in this browser. Use keyboard or switch scanning.');
    }
  };

  // ===== Frames =====
  private readonly onFrame = (raw: RawBlinkFrame) => {
    this.lastFrameAt = performance.now(); // processing time; raw.t may be the earlier capture time
    this.stalled = false;
    this.faceCount = raw.faces;
    const single = raw.faces === 1 && raw.score !== null;
    this.smoothed = single ? smoothScore(this.smoothed, raw.score as number) : null;
    const frame: BlinkFrame = { t: raw.t, faces: raw.faces, score: single ? this.smoothed : null };
    this.calibrationFrame(frame);
    this.emit(this.gesture.push(frame));
    this.publish();
  };

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
    this.gesture.setConfig(this.calibration ?? DEFAULT_GESTURE_CONFIG);
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
    if (stage === 'review') this.computeProposal();
    this.publish(true);
  }

  private failCalibration(reason: string) {
    this.stage = 'failed';
    this.failureReason = reason;
    this.proposed = null;
    this.gesture.setConfig(this.calibration ?? DEFAULT_GESTURE_CONFIG);
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

  /** Counts frame time toward a stage only while one face is present and frames are contiguous. */
  private countTime(frame: BlinkFrame): number {
    const last = this.stageLastT;
    this.stageLastT = frame.t;
    if (last === null || frame.faces !== 1 || frame.score === null) return 0;
    const dt = frame.t - last;
    return dt > 0 && dt <= CALIBRATION_TIMING.maxCountedGapMs ? dt : 0;
  }

  private calibrationFrame(f: BlinkFrame) {
    switch (this.stage) {
      case 'position': {
        if (f.faces === 1 && f.score !== null) {
          if (this.positionSince === null) this.positionSince = f.t;
          this.stageProgress = (f.t - this.positionSince) / CALIBRATION_TIMING.positionStableMs;
          if (this.stageProgress >= 1) this.enterStage('baseline', f.t);
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
  readonly begin = (): void => {
    if (this.stage !== 'consent' && this.stage !== 'failed' && this.stage !== 'done') return;
    this.resetCalibrator('position');
    this.publish(true);
    if (!this.stream) void this.startCamera();
  };

  readonly advance = (): void => {
    const t = this.stageLastT;
    switch (this.stage) {
      case 'consent':
        this.begin();
        return;
      case 'position':
        this.enterStage('baseline', null);
        return;
      case 'baseline':
        this.enterStage('natural', null);
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

  readonly restart = (): void => {
    this.resetCalibrator(this.stream ? 'position' : 'consent');
    this.publish(true);
  };

  readonly accept = (): void => {
    if (this.stage !== 'review' || !this.proposed) return;
    this.gesture.setConfig(this.proposed); // practice uses the proposed timing
    this.stage = 'practice-select';
    this.publish(true);
  };

  readonly finishPractice = (): void => {
    if ((this.stage !== 'practice-select' && this.stage !== 'practice-confirm') || !this.proposed) return;
    const c: BlinkCalibration = { ...this.proposed, calibratedAt: Date.now() };
    this.calibration = c;
    saveCalibration(storage(), c);
    this.gesture.setConfig(c);
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

const SERVER_SNAPSHOT: BlinkEngineSnapshot = {
  status: 'off',
  message: STATUS_MESSAGES.off,
  closureProgress: 0,
  eyeScore: null,
  faceCount: 0,
  fps: 0,
  calibration: null,
  cameraOn: false,
  cal: {
    stage: 'consent', progress: 0, instructions: stageInstructions('consent', {}),
    naturalSamplesMs: [], deliberateSamplesMs: [], proposed: null, failureReason: null,
  },
};
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function useBlink(accessMode: AccessMode): BlinkRuntime & { engine: BlinkEngine; cameraOn: boolean } {
  const [engine] = useState(() => new BlinkEngine());
  const snap = useSyncExternalStore(engine.subscribeStore, engine.getSnapshot, getServerSnapshot);
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
      active: accessMode === 'blink' && snap.calibration !== null,
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
