// Fast-mode speech prefetch: cache semantics (key, LRU, TTL, bytes, dedupe, concurrency, cooldown),
// the player's cache-hit / in-flight / miss paths, and when a prefetch plan exists at all.
// Fake fetch + fake audio element; proves client plumbing only, not real audio.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenPlayer, type AudioLike, type ElevenListener } from '@/audio/eleven-player';
import { SpeechAudioCache, PREFETCH_COOLDOWN_MS } from '@/audio/speech-prefetch';
import { speechPrefetchPlan } from '@/runtime/useAudio';
import { ACCESS_HEADER } from '@/runtime/contract';
import type { ConfirmedUtterance, SpeechRequest } from '@/core/types';
import { Driver, SPREAD_CANDIDATES } from './helpers';

type Handler = (ev: unknown) => void;
class FakeAudio implements AudioLike {
  src = ''; currentTime = 0; playsInline = false; muted = false; preload = '';
  plays: string[] = [];
  private handlers = new Map<string, Set<Handler>>();
  play() { this.plays.push(this.src); return Promise.resolve(); }
  pause() {}
  load() {}
  setAttribute() {}
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  addEventListener(type: string, fn: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Handler) { this.handlers.get(type)?.delete(fn); }
  emit(type: string) { [...(this.handlers.get(type) ?? [])].forEach((fn) => fn({})); }
}

type FakeResponse = { ok: boolean; status: number; headers: { get: (k: string) => string | null }; json: () => Promise<unknown>; blob: () => Promise<Blob> };
const audioResponse = (bytes = 32): FakeResponse => ({
  ok: true, status: 200,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'audio/mpeg' : null) },
  json: async () => { throw new Error('not json'); },
  blob: async () => new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' }),
});
const errorResponse = (status: number): FakeResponse => ({
  ok: false, status,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => ({ ok: false, error: { code: 'RATE_LIMITED' } }),
  blob: async () => new Blob([]),
});

type Call = { url: string; init: RequestInit; body: SpeechRequest; resolve: (r: FakeResponse) => void; reject: (e: unknown) => void };
function fakeFetch() {
  const calls: Call[] = [];
  const fetchImpl = vi.fn((url: string, init: RequestInit) => new Promise<FakeResponse>((resolve, reject) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) as SpeechRequest, resolve, reject });
    init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

let seq = 0;
function utterance(over: Partial<ConfirmedUtterance> = {}): ConfirmedUtterance {
  const n = ++seq;
  return {
    id: `utt-${n}`, reviewId: `rev-${n}`, exactText: 'Sure, I can do that.',
    selectionEventId: 'se', confirmationEventId: 'ce', selectionCycleId: 'sc', confirmationCycleId: 'cc',
    delivery: 'queued', sessionEpoch: 'epoch-1', provider: 'elevenlabs', voiceChoiceId: 'voice-a',
    ...over,
  };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); });

function playerWith(cache: SpeechAudioCache | null) {
  const net = fakeFetch(); // the player's own network (separate from the cache's)
  const audio = new FakeAudio();
  const player = new ElevenPlayer({
    fetchImpl: net.fetchImpl, createAudio: () => audio, createObjectURL: () => 'blob:x', revokeObjectURL: () => {},
    now: () => Date.now(), unlockExtras: () => {}, cache,
  });
  const events: string[] = [];
  const listener: ElevenListener = (e) => events.push(e.kind);
  return { player, audio, net, events, listener };
}

