// MediaPipe FaceLandmarker wrapper for the blink adapter. Browser-only; loaded lazily with a
// dynamic import after the user explicitly starts the camera, so the WASM runtime and model are
// never fetched during SSR or before consent. Assets are served from this origin (pinned
// @mediapipe/tasks-vision 1.1.1 in /wasm, face_landmarker float16/1 in /models). Frames are
// processed in the page and never leave the device.
//
// Signals per frame: eye-closure (blink SELECT) and both-brow raise (eyebrow NEXT), see
// eyeClosureFromCategories / browRaiseFromCategories below.
//
// Frame loop: requestAnimationFrame, throttled to ~15 processed fps. detectForVideo is
// synchronous, so a slow frame simply delays the next one: frames are skipped, never queued.
// Frame timestamps: when the browser supports requestVideoFrameCallback, each frame is stamped
// with its camera capture time (performance timeline) instead of the later processing time, so
// closure onsets line up better with what was highlighted. Timestamps stay strictly increasing.
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { FaceSelector, type FaceSelection } from './face-selector';

/**
 * One processed camera frame. `score` is the eye-closure score (0 open … 1 closed); `brow` is the
 * raw (unsmoothed) both-brow raise score 0..1. Both are null when no face / blendshapes.
 */
export type RawBlinkFrame = {
  t: number;
  /** Faces handed to the gesture machines: 1 when a face is being followed this frame, else 0 (or the real count from legacy callers). */
  faces: number;
  score: number | null;
  brow: number | null;
  /** jawOpen blendshape 0..1 (jaw-drop BACK); null/absent when unavailable (legacy callers). */
  jaw?: number | null;
  /** Faces actually visible in the camera frame (display only). Defaults to `faces`. */
  faceCount?: number;
  /** The followed face changed to a different person on this frame: drop any in-progress gesture. */
  switched?: boolean;
};

export type BlinkDetectorOptions = {
  onFrame: (frame: RawBlinkFrame) => void;
  onError?: (error: unknown) => void;
  wasmBase?: string;
  modelPath?: string;
  targetFps?: number;
};

export const BLINK_ASSETS = {
  wasmBase: '/wasm',
  modelPath: '/models/face_landmarker.task',
} as const;

type Category = { categoryName: string; score: number };

const finite01 = (x: number | null): number | null => (x === null || !Number.isFinite(x) ? null : x < 0 ? 0 : x > 1 ? 1 : x);

/** Eye-closure score from blendshapes: min(eyeBlinkLeft, eyeBlinkRight), so winks never count. */
export function eyeClosureFromCategories(cats: readonly Category[]): number | null {
  let left: number | null = null;
  let right: number | null = null;
  for (const c of cats) {
    if (c.categoryName === 'eyeBlinkLeft') left = c.score;
    else if (c.categoryName === 'eyeBlinkRight') right = c.score;
  }
  if (left === null || right === null) return null;
  return finite01(Math.min(left, right));
}

/**
 * Both-brow raise score from blendshapes (verified present in face_landmarker float16/1):
 * max(browInnerUp, mean(browOuterUpLeft, browOuterUpRight)).
 * - browInnerUp alone is the strongest single raise signal but also moves with worry/speech;
 *   the outer pair captures people whose raise is mostly lateral.
 * - Using the MEAN of the outer pair (not max) means a one-sided raise counts only half, so the
 *   gesture is "both eyebrows", matching the instruction we show.
 * - max() of the two components lets either raise style reach the calibrated threshold.
 * Returns null when any of the three is missing. Smoothing is applied by the engine (EMA), not
 * here, so this stays a pure per-frame function. Values are blendshape coefficients, not
 * probabilities of intent; calibration sets per-person thresholds.
 */
export function browRaiseFromCategories(cats: readonly Category[]): number | null {
  let inner: number | null = null;
  let outerL: number | null = null;
  let outerR: number | null = null;
  for (const c of cats) {
    if (c.categoryName === 'browInnerUp') inner = c.score;
    else if (c.categoryName === 'browOuterUpLeft') outerL = c.score;
    else if (c.categoryName === 'browOuterUpRight') outerR = c.score;
  }
  if (inner === null || outerL === null || outerR === null) return null;
  return finite01(Math.max(inner, (outerL + outerR) / 2));
}

/** Jaw-drop score from blendshapes: the `jawOpen` coefficient (0 closed … 1 wide open), or null. */
export function jawOpenFromCategories(cats: readonly Category[]): number | null {
  for (const c of cats) if (c.categoryName === 'jawOpen') return finite01(c.score);
  return null;
}

