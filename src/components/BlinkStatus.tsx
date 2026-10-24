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

type GestureChipProps = { icon: string; label: string; result: string; spoken: string };

/** One legend chip: a visual "gesture · result" pill with a full-sentence screen-reader reading. */
function GestureChip({ icon, label, result, spoken }: GestureChipProps) {
  return (
    <span className="gesture-chip">
      <span className="gesture-chip-icon" aria-hidden="true">{icon}</span>
      <span aria-hidden="true">{result ? `${label} · ${result}` : label}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
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
  let chips: GestureChipProps[];
  if (brow) {
    chips = action === 'speak'
      ? [
        { icon: '↑', label: 'Eyebrows up', result: 'Move to Speak', spoken: 'Raise your eyebrows to move to Speak.' },
        { icon: '◉', label: 'New long blink', result: 'Speak', spoken: 'A new long blink speaks it.' },
      ]
      : [
        { icon: '↑', label: 'Eyebrows up ½ s', result: 'Next', spoken: 'Eyebrows up for half a second moves to Next.' },
        { icon: '◉', label: 'Long blink', result: 'Select', spoken: 'A long blink selects.' },
      ];
  } else {
    const secs = (st.scanIntervalMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 });
    chips = action === 'speak'
      ? [
        { icon: '↻', label: `Starts on Cancel · ${secs} s per item`, result: '', spoken: `The highlight starts on Cancel and moves every ${secs} seconds.` },
        { icon: '◉', label: 'New long blink on Speak', result: 'Says it', spoken: 'A new long blink on Speak says it.' },
      ]
      : [
        { icon: '↻', label: 'Auto-scan', result: `${secs} s per item`, spoken: `The highlight moves automatically, every ${secs} seconds.` },
        { icon: '◉', label: 'Long blink', result: 'Select', spoken: 'A long blink selects.' },
      ];
  }
  const rising = brow && runtime.blink.browStatus === 'rising';
  return (
    <p className="blink-hint">
      <span className="blink-hint-text">
        {chips.map((c) => <GestureChip key={c.icon + c.label} {...c} />)}
      </span>
      <span className="blink-hint-progress" aria-hidden="true">
        {rising && <><span className="blink-hint-progress-label">Brow</span><GestureBar value={runtime.blink.browProgress} /></>}
      </span>
    </p>
  );
}