describe('SpeechAudioCache', () => {
  it('prefetches in order with the same request shape as the player, and caches the audio', async () => {
    const net = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl });
    cache.prefetch([{ text: 'One.', voiceChoiceId: 'v1' }, { text: 'Two.', voiceChoiceId: 'v1' }], 'code-9');
    expect(net.calls.map((c) => c.body.exactText)).toEqual(['One.', 'Two.']);
    const { url, init, body } = net.calls[0];
    expect(url).toBe('/api/speech');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)[ACCESS_HEADER]).toBe('code-9');
    expect(Object.keys(body).sort()).toEqual(['exactText', 'reviewSnapshotId', 'sessionEpoch', 'utteranceId', 'voiceChoiceId']);
    expect(body.voiceChoiceId).toBe('v1');
    net.calls[0].resolve(audioResponse());
    await flush();
    expect(cache.lookup('One.', 'v1')?.kind).toBe('hit');
    expect(cache.lookup('Two.', 'v1')?.kind).toBe('pending');
  });

  it('key includes the voice: another voice (or null) is a miss', async () => {
    const net = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl });
    cache.prefetch([{ text: 'Hello.', voiceChoiceId: 'v1' }, { text: 'Hello.', voiceChoiceId: null }], '');
    expect(net.calls).toHaveLength(2);
    net.calls.forEach((c) => c.resolve(audioResponse()));
    await flush();
    expect(cache.lookup('Hello.', 'v1')?.kind).toBe('hit');
    expect(cache.lookup('Hello.', null)?.kind).toBe('hit');
    expect(cache.lookup('Hello.', 'v2')).toBeNull();
    expect(cache.lookup('Hello. ', 'v1')).toBeNull(); // exact text, no normalization
  });

  it('dedupes in-flight and cached requests for the same key', async () => {
    const net = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl });
    const item = { text: 'Same.', voiceChoiceId: null };
    cache.prefetch([item], '');
    cache.prefetch([item], '');
    cache.prefetch([item, item], '');
    expect(net.calls).toHaveLength(1);
    net.calls[0].resolve(audioResponse());
    await flush();
    cache.prefetch([item], '');
    expect(net.calls).toHaveLength(1);
  });

  it('limits concurrency to 3 and starts the rest as slots free up', async () => {
    const net = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl });
    cache.prefetch(['a', 'b', 'c', 'd', 'e'].map((text) => ({ text, voiceChoiceId: null })), '');
    expect(net.calls).toHaveLength(3);
    net.calls[0].resolve(audioResponse());
    await flush();
    expect(net.calls).toHaveLength(4);
  });

  it('a replaced batch drops queued items and aborts unawaited in-flight ones', async () => {
    const net = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl, concurrency: 1 });
    cache.prefetch([{ text: 'old1', voiceChoiceId: null }, { text: 'old2', voiceChoiceId: null }], '');
    expect(net.calls).toHaveLength(1);
    cache.prefetch([{ text: 'new1', voiceChoiceId: null }], '');
    await flush();
    expect(net.calls[0].init.signal?.aborted).toBe(true);
    expect(net.calls.map((c) => c.body.exactText)).toEqual(['old1', 'new1']); // old2 never requested
    expect(cache.lookup('old1', null)).toBeNull();
  });

  it('evicts least recently used beyond 12 entries and caps total bytes', async () => {
    const net = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl, maxBytes: 100 });
    const texts = Array.from({ length: 14 }, (_, i) => `t${i}`);
    for (const t of texts) {
      cache.prefetch([{ text: t, voiceChoiceId: null }], '');
      net.calls[net.calls.length - 1].resolve(audioResponse(1));
      await flush();
    }
    expect(cache.size).toBe(12);
    expect(cache.lookup('t0', null)).toBeNull();
    expect(cache.lookup('t1', null)).toBeNull();
    expect(cache.lookup('t13', null)?.kind).toBe('hit');

    for (const t of ['big1', 'big2', 'big3']) {
      cache.prefetch([{ text: t, voiceChoiceId: null }], '');
      net.calls[net.calls.length - 1].resolve(audioResponse(60));
      await flush();
    }
    expect(cache.totalBytes).toBeLessThanOrEqual(100);
    expect(cache.lookup('big3', null)?.kind).toBe('hit');
    expect(cache.lookup('big1', null)).toBeNull();
  });

  it('expires entries after the TTL', async () => {
    const net = fakeFetch();
    let t = 0;
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl, now: () => t, ttlMs: 1000 });
    cache.prefetch([{ text: 'Soon gone.', voiceChoiceId: null }], '');
    net.calls[0].resolve(audioResponse());
    await flush();
    t = 999;
    expect(cache.lookup('Soon gone.', null)?.kind).toBe('hit');
    t = 2000;
    expect(cache.lookup('Soon gone.', null)).toBeNull();
    expect(cache.totalBytes).toBe(0);
  });

  it('fails silently and pauses prefetching after a refusal', async () => {
    const net = fakeFetch();
    let t = 0;
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl, now: () => t });
    cache.prefetch([{ text: 'x', voiceChoiceId: null }], '');
    net.calls[0].resolve(errorResponse(429));
    await flush();
    expect(cache.size).toBe(0);
    cache.prefetch([{ text: 'y', voiceChoiceId: null }], '');
    expect(net.calls).toHaveLength(1); // cooling down
    t = PREFETCH_COOLDOWN_MS + 1;
    cache.prefetch([{ text: 'y', voiceChoiceId: null }], '');
    expect(net.calls).toHaveLength(2);
  });
});

