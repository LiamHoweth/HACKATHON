'use client';

import type { StillHereRuntime } from '@/runtime/contract';
import { activeWorkspace } from '@/core/targets';
import {
  ACCESS_LABELS, AI_MODE_LABELS, BATCH_SOURCE_LABELS, micLabel, personalizationLabel, storageLabel,
} from './labels';

export function StatusBar({ runtime }: { runtime: StillHereRuntime }) {
  const { state } = runtime;
  const st = state.settings;
  const ws = activeWorkspace(state);
  const batch = ws && !ws.closed && ws.status === 'choosing' ? ws.batch : null;
  const recording = state.recording.status === 'recording';
  const pendingProposal = state.proposals.some((p) => p.status === 'pending');

  return (
    <dl className="status-bar" aria-label="Session status">
      <div className="status-item">
        <dt>Input</dt>
        <dd>{ACCESS_LABELS[st.accessMode]}{runtime.switchHeld ? ' · held' : ''}</dd>
      </div>
      <div className={`status-item${recording ? ' status-recording' : ''}`}>
        <dt>Mic</dt>
        <dd>{recording && <span className="rec-dot" aria-hidden="true" />}{micLabel(state.recording.status)}</dd>
      </div>
      <div className="status-item">
        <dt>Suggestions</dt>
        <dd>
          {AI_MODE_LABELS[st.aiMode]}
          {batch ? ` · showing ${BATCH_SOURCE_LABELS[batch.source]}` : ''}
        </dd>
      </div>
      <div className="status-item">
        <dt>Personalization</dt>
        <dd>
          {personalizationLabel(state)}
          {pendingProposal ? ' · Preference suggestion available' : ''}
        </dd>
      </div>
      <div className="status-item">
        <dt>Storage</dt>
        <dd>{storageLabel(state.storageStatus, st.persistOnDevice)}</dd>
      </div>
    </dl>
  );
}
