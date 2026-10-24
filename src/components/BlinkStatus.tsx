'use client';

import type { BlinkRuntime, StillHereRuntime } from '@/runtime/contract';
import { BLINK_STATUS_LABELS, blinkAnnouncement } from './labels';

type Props = {
  blink: BlinkRuntime;
  /** 'pill' for the header/board; 'large' for the paused screen and calibration. */
  variant?: 'pill' | 'large';
  /** Render the polite screen-reader announcement (only one instance on screen should). */
  announce?: boolean;
  className?: string;
};

/**
 * Compact camera/gesture status: icon + text, plus a contained closure-progress ring while
 * the eyes are closing. The visible text is not a live region; a separate polite region
 * announces only coarse state changes (never per frame, never per gesture).
 */
export function BlinkStatus({ blink, variant = 'pill', announce = false, className }: Props) {
  const info = BLINK_STATUS_LABELS[blink.status];
  const closing = blink.status === 'closing';
  const progress = Math.max(0, Math.min(1, blink.closureProgress || 0));

  return (
    <span className={`blink-status blink-${variant} blink-tone-${info.tone} blink-st-${blink.status} ${className ?? ''}`}>
      <span className="blink-icon" aria-hidden="true">
        {closing ? <ProgressRing value={progress} /> : info.icon}
      </span>
      <span className="blink-text">{info.text}</span>
      {announce && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">{blinkAnnouncement(blink.status)}</span>
      )}
    </span>
  );
}

/** Small contained ring showing elapsed closure toward the calibrated minimum. */
export function ProgressRing({ value, size = 18 }: { value: number; size?: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg className="progress-ring" width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <circle
        cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - value)} transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

/** Horizontal closure-progress bar (used inside a frozen highlighted target). */
export function ClosureBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className="closure-bar" aria-hidden="true">
      <span className="closure-bar-fill" style={{ width: `${Math.round(v * 100)}%` }} />
    </span>
  );
}

/**
 * Footer hint line for blink mode: what the eyes control and what a blink does.
 * Renders nothing for other access modes.
 */
export function BlinkHint({ runtime, action = 'select' }: { runtime: StillHereRuntime; action?: 'select' | 'speak' }) {
  const st = runtime.state.settings;
  if (st.accessMode !== 'blink') return null;
  const secs = (st.scanIntervalMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const parts = action === 'speak'
    ? ['Highlight starts on Cancel', 'A new deliberate blink on Speak says it', `Scan ${secs} s/item`]
    : ['Highlight moves automatically', 'A deliberate blink selects', `Scan ${secs} s/item`];
  return (
    <p className="blink-hint">
      <BlinkStatus blink={runtime.blink} />
      <span className="blink-hint-text">{parts.join(' • ')}</span>
      <span className="blink-hint-local">Camera stays on this device</span>
    </p>
  );
}
