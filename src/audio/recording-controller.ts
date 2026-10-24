// Bounded push-to-record capture. Not always-listening. Owns its tracks and releases them on
// finish, discard, and session end. Rejects empty audio.
import type { Id } from '@/core/types';

export const MAX_RECORDING_MS = 20_000;

const CANDIDATES: Array<{ mimeType: string; ext: string }> = [
  { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
  { mimeType: 'audio/webm', ext: 'webm' },
  { mimeType: 'audio/mp4', ext: 'm4a' },
  { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
];

export function recordingSupported(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.isSecureContext === true &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof window.MediaRecorder === 'function'
    );
  } catch {
    return false;
  }
}

export function pickFormat(): { mimeType: string; ext: string } | null {
  try {
    for (const c of CANDIDATES) if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  } catch {
    /* ignore */
  }
  return null;
}

function extFor(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base === 'audio/mp4' || base === 'audio/x-m4a') return 'm4a';
  if (base === 'audio/ogg') return 'ogg';
  return 'webm';
}

export type Capture = { captureId: Id; blob: Blob; filename: string; mimeType: string };
export type StartResult = { ok: true; captureId: Id } | { ok: false; cancelled: boolean; message: string };
export type FinishResult = { ok: true; capture: Capture } | { ok: false; message: string };

type Session = {
  token: number;
  captureId: Id;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  mimeType: string;
  ext: string;
  autoStop: ReturnType<typeof setTimeout> | null;
};

export class RecordingController {
  private token = 0;
  private session: Session | null = null;
  status: 'idle' | 'requesting' | 'recording' | 'stopping' = 'idle';

  /** onAutoStop fires once when the maximum duration is reached; the owner then calls finish(). */
  constructor(private newId: () => Id, private onAutoStop: () => void) {}

  get currentCaptureId(): Id | null {
    return this.session?.captureId ?? null;
  }

  async start(): Promise<StartResult> {
    if (!recordingSupported()) return { ok: false, cancelled: false, message: 'Recording is not available in this browser. Type the message instead.' };
    if (this.status !== 'idle') return { ok: false, cancelled: true, message: 'Already recording.' };
    const format = pickFormat();
    const token = ++this.token;
    const session: Session = {
      token, captureId: this.newId(), stream: null, recorder: null, chunks: [],
      mimeType: format?.mimeType ?? '', ext: format?.ext ?? 'webm', autoStop: null,
    };
    this.session = session;
    this.status = 'requesting';
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      if (this.token === token) this.reset();
      const name = err instanceof DOMException ? err.name : '';
      const message =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission was not given. Type the message instead.'
          : name === 'NotFoundError'
            ? 'No microphone was found. Type the message instead.'
            : 'Could not start the microphone. Type the message instead.';
      return { ok: false, cancelled: this.token !== token, message };
    }
    if (this.token !== token) {
      // Discarded while the permission prompt was open.
      stream.getTracks().forEach((t) => t.stop());
      return { ok: false, cancelled: true, message: 'Recording cancelled.' };
    }
    session.stream = stream;
    try {
      const recorder = session.mimeType ? new MediaRecorder(stream, { mimeType: session.mimeType }) : new MediaRecorder(stream);
      if (!session.mimeType && recorder.mimeType) {
        session.mimeType = recorder.mimeType;
        session.ext = extFor(recorder.mimeType);
      }
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) session.chunks.push(e.data);
      };
      // Unplugged device or revoked permission: stop safely; the owner sees an empty/short capture.
      stream.getTracks().forEach((t) => {
        t.onended = () => {
          if (this.session === session && this.status === 'recording') this.onAutoStop();
        };
      });
      session.recorder = recorder;
      recorder.start(250);
    } catch {
      this.reset();
      return { ok: false, cancelled: false, message: 'Could not start recording. Type the message instead.' };
    }
    session.autoStop = setTimeout(() => {
      if (this.session === session && this.status === 'recording') this.onAutoStop();
    }, MAX_RECORDING_MS);
    this.status = 'recording';
    return { ok: true, captureId: session.captureId };
  }

  async finish(): Promise<FinishResult> {
    const session = this.session;
    if (!session || this.status !== 'recording' || !session.recorder) return { ok: false, message: 'Nothing is being recorded.' };
    this.status = 'stopping';
    const recorder = session.recorder;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      recorder.addEventListener('stop', done, { once: true });
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        else resolve();
      } catch {
        resolve();
      }
      setTimeout(done, 2000); // never hang on a misbehaving engine
    });
    if (this.session !== session) return { ok: false, message: 'Recording discarded.' };
    const blob = new Blob(session.chunks, { type: session.mimeType || 'audio/webm' });
    const capture: Capture = { captureId: session.captureId, blob, filename: `capture.${session.ext}`, mimeType: blob.type };
    this.reset();
    if (blob.size === 0) return { ok: false, message: 'No audio was captured. Try again or type the message.' };
    return { ok: true, capture };
  }

  /** Stop capture and drop all audio. Safe to call at any time. Returns whether anything was active. */
  discard(): boolean {
    const wasActive = this.status !== 'idle';
    this.token++;
    this.reset();
    return wasActive;
  }

  private reset() {
    const s = this.session;
    this.session = null;
    this.status = 'idle';
    if (!s) return;
    if (s.autoStop) clearTimeout(s.autoStop);
    try {
      if (s.recorder && s.recorder.state !== 'inactive') {
        s.recorder.ondataavailable = null;
        s.recorder.stop();
      }
    } catch {
      /* ignore */
    }
    s.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    s.chunks = [];
  }
}
