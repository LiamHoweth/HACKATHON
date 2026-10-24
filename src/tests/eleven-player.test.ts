// ElevenLabs natural-voice player: exact text, idempotency, Stop/late results, autoplay block,
// server errors, completion only on `ended`, watchdog, and preview isolation (TTS-03..05, TTS-07).
// Fake fetch + fake audio element + fake timers; proves client plumbing only, not real audio.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ElevenPlayer, MESSAGES, NATURAL_VOICE_TEST_TEXT, PLAYING_WATCHDOG_MS, VOICE_TEST_PREFIX,
  silentWavDataUri, type AudioLike, type ElevenListener,
} from '@/audio/eleven-player';
import { EffectsRunner } from '@/runtime/effects-runner';
import { ACCESS_HEADER } from '@/runtime/contract';
import type { ConfirmedUtterance, SpeechRequest } from '@/core/types';
import type { Action, Effect, State } from '@/core/state';

type Handler = (ev: unknown) => void;

class FakeAudio implements AudioLike {
  src = '';
  currentTime = 0;
  playsInline = false;
  muted = false;
  preload = '';
  paused = true;
  plays: string[] = [];
  playImpl: () => Promise<void> = () => Promise.resolve();
  private handlers = new Map<string, Set<Handler>>();
  play() {
    this.plays.push(this.src);
    this.paused = false;
    return this.playImpl();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  setAttribute() {}
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  addEventListener(type: string, fn: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Handler) {
    this.handlers.get(type)?.delete(fn);
  }
  emit(type: string) {
    [...(this.handlers.get(type) ?? [])].forEach((fn) => fn({}));
  }
  listenerCount() {
    return [...this.handlers.values()].reduce((n, s) => n + s.size, 0);
  }
}

type Call = { url: string; init: RequestInit; resolve: (r: FakeResponse) => void; reject: (e: unknown) => void };
type FakeResponse = { ok: boolean; status: number; headers: { get: (k: string) => string | null }; json: () => Promise<unknown>; blob: () => Promise<Blob> };

const audioResponse = (bytes = 32): FakeResponse => ({
  ok: true, status: 200,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'audio/mpeg' : null) },
  json: async () => { throw new Error('not json'); },
  blob: async () => new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' }),
});
const errorResponse = (status: number, code: string | null, providerText = 'upstream said: secret-ish details'): FakeResponse => ({
  ok: false, status,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => (code ? { ok: false, requestId: 'r', error: { code, message: providerText, recoverable: true } } : null),
  blob: async () => new Blob([]),
});

