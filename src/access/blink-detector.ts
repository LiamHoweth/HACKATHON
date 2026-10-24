// MediaPipe FaceLandmarker wrapper for the blink adapter. Browser-only; loaded lazily with a
// dynamic import after the user explicitly starts the camera, so the WASM runtime and model are
// never fetched during SSR or before consent. Assets are served from this origin (pinned
// @mediapipe/tasks-vision 1.1.1 in /wasm, face_landmarker float16/1 in /models). Frames are
// processed in the page and never leave the device.
//
// Frame loop: requestAnimationFrame, throttled to ~15 processed fps. detectForVideo is
// synchronous, so a slow frame simply delays the next one: frames are skipped, never queued.
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type RawBlinkFrame = { t: number; faces: number; score: number | null };

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

/** Eye-closure score for the first face: min(eyeBlinkLeft, eyeBlinkRight), so winks never count. */
export function eyeClosureFromResult(result: FaceLandmarkerResult): { faces: number; score: number | null } {
  const faces = result.faceLandmarks?.length ?? 0;
  if (faces === 0) return { faces, score: null };
  const cats = result.faceBlendshapes?.[0]?.categories;
  if (!cats || cats.length === 0) return { faces, score: null };
  let left: number | null = null;
  let right: number | null = null;
  for (const c of cats) {
    if (c.categoryName === 'eyeBlinkLeft') left = c.score;
    else if (c.categoryName === 'eyeBlinkRight') right = c.score;
  }
  if (left === null || right === null) return { faces, score: null };
  return { faces, score: Math.min(left, right) };
}

async function createLandmarker(wasmBase: string, modelPath: string): Promise<{ landmarker: FaceLandmarker; delegate: 'GPU' | 'CPU' }> {
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: modelPath, delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 2, // needed to notice a second face; one-face mode cannot establish exclusivity
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
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

  private constructor(
    private landmarker: FaceLandmarker,
    private video: HTMLVideoElement,
    private opts: BlinkDetectorOptions,
    readonly delegate: 'GPU' | 'CPU',
  ) {
    this.minIntervalMs = 1000 / Math.max(1, opts.targetFps ?? 15);
  }

  static async create(video: HTMLVideoElement, opts: BlinkDetectorOptions): Promise<BlinkDetector> {
    const { landmarker, delegate } = await createLandmarker(opts.wasmBase ?? BLINK_ASSETS.wasmBase, opts.modelPath ?? BLINK_ASSETS.modelPath);
    return new BlinkDetector(landmarker, video, opts, delegate);
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
    this.schedule();
  }

  pause(): void {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
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

  private readonly tick = () => {
    this.raf = null;
    if (!this.running) return;
    const now = performance.now();
    const v = this.video;
    if (now - this.lastProcessed >= this.minIntervalMs - 1 && v.readyState >= 2 && v.videoWidth > 0 && v.currentTime !== this.lastVideoTime) {
      this.lastProcessed = now;
      this.lastVideoTime = v.currentTime;
      // MediaPipe VIDEO mode requires strictly increasing timestamps.
      const ts = Math.max(Math.round(now), this.lastTs + 1);
      this.lastTs = ts;
      let frame: RawBlinkFrame | null = null;
      try {
        const result = this.landmarker.detectForVideo(v, ts);
        frame = { t: now, ...eyeClosureFromResult(result) };
        this.consecutiveErrors = 0;
      } catch (e) {
        this.consecutiveErrors += 1;
        if (this.consecutiveErrors === 1 || this.consecutiveErrors % 30 === 0) this.opts.onError?.(e);
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
