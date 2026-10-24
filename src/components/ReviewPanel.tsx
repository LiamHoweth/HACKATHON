'use client';

import type { StillHereRuntime } from '@/runtime/contract';
import { anchorLabel } from '@/core/targets';
import { TargetList } from './TargetButton';
import { SurfaceTitle } from './SurfaceTitle';
import { MESSAGE_SOURCE_LABELS } from './labels';

export function ReviewPanel({ runtime }: { runtime: StillHereRuntime }) {
  const { state, targets } = runtime;
  const review = state.review;
  const ws = review?.snapshot.workspaceId ? state.workspaces[review.snapshot.workspaceId] : null;

  return (
    <div className="review">
      <SurfaceTitle sub="Nothing is spoken until you select Speak.">Review your message</SurfaceTitle>
      {review ? (
        <>
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
    </div>
  );
}
