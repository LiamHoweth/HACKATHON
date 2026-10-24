'use client';

import { useEffect, useState } from 'react';
import type { BlinkRuntime, GestureFeedbackKind, StillHereRuntime } from '@/runtime/contract';
import { currentSurface } from '@/core/state';
import { BLINK_STATUS_LABELS } from './labels';
import type { BlinkTone } from './labels';
import { GestureBar, ProgressRing, isFaceMode } from './BlinkStatus';

/** How long an accepted NAV_NEXT / SELECT acknowledgement stays visible. */
export const ACK_MS = 900;

const KIND_TONE: Record<GestureFeedbackKind, BlinkTone> = {
  'camera-off': 'off',
  acquiring: 'warn',
  'face-detected': 'ok',
  'brow-progress': 'work',
  'brow-accepted': 'ok',
  'blink-progress': 'work',
  'blink-accepted': 'ok',
  ambiguous: 'warn',
  'tracking-paused': 'stop',
  cooldown: 'work',
};

/** Border/tint tone for the compact preview area. Falls back to the coarse blink status. */
export function feedbackTone(blink: BlinkRuntime): BlinkTone {
  const kind = blink.feedback?.kind;
  if (kind && KIND_TONE[kind]) return KIND_TONE[kind];
  return BLINK_STATUS_LABELS[blink.status]?.tone ?? 'off';
}

type Line = { icon: React.ReactNode; text: string; tone: BlinkTone; progress?: number; coarse: string };

/**
 * Brief acknowledgement of the most recent ACCEPTED gesture command. Shows only after the
 * runtime reports a committed command (never from progress), for ACK_MS, then clears.
 * A command that was already present on mount is treated as old and never shown.
 */
function useAcceptedAck(blink: BlinkRuntime) {
  const la = blink.lastAccepted ?? null;
  const key = la ? `${la.command}:${la.at}` : null;
  const [initialKey] = useState(key);
  const [expiredKey, setExpiredKey] = useState<string | null>(null);
  useEffect(() => {
    if (!key || key === initialKey) return;
    const id = window.setTimeout(() => setExpiredKey(key), ACK_MS);
    return () => window.clearTimeout(id);
  }, [key, initialKey]);
  return key && key !== initialKey && key !== expiredKey ? la : null;
}

function gestureLine(runtime: StillHereRuntime, ack: ReturnType<typeof useAcceptedAck>): Line {
  const { blink } = runtime;
  const browMode = runtime.state.settings.accessMode === 'brow-blink';
  const fb = blink.feedback;
  const status = blink.status;

  if (ack?.command === 'NAV_NEXT') {
    return { icon: '↓', text: 'Eyebrows up · Next', tone: 'ok', coarse: 'ready' };
  }
  if (ack?.command === 'SELECT') {
    return { icon: '✓', text: 'Blink · Selected', tone: 'ok', coarse: 'ready' };
  }
  if (status === 'face-lost' || fb?.kind === 'tracking-paused') {
    return { icon: '⏸', text: 'Lost your face · Paused', tone: 'stop', coarse: 'Tracking lost. Paused.' };
  }
  if (status === 'off') return { icon: '○', text: fb?.kind === 'camera-off' && fb.label ? fb.label : 'Camera off', tone: 'off', coarse: 'Camera off.' };
  if (status === 'unsupported' || status === 'permission-denied') {
    const t = BLINK_STATUS_LABELS[status].text;
    return { icon: '⊘', text: t, tone: 'stop', coarse: `${t}.` };
  }
  if (status === 'starting' || status === 'no-face' || fb?.kind === 'acquiring') {
    return { icon: '◌', text: fb?.kind === 'acquiring' && fb.label ? fb.label : 'Position your face', tone: 'warn', coarse: 'Position your face.' };
  }
  if (status === 'multiple-faces') {
    return { icon: '◎', text: 'Two faces · On hold', tone: 'warn', coarse: 'Two faces visible. Selection held.' };
  }
  // Tracking one face from here on. Progress lines never say "Next" or "Selected".
  if (status === 'closing') {
    return { icon: <ProgressRing value={blink.closureProgress} />, text: 'Long blink · Keep eyes closed', tone: 'work', progress: blink.closureProgress, coarse: 'ready' };
  }
  if (browMode && blink.browStatus === 'rising') {
    return { icon: <ProgressRing value={blink.browProgress} />, text: 'Eyebrows up · Keep holding', tone: 'work', progress: blink.browProgress, coarse: 'ready' };
  }
  if (fb?.kind === 'ambiguous') {
    return { icon: '?', text: fb.label || 'Not sure what that was. Nothing happened', tone: 'warn', coarse: 'ready' };
  }
  if (browMode && blink.browStatus === 'latched') {
    return { icon: '◔', text: 'Moving · Relax to stop', tone: 'work', coarse: 'ready' };
  }
  if (browMode && blink.browStatus === 'rearming') {
    return { icon: '◔', text: 'Relaxed · One moment', tone: 'work', coarse: 'ready' };
  }
  if (status === 'cooldown' || fb?.kind === 'cooldown') {
    return { icon: '◔', text: 'Got it. One moment…', tone: 'work', coarse: 'ready' };
  }
  return {
    icon: '◉',
    text: browMode ? 'Ready · Raise eyebrows to move' : 'Ready · Long blink to choose',
    tone: 'ok',
    coarse: 'ready',
  };
}

