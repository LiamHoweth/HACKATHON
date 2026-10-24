// Opt-in, content-minimal gesture and speech measurement (brief §31). Pure and framework-free:
// no DOM, no React, no timers. The runtime records events; the metrics export summarizes them.
//
// Content rule: an event carries a kind, a monotonic timestamp, durations, and fixed enum values
// only. No message text, no partner text, no utterance/target ids, no provider messages. The
// types make free strings impossible to declare (see _NO_FREE_STRINGS) and record() rebuilds each
// event from an allow-list, rejecting unknown kinds and enum values, so a stray field such as
// `text` can never be stored or exported.
//
// Timing: gesture times are the face detector's frame timestamps; speech times are
// performance.now(). Both are monotonic milliseconds since page load. Durations are reported as
// counts, medians and ranges only (no accuracy percentages). "playing" is the audio element's
// playback-start callback, not verified audible onset.
import type { MetricEvent } from '@/core/state';
import { LIMITS } from '@/core/limits';
import type { BlinkGestureEvent, GestureCommand, SpeechPlaybackState } from '@/runtime/contract';
import type { ApiErrorCode } from '@/core/types';
import { MESSAGES, speechErrorMessage } from '@/audio/eleven-player';

// ---------------------------------------------------------------------------
// Event vocabulary

export type BrowCancelReason = Extract<BlinkGestureEvent, { type: 'brow-cancel' }>['reason'];
export type BlinkDiscardReason = Extract<BlinkGestureEvent, { type: 'discard' }>['reason'];
export type TtsEndOutcome = 'completed' | 'interrupted' | 'uncertain';
export type TtsErrorReason =
  | 'not-configured' | 'unauthorized' | 'invalid-input' | 'rate-limited' | 'timeout'
  | 'provider-unavailable' | 'network' | 'no-audio' | 'play-failed' | 'unavailable'
  | 'blocked' | 'unknown';

export const BROW_CANCEL_REASONS = ['too-short', 'blink-preempted', 'face-lost', 'ambiguous', 'stale'] as const satisfies readonly BrowCancelReason[];
export const BLINK_DISCARD_REASONS = ['too-short', 'too-long', 'face-lost', 'multiple-faces', 'stale'] as const satisfies readonly BlinkDiscardReason[];
export const TTS_END_OUTCOMES = ['completed', 'interrupted', 'uncertain'] as const satisfies readonly TtsEndOutcome[];
export const TTS_ERROR_REASONS = [
  'not-configured', 'unauthorized', 'invalid-input', 'rate-limited', 'timeout', 'provider-unavailable',
  'network', 'no-audio', 'play-failed', 'unavailable', 'blocked', 'unknown',
] as const satisfies readonly TtsErrorReason[];
const COMMANDS = ['NAV_NEXT', 'SELECT'] as const satisfies readonly GestureCommand[];

// Compile-time: every reason union in the contract is fully listed above.
type _Exhaustive<U, L extends readonly unknown[]> = [U] extends [L[number]] ? true : never;
const _exhaustive: [
  _Exhaustive<BrowCancelReason, typeof BROW_CANCEL_REASONS>,
  _Exhaustive<BlinkDiscardReason, typeof BLINK_DISCARD_REASONS>,
  _Exhaustive<GestureCommand, typeof COMMANDS>,
] = [true, true, true];
void _exhaustive;

/** t: monotonic ms. No field is ever free text. */
export type GestureMetricEvent =
  // Eyebrow detector (BrowGesture), proposals only
  | { kind: 'brow-start'; t: number }
  | { kind: 'brow-next'; t: number; heldMs: number }
  | { kind: 'brow-cancel'; t: number; heldMs: number; reason: BrowCancelReason }
  // Blink detector (BlinkGesture), proposals only
  | { kind: 'blink-closure-start'; t: number }
  | { kind: 'blink-select'; t: number; durationMs: number }
  | { kind: 'blink-discard'; t: number; durationMs: number; reason: BlinkDiscardReason }
  | { kind: 'face-lost'; t: number }
  | { kind: 'face-found'; t: number }
  // Arbiter accepted a command; applied = the runtime's ACTIVATE path actually applied it
  | { kind: 'gesture-accept'; t: number; command: GestureCommand; applied: boolean }
  // Natural-voice (ElevenLabs) attempt lifecycle. preview = setup voice test (excluded from summary)
  | { kind: 'tts-request'; t: number; preview: boolean }
  | { kind: 'tts-bytes'; t: number }
  | { kind: 'tts-playing'; t: number }
  | { kind: 'tts-end'; t: number; outcome: TtsEndOutcome }
  | { kind: 'tts-error'; t: number; reason: TtsErrorReason };