function setup() {
  const calls: Call[] = [];
  const fetchImpl = vi.fn((url: string, init: RequestInit) => new Promise<FakeResponse>((resolve, reject) => {
    calls.push({ url, init, resolve, reject });
    init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  const audio = new FakeAudio();
  const revoked: string[] = [];
  const unlockExtras = vi.fn();
  let urlSeq = 0;
  const player = new ElevenPlayer({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    createAudio: () => audio,
    createObjectURL: () => `blob:fake-${++urlSeq}`,
    revokeObjectURL: (u) => revoked.push(u),
    now: () => Date.now(),
    unlockExtras,
  });
  const events: Array<{ id: string; kind: string }> = [];
  const listener: ElevenListener = (e) => events.push({ id: e.utteranceId, kind: e.kind });
  return { calls, fetchImpl, audio, revoked, player, events, listener, unlockExtras };
}

let seq = 0;
function utterance(over: Partial<ConfirmedUtterance> = {}): ConfirmedUtterance {
  const n = ++seq;
  return {
    id: `utt-${n}`, reviewId: `rev-${n}`, exactText: "I don't agree with that.",
    selectionEventId: 'se', confirmationEventId: 'ce', selectionCycleId: 'sc', confirmationCycleId: 'cc',
    delivery: 'queued', sessionEpoch: 'epoch-1', provider: 'elevenlabs', voiceChoiceId: 'voice-a',
    ...over,
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ElevenPlayer', () => {
  it('sends exactly the confirmed text and identity to /api/speech with the access header', async () => {
    const t = setup();
    const u = utterance({ exactText: '  I’ll be there at 3:15, Dr. Lee.  ' });
    expect(t.player.speak(u, { accessCode: 'code-1', listener: t.listener })).toBe(true);
    expect(t.player.getSnapshot().state).toBe('requesting');
    expect(t.calls).toHaveLength(1);
    const { url, init } = t.calls[0];
    expect(url).toBe('/api/speech');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)[ACCESS_HEADER]).toBe('code-1');
    const body = JSON.parse(String(init.body)) as SpeechRequest;
    expect(body).toEqual({
      utteranceId: u.id, reviewSnapshotId: u.reviewId, sessionEpoch: 'epoch-1',
      exactText: '  I’ll be there at 3:15, Dr. Lee.  ', voiceChoiceId: 'voice-a',
    });
  });

  it('omits the access header when no code is set and ignores browser-provider utterances', () => {
    const t = setup();
    expect(t.player.speak(utterance({ provider: 'browser' }), { accessCode: '', listener: t.listener })).toBe(false);
    expect(t.calls).toHaveLength(0);
    t.player.speak(utterance(), { accessCode: '', listener: t.listener });
    expect((t.calls[0].init.headers as Record<string, string>)[ACCESS_HEADER]).toBeUndefined();
  });

  it('requests once per utterance id even if speak is called twice (TTS-04)', async () => {
    const t = setup();
    const u = utterance();
    expect(t.player.speak(u, { accessCode: '', listener: t.listener })).toBe(true);
    expect(t.player.speak(u, { accessCode: '', listener: t.listener })).toBe(false);
    expect(t.player.speak({ ...u }, { accessCode: '', listener: t.listener })).toBe(false);
    expect(t.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('plays bytes through the one reused element; start on playing, end only on ended', async () => {
    const t = setup();
    const u = utterance();
    vi.setSystemTime(1_000);
    t.player.speak(u, { accessCode: '', listener: t.listener, startedAt: 1_000 });
    t.calls[0].resolve(audioResponse());
    await flush();
    expect(t.player.getSnapshot().state).toBe('buffering');
    expect(t.audio.plays).toEqual(['blob:fake-1']);
    expect(t.events).toEqual([]); // play() resolving is not proof of sound
    vi.setSystemTime(1_420);
    t.audio.emit('playing');
    expect(t.events).toEqual([{ id: u.id, kind: 'start' }]);
    expect(t.player.getSnapshot()).toMatchObject({ state: 'playing', lastConfirmToPlayMs: 420, unlocked: true });
    t.audio.emit('playing'); // duplicate media event
    expect(t.events).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.events).toHaveLength(1);
    t.audio.emit('ended');
    expect(t.events).toEqual([{ id: u.id, kind: 'start' }, { id: u.id, kind: 'end' }]);
    expect(t.player.getSnapshot().state).toBe('completed');
    expect(t.revoked).toEqual(['blob:fake-1']);
    expect(t.audio.listenerCount()).toBe(0);
    t.audio.emit('ended');
    expect(t.events).toHaveLength(2);
  });

  it('Stop before the fetch completes: no play, a single interrupted, late result discarded (TTS-05)', async () => {
    const t = setup();
    const u = utterance();
    t.player.speak(u, { accessCode: '', listener: t.listener });
    const call = t.calls[0];
    t.player.stop(u.id);
    t.player.stop(u.id);
    t.player.cancelAll();
    expect(call.init.signal?.aborted).toBe(true);
    call.resolve(audioResponse()); // a late completion after Stop
    await flush();
    await vi.advanceTimersByTimeAsync(PLAYING_WATCHDOG_MS * 3);
    expect(t.audio.plays).toEqual([]);
    expect(t.events).toEqual([{ id: u.id, kind: 'interrupted' }]);
    expect(t.player.getSnapshot().state).toBe('interrupted');
  });

  it('Stop during playback pauses, frees the object URL and reports interrupted once', async () => {
    const t = setup();
    const u = utterance();
    t.player.speak(u, { accessCode: '', listener: t.listener });
    t.calls[0].resolve(audioResponse());
    await flush();
    t.audio.emit('playing');
    t.player.stop(u.id);
    t.audio.emit('ended');
    expect(t.audio.paused).toBe(true);
    expect(t.audio.src).toBe('');
    expect(t.revoked).toEqual(['blob:fake-1']);
    expect(t.events).toEqual([{ id: u.id, kind: 'start' }, { id: u.id, kind: 'interrupted' }]);
  });

  it('a new authorized utterance cleans up the old one', async () => {
    const t = setup();
    const a = utterance();
    const b = utterance();
    t.player.speak(a, { accessCode: '', listener: t.listener });
    t.calls[0].resolve(audioResponse());
    await flush();
    t.player.speak(b, { accessCode: '', listener: t.listener });
    expect(t.revoked).toEqual(['blob:fake-1']);
    expect(t.events).toEqual([{ id: a.id, kind: 'interrupted' }]);
    t.calls[1].resolve(audioResponse());
    await flush();
    t.audio.emit('playing');
    expect(t.events.at(-1)).toEqual({ id: b.id, kind: 'start' });
  });

  it('NotAllowedError → blocked + error event, no browser fallback and no retry', async () => {
    const t = setup();
    const u = utterance();
    t.audio.playImpl = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    t.player.speak(u, { accessCode: '', listener: t.listener });
    t.calls[0].resolve(audioResponse());
    await flush();
    expect(t.events).toEqual([{ id: u.id, kind: 'error' }]);
    expect(t.player.getSnapshot()).toMatchObject({ state: 'blocked', message: MESSAGES.blocked, unlocked: false });
    await vi.advanceTimersByTimeAsync(PLAYING_WATCHDOG_MS * 2);
    expect(t.audio.plays).toHaveLength(1);
    expect(t.fetchImpl).toHaveBeenCalledTimes(1);
    expect(t.events).toHaveLength(1);
  });

  it.each([
    [503, 'NOT_CONFIGURED', 'Natural voice not configured'],
    [429, 'RATE_LIMITED', 'Voice service busy — try again shortly'],
    [401, 'UNAUTHORIZED', 'Natural voice not authorized — check the access code'],
    [503, null, 'Natural voice unavailable right now'],
    [429, null, 'Voice service busy — try again shortly'],
  ])('server %i %s → error event with a safe message', async (status, code, message) => {
    const t = setup();
    const u = utterance();
    t.player.speak(u, { accessCode: '', listener: t.listener });
    t.calls[0].resolve(errorResponse(status, code));
    await flush();
    expect(t.events).toEqual([{ id: u.id, kind: 'error' }]);
    expect(t.player.getSnapshot()).toMatchObject({ state: 'failed', message });
    expect(t.player.getSnapshot().message).not.toContain('upstream');
    expect(t.audio.plays).toEqual([]);
  });

  it('network failure, empty audio and client timeout fail safely', async () => {
    const t = setup();
    const a = utterance();
    t.player.speak(a, { accessCode: '', listener: t.listener });
    t.calls[0].reject(new TypeError('Failed to fetch'));
    await flush();
    expect(t.player.getSnapshot().message).toBe('Could not reach the voice service');

    const b = utterance();
    t.player.speak(b, { accessCode: '', listener: t.listener });
    t.calls[1].resolve(audioResponse(0));
    await flush();
    expect(t.player.getSnapshot().message).toBe(MESSAGES.noAudio);

    const c = utterance();
    t.player.speak(c, { accessCode: '', listener: t.listener });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.player.getSnapshot().message).toBe('Natural voice took too long');
    expect(t.events.map((e) => e.kind)).toEqual(['error', 'error', 'error']);
    expect(t.audio.plays).toEqual([]);
  });

  it('watchdog: no playing within the window → uncertain once, never replayed', async () => {
    const t = setup();
    const u = utterance();
    t.player.speak(u, { accessCode: '', listener: t.listener });
    t.calls[0].resolve(audioResponse());
    await flush();
    await vi.advanceTimersByTimeAsync(PLAYING_WATCHDOG_MS + 1);
    expect(t.events).toEqual([{ id: u.id, kind: 'uncertain' }]);
    expect(t.player.getSnapshot().state).toBe('uncertain');
    t.audio.emit('playing'); // late start after the watchdog is ignored
    await vi.advanceTimersByTimeAsync(PLAYING_WATCHDOG_MS * 3);
    expect(t.events).toHaveLength(1);
    expect(t.audio.plays).toHaveLength(1);
    expect(t.audio.paused).toBe(true);
  });

  it('enableAudio plays silence on the same element inside the gesture and marks unlocked', async () => {
    const t = setup();
    const p = t.player.enableAudio();
    expect(t.audio.plays).toEqual([silentWavDataUri()]); // started synchronously, before any await
    expect(t.audio.playsInline).toBe(true);
    expect(t.unlockExtras).toHaveBeenCalledTimes(1); // basic voice + audio session, same gesture
    expect(await p).toBe(true);
    expect(t.player.getSnapshot().unlocked).toBe(true);
    t.player.speak(utterance(), { accessCode: '', listener: t.listener });
    t.calls[0].resolve(audioResponse());
    await flush();
    expect(t.audio.plays).toEqual([silentWavDataUri(), 'blob:fake-1']); // one reused element
  });

  it('enableAudio rejected by autoplay policy → blocked, not unlocked', async () => {
    const t = setup();
    t.audio.playImpl = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    expect(await t.player.enableAudio()).toBe(false);
    expect(t.player.getSnapshot()).toMatchObject({ unlocked: false, state: 'blocked', message: MESSAGES.blocked });
  });

  it('silent unlock clip is a valid RIFF/WAVE header', () => {
    const b64 = silentWavDataUri().split(',')[1];
    const bin = atob(b64);
    expect(bin.slice(0, 4)).toBe('RIFF');
    expect(bin.slice(8, 12)).toBe('WAVE');
    expect(bin.length).toBe(444);
  });

  it('testNaturalVoice preview uses fixed text and voice-test ids and never reports speech events', async () => {
    const t = setup();
    const done = t.player.preview({ accessCode: 'c', voiceChoiceId: 'voice-b' });
    const body = JSON.parse(String(t.calls[0].init.body)) as SpeechRequest;
    expect(body.exactText).toBe(NATURAL_VOICE_TEST_TEXT);
    expect(body.utteranceId.startsWith(VOICE_TEST_PREFIX)).toBe(true);
    expect(body.reviewSnapshotId.startsWith(VOICE_TEST_PREFIX)).toBe(true);
    expect(body.sessionEpoch.startsWith(VOICE_TEST_PREFIX)).toBe(true);
    expect(body.voiceChoiceId).toBe('voice-b');
    t.calls[0].resolve(audioResponse());
    await done;
    t.audio.emit('playing');
    t.audio.emit('ended');
    expect(t.player.getSnapshot()).toMatchObject({ state: 'completed', message: MESSAGES.previewDone, lastConfirmToPlayMs: null });
    expect(t.events).toEqual([]);
  });

  it('preview refuses while a conversation message is active', async () => {
    const t = setup();
    t.player.speak(utterance(), { accessCode: '', listener: t.listener });
    await t.player.preview({ accessCode: '', voiceChoiceId: null });
    expect(t.calls).toHaveLength(1);
    expect(t.player.getSnapshot().message).toBe(MESSAGES.previewBusy);
  });
});

describe('EffectsRunner speech routing', () => {
  function runnerWith(state: Partial<State> = {}) {
    const dispatched: Action[] = [];
    const eleven = { speak: vi.fn(() => true), stop: vi.fn(), cancelAll: vi.fn() };
    const speech = { speak: vi.fn(() => true), stop: vi.fn(), cancelAll: vi.fn() };
    const runner = new EffectsRunner({
      dispatch: (a) => dispatched.push(a),
      getState: () => ({ settings: { voiceURI: null, rate: 1, language: 'en-US' }, ...state }) as unknown as State,
      getAccessCode: () => 'code-9',
      transcriptionConfigured: () => false,
      setTranscript: () => {},
      speech: speech as never,
      eleven,
      newId: () => `id-${++seq}`,
      now: () => 5,
    });
    return { runner, dispatched, eleven, speech };
  }

  it('routes elevenlabs utterances to the natural-voice player and browser ones to speechSynthesis', () => {
    const r = runnerWith();
    const nat = utterance();
    const basic = utterance({ provider: 'browser' });
    r.runner.run([{ id: 'e1', kind: 'speak', utterance: nat } as Effect]);
    expect(r.eleven.speak).toHaveBeenCalledTimes(1);
    expect(r.eleven.speak.mock.calls[0]).toMatchObject([nat, { accessCode: 'code-9', startedAt: 5 }]);
    expect(r.speech.speak).not.toHaveBeenCalled();
    r.runner.run([{ id: 'e1', kind: 'speak', utterance: nat } as Effect]); // same effect id again
    expect(r.eleven.speak).toHaveBeenCalledTimes(1);
    r.runner.run([{ id: 'e2', kind: 'speak', utterance: basic } as Effect]);
    expect(r.speech.speak).toHaveBeenCalledTimes(1);
    expect(r.eleven.cancelAll).toHaveBeenCalled();
  });

  it('forwards player events as SPEECH_EVENT and stop/cancel to both paths', () => {
    const r = runnerWith();
    const u = utterance();
    r.runner.run([{ id: 'e3', kind: 'speak', utterance: u } as Effect]);
    const listener = (r.eleven.speak.mock.calls[0] as unknown as [unknown, { listener: ElevenListener }])[1].listener;
    listener({ utteranceId: u.id, sessionEpoch: u.sessionEpoch, kind: 'start' });
    expect(r.dispatched).toContainEqual({ type: 'SPEECH_EVENT', utteranceId: u.id, sessionEpoch: 'epoch-1', kind: 'start', at: 5 });
    r.runner.run([{ id: 'e4', kind: 'stop-speech', utteranceId: u.id } as Effect]);
    expect(r.eleven.stop).toHaveBeenCalledWith(u.id);
    expect(r.speech.stop).toHaveBeenCalledWith(u.id);
    r.runner.run([{ id: 'e5', kind: 'cancel-all-speech' } as Effect]);
    expect(r.eleven.cancelAll).toHaveBeenCalled();
    expect(r.speech.cancelAll).toHaveBeenCalled();
  });

  it('reports error when no natural-voice player exists (never silently uses the browser voice)', () => {
    const dispatched: Action[] = [];
    const speech = { speak: vi.fn(), stop: vi.fn(), cancelAll: vi.fn() };
    const runner = new EffectsRunner({
      dispatch: (a) => dispatched.push(a),
      getState: () => ({ settings: { voiceURI: null, rate: 1, language: 'en-US' } }) as unknown as State,
      getAccessCode: () => '', transcriptionConfigured: () => false, setTranscript: () => {},
      speech: speech as never, eleven: null, newId: () => 'x', now: () => 1,
    });
    const u = utterance();
    runner.run([{ id: 'e6', kind: 'speak', utterance: u } as Effect]);
    expect(speech.speak).not.toHaveBeenCalled();
    expect(dispatched).toContainEqual({ type: 'SPEECH_EVENT', utteranceId: u.id, sessionEpoch: 'epoch-1', kind: 'error', at: 1 });
  });
});
