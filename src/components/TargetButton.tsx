'use client';

import { useEffect, useRef } from 'react';
import type { Target } from '@/core/state';
import type { StillHereRuntime } from '@/runtime/contract';
import { ClosureBar } from './BlinkStatus';
import { BLINK_ARMED } from './labels';

type Props = {
  target: Target;
  runtime: StillHereRuntime;
  className?: string;
};

/**
 * One registry target rendered as a native button. Pointer and native keyboard activation
 * both go through runtime.activate (the guarded ACTIVATE path). The switch-scanning
 * highlight is shown visually and with aria-current; it never moves DOM focus.
 */
export function TargetButton({ target: t, runtime, className }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const highlighted = runtime.highlightedTargetId === t.id;
  const held = highlighted && runtime.switchHeld;
  const blinkMode = runtime.state.settings.accessMode === 'blink';
  const blinkStatus = runtime.blink.status;

  useEffect(() => {
    if (!highlighted || !ref.current) return;
    // Keep the scanned target visible without taking focus away from anything.
    ref.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [highlighted]);

  const classes = [
    'target',
    `region-${t.region}`,
    `tone-${t.tone ?? 'normal'}`,
    highlighted ? 'is-scan' : '',
    held ? 'is-held' : '',
    blinkMode && highlighted ? 'is-blink-scan' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      data-target-id={t.id}
      disabled={!t.enabled}
      aria-current={highlighted ? 'true' : undefined}
      onClick={(e) => runtime.activate(t.id, e.detail === 0 ? 'keyboard' : 'pointer')}
    >
      {blinkMode && highlighted && (
        <span className={`blink-badge${held ? ' is-selecting' : ''}`} aria-hidden="true">
          {blinkBadge(t, held, blinkStatus)}
        </span>
      )}
      <span className="target-label">{t.label}</span>
      {t.detail ? <span className="target-detail">{t.detail}</span> : null}
      {blinkMode && held && <ClosureBar value={runtime.blink.closureProgress} />}
    </button>
  );
}

/** Inline instruction on the highlighted target. Positioned over the border, so no layout shift. */
function blinkBadge(t: Target, held: boolean, status: StillHereRuntime['blink']['status']): string {
  if (held) return 'Selecting… keep eyes closed';
  if (status === 'selected') return '✓ Selected';
  if (!BLINK_ARMED.has(status)) return '◌ Waiting for face';
  return t.tone === 'speak' ? '◉ Blink to speak' : '◉ Blink to select';
}

type ListProps = {
  targets: Target[];
  runtime: StillHereRuntime;
  layout?: 'stack' | 'grid' | 'row' | 'keys';
  label?: string;
  className?: string;
};

/** Renders targets in registry order. Positions are stable because order never changes. */
export function TargetList({ targets, runtime, layout = 'stack', label, className }: ListProps) {
  if (targets.length === 0) return null;
  return (
    <div className={`target-list layout-${layout} ${className ?? ''}`} role="group" aria-label={label}>
      {targets.map((t) => <TargetButton key={t.id} target={t} runtime={runtime} />)}
    </div>
  );
}
