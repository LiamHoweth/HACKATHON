'use client';

import { useId } from 'react';
import type { StillHereRuntime } from '@/runtime/contract';
import type { ComposePurpose, Surface } from '@/core/state';
import { LIMITS } from '@/core/limits';
import { KEY_GROUPS } from '@/core/phrases';
import { TargetList } from './TargetButton';
import { SurfaceTitle } from './SurfaceTitle';

const TITLES: Record<ComposePurpose, string> = {
  message: 'Your message',
  seed: 'Topic or keyword for suggestions',
  phrase: 'New saved phrase',
};

const LIMIT: Record<ComposePurpose, number> = {
  message: LIMITS.composeChars,
  seed: LIMITS.seedChars,
  phrase: LIMITS.phraseChars,
};

export function Composer({ runtime, surface }: { runtime: StillHereRuntime; surface: Extract<Surface, { kind: 'compose' }> }) {
  const { state, targets, dispatch } = runtime;
  const uid = useId();
  const purpose = surface.purpose;
  const draft = state.drafts[purpose];
  const limit = LIMIT[purpose];
  const atLimit = draft.length >= limit;

  const sub = purpose === 'seed'
    ? surface.seedFor === 'initiate' ? 'Used to suggest ways to start a conversation.' : 'Used to guide the next suggestions. It is not spoken.'
    : purpose === 'phrase' ? 'You will review it before it is saved.'
      : 'You will review the exact text before anything is spoken.';

  return (
    <div className="composer">
      <SurfaceTitle sub={sub}>{TITLES[purpose]}</SurfaceTitle>

      <div className="draft-display" aria-hidden="true">
        <span className="draft-text">{draft}</span>
        <span className="caret" />
        {draft.length === 0 && <span className="draft-placeholder">Nothing typed yet</span>}
      </div>
      <p className={`char-count${atLimit ? ' at-limit' : ''}`} aria-live="off">
        {draft.length} / {limit} characters{atLimit ? ' · limit reached' : ''}
      </p>

      <div className="field compose-field">
        <label htmlFor={`${uid}-text`}>Type with a keyboard (optional)</label>
        <textarea
          id={`${uid}-text`}
          value={draft}
          maxLength={limit}
          rows={2}
          // Single-line message: Enter never inserts a line break, and pasted line breaks/tabs
          // become spaces in the reducer before the draft is stored (speech refuses them).
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          onChange={(e) => dispatch({ type: 'COMPOSE_TEXT', purpose, text: e.target.value })}
        />
      </div>

      <p className="key-group-label">
        {surface.group !== null ? `Letters: ${KEY_GROUPS[surface.group]?.label ?? ''}` : 'Choose a group, then a letter.'}
      </p>
      <TargetList targets={targets} runtime={runtime} layout="keys" label="Keys" className="keys" />
    </div>
  );
}
