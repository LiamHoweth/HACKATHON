'use client';

import { useEffect, useRef } from 'react';
import type { StillHereRuntime } from '@/runtime/contract';
import { currentSurface } from '@/core/state';
import type { Surface } from '@/core/state';
import { SetupFlow } from './SetupFlow';
import { StatusBar } from './StatusBar';
import { ConversationBoard } from './ConversationBoard';
import { ReviewPanel } from './ReviewPanel';
import { Composer } from './Composer';
import { PausedPanel, SpeakingPanel } from './SpeakingPanel';
import { MenuSurface } from './MenuSurface';
import { PartnerPanel } from './PartnerPanel';

export function StillHereApp({ runtime }: { runtime: StillHereRuntime }) {
  if (runtime.state.phase === 'setup') return <SetupFlow runtime={runtime} />;
  return <ActiveShell runtime={runtime} />;
}

function ActiveShell({ runtime }: { runtime: StillHereRuntime }) {
  const { state, dispatch } = runtime;
  const surface = currentSurface(state);
  const surfaceRef = useRef<HTMLElement>(null);
  const surfaceKey = `${state.stack.length}:${JSON.stringify(surface)}`;

  // On a surface change, move focus to the new surface heading only if focus was in the
  // communication surface (or nowhere). Never steal focus from the partner's text fields.
  useEffect(() => {
    const root = surfaceRef.current;
    if (!root) return;
    const active = document.activeElement;
    if (active && active !== document.body && !root.contains(active)) return;
    if (active && active !== document.body && root.contains(active) && active.tagName === 'TEXTAREA') return;
    const heading = root.querySelector<HTMLElement>('[data-surface-title]');
    heading?.focus({ preventScroll: false });
  }, [surfaceKey]);

  const speaking = !!state.speech;
  const paused = surface.kind === 'paused';

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="wordmark">STILL HERE</span>
          <span className="tagline">Your words. Your choice.</span>
        </div>
        <StatusBar runtime={runtime} />
        <div className="safety" role="group" aria-label="Safety controls">
          <button
            type="button"
            className="btn btn-safety"
            disabled={paused}
            onClick={() => dispatch({ type: 'SAFETY_PAUSE', at: performance.now() })}
          >
            Pause (Esc)
          </button>
          {speaking && (
            <button
              type="button"
              className="btn btn-safety btn-stop"
              onClick={() => dispatch({ type: 'SAFETY_STOP', at: performance.now() })}
            >
              Stop speaking
            </button>
          )}
        </div>
      </header>

      <div className="notice-region" aria-live="polite" aria-atomic="true">
        {state.notice && (
          <div className="notice">
            <p>{state.notice.text}</p>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => dispatch({ type: 'DISMISS_NOTICE' })}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      <div className="app-body">
        <main ref={surfaceRef} className={`surface surface-${surface.kind}`} aria-label="Communication">
          <SurfaceView runtime={runtime} surface={surface} />
        </main>
        <PartnerPanel runtime={runtime} />
      </div>
    </div>
  );
}

function SurfaceView({ runtime, surface }: { runtime: StillHereRuntime; surface: Surface }) {
  switch (surface.kind) {
    case 'board': return <ConversationBoard runtime={runtime} />;
    case 'review': return <ReviewPanel runtime={runtime} />;
    case 'compose': return <Composer runtime={runtime} surface={surface} />;
    case 'speaking': return <SpeakingPanel runtime={runtime} />;
    case 'paused': return <PausedPanel runtime={runtime} />;
    default: return <MenuSurface runtime={runtime} surface={surface} />;
  }
}