type SpeechLine = { icon: string; text: string; tone: BlinkTone; enable: boolean; detail?: string | null };

/** Factual speech lifecycle labels. Never implies sound played when the browser blocked it. */
export function speechLine(runtime: StillHereRuntime): SpeechLine | null {
  const audio = runtime.audio;
  if (!audio) return null;
  const natural = runtime.state.settings.speechProvider === 'elevenlabs' && audio.elevenLabsConfigured;
  switch (audio.state) {
    case 'requesting':
    case 'buffering':
      return { icon: '◌', text: natural ? 'Generating natural voice…' : 'Preparing basic voice…', tone: 'work', enable: false };
    case 'playing': return { icon: '♪', text: 'Speaking', tone: 'ok', enable: false };
    case 'blocked': return { icon: '⊘', text: 'Audio blocked. Tap Enable audio', tone: 'stop', enable: true };
    case 'failed': return { icon: '⊘', text: 'Voice unavailable', tone: 'stop', enable: false, detail: audio.message };
    case 'uncertain': return { icon: '?', text: 'Not sure it played', tone: 'warn', enable: false };
    case 'interrupted': return { icon: '■', text: 'Speech stopped', tone: 'off', enable: false };
    default:
      return audio.unlocked ? null : { icon: '○', text: 'Audio setup needed. Tap Enable audio', tone: 'warn', enable: true };
  }
}

/** Enable audio: a plain touch/click button. enableAudio() is called directly in the handler. */
export function EnableAudioButton({ runtime, className }: { runtime: StillHereRuntime; className?: string }) {
  const audio = runtime.audio;
  if (!audio) return null;
  return (
    <button
      type="button"
      className={`btn btn-primary btn-small ${className ?? ''}`}
      onClick={() => { void audio.enableAudio(); }}
    >
      Enable audio
    </button>
  );
}

/**
 * Compact gesture + speech feedback beside the self-view. Text plus icon (never colour alone),
 * progress bars only while a gesture is actually in progress, and one polite live region that
 * announces coarse state changes only (not per frame, not per gesture).
 */
export function GestureFeedback({ runtime }: { runtime: StillHereRuntime }) {
  const face = isFaceMode(runtime.state.settings.accessMode);
  const ack = useAcceptedAck(runtime.blink);
  const g = face ? gestureLine(runtime, ack) : null;
  const sp = speechLine(runtime);
  // While the Speaking surface is open it announces delivery itself (role=status), so the speech
  // state is left out of this region to avoid announcing it twice.
  const speakingSurface = currentSurface(runtime.state).kind === 'speaking';
  const announce = [
    g ? (g.coarse === 'ready' ? 'Eye gestures ready.' : g.coarse) : '',
    sp && sp.tone !== 'work' && !speakingSurface ? sp.text.replace('. Tap Enable audio', '') + '.' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="gesture-feedback">
      {g && (
        <div className={`gf-line gf-gesture gf-tone-${g.tone}${ack ? ' is-ack' : ''}`}>
          <span className="gf-icon" aria-hidden="true">{g.icon}</span>
          <span className="gf-text">{g.text}</span>
          <span className="gf-progress" aria-hidden="true">
            {g.progress !== undefined && <GestureBar value={g.progress} />}
          </span>
        </div>
      )}
      {sp && (
        <div className={`gf-line gf-speech gf-tone-${sp.tone}`}>
          <span className="gf-icon" aria-hidden="true">{sp.icon}</span>
          <span className="gf-text">
            {sp.text}
            {sp.detail ? <span className="gf-detail">{sp.detail}</span> : null}
          </span>
          {sp.enable && <EnableAudioButton runtime={runtime} className="gf-enable" />}
        </div>
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{announce}</span>
    </div>
  );
}
