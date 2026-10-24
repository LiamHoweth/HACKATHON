// Hands-free partner listening for the conversational demo. The microphone stays open while
// enabled; a simple energy-based voice detector cuts each utterance into its own recording, which
// the owner transcribes and submits. Paused (and any partial audio dropped) while the app speaks,
// so Still Here never hears its own voice. Nothing is stored; segments go only to the owner.
import { enterRecordSession, pickFormat, recordingSupported, restoreAudioSession } from './recording-controller';

export type ListenerStatus = 'off' | 'starting' | 'listening' | 'hearing' | 'paused' | 'error';
export type ListenerSegment = { blob: Blob; mimeType: string; ext: string; speechMs: number };

export const VAD = {
  tickMs: 50,
  /** Consecutive loud ticks before an utterance starts. */
  onsetTicks: 3,
  /** Loudness must exceed the noise floor by this factor to start / continue an utterance. */
  onsetFactor: 3,
  sustainFactor: 2,
  minOnsetRms: 0.02,
  minSustainRms: 0.012,
  /** Silence that ends an utterance. Pauses between words stay under ~500 ms, so this cuts the wait without splitting sentences. */
  endSilenceMs: 650,
  /** Shorter than this (loud time) is treated as a noise blip and dropped. */
  minSpeechMs: 450,
  maxUtteranceMs: 15_000,
  /** While nobody talks, restart the recorder this often so leading silence stays short. */
  idleRestartMs: 2_000,
  /** Speech-quality AAC/Opus bitrate: smaller uploads, no audible loss for transcription. */
  audioBitsPerSecond: 48_000,
};

type Recorder = { rec: MediaRecorder; chunks: Blob[]; startedAt: number };

export class ContinuousListener {
  status: ListenerStatus = 'off';
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private recorder: Recorder | null = null;
  private format: { mimeType: string; ext: string } | null = null;
  private previousSession: string | null = null;
  private paused = false;
  private startRun = 0;
  private floor = 0.01;
  private loudTicks = 0;
  private inSpeech = false;
  private speechStart = 0;
  private lastLoud = 0;
  private speechMs = 0;

  constructor(
    private onSegment: (seg: ListenerSegment) => void,
    private onStatus: (status: ListenerStatus, message?: string) => void,
    private now: () => number = () => performance.now(),
  ) {}