export type GestureMetricKind = GestureMetricEvent['kind'];

// Compile-time: no event may declare a plain `string` field (only enum literal unions).
type FreeStringFields<E> = E extends unknown
  ? { [K in keyof E]-?: string extends NonNullable<E[K]> ? (K extends 'kind' ? never : K) : never }[keyof E]
  : never;
const _NO_FREE_STRINGS: [FreeStringFields<GestureMetricEvent>] extends [never] ? true : never = true;
void _NO_FREE_STRINGS;

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isDur = (x: unknown): x is number => isNum(x) && x >= 0;
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === 'string' && (list as readonly string[]).includes(x);

/**
 * Allow-list rebuild of an event. Returns null for an unknown kind, a non-enum value, a missing
 * or non-finite number, or a non-boolean flag. Extra fields are dropped, never copied.
 */
export function sanitizeGestureEvent(input: unknown): GestureMetricEvent | null {
  if (!input || typeof input !== 'object') return null;
  const e = input as Record<string, unknown>;
  const t = e.t;
  if (!isNum(t)) return null;
  switch (e.kind) {
    case 'brow-start':
    case 'blink-closure-start':
    case 'face-lost':
    case 'face-found':
    case 'tts-bytes':
    case 'tts-playing':
      return { kind: e.kind, t };
    case 'brow-next':
      return isDur(e.heldMs) ? { kind: 'brow-next', t, heldMs: e.heldMs } : null;
    case 'brow-cancel':
      return isDur(e.heldMs) && oneOf(BROW_CANCEL_REASONS, e.reason) ? { kind: 'brow-cancel', t, heldMs: e.heldMs, reason: e.reason } : null;
    case 'blink-select':
      return isDur(e.durationMs) ? { kind: 'blink-select', t, durationMs: e.durationMs } : null;
    case 'blink-discard':
      return isDur(e.durationMs) && oneOf(BLINK_DISCARD_REASONS, e.reason) ? { kind: 'blink-discard', t, durationMs: e.durationMs, reason: e.reason } : null;
    case 'gesture-accept':
      return oneOf(COMMANDS, e.command) && typeof e.applied === 'boolean' ? { kind: 'gesture-accept', t, command: e.command, applied: e.applied } : null;
    case 'tts-request':
      return typeof e.preview === 'boolean' ? { kind: 'tts-request', t, preview: e.preview } : null;
    case 'tts-end':
      return oneOf(TTS_END_OUTCOMES, e.outcome) ? { kind: 'tts-end', t, outcome: e.outcome } : null;
    case 'tts-error':
      return oneOf(TTS_ERROR_REASONS, e.reason) ? { kind: 'tts-error', t, reason: e.reason } : null;
    default:
      return null;
  }
}

/** Map a raw detector event (BlinkRuntime.subscribe / routeBlink / routeBrow) to a metric event. */
export function fromBlinkGestureEvent(e: BlinkGestureEvent): GestureMetricEvent {
  switch (e.type) {
    case 'brow-start': return { kind: 'brow-start', t: e.at };
    case 'brow-next': return { kind: 'brow-next', t: e.at, heldMs: e.heldMs };
    case 'brow-cancel': return { kind: 'brow-cancel', t: e.at, heldMs: e.heldMs, reason: e.reason };
    case 'closure-start': return { kind: 'blink-closure-start', t: e.at };
    case 'select': return { kind: 'blink-select', t: e.at, durationMs: e.durationMs };
    case 'discard': return { kind: 'blink-discard', t: e.at, durationMs: e.durationMs, reason: e.reason };
    case 'face-lost': return { kind: 'face-lost', t: e.at };
    case 'face-found': return { kind: 'face-found', t: e.at };
  }
}

