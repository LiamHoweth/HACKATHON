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
  static rejectBitrate = false;
  static lastOptions: Record<string, unknown> | undefined;
  constructor(_stream?: unknown, options?: Record<string, unknown>) {
    if (FakeRecorder.rejectBitrate && options && 'audioBitsPerSecond' in options) throw new DOMException('unsupported', 'NotSupportedError');
    FakeRecorder.made++;
    FakeRecorder.lastOptions = options;
  }
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
  FakeRecorder.rejectBitrate = false;
  FakeRecorder.made = 0;
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

  it('does not end the utterance on a 400 ms mid-sentence pause', async () => {
    const { listener, segments, run } = setup();
    await listener.start();
    run(1000, 0.001);
    run(900, 0.2); // "Are you coming"
    run(400, 0.001); // natural pause
    run(900, 0.2); // "to dinner tonight"
    expect(segments).toHaveLength(0);
    run(VAD.endSilenceMs + 200, 0.001);
    expect(segments).toHaveLength(1);
    expect(segments[0].speechMs).toBeGreaterThanOrEqual(1700);
    listener.stop();
  });

  it('ends the utterance once the trailing silence reaches endSilenceMs, not before', async () => {
    const { listener, segments, run } = setup();
    await listener.start();
    run(1000, 0.001);
    run(1500, 0.2);
    run(VAD.endSilenceMs - 150, 0.001);
    expect(segments).toHaveLength(0);
    run(250, 0.001);
    expect(segments).toHaveLength(1);
    listener.stop();
  });

  it('keeps leading silence short by restarting the idle recorder', async () => {
    const { listener, run } = setup();
    await listener.start();
    const before = FakeRecorder.made;
    run(VAD.idleRestartMs * 3 + 200, 0.001);
    expect(FakeRecorder.made - before).toBeGreaterThanOrEqual(2);
    listener.stop();
  });

  it('asks for a small speech bitrate and falls back when the browser rejects it', async () => {
    const a = setup();
    await a.listener.start();
    expect(FakeRecorder.lastOptions?.audioBitsPerSecond).toBe(VAD.audioBitsPerSecond);
    a.listener.stop();
    vi.unstubAllGlobals();
    FakeRecorder.rejectBitrate = true;
    const b = setup();
    await b.listener.start();
    b.run(500, 0.001);
    b.run(1500, 0.2);
    b.run(VAD.endSilenceMs + 200, 0.001);
    expect(FakeRecorder.lastOptions && 'audioBitsPerSecond' in FakeRecorder.lastOptions).toBe(false);
    expect(b.segments).toHaveLength(1);
    b.listener.stop();
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

describe('continuous listener races and audio session', () => {
  it('stop() while getUserMedia is pending leaves no open mic, timer, or segments', async () => {
    const { listener, segments, run, track } = setup();
    let resolveMedia!: (s: unknown) => void;
    (navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((r) => { resolveMedia = r; }),
    );
    const started = listener.start();
    listener.stop();
    resolveMedia({ getTracks: () => [track] });
    expect(await started).toBe(false);
    expect(track.stop).toHaveBeenCalled();
    expect(listener.status).toBe('off');
    expect(vi.getTimerCount()).toBe(0);
    run(1000, 0.001);
    run(1500, 0.2);
    run(VAD.endSilenceMs + 200, 0.001);
    expect(segments).toHaveLength(0);
  });

  it('stop() while the AudioContext resumes closes everything and returns false', async () => {
    const { listener, track } = setup();
    let resolveResume!: () => void;
    const close = vi.fn(() => Promise.resolve());
    class SlowContext {
      state = 'suspended';
      createMediaStreamSource() { return { connect: () => {} }; }
      createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: () => {} }; }
      resume() { return new Promise<void>((r) => { resolveResume = r; }); }
      close = close;
    }
    vi.stubGlobal('window', { isSecureContext: true, MediaRecorder: FakeRecorder, AudioContext: SlowContext });
    const started = listener.start();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    listener.stop();
    resolveResume();
    expect(await started).toBe(false);
    expect(track.stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(listener.status).toBe('off');
  });

  it('re-asserts play-and-record when resuming after the app spoke', async () => {
    const { listener, audioSession } = setup();
    await listener.start();
    listener.setPaused(true);
    audioSession.type = 'playback'; // the voice player flips it while speaking
    listener.setPaused(false);
    expect(audioSession.type).toBe('play-and-record');
    listener.stop();
  });

  it('re-asserts play-and-record on a tick if something flipped it mid-listen', async () => {
    const { listener, audioSession, run } = setup();
    await listener.start();
    audioSession.type = 'playback';
    run(VAD.tickMs * 2, 0.001);
    expect(audioSession.type).toBe('play-and-record');
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

  it('rejects back-channel-only transcripts regardless of duration', () => {
    for (const text of [
      'Uh huh.',
      'Mm-hmm',
      'uh huh uh huh',
      'Got it!',
      'I see.',
      'WOW',
      'Oh.',
      'Mhm.',
      'Hmm, hmm',
    ]) {
      expect(usableTranscript(text, 300), text).toBe(false);
      expect(usableTranscript(text, 5000), text).toBe(false);
    }
  });

  it('keeps short real answers to something the person asked', () => {
    for (const text of ['Yeah.', 'Sure!', 'Okay.', 'Yep', 'Cool, cool', 'Right?']) {
      expect(usableTranscript(text, 2000), text).toBe(true);
    }
  });

  it('keeps transcripts with real content, including leading back-channels', () => {
    for (const text of [
      'Yeah, are you hungry?',
      'Okay so what time?',
      'Sure, want pizza?',
      'Yes?',
      'No.',
      'Hello',
      'Hey',
      'I see the problem',
      'Right now?',
      'Oh no, I forgot',
      'Got it, thanks',
    ]) {
      expect(usableTranscript(text, 2000), text).toBe(true);
    }
  });
});
