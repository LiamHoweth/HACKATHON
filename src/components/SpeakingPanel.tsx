'use client';

import type { StillHereRuntime } from '@/runtime/contract';
import { TargetList } from './TargetButton';
import { SurfaceTitle } from './SurfaceTitle';
import { DELIVERY_LABELS } from './labels';
import { BlinkStatus, isFaceMode } from './BlinkStatus';
import { EnableAudioButton, speechLine } from './GestureFeedback';

export function SpeakingPanel({ runtime }: { runtime: StillHereRuntime }) {
  const { state, targets } = runtime;
  const speech = state.speech;
  const turn = speech
    ? state.conversation.find((e) => e.role === 'user' && e.value.id === speech.userTurnId)
    : undefined;
  const delivery = turn && turn.role === 'user' ? turn.value.delivery : speech?.utterance.delivery;
  const sp = speechLine(runtime);

  return (
    <div className="speaking">
      <SurfaceTitle>{delivery === 'failed' ? 'Your message (speech failed)' : 'Speaking'}</SurfaceTitle>
      {speech ? (
        <>
          <blockquote className="speaking-text" lang={state.settings.language}>{speech.utterance.exactText}</blockquote>
          <p className={`delivery delivery-${delivery ?? 'queued'}`} role="status">{delivery ? DELIVERY_LABELS[delivery] : ''}</p>
          {sp && (
            <p className={`speech-state gf-tone-${sp.tone}`}>
              <span aria-hidden="true">{sp.icon} </span>{sp.text}
              {sp.enable && <EnableAudioButton runtime={runtime} className="speech-enable" />}
            </p>
          )}
          {(delivery === 'failed' || runtime.audio?.state === 'failed') && (
            <p className="warning">The natural voice didn’t play. Show this text to your partner. Next, you can say it with the basic device voice. You’ll review it again first.</p>
          )}
          {!runtime.speechAvailable && <p className="warning">This device can’t speak right now. Show this text to your partner.</p>}
        </>
      ) : (
        <p className="muted">Nothing is being spoken.</p>
      )}
      <TargetList targets={targets} runtime={runtime} layout="row" label="Speaking controls" className="safety-targets" />
    </div>
  );
}

export function PausedPanel({ runtime }: { runtime: StillHereRuntime }) {
  const blinkMode = isFaceMode(runtime.state.settings.accessMode);
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
        Paused. Look at the camera. When “Ready” shows, make a long blink to Resume.
      </SurfaceTitle>
      <div className="paused-status">
        <BlinkStatus blink={blink} variant="large" />
        <p className="paused-guidance">{pausedGuidance(blink.status, blink.message)}</p>
      </div>
      <TargetList targets={runtime.targets} runtime={runtime} layout="row" label="Paused controls" className="safety-targets" />
      <p className="hint">Once tracking is steady, a new long blink resumes. A helper can also tap Resume or press Enter.</p>
    </div>
  );
}

function pausedGuidance(status: StillHereRuntime['blink']['status'], message: string): string {
  switch (status) {
    case 'face-lost':
    case 'no-face': return 'Can’t see your face. Face the screen with your whole face in view.';
    case 'multiple-faces': return 'Two faces are in view. Nothing is selected until there’s just one.';
    case 'permission-denied': return 'The camera is blocked. A helper can allow it in the address bar, or use keyboard or switch.';
    case 'unsupported': return 'The camera is not available. A helper can use keyboard or switch to Resume.';
    case 'off':
    case 'starting': return 'The camera is starting.';
    default: return message || 'Tracking is steady. Resume is highlighted. Long blink to continue.';
  }
}
