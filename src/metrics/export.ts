// Content-minimal measurement export. state.metrics holds kinds, timestamps, sources and ids only:
// no partner text and no message text ever leaves through this file.
import type { MetricEvent, State } from '@/core/state';

export type MetricsSummary = {
  confirmedMessages: Array<{
    confirmAt: number;
    source: string | null;
    playbackStartAt: number | null;
    /** Accepted partner input (same workspace when known) to playback-start callback. */
    partnerAcceptedToPlaybackMs: number | null;
    reviewOpenToPlaybackMs: number | null;
    activationsSinceAnchor: number;
  }>;
  activationCounts: { total: number; bySource: Record<string, number> };
  generationLatencyMs: Array<{ requestId: string; ms: number; source: string | null }>;
  generationErrors: number;
  noneOfThese: number;
  guidanceUses: number;
};

export type MetricsExport = {
  format: 'still-here-metrics';
  version: 1;
  exportedAt: string;
  clock: 'performance.now() milliseconds since page load (monotonic); durations only';
  note: string;
  settings: { accessMode: string; aiMode: string; scanIntervalMs: number; readingPauseMs: number };
  events: MetricEvent[];
  summary: MetricsSummary;
};

const round = (n: number) => Math.round(n);

export function summarize(events: MetricEvent[]): MetricsSummary {
  const ev = [...events].sort((a, b) => a.t - b.t);
  const bySource: Record<string, number> = {};
  let total = 0;
  for (const e of ev) {
    if (e.kind !== 'activation') continue;
    total += 1;
    const k = e.source ?? 'unknown';
    bySource[k] = (bySource[k] ?? 0) + 1;
  }

  const starts = new Map<string, number>();
  const generationLatencyMs: MetricsSummary['generationLatencyMs'] = [];
  for (const e of ev) {
    if (!e.requestId) continue;
    if (e.kind === 'generation-start') starts.set(e.requestId, e.t);
    if (e.kind === 'generation-ready' && starts.has(e.requestId)) {
      generationLatencyMs.push({ requestId: e.requestId, ms: round(e.t - starts.get(e.requestId)!), source: e.source ?? null });
    }
  }

  const confirmedMessages: MetricsSummary['confirmedMessages'] = [];
  ev.forEach((e, i) => {
    if (e.kind !== 'confirm') return;
    const before = ev.slice(0, i);
    const review = [...before].reverse().find((x) => x.kind === 'review-open');
    const accepted = [...before].reverse().find(
      (x) => x.kind === 'partner-accepted' && (!e.workspaceId || !x.workspaceId || x.workspaceId === e.workspaceId),
    );
    const nextConfirmIdx = ev.findIndex((x, j) => j > i && x.kind === 'confirm');
    const after = ev.slice(i + 1, nextConfirmIdx === -1 ? undefined : nextConfirmIdx);
    const playback = after.find((x) => x.kind === 'playback-start');
    const anchorT = accepted?.t ?? review?.t ?? -Infinity;
    confirmedMessages.push({
      confirmAt: round(e.t),
      source: e.source ?? null,
      playbackStartAt: playback ? round(playback.t) : null,
      partnerAcceptedToPlaybackMs: playback && accepted ? round(playback.t - accepted.t) : null,
      reviewOpenToPlaybackMs: playback && review ? round(playback.t - review.t) : null,
      activationsSinceAnchor: ev.filter((x, j) => j <= i && x.kind === 'activation' && x.t >= anchorT).length,
    });
  });

  return {
    confirmedMessages,
    activationCounts: { total, bySource },
    generationLatencyMs,
    generationErrors: ev.filter((e) => e.kind === 'generation-error').length,
    noneOfThese: ev.filter((e) => e.kind === 'none-of-these').length,
    guidanceUses: ev.filter((e) => e.kind === 'guidance').length,
  };
}

/** Allow-list copy of each event so no unexpected field (e.g. text) can be exported. */
function minimal(e: MetricEvent): MetricEvent {
  const out: MetricEvent = { t: round(e.t), kind: e.kind };
  if (e.workspaceId !== undefined) out.workspaceId = e.workspaceId;
  if (e.requestId !== undefined) out.requestId = e.requestId;
  if (e.source !== undefined) out.source = e.source;
  if (e.detail !== undefined) out.detail = e.detail;
  return out;
}

export function buildMetricsExport(state: State, now: Date = new Date()): MetricsExport {
  const events = state.metrics.map(minimal);
  return {
    format: 'still-here-metrics',
    version: 1,
    exportedAt: now.toISOString(),
    clock: 'performance.now() milliseconds since page load (monotonic); durations only',
    note: 'Prototype measurement. Playback-start is the speech API callback, not verified audible onset. No message text included.',
    settings: {
      accessMode: state.settings.accessMode,
      aiMode: state.settings.aiMode,
      scanIntervalMs: state.settings.scanIntervalMs,
      readingPauseMs: state.settings.readingPauseMs,
    },
    events,
    summary: summarize(events),
  };
}

export function downloadMetrics(state: State): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const data = buildMetricsExport(state);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `still-here-metrics-${data.exportedAt.replace(/[:.]/g, '-')}.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
