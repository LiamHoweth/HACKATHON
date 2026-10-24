'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
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
import { CameraPreview } from './CameraPreview';
import { GestureFeedback } from './GestureFeedback';
import { isFaceMode } from './BlinkStatus';
import { useContinuousListening } from '@/runtime/useContinuousListening';

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
function subscribeFinePointer(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(FINE_POINTER_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
/** True on mouse/trackpad devices (likely a hardware keyboard); false on touch and during SSR. */
function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribeFinePointer,
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(FINE_POINTER_QUERY).matches,
    () => false,
  );
}

export function StillHereApp({ runtime }: { runtime: StillHereRuntime }) {
  if (runtime.state.phase === 'setup') return <SetupFlow runtime={runtime} />;
  return <ActiveShell runtime={runtime} />;
}

function ActiveShell({ runtime }: { runtime: StillHereRuntime }) {
  const { state, dispatch } = runtime;
  const surface = currentSurface(state);
  const surfaceRef = useRef<HTMLElement>(null);
  const surfaceKey = `${state.stack.length}:${JSON.stringify(surface)}`;
  // Hands-free partner listening: on by default whenever recording is allowed.
  const listening = useContinuousListening(runtime);

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

  const face = isFaceMode(state.settings.accessMode);
  const finePointer = useFinePointer();

  // iPad landscape: two independent columns. Left: header, notice, communication surface (the
  // only scrolling region for cards). Right (slim): camera self-view + gesture/speech feedback at
  // the top-right, partner panel below. The preview's space is reserved in the grid, so it can
  // never cover response cards. Portrait and narrow widths stack (see globals.css).
  return (
    <div className={`app mode-${state.settings.accessMode}`}>
      <div className="app-main-col">
        <header className="app-header">
          <div className="brand">
            <span className="wordmark">STILL HERE</span>
          </div>
          <StatusBar runtime={runtime} />
          <div className="safety" role="group" aria-label="Safety controls">
            <button
              type="button"
              className="btn btn-safety"
              disabled={paused}
              aria-keyshortcuts="Escape"
              title={finePointer ? 'Pause (Esc)' : undefined}
              onClick={() => dispatch({ type: 'SAFETY_PAUSE', at: performance.now() })}
            >
              Pause
              {/* Esc hint only where a hardware keyboard + fine pointer is likely (not iPad touch). */}
              {finePointer && <span aria-hidden="true"> (Esc)</span>}
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

        <main ref={surfaceRef} className={`surface surface-${surface.kind}`} aria-label="Communication">
          <SurfaceView runtime={runtime} surface={surface} />
        </main>
      </div>

      <div className="app-side-col">
        <section className="camera-dock" aria-label={face ? 'Camera and gesture feedback' : 'Voice status'}>
          {face && <CameraPreview runtime={runtime} />}
          <GestureFeedback runtime={runtime} />
        </section>
        <PartnerPanel runtime={runtime} listening={listening} />
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
    // Branching flow: "Other ways to answer" renders as a menu (title, partner question, path cards).
    case 'paths': return <MenuSurface runtime={runtime} surface={surface} />;
    default: return <MenuSurface runtime={runtime} surface={surface} />;
  }
}
