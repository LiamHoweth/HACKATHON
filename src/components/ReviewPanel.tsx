'use client';

import type { StillHereRuntime } from '@/runtime/contract';
import { anchorLabel } from '@/core/targets';
import { TargetList } from './TargetButton';
import { SurfaceTitle } from './SurfaceTitle';
import { MESSAGE_SOURCE_LABELS } from './labels';
import { BlinkHint } from './BlinkStatus';
import type { AccessMode } from '@/core/types';

export function ReviewPanel({ runtime }: { runtime: StillHereRuntime }) {
  const { state, targets } = runtime;
  const review = state.review;
  const ws = review?.snapshot.workspaceId ? state.workspaces[review.snapshot.workspaceId] : null;

  return (
    <div className="review">
      <SurfaceTitle sub={reviewSub(state.settings.accessMode)}>
        Review your message
      </SurfaceTitle>
      {review ? (
        <>
          {review.origin.kind === 'basic-voice' && (
            <p className="info review-voice-notice" role="status">
              <strong>Will be spoken with the basic device voice</strong>, not the natural voice.
            </p>
          )}
          <blockquote className="review-text" lang={state.settings.language}>{review.snapshot.exactText}</blockquote>
          <p className="review-source">
            <span className="meta-label">Source:</span> {MESSAGE_SOURCE_LABELS[review.snapshot.source]}
            {ws ? <> · <span className="meta-label">{ws.anchor.mode === 'reply' ? 'Answering:' : 'Starting:'}</span> {anchorLabel(state, ws)}</> : null}
          </p>
        </>
      ) : (
        <p className="muted">There is no message to review.</p>
      )}
      <TargetList targets={targets} runtime={runtime} layout="row" label="Review actions" className="review-actions" />
      <BlinkHint runtime={runtime} action="speak" />
    </div>
  );
}

function reviewSub(mode: AccessMode): string {
  if (mode === 'brow-blink') return 'Nothing is spoken until you confirm Speak. The highlight starts on Cancel. Raise your eyebrows to move to Speak, then make a new long blink.';
  if (mode === 'blink') return 'Nothing is spoken until you confirm Speak. The highlight starts on Cancel; a new long blink on Speak says it aloud.';
  return 'Nothing is spoken until you select Speak.';
}