/** Face count plus eye-closure, brow-raise and jaw-open scores for the face at `index` (default: the first). */
export function faceSignalsFromResult(
  result: FaceLandmarkerResult, index = 0,
): { faces: number; score: number | null; brow: number | null; jaw: number | null } {
  const faces = result.faceLandmarks?.length ?? 0;
  if (faces === 0) return { faces, score: null, brow: null, jaw: null };
  const cats = result.faceBlendshapes?.[index]?.categories;
  if (!cats || cats.length === 0) return { faces, score: null, brow: null, jaw: null };
  return { faces, score: eyeClosureFromCategories(cats), brow: browRaiseFromCategories(cats), jaw: jawOpenFromCategories(cats) };
}

/**
 * Engine frame for one detection result, following the single face chosen by `selection`.
 * Several visible faces still report `faces: 1` (the followed one); `faceCount` keeps the real number.
 * No followed face (none visible, or the locked face briefly missing) reports `faces: 0`.
 */
export function selectedFaceFrame(result: FaceLandmarkerResult, selection: FaceSelection): Omit<RawBlinkFrame, 't'> {
  if (selection.index === null) return { faces: 0, score: null, brow: null, jaw: null, faceCount: selection.count, switched: selection.switched };
  const { score, brow, jaw } = faceSignalsFromResult(result, selection.index);
  return { faces: 1, score, brow, jaw, faceCount: selection.count, switched: selection.switched };
}

/** Eye-closure score for the first face (kept for existing callers). */
export function eyeClosureFromResult(result: FaceLandmarkerResult): { faces: number; score: number | null } {
  const { faces, score } = faceSignalsFromResult(result);
  return { faces, score };
}

/** Capture metadata older than this (relative to processing) is not trusted for the frame. */
export const MAX_CAPTURE_AGE_MS = 250;

/**
 * Timestamp for a processed frame: the camera capture time when it is known, recent and not in
 * the future, else the processing time. Always strictly greater than `lastT` (the gesture
 * machine treats a non-increasing timestamp as stale).
 */
export function frameTimestamp(processedAt: number, captureTime: number | null, lastT: number): number {
  let t = processedAt;
  if (captureTime !== null && Number.isFinite(captureTime) && captureTime <= processedAt
    && processedAt - captureTime <= MAX_CAPTURE_AGE_MS && captureTime > lastT) {
    t = captureTime;
  }
  return t > lastT ? t : lastT + 0.01;
}

/** Consecutive GPU-delegate frame errors that trigger one rebuild on the CPU delegate. */
export const GPU_FALLBACK_ERRORS = 10;

async function createLandmarker(wasmBase: string, modelPath: string, cpuOnly = false): Promise<{ landmarker: FaceLandmarker; delegate: 'GPU' | 'CPU' }> {
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: modelPath, delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 3, // several faces are tracked so FaceSelector can follow one (longest in frame, most central)
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
  if (cpuOnly) return { landmarker: await FaceLandmarker.createFromOptions(fileset, options('CPU')), delegate: 'CPU' };
  try {
    return { landmarker: await FaceLandmarker.createFromOptions(fileset, options('GPU')), delegate: 'GPU' };
  } catch {
    return { landmarker: await FaceLandmarker.createFromOptions(fileset, options('CPU')), delegate: 'CPU' };
  }
}

export class BlinkDetector {
  private running = false;
  private raf: number | null = null;
  private lastProcessed = -Infinity;
  private lastTs = 0;
  private lastVideoTime = -1;
  private closed = false;
  private frameTimes: number[] = [];
  private consecutiveErrors = 0;
  private readonly minIntervalMs: number;
  private vfc: number | null = null;
  private captureTime: number | null = null;
  private lastFrameT = -Infinity;
  private rebuilding = false;
  private rebuiltOnCpu = false;
  private readonly selector = new FaceSelector();

  private constructor(
    private landmarker: FaceLandmarker,
    private video: HTMLVideoElement,
    private opts: BlinkDetectorOptions,
    private delegateUsed: 'GPU' | 'CPU',
  ) {
    this.minIntervalMs = 1000 / Math.max(1, opts.targetFps ?? 15);
  }

  static async create(video: HTMLVideoElement, opts: BlinkDetectorOptions): Promise<BlinkDetector> {
    const { landmarker, delegate } = await createLandmarker(opts.wasmBase ?? BLINK_ASSETS.wasmBase, opts.modelPath ?? BLINK_ASSETS.modelPath);
    return new BlinkDetector(landmarker, video, opts, delegate);
  }

