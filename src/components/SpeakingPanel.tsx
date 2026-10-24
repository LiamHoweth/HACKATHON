'use client';

import type { StillHereRuntime } from '@/runtime/contract';
import { TargetList } from './TargetButton';
import { SurfaceTitle } from './SurfaceTitle';
import { DELIVERY_LABELS } from './labels';

export function SpeakingPanel({ runtime }: { runtime: StillHereRuntime }) {
  const { state, targets } = runtime;
  const speech = state.speech;
  const turn = speech
    ? state.conversation.find((e) => e.role === 'user' && e.value.id === speech.userTurnId)
    : undefined;
  const delivery = turn && turn.role === 'user' ? turn.value.delivery : speech?.utterance.delivery;

  return (
    <div className="speaking">
      <SurfaceTitle>{delivery === 'failed' ? 'Your message (speech failed)' : 'Speaking'}</SurfaceTitle>
      {speech ? (
        <>
          <blockquote className="speaking-text" lang={state.settings.language}>{speech.utterance.exactText}</blockquote>
          <p className={`delivery delivery-${delivery ?? 'queued'}`} role="status">{delivery ? DELIVERY_LABELS[delivery] : ''}</p>
          {!runtime.speechAvailable && <p className="warning">Speech output is unavailable here. Show this text to your conversation partner.</p>}
        </>
      ) : (
        <p className="muted">Nothing is being spoken.</p>
      )}
      <TargetList targets={targets} runtime={runtime} layout="row" label="Speaking controls" className="safety-targets" />
    </div>
  );
}

export function PausedPanel({ runtime }: { runtime: StillHereRuntime }) {
  return (
    <div className="paused">
      <SurfaceTitle sub="Speech and recording are stopped. Your drafts and questions are kept.">Paused. Select Resume to continue.</SurfaceTitle>
      <TargetList targets={runtime.targets} runtime={runtime} layout="row" label="Paused controls" className="safety-targets" />
    </div>
  );
}
