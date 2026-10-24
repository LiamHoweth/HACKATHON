'use client';

import { useSyncExternalStore } from 'react';
import type { StillHereRuntime } from '@/runtime/contract';
import type { RecordingStatus } from '@/core/state';
import { activeWorkspace } from '@/core/targets';
import { BlinkStatus, isFaceMode } from './BlinkStatus';
import {
  ACCESS_LABELS, AI_MODE_LABELS, BATCH_SOURCE_LABELS, personalizationLabel,
} from './labels';

function micShort(status: RecordingStatus): string {
  switch (status) {
    case 'idle': return 'Off';
    case 'requesting': return 'Asking permission';
    case 'recording': return 'RECORDING';
    case 'transcribing': return 'Off · transcribing';
    case 'review': return 'Off · transcript ready';
    case 'error': return 'Problem';
  }
}

const noSubscribe = () => () => {};
/** True when the Screen Wake Lock API is missing (feature-detected on the client only). */
function useNoWakeLock(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof navigator !== 'undefined' && !('wakeLock' in navigator),
    () => false,
  );
}

/**
 * Compact header status: "Eye gestures: Ready • Mic: Off • Voice: Natural" first, then the
 * quieter session facts (suggestions, personalization, storage). Not a live region; the
 * gesture feedback area owns the single polite announcement.
 */
export function StatusBar({ runtime }: { runtime: StillHereRuntime }) {
  const { state } = runtime;
  const st = state.settings;
  const ws = activeWorkspace(state);
  const batch = ws && !ws.closed && ws.status === 'choosing' ? ws.batch : null;
  const recording = state.recording.status === 'recording';
  const pendingProposal = state.proposals.some((p) => p.status === 'pending');
  const face = isFaceMode(st.accessMode);
  const noWakeLock = useNoWakeLock();

  // Show the suggestion mode once; name the batch source only when it differs from the mode.
  const modeLabel = AI_MODE_LABELS[st.aiMode];
  const batchLabel = batch ? BATCH_SOURCE_LABELS[batch.source] : null;
  const suggestions = batchLabel && batchLabel !== modeLabel ? `${modeLabel} · this batch: ${batchLabel}` : modeLabel;

  const voice = st.speechProvider === 'elevenlabs'
    ? (runtime.audio && !runtime.audio.elevenLabsConfigured ? 'Natural (not configured)' : 'Natural')
    : 'Basic device voice';

  return (
    <dl className="status-bar" aria-label="Session status">
      <div className="status-item status-primary status-blink">
        <dt>{face ? 'Eye gestures' : 'Input'}</dt>
        <dd>
          {face ? <BlinkStatus blink={runtime.blink} /> : <>{ACCESS_LABELS[st.accessMode]}{runtime.switchHeld ? ' · held' : ''}</>}
          {face && <span className="sr-only"> ({ACCESS_LABELS[st.accessMode]})</span>}
        </dd>
      </div>
      {state.recording.status !== 'idle' && (
        <div className={`status-item status-primary${recording ? ' status-recording' : ''}`}>
          <dt>Mic</dt>
          <dd>{recording && <span className="rec-dot" aria-hidden="true" />}{micShort(state.recording.status)}</dd>
        </div>
      )}
      <div className="status-item status-primary">
        <dt>Voice</dt>
        <dd>{voice}</dd>
      </div>
      <div className="status-item status-secondary">
        <dt>Suggestions</dt>
        <dd>{suggestions}</dd>
      </div>
      {pendingProposal && (
        <div className="status-item status-secondary">
          <dt>Personalization</dt>
          <dd>{personalizationLabel(state)} · suggestion available</dd>
        </div>
      )}
      {face && noWakeLock && (
        <div className="status-item status-tip">
          <dt className="sr-only">Tip</dt>
          <dd>For hands-free use, set Auto-Lock to Never</dd>
        </div>
      )}
    </dl>
  );
}
