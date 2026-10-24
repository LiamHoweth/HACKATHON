// Wave-3 speech/security review fixes: access-code voice gating, control characters in drafts and
// candidates, lastFailedSpeech lifecycle + delivery, confirm-to-play timing, player reset and
// preview outcomes, TTD binary frames, and per-request character-limit classification.
// Fakes only: proves plumbing, not real audio or provider behavior.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Driver, SPREAD_CANDIDATES, ids } from './helpers';
import type { SpeakEffect } from './helpers';
import { stripControlChars } from '@/core/reducer';
import { checkModelOutput } from '@/server/validation';
import { voicesFetchAllowed } from '@/runtime/useAudio';
import type { ServerStatus } from '@/runtime/contract';
import { ElevenPlayer, MESSAGES, type AudioLike } from '@/audio/eleven-player';
import { classifyProviderError } from '@/server/elevenlabs/shared';
import { synthesizeDialogueWs, type WebSocketLike } from '@/server/elevenlabs/tts-dialogue-ws';
import type { ServerConfig } from '@/server/config';
import type { ConfirmedUtterance, ReplyRequest } from '@/core/types';

// ---------------------------------------------------------------------------------------------
// 1. Access code: /api/voices only with a confirmed code (or none required)

const status = (over: Partial<ServerStatus> = {}): ServerStatus => ({
  replies: { configured: true, provider: null, model: null },
  transcription: { configured: false, provider: null },
  fixturesEnabled: true,
  accessRequired: true,
  accessCodeValid: null,
  speech: { configured: true, provider: 'elevenlabs', model: null },
  ...over,
});

