'use client';

import type { StillHereRuntime } from '@/runtime/contract';
import { activeWorkspace, anchorLabel } from '@/core/targets';
import { workspacePolicy } from '@/core/context-builder';
import { describeSetting } from '@/adaptation/preference-policy';
import { INTENT_LABELS } from '@/core/phrases';
import { TargetButton, TargetList } from './TargetButton';
import { SurfaceTitle } from './SurfaceTitle';
import { BATCH_SOURCE_LABELS, DELIVERY_LABELS, PROVENANCE_LABELS } from './labels';

export function ConversationBoard({ runtime }: { runtime: StillHereRuntime }) {
  const { state, targets } = runtime;
  const ws = activeWorkspace(state);
  const open = ws && !ws.closed ? ws : null;

  const candidates = targets.filter((t) => t.region === 'candidates');
  const primary = targets.filter((t) => t.region === 'primary');
  const rest = targets.filter((t) => t.region !== 'candidates' && t.region !== 'primary');

  const policy = open ? workspacePolicy(state, open) : null;
  const styleEntries = policy
    ? Object.values(policy.settings).filter((e) => e && e.provenance !== 'default')
    : [];

  const guidanceParts: string[] = [];
  if (open) {
    if (open.guidance.intent) guidanceParts.push(INTENT_LABELS[open.guidance.intent] ?? open.guidance.intent);
    for (const w of open.guidance.wording) guidanceParts.push(describeSetting(w));
    if (open.guidance.userTopicOrSeed) guidanceParts.push(`Topic: ${open.guidance.userTopicOrSeed}`);
  }

  const lastUser = [...state.conversation].reverse().find((e) => e.role === 'user');

  return (
    <div className="board">
      <section className="anchor" aria-label="Current question">
        {open ? (
          open.anchor.mode === 'reply' ? (
            <>
              <SurfaceTitle>Answering this question:</SurfaceTitle>
              <p className="anchor-text">{anchorLabel(state, open)}</p>
            </>
          ) : (
            <>
              <SurfaceTitle>Starting a conversation:</SurfaceTitle>
              <p className="anchor-text">{anchorLabel(state, open)}</p>
            </>
          )
        ) : (
          <>
            <SurfaceTitle>No active question</SurfaceTitle>
            <p className="muted">When your conversation partner types or records something, it appears here. You can also start a conversation, use a quick phrase, or write your own words.</p>
          </>
        )}
      </section>

      {open && (
        <div className="board-meta">
          <p><span className="meta-label">Active guidance:</span> {guidanceParts.length ? guidanceParts.join(' · ') : 'none'}</p>
          <p>
            <span className="meta-label">Style:</span>{' '}
            {styleEntries.length
              ? styleEntries.map((e) => `${describeSetting(e!.setting)} · ${PROVENANCE_LABELS[e!.provenance]}`).join('; ')
              : 'default'}
          </p>
          {open.batch && open.status === 'choosing' && (
            <p><span className="meta-label">Suggestions from:</span> {BATCH_SOURCE_LABELS[open.batch.source]}</p>
          )}
        </div>
      )}

      {open && (
        <div className="board-status" role="status">
          {open.status === 'generating' && <p className="status-line">Finding possible responses…</p>}
          {open.status === 'error' && <p className="status-line status-error">{open.error?.message ?? 'Suggestions could not be loaded.'}</p>}
          {open.status === 'stale' && <p className="status-line">The question or context changed. Refresh to get new suggestions.</p>}
          {open.batch?.kind === 'refinement' && open.status === 'choosing' && (
            <p className="status-line">Rewording your selected message{open.refineTarget ? `: “${open.refineTarget.text}”` : ''}</p>
          )}
          {open.status === 'generating' && open.pending?.kind === 'refinement' && open.refineTarget && (
            <p className="status-line">Rewording your selected message: “{open.refineTarget.text}”</p>
          )}
          {state.settings.aiMode === 'local-only' && (
            <p className="status-line">Local only: no AI suggestions. Use Quick phrases or My words.</p>
          )}
        </div>
      )}

      <div className="candidates" aria-label="Possible responses" role="group">
        {candidates.length > 0
          ? candidates.map((t) => <TargetButton key={t.id} target={t} runtime={runtime} className={t.id.startsWith('cand-') ? 'candidate' : 'candidate-none'} />)
          : open && open.status === 'generating'
            ? [0, 1, 2].map((i) => <div key={i} className="candidate-placeholder" aria-hidden="true" />)
            : null}
      </div>

      <TargetList targets={primary} runtime={runtime} layout="row" label="Next step" className="board-primary" />

      {lastUser && lastUser.role === 'user' && (
        <p className={`last-said${lastUser.value.delivery === 'failed' ? ' last-said-failed' : ''}`}>
          <span className="meta-label">You last said:</span> “{lastUser.value.text}” <span className="muted">— {DELIVERY_LABELS[lastUser.value.delivery]}</span>
        </p>
      )}

      <nav className="board-tools" aria-label="Conversation tools">
        <TargetList targets={rest} runtime={runtime} layout="grid" />
      </nav>
    </div>
  );
}