  async start(): Promise<boolean> {
    if (this.status !== 'off' && this.status !== 'error') return true;
    if (!recordingSupported()) return this.fail('Listening is not available in this browser. Type instead.');
    this.set('starting');
    const run = ++this.startRun;
    // stop() (or a newer start()) while a permission prompt / resume is pending supersedes this run.
    const superseded = () => this.startRun !== run || this.status !== 'starting';
    this.previousSession = enterRecordSession();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      if (superseded()) return false;
      const name = err instanceof DOMException ? err.name : '';
      this.teardown();
      return this.fail(name === 'NotAllowedError'
        ? 'Microphone permission was not given. Allow it in Settings, or type instead.'
        : 'Could not start the microphone. Type instead.');
    }
    if (superseded()) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = stream;
    let ctx: AudioContext | null = null;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      this.ctx = ctx;
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      if (superseded()) {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
        return false;
      }
      const source = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      source.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
    } catch {
      if (superseded()) {
        stream.getTracks().forEach((t) => t.stop());
        void ctx?.close().catch(() => {});
        return false;
      }
      this.teardown();
      return this.fail('Could not start listening. Type instead.');
    }
    this.format = pickFormat();
    this.resetVad();
    this.restartRecorder();
    this.timer = setInterval(() => this.tick(), VAD.tickMs);
    this.set(this.paused ? 'paused' : 'listening');
    return true;
  }

  stop(): void {
    this.teardown();
    this.set('off');
  }

  /** Pause while the app is speaking (or another recording is active). Drops partial audio. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (this.status === 'off' || this.status === 'error' || this.status === 'starting') return;
    if (paused) {
      this.resetVad();
      this.dropRecorder();
      this.set('paused');
    } else {
      this.ensureRecordSession();
      this.resetVad();
      this.restartRecorder();
      this.set('listening');
    }
  }

  private tick(): void {
    if (!this.analyser || !this.buf || this.paused) return;
    this.ensureRecordSession();
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {});
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    const t = this.now();

    if (!this.inSpeech) {
      const onset = Math.max(this.floor * VAD.onsetFactor, VAD.minOnsetRms);
      if (rms > onset) this.loudTicks++;
      else {
        this.loudTicks = 0;
        // Track steady background noise slowly so a noisy room does not trigger.
        this.floor = Math.max(0.002, this.floor * 0.97 + rms * 0.03);
      }
      if (this.loudTicks >= VAD.onsetTicks) {
        this.inSpeech = true;
        this.speechStart = t - VAD.onsetTicks * VAD.tickMs;
        this.lastLoud = t;
        this.speechMs = VAD.onsetTicks * VAD.tickMs;
        this.set('hearing');
      } else if (this.recorder && this.loudTicks === 0 && t - this.recorder.startedAt > VAD.idleRestartMs) {
        // Never swap recorders while a possible onset is building, or its first phoneme could be lost.
        this.restartRecorder();
      }
      return;
    }

    if (rms > Math.max(this.floor * VAD.sustainFactor, VAD.minSustainRms)) {
      this.lastLoud = t;
      this.speechMs += VAD.tickMs;
    }
    if (t - this.lastLoud >= VAD.endSilenceMs || t - this.speechStart >= VAD.maxUtteranceMs) {
      const speechMs = this.speechMs;
      this.resetVad();
      if (speechMs >= VAD.minSpeechMs) this.emitRecorder(speechMs);
      else this.restartRecorder();
      this.set('listening');
    }
  }

  /** The voice player may flip the session back to 'playback', which makes WebKit refuse capture. */
  private ensureRecordSession() {
    const session = typeof navigator !== 'undefined' ? (navigator as Navigator & { audioSession?: { type: string } }).audioSession : undefined;
    if (!session || session.type === 'play-and-record') return;
    try { session.type = 'play-and-record'; } catch { /* ignore */ }
  }

  private resetVad() {
    this.inSpeech = false;
    this.loudTicks = 0;
    this.speechMs = 0;
  }

  private newRecorder(): Recorder | null {
    if (!this.stream) return null;
    try {
      const rec = this.createMediaRecorder(this.stream);
      const r: Recorder = { rec, chunks: [], startedAt: this.now() };
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) r.chunks.push(e.data); };
      rec.start();
      return r;
    } catch {
      return null;
    }
  }

  /** Small bitrate when the browser accepts it; falls back to the browser defaults when it throws. */
  private createMediaRecorder(stream: MediaStream): MediaRecorder {
    const mimeType = this.format?.mimeType;
    try {
      return new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: VAD.audioBitsPerSecond });
    } catch {
      return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    }
  }

  private restartRecorder() {
    this.dropRecorder();
    this.recorder = this.newRecorder();
  }

  private dropRecorder() {
    const r = this.recorder;
    this.recorder = null;
    if (!r) return;
    r.rec.ondataavailable = null;
    try { if (r.rec.state !== 'inactive') r.rec.stop(); } catch { /* ignore */ }
  }

  private emitRecorder(speechMs: number) {
    const r = this.recorder;
    this.recorder = this.newRecorder(); // keep listening while this one finalizes
    if (!r) return;
    const finish = () => {
      const mimeType = r.rec.mimeType || this.format?.mimeType || 'audio/mp4';
      const blob = new Blob(r.chunks, { type: mimeType });
      if (blob.size > 0) this.onSegment({ blob, mimeType: blob.type, ext: extFor(mimeType), speechMs });
    };
    r.rec.addEventListener('stop', finish, { once: true });
    try { r.rec.stop(); } catch { /* ignore */ }
  }

  private teardown() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.dropRecorder();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
    this.buf = null;
    restoreAudioSession(this.previousSession);
    this.previousSession = null;
    this.resetVad();
  }

  private fail(message: string): false {
    this.set('error', message);
    return false;
  }

  private set(status: ListenerStatus, message?: string) {
    this.status = status;
    this.onStatus(status, message);
  }
}

function extFor(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base === 'audio/mp4' || base === 'audio/x-m4a') return 'm4a';
  if (base === 'audio/ogg') return 'ogg';
  return 'webm';
}

/** Transcripts the speech model tends to invent from noise or silence. */
const HALLUCINATIONS = /^(thank you|thanks|thanks for watching|you|bye|okay|uh|um|hmm)[.!?]*$/i;

/**
 * Back-channel filler ("uh huh", "mm-hmm", "got it"...). A transcript made
 * only of these (repeats allowed) is never a real partner line, whatever its
 * duration. Deliberately excludes yes/no/yeah/sure/okay/hello/hey: those can be
 * real answers to something the person asked, or greetings. Matched on normalized text (lowercase, punctuation
 * and hyphens turned into spaces).
 */
const BACKCHANNEL_PHRASES = [
  'uh huh',
  'mm hmm',
  'mm hm',
  'mmhmm',
  'mhm',
  'hmm',
  'oh',
  'ah',
  'wow',
  'got it',
  'i see',
];
const BACKCHANNEL_ONLY = new RegExp(`^(?:(?:${BACKCHANNEL_PHRASES.join('|')})(?:\\s+|$))+$`);

function isBackchannelOnly(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return normalized !== '' && BACKCHANNEL_ONLY.test(normalized);
}

/** True when a transcript is worth submitting as a partner line. */
export function usableTranscript(text: string, speechMs: number): boolean {
  const t = text.trim();
  if (!/[a-z0-9]/i.test(t)) return false;
  if (isBackchannelOnly(t)) return false;
  if (speechMs < 1200 && HALLUCINATIONS.test(t)) return false;
  return true;
}