// ---------------------------------------------------------------------------
// Summary

export const NOT_MEASURED = 'not measured' as const;
export type NotMeasured = typeof NOT_MEASURED;

/** Observed spread of a small sample. No percentages, no inferential statistics. */
export type Spread = { n: number; median: number; min: number; max: number; unit: 'ms' | 'actions' };

export function spread(values: number[], unit: Spread['unit'] = 'ms'): Spread | NotMeasured {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NOT_MEASURED;
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  // ms rounded to whole milliseconds; action counts keep a half (median of an even sample).
  return { n: v.length, median: unit === 'ms' ? Math.round(median) : Math.round(median * 10) / 10, min: Math.round(v[0]), max: Math.round(v[v.length - 1]), unit };
}

const zeroCounts = <T extends string>(keys: readonly T[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;

export type BrowSummary = {
  /** Raises the detector saw begin. */
  onsets: number;
  /** Raises the detector held >= holdMs (proposed NAV_NEXT). */
  proposedNext: number;
  /** NAV_NEXT the arbiter accepted and the runtime applied. */
  committedNext: number;
  /** NAV_NEXT accepted by the arbiter but not applied by the runtime (paused, stale surface…). */
  acceptedNotApplied: number;
  /** Proposals the arbiter refused (e.g. a blink closure was in progress). */
  proposalsRefused: number;
  /** Raises that ended without NEXT, by reason (false or aborted raises). */
  cancelled: Record<BrowCancelReason, number>;
  /** Brow onset → accepted NEXT (arbiter accept time). */
  onsetToCommittedNextMs: Spread | NotMeasured;
  /** Detector hold time at the moment NEXT was proposed. */
  heldAtNextMs: Spread | NotMeasured;
  /** Hold time of cancelled raises. */
  cancelledHeldMs: Spread | NotMeasured;
  /** Accepted NEXT → next raise onset (includes release, stable neutral, and cooldown re-arm). */
  nextToNextOnsetMs: Spread | NotMeasured;
};

export type BlinkSummary = {
  closureStarts: number;
  /** Closures the detector proposed as deliberate (within min/max closure). */
  proposedSelect: number;
  /** SELECT accepted by the arbiter and applied by the runtime. */
  committedSelect: number;
  acceptedNotApplied: number;
  /** Proposals the arbiter refused (ambiguous with an eyebrow raise). */
  proposalsRefused: number;
  discarded: Record<BlinkDiscardReason, number>;
  selectedClosureMs: Spread | NotMeasured;
  discardedClosureMs: Spread | NotMeasured;
  /** Closure onset → accepted SELECT (arbiter accept time). */
  onsetToCommittedSelectMs: Spread | NotMeasured;
};

export type GestureSummary = {
  brow: BrowSummary | NotMeasured;
  blink: BlinkSummary | NotMeasured;
  faceLost: number;
  faceFound: number;
};

export type TtsSummary = {
  /** Conversation attempts (setup previews excluded and counted separately). */
  attempts: number;
  previews: number;
  /** Authorized request start → complete audio bytes received (player entered 'buffering'). */
  requestToBytesMs: Spread | NotMeasured;
  /** Bytes received → audio element 'playing' callback. */
  bytesToPlayingCallbackMs: Spread | NotMeasured;
  /** Request start → 'playing' callback. */
  requestToPlayingCallbackMs: Spread | NotMeasured;
  outcomes: Record<TtsEndOutcome, number>;
  errors: Record<TtsErrorReason, number>;
  /** Attempts with no recorded end or error (in flight at export, or lost). */
  unresolved: number;
};

export type SpeechSummary = {
  label: string;
  /** ElevenLabs provider timing; 'not measured' when no natural-voice attempt was recorded. */
  naturalVoice: TtsSummary | NotMeasured;
  /** Confirm activation → playback-start callback (any provider), from the core metric events. */
  confirmToPlaybackCallbackMs: Spread | NotMeasured;
  /** Confirmed messages with no playback-start callback recorded after them. */
  confirmedWithoutPlaybackCallback: number;
};

export type SelectionSummary = {
  confirmedMessages: number;
  /** Deliberate activations from the anchor (accepted partner input, else review open) through confirmation. */
  actionsPerConfirmedMessage: Spread | NotMeasured;
  regeneration: {
    /** "None of these" activations (batches rejected by the user). */
    rejectedBatches: number;
    /** Validated batches shown (generation-ready events): the stated denominator. */
    batchesShown: number;
    denominator: 'generation-ready events (validated batches shown)';
  } | NotMeasured;
  guidanceUses: number;
  generationErrors: Record<string, number>;
  /** Wrong targets, missed activations, false selections/confirmations, unintended speech. */
  selectionErrors: 'not measured: requires observer annotation per trial';
};

type Pending = { t: number } | null;

export function summarizeGestures(events: readonly GestureMetricEvent[]): GestureSummary {
  const ev = [...events].sort((a, b) => a.t - b.t);
  let browSeen = false;
  let blinkSeen = false;
  const brow = {
    onsets: 0, proposedNext: 0, committedNext: 0, acceptedNotApplied: 0,
    cancelled: zeroCounts(BROW_CANCEL_REASONS),
  };
  const blink = {
    closureStarts: 0, proposedSelect: 0, committedSelect: 0, acceptedNotApplied: 0,
    discarded: zeroCounts(BLINK_DISCARD_REASONS),
  };
  const onsetToNext: number[] = [];
  const heldAtNext: number[] = [];
  const cancelledHeld: number[] = [];
  const rearm: number[] = [];
  const selected: number[] = [];
  const discarded: number[] = [];
  const onsetToSelect: number[] = [];
  let acceptsNext = 0;
  let acceptsSelect = 0;
  let browOpen: Pending = null;
  let lastNextAt: number | null = null;
  let closureOpen: Pending = null;
  let faceLost = 0;
  let faceFound = 0;

  for (const e of ev) {
    switch (e.kind) {
      case 'brow-start':
        browSeen = true;
        brow.onsets += 1;
        browOpen = { t: e.t };
        if (lastNextAt !== null) rearm.push(e.t - lastNextAt);
        lastNextAt = null;
        break;
      case 'brow-next':
        browSeen = true;
        brow.proposedNext += 1;
        heldAtNext.push(e.heldMs);
        break;
      case 'brow-cancel':
        browSeen = true;
        brow.cancelled[e.reason] += 1;
        cancelledHeld.push(e.heldMs);
        browOpen = null;
        break;
      case 'blink-closure-start':
        blinkSeen = true;
        blink.closureStarts += 1;
        closureOpen = { t: e.t };
        break;
      case 'blink-select':
        blinkSeen = true;
        blink.proposedSelect += 1;
        selected.push(e.durationMs);
        break;
      case 'blink-discard':
        blinkSeen = true;
        blink.discarded[e.reason] += 1;
        discarded.push(e.durationMs);
        closureOpen = null;
        break;
      case 'gesture-accept':
        if (e.command === 'NAV_NEXT') {
          browSeen = true;
          acceptsNext += 1;
          if (e.applied) brow.committedNext += 1;
          else brow.acceptedNotApplied += 1;
          if (browOpen) onsetToNext.push(e.t - browOpen.t);
          browOpen = null;
          lastNextAt = e.t;
        } else {
          blinkSeen = true;
          acceptsSelect += 1;
          if (e.applied) blink.committedSelect += 1;
          else blink.acceptedNotApplied += 1;
          if (closureOpen) onsetToSelect.push(e.t - closureOpen.t);
          closureOpen = null;
        }
        break;
      case 'face-lost':
        faceLost += 1;
        browOpen = null;
        closureOpen = null;
        lastNextAt = null;
        break;
      case 'face-found':
        faceFound += 1;
        break;
      default:
        break; // tts-* events belong to the speech summary
    }
  }

  return {
    brow: browSeen
      ? {
          ...brow,
          proposalsRefused: Math.max(0, brow.proposedNext - acceptsNext),
          onsetToCommittedNextMs: spread(onsetToNext),
          heldAtNextMs: spread(heldAtNext),
          cancelledHeldMs: spread(cancelledHeld),
          nextToNextOnsetMs: spread(rearm),
        }
      : NOT_MEASURED,
    blink: blinkSeen
      ? {
          ...blink,
          proposalsRefused: Math.max(0, blink.proposedSelect - acceptsSelect),
          selectedClosureMs: spread(selected),
          discardedClosureMs: spread(discarded),
          onsetToCommittedSelectMs: spread(onsetToSelect),
        }
      : NOT_MEASURED,
    faceLost,
    faceFound,
  };
}

export function summarizeTts(events: readonly GestureMetricEvent[]): TtsSummary | NotMeasured {
  const ev = [...events].sort((a, b) => a.t - b.t);
  const out = {
    attempts: 0, previews: 0, unresolved: 0,
    outcomes: zeroCounts(TTS_END_OUTCOMES), errors: zeroCounts(TTS_ERROR_REASONS),
  };
  const toBytes: number[] = [];
  const bytesToPlaying: number[] = [];
  const toPlaying: number[] = [];
  // Attempts are sequential (one active job in the player); later events attach to the open one.
  let open = null as { t: number; bytesAt: number | null; preview: boolean } | null;
  for (const e of ev) {
    switch (e.kind) {
      case 'tts-request':
        if (open && !open.preview) out.unresolved += 1;
        if (e.preview) out.previews += 1;
        else out.attempts += 1;
        open = { t: e.t, bytesAt: null, preview: e.preview };
        break;
      case 'tts-bytes':
        if (open && !open.preview && open.bytesAt === null) {
          open.bytesAt = e.t;
          toBytes.push(e.t - open.t);
        }
        break;
      case 'tts-playing':
        if (open && !open.preview) {
          toPlaying.push(e.t - open.t);
          if (open.bytesAt !== null) bytesToPlaying.push(e.t - open.bytesAt);
        }
        break;
      case 'tts-end':
        if (open && !open.preview) out.outcomes[e.outcome] += 1;
        open = null;
        break;
      case 'tts-error':
        if (open && !open.preview) out.errors[e.reason] += 1;
        open = null;
        break;
      default:
        break;
    }
  }
  if (open && !open.preview) out.unresolved += 1;
  if (!out.attempts && !out.previews) return NOT_MEASURED;
  return {
    ...out,
    requestToBytesMs: spread(toBytes),
    bytesToPlayingCallbackMs: spread(bytesToPlaying),
    requestToPlayingCallbackMs: spread(toPlaying),
  };
}

export const PLAYBACK_LABEL =
  'Playback timings use the playback-start callback (audio element "playing" / speechSynthesis start), not verified audible onset.';

export function summarizeSpeech(gestureEvents: readonly GestureMetricEvent[], coreEvents: readonly MetricEvent[] = []): SpeechSummary {
  const ev = [...coreEvents].sort((a, b) => a.t - b.t);
  const confirmToPlay: number[] = [];
  let withoutPlayback = 0;
  ev.forEach((e, i) => {
    if (e.kind !== 'confirm') return;
    let playback: MetricEvent | undefined;
    for (let j = i + 1; j < ev.length; j++) {
      if (ev[j].kind === 'confirm') break;
      if (ev[j].kind === 'playback-start') {
        playback = ev[j];
        break;
      }
    }
    if (playback) confirmToPlay.push(playback.t - e.t);
    else withoutPlayback += 1;
  });
  return {
    label: PLAYBACK_LABEL,
    naturalVoice: summarizeTts(gestureEvents),
    confirmToPlaybackCallbackMs: spread(confirmToPlay),
    confirmedWithoutPlaybackCallback: withoutPlayback,
  };
}

/** Selection actions, regeneration and errors from the core reducer's metric events. */
export function summarizeSelection(coreEvents: readonly MetricEvent[]): SelectionSummary {
  const ev = [...coreEvents].sort((a, b) => a.t - b.t);
  const generationErrors: Record<string, number> = {};
  let rejected = 0;
  let shown = 0;
  let guidance = 0;
  for (const e of ev) {
    if (e.kind === 'none-of-these') rejected += 1;
    else if (e.kind === 'generation-ready') shown += 1;
    else if (e.kind === 'guidance') guidance += 1;
    else if (e.kind === 'generation-error') {
      const code = /^[A-Z_]{1,40}$/.test(e.detail ?? '') ? (e.detail as string) : 'unknown';
      generationErrors[code] = (generationErrors[code] ?? 0) + 1;
    }
  }
  // Per confirmed message: activations after the previous confirmation and at/after the anchor
  // (latest accepted partner input, else latest review open), through the confirm activation
  // itself (same timestamp). Nothing is subtracted (guidance, regeneration, corrections count).
  const actions: number[] = [];
  let prevConfirmT = -Infinity;
  for (const c of ev) {
    if (c.kind !== 'confirm') continue;
    const span = ev.filter((x) => x.t > prevConfirmT && x.t <= c.t);
    const anchor = [...span].reverse().find((x) => x.kind === 'partner-accepted')
      ?? [...span].reverse().find((x) => x.kind === 'review-open');
    const from = anchor?.t ?? -Infinity;
    actions.push(span.filter((x) => x.kind === 'activation' && x.t >= from).length);
    prevConfirmT = c.t;
  }
  return {
    confirmedMessages: actions.length,
    actionsPerConfirmedMessage: spread(actions, 'actions'),
    regeneration: shown || rejected
      ? { rejectedBatches: rejected, batchesShown: shown, denominator: 'generation-ready events (validated batches shown)' }
      : NOT_MEASURED,
    guidanceUses: guidance,
    generationErrors,
    selectionErrors: 'not measured: requires observer annotation per trial',
  };
}

// ---------------------------------------------------------------------------
// Recorder

export type GestureMetricsExportJSON = {
  gestureEvents: GestureMetricEvent[];
  gestures: GestureSummary;
  speech: SpeechSummary;
};

export type GestureMetrics = {
  /** Records one event when measurement is enabled. Returns false if disabled or rejected. */
  record: (event: GestureMetricEvent) => boolean;
  /** Convenience: record a raw detector event. */
  recordGesture: (event: BlinkGestureEvent) => boolean;
  /** Opt-in switch (mirror state.settings.measurement). Off by default. */
  setEnabled: (on: boolean) => void;
  readonly enabled: boolean;
  /** Drop all recorded events (new session, session end, clear data). */
  reset: () => void;
  events: () => GestureMetricEvent[];
  summary: (coreEvents?: readonly MetricEvent[]) => { gestures: GestureSummary; speech: SpeechSummary };
  toExportJSON: (coreEvents?: readonly MetricEvent[]) => GestureMetricsExportJSON;
};

export function createGestureMetrics(opts: { enabled?: boolean; limit?: number } = {}): GestureMetrics {
  let enabled = opts.enabled ?? false;
  const limit = Math.max(1, opts.limit ?? LIMITS.metricsEvents);
  let list: GestureMetricEvent[] = [];

  const record = (event: GestureMetricEvent): boolean => {
    if (!enabled) return false;
    const clean = sanitizeGestureEvent(event);
    if (!clean) return false;
    list.push(clean);
    if (list.length > limit) list = list.slice(-limit);
    return true;
  };
  const exported = () => list.map((e) => ({ ...e, t: Math.round(e.t) }) as GestureMetricEvent);
  const summary = (coreEvents: readonly MetricEvent[] = []) => ({
    gestures: summarizeGestures(list),
    speech: summarizeSpeech(list, coreEvents),
  });

  return {
    record,
    recordGesture: (e) => record(fromBlinkGestureEvent(e)),
    setEnabled: (on) => {
      enabled = !!on;
    },
    get enabled() {
      return enabled;
    },
    reset: () => {
      list = [];
    },
    events: () => list.map((e) => ({ ...e })),
    summary,
    toExportJSON: (coreEvents = []) => ({ gestureEvents: exported(), ...summary(coreEvents) }),
  };
}

// One recorder per page so useBlink, useAudio and the metrics export share it (like the player).
let shared: GestureMetrics | null = null;
export function getSharedGestureMetrics(): GestureMetrics {
  if (!shared) shared = createGestureMetrics();
  return shared;
}

// ---------------------------------------------------------------------------
// Natural-voice player observer

type SnapshotLike = { state: SpeechPlaybackState; message: string | null };
type PlayerLike = { subscribe: (fn: () => void) => () => void; getSnapshot: () => SnapshotLike };

const CODE_REASONS: Array<[ApiErrorCode, TtsErrorReason]> = [
  ['UNAUTHORIZED', 'unauthorized'], ['INVALID_INPUT', 'invalid-input'], ['RATE_LIMITED', 'rate-limited'],
  ['TIMEOUT', 'timeout'], ['NETWORK', 'network'], ['NOT_CONFIGURED', 'not-configured'],
  ['PROVIDER_UNAVAILABLE', 'provider-unavailable'],
];

/** Map the player's factual failure line to a fixed reason. The message itself is never stored. */
export function ttsErrorReason(state: SpeechPlaybackState, message: string | null): TtsErrorReason {
  if (state === 'blocked') return 'blocked';
  if (message === MESSAGES.noAudio) return 'no-audio';
  if (message === MESSAGES.playFailed) return 'play-failed';
  if (message === MESSAGES.unavailable) return 'unavailable';
  if (message === MESSAGES.notConfigured) return 'not-configured';
  for (const [code, reason] of CODE_REASONS) if (message === speechErrorMessage(code)) return reason;
  return 'unknown';
}

/**
 * Translate one player snapshot transition into metric events. `inAttempt` / `preview` describe
 * the attempt open before this transition; the caller keeps them (see observeElevenPlayer).
 */
export function ttsEventsForTransition(
  prev: SnapshotLike, next: SnapshotLike, t: number, inAttempt: boolean,
): GestureMetricEvent[] {
  if (prev.state === next.state) return [];
  switch (next.state) {
    case 'requesting':
      return [{ kind: 'tts-request', t, preview: next.message === MESSAGES.previewing }];
    case 'buffering':
      return inAttempt ? [{ kind: 'tts-bytes', t }] : [];
    case 'playing':
      return inAttempt ? [{ kind: 'tts-playing', t }] : [];
    case 'completed':
    case 'interrupted':
    case 'uncertain':
      return inAttempt ? [{ kind: 'tts-end', t, outcome: next.state }] : [];
    case 'failed':
    case 'blocked':
      return inAttempt ? [{ kind: 'tts-error', t, reason: ttsErrorReason(next.state, next.message) }] : [];
    default:
      return [];
  }
}

/**
 * Subscribe a recorder to the natural-voice player's state transitions (request → bytes →
 * playing → end/error). Returns unsubscribe. Records nothing while the recorder is disabled.
 */
export function observeElevenPlayer(
  player: PlayerLike, metrics: GestureMetrics = getSharedGestureMetrics(),
  now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
): () => void {
  let prev = player.getSnapshot();
  let inAttempt = prev.state === 'requesting' || prev.state === 'buffering' || prev.state === 'playing';
  return player.subscribe(() => {
    const next = player.getSnapshot();
    for (const e of ttsEventsForTransition(prev, next, now(), inAttempt)) {
      metrics.record(e);
      if (e.kind === 'tts-request') inAttempt = true;
      if (e.kind === 'tts-end' || e.kind === 'tts-error') inAttempt = false;
    }
    prev = next;
  });
}
