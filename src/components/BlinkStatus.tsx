'use client';

import type { BlinkRuntime, StillHereRuntime } from '@/runtime/contract';
import type { AccessMode } from '@/core/types';
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

/** Horizontal gesture-progress bar (brow raise or blink closure) for the feedback area. */
export function GestureBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className="gesture-bar">
      <span className="gesture-bar-fill" style={{ width: `${Math.round(v * 100)}%` }} />
    </span>
  );
}

/** Face-gesture input modes: eyebrow NEXT + blink SELECT (primary) or auto-scan + blink. */
export function isFaceMode(mode: AccessMode): boolean {
  return mode === 'brow-blink' || mode === 'blink';
}

/**
 * Bottom hint line for face-gesture modes: what each gesture does on this screen. The brow
 * progress slot is always reserved (no layout shift) and filled only while the brows are
 * actually rising. Renders nothing for keyboard / switch / pointer modes.
 */
export function BlinkHint({ runtime, action = 'select' }: { runtime: StillHereRuntime; action?: 'select' | 'speak' }) {
  const st = runtime.state.settings;
  if (!isFaceMode(st.accessMode)) return null;
  const brow = st.accessMode === 'brow-blink';
  let text: string;
  if (brow) {
    text = action === 'speak'
      ? 'Raise eyebrows to move to Speak • New long blink speaks it'
      : 'Eyebrows up 0.5 s → Next • Long blink → Select';
  } else {
    const secs = (st.scanIntervalMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 });
    text = action === 'speak'
      ? `Highlight starts on Cancel • New long blink on Speak says it • ${secs} s per item`
      : `Highlight moves automatically • Long blink → Select • ${secs} s per item`;
  }
  const rising = brow && runtime.blink.browStatus === 'rising';
  return (
    <p className="blink-hint">
      <span className="blink-hint-text">{text}</span>
      <span className="blink-hint-progress" aria-hidden="true">
        {rising && <><span className="blink-hint-progress-label">Brow</span><GestureBar value={runtime.blink.browProgress} /></>}
      </span>
    </p>
  );
}