  get delegate(): 'GPU' | 'CPU' {
    return this.delegateUsed;
  }

  /**
   * GPU runtime failure (e.g. a lost WebGL context on iPad Safari makes detectForVideo throw):
   * rebuild the landmarker ONCE on the CPU delegate. Frames are skipped while rebuilding. If the
   * CPU build also fails, errors keep accumulating and the engine reports 'unsupported'.
   */
  private rebuildOnCpu() {
    if (this.rebuilding || this.rebuiltOnCpu || this.closed || this.delegateUsed !== 'GPU') return;
    this.rebuilding = true;
    this.rebuiltOnCpu = true;
    const old = this.landmarker;
    createLandmarker(this.opts.wasmBase ?? BLINK_ASSETS.wasmBase, this.opts.modelPath ?? BLINK_ASSETS.modelPath, true)
      .then(({ landmarker, delegate }) => {
        if (this.closed) {
          landmarker.close();
          return;
        }
        this.landmarker = landmarker;
        this.delegateUsed = delegate;
        this.consecutiveErrors = 0;
        try {
          old.close();
        } catch {
          /* already released */
        }
      })
      .catch((e) => this.opts.onError?.(e))
      .finally(() => {
        this.rebuilding = false;
      });
  }

  /** Measured processed frames per second over the last ~2 s. */
  get fps(): number {
    const n = this.frameTimes.length;
    if (n < 2) return 0;
    const span = this.frameTimes[n - 1] - this.frameTimes[0];
    return span > 0 ? ((n - 1) * 1000) / span : 0;
  }

  start(): void {
    if (this.closed || this.running) return;
    this.running = true;
    this.lastFrameT = -Infinity;
    this.captureTime = null;
    this.scheduleVideoFrame();
    this.schedule();
  }

  pause(): void {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.vfc !== null && typeof this.video.cancelVideoFrameCallback === 'function') this.video.cancelVideoFrameCallback(this.vfc);
    this.vfc = null;
    this.frameTimes = [];
  }

  close(): void {
    this.pause();
    if (this.closed) return;
    this.closed = true;
    try {
      this.landmarker.close();
    } catch {
      /* already released */
    }
  }

  private schedule() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private scheduleVideoFrame() {
    if (!this.running || typeof this.video.requestVideoFrameCallback !== 'function') return;
    this.vfc = this.video.requestVideoFrameCallback(this.onVideoFrame);
  }

  private readonly onVideoFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
    this.vfc = null;
    if (!this.running) return;
    this.captureTime = typeof meta.captureTime === 'number' && Number.isFinite(meta.captureTime) ? meta.captureTime : null;
    this.scheduleVideoFrame();
  };

  private readonly tick = () => {
    this.raf = null;
    if (!this.running) return;
    const now = performance.now();
    const v = this.video;
    if (!this.rebuilding && now - this.lastProcessed >= this.minIntervalMs - 1 && v.readyState >= 2 && v.videoWidth > 0 && v.currentTime !== this.lastVideoTime) {
      this.lastProcessed = now;
      this.lastVideoTime = v.currentTime;
      // MediaPipe VIDEO mode requires strictly increasing timestamps.
      const ts = Math.max(Math.round(now), this.lastTs + 1);
      this.lastTs = ts;
      let frame: RawBlinkFrame | null = null;
      try {
        const result = this.landmarker.detectForVideo(v, ts);
        const t = frameTimestamp(now, this.captureTime, this.lastFrameT);
        this.lastFrameT = t;
        const selection = this.selector.select((result.faceLandmarks ?? []).map((landmarks) => ({ landmarks })), t);
        frame = { t, ...selectedFaceFrame(result, selection) };
        this.consecutiveErrors = 0;
      } catch (e) {
        this.consecutiveErrors += 1;
        if (this.consecutiveErrors === 1 || this.consecutiveErrors % 30 === 0) this.opts.onError?.(e);
        if (this.consecutiveErrors >= GPU_FALLBACK_ERRORS && this.delegateUsed === 'GPU' && !this.rebuiltOnCpu) this.rebuildOnCpu();
      }
      if (frame) {
        this.frameTimes.push(now);
        while (this.frameTimes.length > 2 && now - this.frameTimes[0] > 2000) this.frameTimes.shift();
        this.opts.onFrame(frame);
      }
    }
    this.schedule();
  };

  get errorCount(): number {
    return this.consecutiveErrors;
  }
}
