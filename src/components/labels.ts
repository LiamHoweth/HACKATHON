// Presentation-only label helpers. No state changes happen here.
import type { AccessMode, AiMode, CandidateSource, Delivery, MessageSource, PartnerTurnSource } from '@/core/types';
import type { MetricEvent, RecordingStatus, State, StorageStatus } from '@/core/state';
import type { Provenance } from '@/adaptation/preference-policy';
import type { BlinkStatus } from '@/runtime/contract';

export const ACCESS_LABELS: Record<AccessMode, string> = {
  blink: 'Blink control',
  switch: 'Switch scanning',
  keyboard: 'Keyboard',
  pointer: 'Pointer',
};

export const AI_MODE_LABELS: Record<AiMode, string> = {
  live: 'Live AI',
  fixture: 'Fixture demo',
  'local-only': 'Local only',
};

export const BATCH_SOURCE_LABELS: Record<CandidateSource, string> = {
  'live-model': 'Live AI',
  'demo-fixture': 'Fixture demo',
};

export const MESSAGE_SOURCE_LABELS: Record<MessageSource, string> = {
  'live-model': 'Live AI suggestion',
  'demo-fixture': 'Fixture demo suggestion',
  'saved-phrase': 'Saved phrase',
  'user-composed': 'Your own words',
};

export const PARTNER_SOURCE_LABELS: Record<PartnerTurnSource, string> = {
  'partner-typed': 'typed',
  'partner-transcribed': 'transcribed',
  'partner-edited': 'transcribed, then edited',
};

export const DELIVERY_LABELS: Record<Delivery, string> = {
  queued: 'Getting ready to speak',
  speaking: 'Speaking now',
  completed: 'Spoken (playback reported complete)',
  interrupted: 'Stopped before finishing',
  failed: 'Speech failed — shown here as text',
  uncertain: 'Playback status uncertain',
};

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  'this-response': 'chosen for this response',
  saved: 'approved saved preference',
  'session-hint': 'temporary session hint',
  default: 'default',
};

export type BlinkTone = 'off' | 'ok' | 'work' | 'warn' | 'stop';

/** Visible text and tone for every blink status. No confidence percentages, ever. */
export const BLINK_STATUS_LABELS: Record<BlinkStatus, { text: string; tone: BlinkTone; icon: string }> = {
  off: { text: 'Camera off', tone: 'off', icon: '○' },
  unsupported: { text: 'Camera unavailable', tone: 'stop', icon: '⊘' },
  'permission-denied': { text: 'Camera blocked', tone: 'stop', icon: '⊘' },
  starting: { text: 'Starting camera…', tone: 'work', icon: '◌' },
  'no-face': { text: 'Position face', tone: 'warn', icon: '◌' },
  'multiple-faces': { text: 'Two faces — held', tone: 'warn', icon: '◎' },
  ready: { text: 'Ready', tone: 'ok', icon: '◉' },
  closing: { text: 'Keep eyes closed…', tone: 'work', icon: '◐' },
  selected: { text: 'Selected', tone: 'ok', icon: '✓' },
  cooldown: { text: 'Re-arming', tone: 'work', icon: '◔' },
  'face-lost': { text: 'Face lost — paused', tone: 'stop', icon: '◌' },
};

/** Statuses in which the detector is tracking one face and gestures can count. */
export const BLINK_ARMED: ReadonlySet<BlinkStatus> = new Set<BlinkStatus>(['ready', 'closing', 'selected', 'cooldown']);

/**
 * Coarse category announced to screen readers. Per-gesture transitions (closing, selected,
 * cooldown) collapse into "ready" so a polite live region speaks only real state changes.
 */
export function blinkAnnouncement(status: BlinkStatus): string {
  if (BLINK_ARMED.has(status)) return 'Blink control ready.';
  return `Blink control: ${BLINK_STATUS_LABELS[status].text}.`;
}

export function micLabel(status: RecordingStatus): string {
  switch (status) {
    case 'idle': return 'Mic off';
    case 'requesting': return 'Mic: asking permission';
    case 'recording': return 'Mic: RECORDING';
    case 'transcribing': return 'Mic off · transcribing';
    case 'review': return 'Mic off · transcript ready';
    case 'error': return 'Mic: problem';
  }
}

export function storageLabel(status: StorageStatus, persist: boolean): string {
  switch (status) {
    case 'unknown': return 'Checking this device';
    case 'empty': return persist ? 'Nothing saved yet on this device' : 'This session only';
    case 'loaded': return 'Loaded from this device';
    case 'corrupt': return 'Saved data unreadable';
    case 'unavailable': return 'Device storage unavailable';
    case 'saved': return 'Saved on this device';
    case 'write-failed': return 'Could not save to this device';
    case 'session-only': return 'This session only';
  }
}

export function personalizationLabel(s: State): string {
  const st = s.settings;
  if (!st.usePreferences && !st.sessionAdaptation) return 'off';
  if (st.personalizationPaused) return 'paused';
  return 'on';
}

export const formatTime = (epochMs: number): string => {
  try {
    return new Date(epochMs).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(epochMs);
  }
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function metricsSummary(events: MetricEvent[]) {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const starts = new Map<string, number>();
  const latencies: number[] = [];
  for (const e of events) {
    if (!e.requestId) continue;
    if (e.kind === 'generation-start') starts.set(e.requestId, e.t);
    else if (e.kind === 'generation-ready') {
      const st = starts.get(e.requestId);
      if (st !== undefined && e.t >= st) latencies.push(e.t - st);
    }
  }
  return {
    counts: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    medianGenerationMs: median(latencies),
    generationSamples: latencies.length,
  };
}
