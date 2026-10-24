// Opt-in, content-minimal gesture/speech measurement (brief §31): opt-in gating, allow-listed
// events (no free text can be stored), brow/blink/tts summaries with "not measured" when empty,
// natural-voice player observation, and the export's gestures / speech / selection sections.
import { describe, expect, it } from 'vitest';
import {
  NOT_MEASURED, createGestureMetrics, observeElevenPlayer, sanitizeGestureEvent, spread,
  summarizeGestures, summarizeSelection, summarizeSpeech, summarizeTts, ttsErrorReason,
  BROW_CANCEL_REASONS, BLINK_DISCARD_REASONS, TTS_END_OUTCOMES, TTS_ERROR_REASONS,
  type GestureMetricEvent,
} from '@/metrics/gesture-metrics';
import { buildMetricsExport } from '@/metrics/export';
import { ElevenPlayer, MESSAGES, speechErrorMessage, type AudioLike } from '@/audio/eleven-player';
import { initialState, type MetricEvent, type State } from '@/core/state';
import type { ConfirmedUtterance } from '@/core/types';
import type { SpeechPlaybackState } from '@/runtime/contract';

const SECRET = 'I need my medication now';
const on = () => createGestureMetrics({ enabled: true });

/** Every string anywhere in a JSON value. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => (out.push(k), strings(x, out)));
  return out;
}

const KINDS = [
  'brow-start', 'brow-next', 'brow-cancel', 'blink-closure-start', 'blink-select', 'blink-discard',
  'face-lost', 'face-found', 'gesture-accept', 'tts-request', 'tts-bytes', 'tts-playing', 'tts-end', 'tts-error',
];
const EVENT_STRINGS = new Set<string>([
  ...KINDS, ...BROW_CANCEL_REASONS, ...BLINK_DISCARD_REASONS, ...TTS_END_OUTCOMES, ...TTS_ERROR_REASONS,
  'NAV_NEXT', 'SELECT', 'kind', 't', 'heldMs', 'durationMs', 'reason', 'command', 'applied', 'preview', 'outcome',
]);

describe('opt-in gating', () => {
  it('records nothing until enabled, and reset clears', () => {
    const m = createGestureMetrics();
    expect(m.enabled).toBe(false);
    expect(m.record({ kind: 'brow-start', t: 1 })).toBe(false);
    expect(m.events()).toEqual([]);
    m.setEnabled(true);
    expect(m.record({ kind: 'brow-start', t: 2 })).toBe(true);
    expect(m.events()).toHaveLength(1);
    m.setEnabled(false);
    expect(m.record({ kind: 'brow-start', t: 3 })).toBe(false);
    m.reset();
    expect(m.events()).toEqual([]);
  });

  it('caps the buffer at the limit (oldest dropped)', () => {
    const m = createGestureMetrics({ enabled: true, limit: 3 });
    for (let t = 0; t < 5; t++) m.record({ kind: 'face-found', t });
    expect(m.events().map((e) => e.t)).toEqual([2, 3, 4]);
  });
});

describe('content minimality', () => {
  it('drops unexpected fields such as message text', () => {
    const m = on();
    // @ts-expect-error a text field is not part of any metric event
    expect(m.record({ kind: 'blink-select', t: 10, durationMs: 400, text: SECRET })).toBe(true);
    // @ts-expect-error nor is an utterance id
    m.record({ kind: 'tts-request', t: 11, preview: false, utteranceId: SECRET });
    const json = JSON.stringify(m.toExportJSON());
    expect(json).not.toContain(SECRET);
    expect(m.events()).toEqual([
      { kind: 'blink-select', t: 10, durationMs: 400 },
      { kind: 'tts-request', t: 11, preview: false },
    ]);
  });

  it('rejects strings that are not in the fixed enums, unknown kinds, and bad numbers', () => {
    const bad: unknown[] = [
      { kind: 'brow-cancel', t: 1, heldMs: 10, reason: SECRET },
      { kind: 'blink-discard', t: 1, durationMs: 10, reason: SECRET },
      { kind: 'tts-error', t: 1, reason: SECRET },
      { kind: 'tts-end', t: 1, outcome: SECRET },
      { kind: 'gesture-accept', t: 1, command: SECRET, applied: true },
      { kind: 'gesture-accept', t: 1, command: 'SELECT', applied: 'yes' },
      { kind: 'tts-request', t: 1, preview: SECRET },
      { kind: SECRET, t: 1 },
      { kind: 'brow-start', t: SECRET },
      { kind: 'brow-start', t: Number.NaN },
      { kind: 'brow-next', t: 1, heldMs: -5 },
      { kind: 'blink-select', t: 1, durationMs: Infinity },
      null, SECRET, 42,
    ];
    const m = on();
    for (const e of bad) {
      expect(sanitizeGestureEvent(e)).toBeNull();
      expect(m.record(e as GestureMetricEvent)).toBe(false);
    }
    expect(m.events()).toEqual([]);
  });

  it('every string in the exported gesture events is a fixed enum value or key', () => {
    const m = on();
    const all: GestureMetricEvent[] = [
      { kind: 'brow-start', t: 0 }, { kind: 'brow-next', t: 500, heldMs: 500 },
      { kind: 'gesture-accept', t: 500, command: 'NAV_NEXT', applied: true },
      { kind: 'brow-cancel', t: 900, heldMs: 200, reason: 'too-short' },
      { kind: 'blink-closure-start', t: 1000 }, { kind: 'blink-select', t: 1400, durationMs: 400 },
      { kind: 'gesture-accept', t: 1400, command: 'SELECT', applied: false },
      { kind: 'blink-discard', t: 2000, durationMs: 90, reason: 'too-short' },
      { kind: 'face-lost', t: 2100 }, { kind: 'face-found', t: 2200 },
      { kind: 'tts-request', t: 3000, preview: false }, { kind: 'tts-bytes', t: 3400 },
      { kind: 'tts-playing', t: 3500 }, { kind: 'tts-end', t: 5000, outcome: 'completed' },
      { kind: 'tts-request', t: 6000, preview: false }, { kind: 'tts-error', t: 6100, reason: 'timeout' },
    ];
    all.forEach((e) => expect(m.record(e)).toBe(true));
    const unexpected = strings(m.toExportJSON().gestureEvents).filter((s) => !EVENT_STRINGS.has(s));
    expect(unexpected).toEqual([]);
  });

  it('maps player failure lines to fixed reasons without storing the line', () => {
    expect(ttsErrorReason('failed', speechErrorMessage('TIMEOUT'))).toBe('timeout');
    expect(ttsErrorReason('failed', speechErrorMessage('UNAUTHORIZED'))).toBe('unauthorized');
    expect(ttsErrorReason('failed', speechErrorMessage('NETWORK'))).toBe('network');
    expect(ttsErrorReason('failed', MESSAGES.noAudio)).toBe('no-audio');
    expect(ttsErrorReason('failed', MESSAGES.playFailed)).toBe('play-failed');
    expect(ttsErrorReason('blocked', MESSAGES.blocked)).toBe('blocked');
    expect(ttsErrorReason('failed', SECRET)).toBe('unknown');
  });
});

describe('summaries', () => {
  it('reports "not measured" for every section when nothing was recorded', () => {
    const g = summarizeGestures([]);
    expect(g.brow).toBe(NOT_MEASURED);
    expect(g.blink).toBe(NOT_MEASURED);
    expect(summarizeTts([])).toBe(NOT_MEASURED);
    const sp = summarizeSpeech([], []);
    expect(sp.naturalVoice).toBe(NOT_MEASURED);
    expect(sp.confirmToPlaybackCallbackMs).toBe(NOT_MEASURED);
    expect(spread([])).toBe(NOT_MEASURED);
    const sel = summarizeSelection([]);
    expect(sel.actionsPerConfirmedMessage).toBe(NOT_MEASURED);
    expect(sel.regeneration).toBe(NOT_MEASURED);
    expect(sel.selectionErrors).toMatch(/^not measured/);
  });

  it('spread gives n, median and range only (no percentages)', () => {
    expect(spread([30, 10, 20, 40])).toEqual({ n: 4, median: 25, min: 10, max: 40, unit: 'ms' });
    expect(spread([3], 'actions')).toEqual({ n: 1, median: 3, min: 3, max: 3, unit: 'actions' });
  });

  it('eyebrow: onset → committed NEXT, held time, false/aborted raises, refused proposals, re-arm', () => {
    const ev: GestureMetricEvent[] = [
      // raise 1: committed NEXT 520 ms after onset
      { kind: 'brow-start', t: 1000 }, { kind: 'brow-next', t: 1500, heldMs: 500 },
      { kind: 'gesture-accept', t: 1520, command: 'NAV_NEXT', applied: true },
      // raise 2: re-armed 900 ms after NEXT; too short
      { kind: 'brow-start', t: 2420 }, { kind: 'brow-cancel', t: 2600, heldMs: 180, reason: 'too-short' },
      // raise 3: pre-empted by a blink
      { kind: 'brow-start', t: 3000 }, { kind: 'brow-cancel', t: 3100, heldMs: 100, reason: 'blink-preempted' },
      // raise 4: proposed but refused by the arbiter (no accept)
      { kind: 'brow-start', t: 4000 }, { kind: 'brow-next', t: 4500, heldMs: 500 },
      // raise 5: accepted but not applied (stale surface)
      { kind: 'brow-start', t: 5000 }, { kind: 'brow-next', t: 5500, heldMs: 500 },
      { kind: 'gesture-accept', t: 5560, command: 'NAV_NEXT', applied: false },
    ];
    const b = summarizeGestures(ev).brow;
    if (b === NOT_MEASURED) throw new Error('expected brow summary');
    expect(b.onsets).toBe(5);
    expect(b.proposedNext).toBe(3);
    expect(b.committedNext).toBe(1);
    expect(b.acceptedNotApplied).toBe(1);
    expect(b.proposalsRefused).toBe(1);
    expect(b.cancelled).toEqual({ 'too-short': 1, 'blink-preempted': 1, 'face-lost': 0, ambiguous: 0, stale: 0 });
    expect(b.onsetToCommittedNextMs).toEqual({ n: 2, median: 540, min: 520, max: 560, unit: 'ms' });
    expect(b.heldAtNextMs).toEqual({ n: 3, median: 500, min: 500, max: 500, unit: 'ms' });
    expect(b.cancelledHeldMs).toEqual({ n: 2, median: 140, min: 100, max: 180, unit: 'ms' });
    expect(b.nextToNextOnsetMs).toEqual({ n: 1, median: 900, min: 900, max: 900, unit: 'ms' });
    expect(summarizeGestures(ev).blink).toBe(NOT_MEASURED);
  });

  it('blink: closure durations for accepted and discarded closures, with reasons', () => {
    const ev: GestureMetricEvent[] = [
      { kind: 'blink-closure-start', t: 100 }, { kind: 'blink-select', t: 500, durationMs: 400 },
      { kind: 'gesture-accept', t: 500, command: 'SELECT', applied: true },
      { kind: 'blink-closure-start', t: 1000 }, { kind: 'blink-discard', t: 1120, durationMs: 120, reason: 'too-short' },
      { kind: 'blink-closure-start', t: 2000 }, { kind: 'blink-discard', t: 4500, durationMs: 2500, reason: 'too-long' },
      // ambiguous with a brow raise: proposed, refused by the arbiter
      { kind: 'blink-closure-start', t: 5000 }, { kind: 'blink-select', t: 5600, durationMs: 600 },
      { kind: 'face-lost', t: 7000 },
    ];
    const s = summarizeGestures(ev);
    const k = s.blink;
    if (k === NOT_MEASURED) throw new Error('expected blink summary');
    expect(k.closureStarts).toBe(4);
    expect(k.proposedSelect).toBe(2);
    expect(k.committedSelect).toBe(1);
    expect(k.proposalsRefused).toBe(1);
    expect(k.discarded).toEqual({ 'too-short': 1, 'too-long': 1, 'face-lost': 0, 'multiple-faces': 0, stale: 0 });
    expect(k.selectedClosureMs).toEqual({ n: 2, median: 500, min: 400, max: 600, unit: 'ms' });
    expect(k.discardedClosureMs).toEqual({ n: 2, median: 1310, min: 120, max: 2500, unit: 'ms' });
    expect(k.onsetToCommittedSelectMs).toEqual({ n: 1, median: 400, min: 400, max: 400, unit: 'ms' });
    expect(s.faceLost).toBe(1);
  });

  it('tts: request → bytes → playing callback, outcomes and errors; previews excluded', () => {
    const ev: GestureMetricEvent[] = [
      { kind: 'tts-request', t: 0, preview: true }, { kind: 'tts-bytes', t: 50 }, { kind: 'tts-playing', t: 60 },
      { kind: 'tts-end', t: 900, outcome: 'completed' },
      { kind: 'tts-request', t: 1000, preview: false }, { kind: 'tts-bytes', t: 1700 },
      { kind: 'tts-playing', t: 1750 }, { kind: 'tts-end', t: 3000, outcome: 'completed' },
      { kind: 'tts-request', t: 4000, preview: false }, { kind: 'tts-bytes', t: 4900 },
      { kind: 'tts-playing', t: 5000 }, { kind: 'tts-end', t: 5200, outcome: 'interrupted' },
      { kind: 'tts-request', t: 6000, preview: false }, { kind: 'tts-error', t: 6300, reason: 'rate-limited' },
      { kind: 'tts-request', t: 7000, preview: false },
    ];
    const t = summarizeTts(ev);
    if (t === NOT_MEASURED) throw new Error('expected tts summary');
    expect(t.attempts).toBe(4);
    expect(t.previews).toBe(1);
    expect(t.requestToBytesMs).toEqual({ n: 2, median: 800, min: 700, max: 900, unit: 'ms' });
    expect(t.bytesToPlayingCallbackMs).toEqual({ n: 2, median: 75, min: 50, max: 100, unit: 'ms' });
    expect(t.requestToPlayingCallbackMs).toEqual({ n: 2, median: 875, min: 750, max: 1000, unit: 'ms' });
    expect(t.outcomes).toEqual({ completed: 1, interrupted: 1, uncertain: 0 });
    expect(t.errors['rate-limited']).toBe(1);
    expect(t.unresolved).toBe(1);
  });

  it('speech: confirmation → playback-start callback from core events, labeled as callback timing', () => {
    const core: MetricEvent[] = [
      { t: 100, kind: 'confirm' }, { t: 1100, kind: 'playback-start' }, { t: 2000, kind: 'playback-end' },
      { t: 3000, kind: 'confirm' }, { t: 3600, kind: 'playback-start' },
      { t: 5000, kind: 'confirm' },
    ];
    const s = summarizeSpeech([], core);
    expect(s.confirmToPlaybackCallbackMs).toEqual({ n: 2, median: 800, min: 600, max: 1000, unit: 'ms' });
    expect(s.confirmedWithoutPlaybackCallback).toBe(1);
    expect(s.label).toMatch(/callback/);
    expect(s.label).toMatch(/not verified audible/);
  });

  it('selection: actions per confirmed message (confirm activation included), regeneration with denominator', () => {
    const core: MetricEvent[] = [
      { t: 0, kind: 'partner-accepted' },
      { t: 10, kind: 'generation-start', requestId: 'r1' }, { t: 900, kind: 'generation-ready', requestId: 'r1' },
      { t: 1000, kind: 'activation', detail: 'none-of-these' }, { t: 1000, kind: 'none-of-these' },
      { t: 1010, kind: 'generation-start', requestId: 'r2' }, { t: 1800, kind: 'generation-ready', requestId: 'r2' },
      { t: 2000, kind: 'activation', detail: 'cand-1' }, { t: 2000, kind: 'review-open' },
      // reducer records the confirm before its activation at the same timestamp
      { t: 2500, kind: 'confirm' }, { t: 2500, kind: 'activation', detail: 'confirm' },
      // second message: review → confirm, no partner input
      { t: 4000, kind: 'activation', detail: 'qp-1' }, { t: 4000, kind: 'review-open' },
      { t: 4500, kind: 'activation', detail: 'confirm' }, { t: 4500, kind: 'confirm' },
      { t: 5000, kind: 'generation-error', detail: 'TIMEOUT' }, { t: 5100, kind: 'guidance', detail: 'ask' },
    ];
    const s = summarizeSelection(core);
    expect(s.confirmedMessages).toBe(2);
    expect(s.actionsPerConfirmedMessage).toEqual({ n: 2, median: 2.5, min: 2, max: 3, unit: 'actions' });
    expect(s.regeneration).toEqual({ rejectedBatches: 1, batchesShown: 2, denominator: 'generation-ready events (validated batches shown)' });
    expect(s.generationErrors).toEqual({ TIMEOUT: 1 });
    expect(s.guidanceUses).toBe(1);
  });
});

describe('natural-voice player observation', () => {
  type Snap = { state: SpeechPlaybackState; message: string | null };
  function fakePlayer() {
    let snap: Snap = { state: 'idle', message: null };
    const fns = new Set<() => void>();
    return {
      getSnapshot: () => snap,
      subscribe: (fn: () => void) => {
        fns.add(fn);
        return () => {
          fns.delete(fn);
        };
      },
      set(s: Snap) {
        snap = s;
        fns.forEach((f) => f());
      },
    };
  }

  it('turns state transitions into tts events and ignores errors outside an attempt', () => {
    const p = fakePlayer();
    const m = on();
    let now = 0;
    const off = observeElevenPlayer(p, m, () => now);
    now = 5; p.set({ state: 'blocked', message: MESSAGES.blocked }); // enableAudio blocked, no attempt
    now = 10; p.set({ state: 'requesting', message: MESSAGES.requesting });
    now = 600; p.set({ state: 'buffering', message: MESSAGES.buffering });
    now = 650; p.set({ state: 'playing', message: MESSAGES.playing });
    now = 650; p.set({ state: 'playing', message: MESSAGES.playing }); // duplicate: ignored
    now = 2000; p.set({ state: 'completed', message: MESSAGES.completed });
    now = 3000; p.set({ state: 'requesting', message: MESSAGES.previewing });
    now = 3100; p.set({ state: 'failed', message: speechErrorMessage('NETWORK') });
    off();
    p.set({ state: 'requesting', message: MESSAGES.requesting }); // after unsubscribe
    expect(m.events()).toEqual([
      { kind: 'tts-request', t: 10, preview: false },
      { kind: 'tts-bytes', t: 600 },
      { kind: 'tts-playing', t: 650 },
      { kind: 'tts-end', t: 2000, outcome: 'completed' },
      { kind: 'tts-request', t: 3000, preview: true },
      { kind: 'tts-error', t: 3100, reason: 'network' },
    ]);
  });

  it('works against the real ElevenPlayer with a fake fetch and audio element', async () => {
    const handlers = new Map<string, Set<(ev: unknown) => void>>();
    const audio: AudioLike = {
      src: '', currentTime: 0,
      play: () => Promise.resolve(), pause() {}, load() {},
      addEventListener: (type, fn) => {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(fn);
      },
      removeEventListener: (type, fn) => handlers.get(type)?.delete(fn),
    };
    const emit = (type: string) => [...(handlers.get(type) ?? [])].forEach((fn) => fn({}));
    let now = 1000;
    const player = new ElevenPlayer({
      now: () => now,
      createAudio: () => audio,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
      timers: { setTimeout: () => 0, clearTimeout: () => {} },
      fetchImpl: (async () => {
        now = 1700;
        return {
          ok: true, status: 200,
          headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'audio/mpeg' : null) },
          json: async () => null,
          blob: async () => new Blob([new Uint8Array(16)], { type: 'audio/mpeg' }),
        };
      }) as unknown as typeof fetch,
    });
    const m = on();
    observeElevenPlayer(player, m, () => now);
    const u: ConfirmedUtterance = {
      id: 'u1', reviewId: 'rv1', exactText: SECRET, selectionEventId: 'e1', confirmationEventId: 'e2',
      selectionCycleId: 'c1', confirmationCycleId: 'c2', delivery: 'pending' as ConfirmedUtterance['delivery'],
      sessionEpoch: 's1', provider: 'elevenlabs', voiceChoiceId: null,
    };
    player.speak(u, { accessCode: '', listener: () => {}, startedAt: now });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    now = 1800; emit('playing');
    now = 3000; emit('ended');
    expect(m.events()).toEqual([
      { kind: 'tts-request', t: 1000, preview: false },
      { kind: 'tts-bytes', t: 1700 },
      { kind: 'tts-playing', t: 1800 },
      { kind: 'tts-end', t: 3000, outcome: 'completed' },
    ]);
    expect(JSON.stringify(m.toExportJSON())).not.toContain(SECRET);
  });
});

describe('metrics export integration', () => {
  const stateWith = (metrics: MetricEvent[], measurement = true): State => {
    const s = initialState('e1');
    return { ...s, metrics, settings: { ...s.settings, measurement } };
  };

  it('includes gestures, speech and selection sections; "not measured" when empty', () => {
    const out = buildMetricsExport(stateWith([]), new Date(0), createGestureMetrics());
    expect(out.version).toBe(2);
    expect(out.gestureEvents).toEqual([]);
    expect(out.gestures.brow).toBe(NOT_MEASURED);
    expect(out.gestures.blink).toBe(NOT_MEASURED);
    expect(out.speech.naturalVoice).toBe(NOT_MEASURED);
    expect(out.speech.confirmToPlaybackCallbackMs).toBe(NOT_MEASURED);
    expect(out.selection.actionsPerConfirmedMessage).toBe(NOT_MEASURED);
    expect(buildMetricsExport(stateWith([]), new Date(0), null).gestures.brow).toBe(NOT_MEASURED);
  });

  it('exports recorded gesture and speech timing, rounded, with no message text', () => {
    const m = on();
    m.recordGesture({ type: 'brow-start', at: 100.4 });
    m.recordGesture({ type: 'brow-next', at: 600.2, heldMs: 500 });
    m.record({ kind: 'gesture-accept', t: 600.2, command: 'NAV_NEXT', applied: true });
    m.recordGesture({ type: 'closure-start', at: 1000 });
    m.recordGesture({ type: 'discard', at: 1100, durationMs: 100, reason: 'too-short' });
    m.record({ kind: 'tts-request', t: 2000, preview: false });
    m.record({ kind: 'tts-bytes', t: 2600 });
    m.record({ kind: 'tts-playing', t: 2700 });
    const core: MetricEvent[] = [
      { t: 1900, kind: 'activation', source: 'face', detail: 'confirm' },
      { t: 1900, kind: 'confirm', source: 'face', workspaceId: 'w1' },
      { t: 2700, kind: 'playback-start' },
    ];
    const out = buildMetricsExport(stateWith(core), new Date(0), m);
    expect(out.gestureEvents[0]).toEqual({ kind: 'brow-start', t: 100 });
    const brow = out.gestures.brow;
    if (brow === NOT_MEASURED) throw new Error('expected brow');
    expect(brow.committedNext).toBe(1);
    expect(brow.onsetToCommittedNextMs).toEqual({ n: 1, median: 500, min: 500, max: 500, unit: 'ms' });
    const blink = out.gestures.blink;
    if (blink === NOT_MEASURED) throw new Error('expected blink');
    expect(blink.discarded['too-short']).toBe(1);
    const tts = out.speech.naturalVoice;
    if (tts === NOT_MEASURED) throw new Error('expected tts');
    expect(tts.requestToBytesMs).toEqual({ n: 1, median: 600, min: 600, max: 600, unit: 'ms' });
    expect(out.speech.confirmToPlaybackCallbackMs).toEqual({ n: 1, median: 800, min: 800, max: 800, unit: 'ms' });
    expect(out.selection.confirmedMessages).toBe(1);
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it('reduces compose-keyboard activation ids so key sequences cannot spell a message', () => {
    const core: MetricEvent[] = ['h', 'i'].map((k, i) => ({ t: i, kind: 'activation', source: 'face', detail: `key-${k}` }));
    core.push({ t: 5, kind: 'activation', source: 'face', detail: 'cand-1' });
    const out = buildMetricsExport(stateWith(core), new Date(0), createGestureMetrics());
    expect(out.events.map((e) => e.detail)).toEqual(['key', 'key', 'cand-1']);
  });
});
