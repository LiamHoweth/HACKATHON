import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordingController } from '@/audio/recording-controller';

// iPad regression: the voice player leaves navigator.audioSession.type = 'playback', which makes
// WebKit refuse getUserMedia({audio}). Recording must switch to play-and-record and restore it.
class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/mp4';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  private listeners: Array<() => void> = [];
  static isTypeSupported = (t: string) => t === 'audio/mp4';
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/mp4' }) });
    this.listeners.forEach((l) => l());
  }
  addEventListener(_: string, l: () => void) { this.listeners.push(l); }
}

function install() {
  const audioSession = { type: 'playback' };
  const seen: string[] = [];
  const track = { stop: vi.fn(), onended: null };
  vi.stubGlobal('window', { isSecureContext: true, MediaRecorder: FakeRecorder });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('navigator', {
    audioSession,
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        seen.push(audioSession.type);
        if (audioSession.type === 'playback') throw new DOMException('capture blocked', 'InvalidStateError');
        return { getTracks: () => [track] };
      }),
    },
  });
  return { audioSession, seen };
}

afterEach(() => vi.unstubAllGlobals());

describe('recording and the iPad audio session', () => {
  it('records under play-and-record and restores playback after finishing', async () => {
    const { audioSession, seen } = install();
    const rc = new RecordingController(() => 'c1', () => {});
    const started = await rc.start();
    expect(started.ok).toBe(true);
    expect(seen).toEqual(['play-and-record']);
    const done = await rc.finish();
    expect(done.ok).toBe(true);
    expect(audioSession.type).toBe('playback');
  });

  it('restores playback after a discard', async () => {
    const { audioSession } = install();
    const rc = new RecordingController(() => 'c1', () => {});
    await rc.start();
    rc.discard();
    expect(audioSession.type).toBe('playback');
  });
});