describe('prefetch cooldown scope', () => {
  it('a 400 for one item only skips it: the next batch still prefetches', async () => {
    const net = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl, now: () => 0 });
    cache.prefetch([{ text: 'too long or invalid', voiceChoiceId: null }], '');
    net.calls[0].resolve(errorResponse(400));
    await flush();
    expect(cache.size).toBe(0);
    cache.prefetch([{ text: 'next batch', voiceChoiceId: null }], '');
    expect(net.calls).toHaveLength(2);
    net.calls[1].resolve(audioResponse());
    await flush();
    expect(cache.lookup('next batch', null)?.kind).toBe('hit');
  });

  it.each([401, 403, 429, 500, 503])('a %i starts the cooldown', async (status) => {
    const net = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: net.fetchImpl, now: () => 0 });
    cache.prefetch([{ text: 'x', voiceChoiceId: null }], '');
    net.calls[0].resolve(errorResponse(status));
    await flush();
    cache.prefetch([{ text: 'y', voiceChoiceId: null }], '');
    expect(net.calls).toHaveLength(1);
  });
});

describe('ElevenPlayer with a prefetch cache', () => {
  async function cachedFor(text: string, voice: string | null) {
    const cacheNet = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: cacheNet.fetchImpl });
    cache.prefetch([{ text, voiceChoiceId: voice }], '');
    cacheNet.calls[0].resolve(audioResponse());
    await flush();
    return { cache, cacheNet };
  }

  it('a cache hit plays without a network call and reports start/end', async () => {
    const { cache } = await cachedFor('Sure, I can do that.', 'voice-a');
    const t = playerWith(cache);
    expect(t.player.speak(utterance(), { accessCode: 'c', listener: t.listener })).toBe(true);
    expect(t.net.fetchImpl).not.toHaveBeenCalled();
    expect(t.audio.plays).toEqual(['blob:x']); // play() started synchronously inside speak()
    await flush();
    t.audio.emit('playing');
    expect(t.player.getSnapshot().state).toBe('playing');
    expect(t.events).toEqual(['start']);
    t.audio.emit('ended');
    expect(t.events).toEqual(['start', 'end']);
    expect(t.player.getSnapshot().state).toBe('completed');
  });

  it('Stop during a cached playback reports interrupted once', async () => {
    const { cache } = await cachedFor('Sure, I can do that.', 'voice-a');
    const t = playerWith(cache);
    const u = utterance();
    t.player.speak(u, { accessCode: '', listener: t.listener });
    await flush();
    t.audio.emit('playing');
    t.player.stop(u.id);
    t.audio.emit('ended');
    expect(t.events).toEqual(['start', 'interrupted']);
  });

  it('a different text or voice is a miss and falls back to the normal request', async () => {
    const { cache } = await cachedFor('Sure, I can do that.', 'voice-a');
    const t = playerWith(cache);
    t.player.speak(utterance({ exactText: 'Sure, I can do that!' }), { accessCode: 'c', listener: t.listener });
    expect(t.net.calls).toHaveLength(1);
    expect(t.net.calls[0].body.exactText).toBe('Sure, I can do that!');
    t.net.calls[0].resolve(audioResponse());
    await flush();
    t.audio.emit('playing');
    expect(t.events).toEqual(['start']);

    const u2 = playerWith(cache);
    u2.player.speak(utterance({ voiceChoiceId: 'voice-b' }), { accessCode: 'c', listener: u2.listener });
    expect(u2.net.calls).toHaveLength(1);
    expect(u2.net.calls[0].body.voiceChoiceId).toBe('voice-b');
  });

  it('without a cache behaves exactly as before (one request)', () => {
    const t = playerWith(null);
    t.player.speak(utterance(), { accessCode: 'c', listener: t.listener });
    expect(t.net.calls).toHaveLength(1);
  });

  it('selecting while the prefetch is still in flight awaits it instead of requesting again', async () => {
    const cacheNet = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: cacheNet.fetchImpl });
    cache.prefetch([{ text: 'Sure, I can do that.', voiceChoiceId: 'voice-a' }], '');
    const t = playerWith(cache);
    t.player.speak(utterance(), { accessCode: 'c', listener: t.listener });
    await flush();
    expect(t.net.fetchImpl).not.toHaveBeenCalled();
    expect(cacheNet.calls).toHaveLength(1);
    expect(t.audio.plays).toHaveLength(0);
    cacheNet.calls[0].resolve(audioResponse());
    await flush();
    expect(t.audio.plays).toEqual(['blob:x']);
    t.audio.emit('playing');
    expect(t.events).toEqual(['start']);
  });

  it('a failed in-flight prefetch falls back to the normal request', async () => {
    const cacheNet = fakeFetch();
    const cache = new SpeechAudioCache({ fetchImpl: cacheNet.fetchImpl });
    cache.prefetch([{ text: 'Sure, I can do that.', voiceChoiceId: 'voice-a' }], '');
    const t = playerWith(cache);
    t.player.speak(utterance(), { accessCode: 'c', listener: t.listener });
    cacheNet.calls[0].resolve(errorResponse(502));
    await flush();
    expect(t.net.calls).toHaveLength(1);
    t.net.calls[0].resolve(audioResponse());
    await flush();
    t.audio.emit('playing');
    expect(t.events).toEqual(['start']);
  });
});

