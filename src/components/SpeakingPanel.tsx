'use client';

import type { StillHereRuntime } from '@/runtime/contract';
import { TargetList } from './TargetButton';
import { SurfaceTitle } from './SurfaceTitle';
import { DELIVERY_LABELS } from './labels';
import { BlinkStatus } from './BlinkStatus';

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
  const blinkMode = runtime.state.settings.accessMode === 'blink';
  const { blink } = runtime;
  if (!blinkMode) {
    return (
      <div className="paused">
        <SurfaceTitle sub="Speech and recording are stopped. Your drafts and questions are kept.">Paused. Select Resume to continue.</SurfaceTitle>
        <TargetList targets={runtime.targets} runtime={runtime} layout="row" label="Paused controls" className="safety-targets" />
      </div>
    );
  }
  return (
    <div className="paused paused-blink">
      <SurfaceTitle sub="Speech and recording are stopped. Your drafts and questions are kept.">
        Paused. Look at the camera. When “Ready” shows, blink to Resume.
      </SurfaceTitle>
      <div className="paused-status">
        <BlinkStatus blink={blink} variant="large" />
        <p className="paused-guidance">{pausedGuidance(blink.status, blink.message)}</p>
      </div>
      <TargetList targets={runtime.targets} runtime={runtime} layout="row" label="Paused controls" className="safety-targets" />
      <p className="hint">Resume needs a new deliberate blink after tracking is stable. A helper can also click Resume or press Enter.</p>
    </div>
  );
}

function pausedGuidance(status: StillHereRuntime['blink']['status'], message: string): string {
  switch (status) {
    case 'face-lost':
    case 'no-face': return 'Face not found. Sit facing the screen with your whole face in view.';
    case 'multiple-faces': return 'Two faces are visible. Selection is held until only one person is in view.';
    case 'permission-denied': return 'The camera is blocked. A helper can allow it in the browser’s address bar, or use keyboard / switch.';
    case 'unsupported': return 'The camera is not available. A helper can use keyboard or switch to Resume.';
    case 'off':
    case 'starting': return 'The camera is starting.';
    default: return message || 'Tracking is stable. Wait for Resume to be highlighted, then blink.';
  }
}
