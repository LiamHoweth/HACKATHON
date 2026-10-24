import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContinuousListener, usableTranscript, VAD, type ListenerSegment } from '@/audio/continuous-listener';

// Drives the voice detector with a scripted loudness level and a fake clock.
class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/mp4';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  private stopListeners: Array<() => void> = [];
  static isTypeSupported = (t: string) => t === 'audio/mp4';
  static made = 0;
  constructor() { FakeRecorder.made++; }
  start() { this.state = 'recording'; }
  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/mp4' }) });
    this.stopListeners.forEach((l) => l());
  }
  addEventListener(_: string, l: () => void) { this.stopListeners.push(l); }
}

function setup() {
  let level = 0.001;
  let clock = 0;
  const audioSession = { type: 'playback' };
  const analyser = {
    fftSize: 1024,
    getFloatTimeDomainData: (buf: Float32Array) => buf.fill(level),
  };
  class FakeContext {
    state = 'running';
    createMediaStreamSource() { return { connect: () => {} }; }
    createAnalyser() { return analyser; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  const track = { stop: vi.fn() };
  vi.stubGlobal('window', { isSecureContext: true, MediaRecorder: FakeRecorder, AudioContext: FakeContext });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('navigator', { audioSession, mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } });
  vi.useFakeTimers();
  const segments: ListenerSegment[] = [];
  const listener = new ContinuousListener((s) => segments.push(s), () => {}, () => clock);
  const run = (ms: number, lvl: number) => {
    level = lvl;
    for (let t = 0; t < ms; t += VAD.tickMs) {
      clock += VAD.tickMs;
      vi.advanceTimersByTime(VAD.tickMs);
    }
  };
  return { listener, segments, run, audioSession, track };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('continuous listener', () => {
  it('emits one segment per utterance after the trailing silence', async () => {
    const { listener, segments, run, audioSession } = setup();
    await listener.start();
    expect(audioSession.type).toBe('play-and-record');
    run(1000, 0.001); // quiet room
    run(1500, 0.2); // partner talks
    expect(segments).toHaveLength(0);
    run(VAD.endSilenceMs + 200, 0.001);
    expect(segments).toHaveLength(1);
    expect(segments[0].speechMs).toBeGreaterThanOrEqual(1400);
    listener.stop();
    expect(audioSession.type).toBe('playback');
  });

  it('ignores short noise blips', async () => {
    const { listener, segments, run } = setup();
    await listener.start();
    run(1000, 0.001);
    run(200, 0.2);
    run(1500, 0.001);
    expect(segments).toHaveLength(0);
    listener.stop();
  });

  it('drops audio and emits nothing while paused (the app is speaking)', async () => {
    const { listener, segments, run } = setup();
    await listener.start();
    run(500, 0.001);
    listener.setPaused(true);
    run(2000, 0.2);
    run(1500, 0.001);
    expect(segments).toHaveLength(0);
    listener.setPaused(false);
    run(1500, 0.2);
    run(1200, 0.001);
    expect(segments).toHaveLength(1);
    listener.stop();
  });

  it('adapts to steady background noise', async () => {
    const { listener, segments, run } = setup();
    await listener.start();
    run(8000, 0.03); // constant loud hum: becomes the floor, not speech... after adapting
    const before = segments.length;
    run(4000, 0.03);
    expect(segments.length).toBe(before);
    listener.stop();
  });
});

describe('usableTranscript', () => {
  it('rejects empty and typical noise hallucinations on short audio', () => {
    expect(usableTranscript('', 2000)).toBe(false);
    expect(usableTranscript('...', 2000)).toBe(false);
    expect(usableTranscript('Thank you.', 600)).toBe(false);
    expect(usableTranscript('Thank you.', 2000)).toBe(true);
    expect(usableTranscript('Are you hungry?', 900)).toBe(true);
  });
});