describe('speechPrefetchPlan', () => {
  const fast = (over = {}) => {
    const d = new Driver({ speakOnSelect: true, speechProvider: 'elevenlabs', voiceChoiceId: 'voice-a', ...over });
    d.partner('Are you coming to dinner tonight?');
    d.resolve();
    return d;
  };

  it('plans all candidates in order, with the voice the reducer will speak with', () => {
    const d = fast();
    const plan = speechPrefetchPlan(d.s, true);
    expect(plan?.items).toEqual(SPREAD_CANDIDATES.map((c) => ({ text: c.text, voiceChoiceId: 'voice-a' })));
    // The spoken utterance matches the first planned item exactly.
    d.act('cand-0');
    const u = d.speaks()[0].utterance;
    expect({ text: u.exactText, voiceChoiceId: u.voiceChoiceId }).toEqual(plan!.items[0]);
  });

  it('plans nothing when fast mode is off, the voice is basic or unconfigured, or in setup', () => {
    expect(speechPrefetchPlan(fast({ speakOnSelect: false }).s, true)).toBeNull();
    expect(speechPrefetchPlan(fast({ speechProvider: 'browser' }).s, true)).toBeNull();
    expect(speechPrefetchPlan(fast().s, false)).toBeNull();
    expect(speechPrefetchPlan({ ...fast().s, phase: 'setup' }, true)).toBeNull();
  });

  it('plans nothing while generating (no batch yet)', () => {
    const d = new Driver({ speakOnSelect: true, speechProvider: 'elevenlabs' });
    d.partner('Are you coming to dinner tonight?');
    expect(speechPrefetchPlan(d.s, true)).toBeNull();
  });
});