describe('access code gating of /api/voices', () => {
  it('fetches voices only when the code was confirmed valid or no code is required', () => {
    expect(voicesFetchAllowed(null)).toBe(false);
    expect(voicesFetchAllowed(status({ accessCodeValid: null }))).toBe(false); // no code sent yet
    expect(voicesFetchAllowed(status({ accessCodeValid: false }))).toBe(false); // half-typed / wrong
    expect(voicesFetchAllowed(status({ accessCodeValid: true }))).toBe(true);
    expect(voicesFetchAllowed(status({ accessRequired: false, accessCodeValid: null }))).toBe(true);
  });

  it('never fetches voices when natural voice is not configured', () => {
    expect(voicesFetchAllowed(status({ accessCodeValid: true, speech: { configured: false, provider: null, model: null } }))).toBe(false);
    expect(voicesFetchAllowed(status({ accessRequired: false, speech: undefined }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Line breaks / tabs never reach a draft; candidates containing them need a repair

describe('control characters in composed text', () => {
  it('stripControlChars turns each run of newlines/tabs/control characters into one space', () => {
    expect(stripControlChars('I need\nwater')).toBe('I need water');
    expect(stripControlChars('a\r\n\tb')).toBe('a b');
    expect(stripControlChars('x\u0000y\u007fz\u0085')).toBe('x y z ');
    expect(stripControlChars("I'll be there at 3:15, Dr. Lee.")).toBe("I'll be there at 3:15, Dr. Lee.");
  });

  it('COMPOSE_TEXT (typed or pasted) stores the draft without line breaks or tabs', () => {
    const d = new Driver();
    d.act('my-words');
    expect(d.surface().kind).toBe('compose');
    d.dispatch({ type: 'COMPOSE_TEXT', purpose: 'message', text: 'Hello\nthere\tfriend' });
    expect(d.s.drafts.message).toBe('Hello there friend');
    d.dispatch({ type: 'COMPOSE_TEXT', purpose: 'seed', text: 'park\r\n' });
    expect(d.s.drafts.seed).toBe('park ');
  });

  it('the speak effect for a pasted multi-line draft carries text /api/speech accepts', () => {
    const d = new Driver();
    d.act('my-words');
    d.dispatch({ type: 'COMPOSE_TEXT', purpose: 'message', text: 'Line one\nLine two' });
    d.act('c-done');
    expect(d.surface().kind).toBe('review');
    d.act('rv-speak');
    const u = (d.s.effects.filter((e) => e.kind === 'speak') as SpeakEffect[])[0].utterance;
    expect(u.exactText).toBe('Line one Line two');
    expect(/[\u0000-\u001f\u007f-\u009f]/.test(u.exactText)).toBe(false);
  });

  const request = (): ReplyRequest => ({
    identity: { sessionEpoch: 'e1', workspaceId: 'w1', requestId: 'r1', contextRevision: 1, preferenceRevision: 0 },
    mode: 'fixture',
    anchor: { mode: 'reply', turnId: 't1', turnContentRevision: 0 },
    activePartnerText: 'Are you coming to dinner tonight?',
    language: 'en-US',
    recentConversation: [{ role: 'partner', text: 'Are you coming to dinner tonight?', source: 'partner-typed' }],
    approvedProfile: [],
    guidance: { intent: null, wording: [], userTopicOrSeed: null, scope: { relationship: null, setting: null } },
    approvedPreferences: [],
    sessionStyleHints: [],
    rejected: [],
    refineTarget: null,
    lengthPolicy: { maxWords: 14, maxCharacters: 100 },
  });
  const GOOD = [
    { text: 'Yes, I will be there.', meaning: { act: 'accept', summary: 'Accept the dinner invitation.' } },
    { text: 'Not tonight, sorry.', meaning: { act: 'decline', summary: 'Decline tonight.' } },
    { text: 'Where is it?', meaning: { act: 'question', summary: 'Ask where dinner is.' } },
  ];

  it('candidate validation asks for a repair when a candidate contains a line break or tab', () => {
    expect(checkModelOutput({ candidates: GOOD }, request()).ok).toBe(true);
    for (const bad of ['Yes,\nI will be there.', 'Yes,\tI will be there.', 'Yes\u0007 I will.']) {
      const res = checkModelOutput({ candidates: [{ ...GOOD[0], text: bad }, GOOD[1], GOOD[2]] }, request());
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.problems.join(' ')).toMatch(/Candidate 1 contains a line break/);
    }
    // Surrounding whitespace is trimmed, as before, and is not a control-character problem.
    expect(checkModelOutput({ candidates: [{ ...GOOD[0], text: 'Yes, I will be there.\n' }, GOOD[1], GOOD[2]] }, request()).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// 4, 5, 8. lastFailedSpeech lifecycle + delivery, confirmedAt

function failedTurn(kind: 'error' | 'uncertain') {
  const d = new Driver();
  d.partner('Do you want to go to the park?');
  d.resolve();
  d.act('cand-0');
  d.act('rv-speak');
  const failed = d.speaks()[d.speaks().length - 1].utterance;
  d.speech('start');
  d.speech(kind);
  return { d, failed };
}

describe('lastFailedSpeech', () => {
  it('records the delivery state of the failure (failed | uncertain)', () => {
    expect(failedTurn('error').d.s.lastFailedSpeech?.delivery).toBe('failed');
    expect(failedTurn('uncertain').d.s.lastFailedSpeech?.delivery).toBe('uncertain');
  });

  it('is cleared by any new confirmed utterance, not only the basic-voice retry', () => {
    const { d, failed } = failedTurn('error');
    expect(ids(d.s)).toContain('speak-basic');
    d.act('my-words');
    d.dispatch({ type: 'COMPOSE_TEXT', purpose: 'message', text: 'Something else' });
    d.act('c-done');
    d.act('rv-speak');
    const u = d.speaks()[d.speaks().length - 1].utterance;
    expect(u.id).not.toBe(failed.id);
    expect(u.provider).toBe('elevenlabs');
    expect(d.s.lastFailedSpeech).toBeNull();
    d.speech('start');
    d.speech('end');
    expect(ids(d.s)).not.toContain('speak-basic');
  });

  it('a failure of the new utterance offers the basic voice for that new text', () => {
    const { d } = failedTurn('error');
    d.act('my-words');
    d.dispatch({ type: 'COMPOSE_TEXT', purpose: 'message', text: 'Second message' });
    d.act('c-done');
    d.act('rv-speak');
    d.speech('start');
    d.speech('uncertain');
    expect(d.s.lastFailedSpeech).toMatchObject({ text: 'Second message', delivery: 'uncertain' });
  });
});

describe('ConfirmedUtterance.confirmedAt', () => {
  it('is the monotonic time of the confirming ACTIVATE', () => {
    const d = new Driver();
    d.partner('Hi');
    d.resolve();
    d.act('cand-1');
    const confirm = d.act('rv-speak');
    const u = d.speaks()[0].utterance;
    expect(u.exactText).toBe(SPREAD_CANDIDATES[1].text);
    expect(u.confirmedAt).toBe(confirm.at);
  });
});

// ---------------------------------------------------------------------------------------------
// 6, 7, 8. ElevenPlayer: reset on cancelAll, preview outcomes, latency from confirmedAt

class FakeAudio implements AudioLike {
  src = '';
  currentTime = 0;
  playsInline = false;
  muted = false;
  preload = '';
  playImpl: () => Promise<void> = () => Promise.resolve();
  private handlers = new Map<string, Set<(ev: unknown) => void>>();
  play() { return this.playImpl(); }
  pause() {}
  load() {}
  setAttribute() {}
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  addEventListener(type: string, fn: (ev: unknown) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (ev: unknown) => void) { this.handlers.get(type)?.delete(fn); }
  emit(type: string) { [...(this.handlers.get(type) ?? [])].forEach((fn) => fn({})); }
}

type FakeResponse = { ok: boolean; status: number; headers: { get: (k: string) => string | null }; json: () => Promise<unknown>; blob: () => Promise<Blob> };
const audioResponse = (): FakeResponse => ({
  ok: true, status: 200,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'audio/mpeg' : null) },
  json: async () => { throw new Error('not json'); },
  blob: async () => new Blob([new Uint8Array(32)], { type: 'audio/mpeg' }),
});
const errorResponse = (status: number, code: string): FakeResponse => ({
  ok: false, status,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => ({ ok: false, requestId: 'r', error: { code, message: 'x', recoverable: false } }),
  blob: async () => new Blob([]),
});

function playerWith(respond: () => FakeResponse) {
  const audio = new FakeAudio();
  let clock = 0;
  const pending: Array<() => void> = [];
  const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<FakeResponse>((resolve, reject) => {
    pending.push(() => resolve(respond()));
    init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  const player = new ElevenPlayer({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    createAudio: () => audio,
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: () => {},
    now: () => clock,
    unlockExtras: () => {},
  });
  return { player, audio, pending, setClock: (t: number) => { clock = t; } };
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

let seq = 0;
const utterance = (over: Partial<ConfirmedUtterance> = {}): ConfirmedUtterance => ({
  id: `fx-${++seq}`, reviewId: 'rev', exactText: 'Hello.', selectionEventId: 'se', confirmationEventId: 'ce',
  selectionCycleId: 'sc', confirmationCycleId: 'cc', delivery: 'queued', sessionEpoch: 'ep', provider: 'elevenlabs',
  voiceChoiceId: null, ...over,
});

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
afterEach(() => { vi.useRealTimers(); });

describe('ElevenPlayer reset, preview outcome and latency', () => {
  it('cancelAll with nothing in flight clears a stale failure to idle', async () => {
    const t = playerWith(() => errorResponse(502, 'PROVIDER_UNAVAILABLE'));
    t.player.speak(utterance(), { accessCode: '', listener: () => {} });
    t.pending[0]();
    await flush();
    expect(t.player.getSnapshot()).toMatchObject({ state: 'failed', message: 'Natural voice unavailable right now' });
    t.player.cancelAll();
    expect(t.player.getSnapshot()).toMatchObject({ state: 'idle', message: null });
  });

  it('cancelAll clears a stale blocked status (unlock state is kept separately)', async () => {
    const t = playerWith(audioResponse);
    t.audio.playImpl = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    t.player.speak(utterance(), { accessCode: '', listener: () => {} });
    t.pending[0]();
    await flush();
    expect(t.player.getSnapshot()).toMatchObject({ state: 'blocked', message: MESSAGES.blocked, unlocked: false });
    t.player.cancelAll();
    expect(t.player.getSnapshot()).toMatchObject({ state: 'idle', message: null, unlocked: false });
  });

  it('preview resolves with its real outcome', async () => {
    const ok = playerWith(audioResponse);
    const p1 = ok.player.preview({ accessCode: '', voiceChoiceId: null });
    ok.pending[0]();
    expect(await p1).toBe('played');

    const nc = playerWith(() => errorResponse(503, 'NOT_CONFIGURED'));
    const p2 = nc.player.preview({ accessCode: '', voiceChoiceId: null });
    nc.pending[0]();
    expect(await p2).toBe('not-configured');

    const bad = playerWith(() => errorResponse(401, 'UNAUTHORIZED'));
    const p3 = bad.player.preview({ accessCode: 'wrong', voiceChoiceId: null });
    bad.pending[0]();
    expect(await p3).toBe('failed');

    const blocked = playerWith(audioResponse);
    blocked.audio.playImpl = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    const p4 = blocked.player.preview({ accessCode: '', voiceChoiceId: null });
    blocked.pending[0]();
    expect(await p4).toBe('blocked');

    const busy = playerWith(audioResponse);
    busy.player.speak(utterance(), { accessCode: '', listener: () => {} });
    expect(await busy.player.preview({ accessCode: '', voiceChoiceId: null })).toBe('busy');
  });

  it('measures confirm-to-play from confirmedAt and resets it when a new utterance starts', async () => {
    const t = playerWith(audioResponse);
    t.setClock(2_000);
    t.player.speak(utterance({ confirmedAt: 1_500 }), { accessCode: '', listener: () => {}, startedAt: 1_900 });
    t.pending[0]();
    await flush();
    t.setClock(2_300);
    t.audio.emit('playing');
    expect(t.player.getSnapshot().lastConfirmToPlayMs).toBe(800);
    t.audio.emit('ended');
    t.player.speak(utterance({ confirmedAt: 3_000 }), { accessCode: '', listener: () => {} });
    expect(t.player.getSnapshot().lastConfirmToPlayMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// 9. TTD WebSocket binary frames and per-request character limits

class FakeSocket implements WebSocketLike {
  binaryType = 'blob';
  sent: string[] = [];
  private listeners = new Map<string, Array<(e: { data?: unknown; code?: number }) => void>>();
  send(data: string) { this.sent.push(data); }
  close() {}
  addEventListener(type: string, fn: (e: { data?: unknown; code?: number }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, e: { data?: unknown; code?: number } = {}) { (this.listeners.get(type) ?? []).forEach((fn) => fn(e)); }
}

const cfg = { elevenLabsKey: 'k', elevenLabsModelId: 'eleven_v4_turbo', elevenLabsOutputFormat: 'mp3_44100_128' } as unknown as ServerConfig;
const frame = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).buffer as ArrayBuffer;

describe('Text to Dialogue WebSocket', () => {
  it('requests ArrayBuffer frames and accepts JSON delivered as ArrayBuffer', async () => {
    const sock = new FakeSocket();
    const p = synthesizeDialogueWs({ text: 'Hi.', voiceId: 'v1' }, cfg, new AbortController().signal, () => sock);
    expect(sock.binaryType).toBe('arraybuffer');
    sock.emit('open');
    sock.emit('message', { data: frame({ audio: Buffer.from([0xff, 0xfb, 1, 2]).toString('base64') }) });
    sock.emit('message', { data: frame({ is_final: true }) });
    const bytes = await p;
    expect(Array.from(bytes)).toEqual([0xff, 0xfb, 1, 2]);
  });

  it('classifies a per-request character_limit as an input rejection, not quota exhaustion', () => {
    expect(classifyProviderError('character_limit_exceeded')).toBe('too-long');
    expect(classifyProviderError('max_character_limit_exceeded')).toBe('too-long');
    expect(classifyProviderError('quota_exceeded')).toBe('quota');
    expect(classifyProviderError('insufficient_credits')).toBe('quota');
  });
});
