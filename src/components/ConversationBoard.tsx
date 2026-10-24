'use client';

import type { StillHereRuntime } from '@/runtime/contract';
import { activeWorkspace, anchorLabel } from '@/core/targets';
import { workspacePolicy } from '@/core/context-builder';
import { describeSetting } from '@/adaptation/preference-policy';
import { INTENT_LABELS } from '@/core/phrases';
import { TargetButton, TargetList } from './TargetButton';
import { BlinkHint } from './BlinkStatus';
import { SurfaceTitle } from './SurfaceTitle';
import { AI_MODE_LABELS, BATCH_SOURCE_LABELS, DELIVERY_LABELS, PROVENANCE_LABELS } from './labels';

export function ConversationBoard({ runtime }: { runtime: StillHereRuntime }) {
  const { state, targets } = runtime;
  const ws = activeWorkspace(state);
  const open = ws && !ws.closed ? ws : null;

  // Rendered in registry order (boardTargets): candidates + None of these, next-step actions,
  // voice-problem recovery, then the compact action row. Visual order therefore equals gesture
  // NEXT order, and candidates keep a fixed position whether or not a voice problem is showing.
  const recovery = targets.filter((t) => t.id === 'speak-basic' || t.id === 'dismiss-failed');
  const candidates = targets.filter((t) => t.region === 'candidates');
  const inActionRow = (id: string, region: string) => region === 'tools' || id === 'start';
  const primary = targets.filter((t) => t.region === 'primary' && !recovery.includes(t) && !inActionRow(t.id, t.region));
  const actions = targets.filter((t) => !recovery.includes(t) && t.region !== 'candidates' && !primary.includes(t) && inActionRow(t.id, t.region));
  const leftover = targets.filter((t) => !recovery.includes(t) && t.region !== 'candidates' && !primary.includes(t) && !actions.includes(t));

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

  // Same wording as the status bar: the suggestion mode once, the batch source only when it differs.
  const modeLabel = AI_MODE_LABELS[state.settings.aiMode];
  const batchLabel = open?.batch && open.status === 'choosing' ? BATCH_SOURCE_LABELS[open.batch.source] : null;
  const sourceLabel = batchLabel && batchLabel !== modeLabel ? `${modeLabel} · these suggestions: ${batchLabel}` : modeLabel;

  const failed = state.lastFailedSpeech;
  const voiceProblemHead = failed?.delivery === 'uncertain'
    ? 'The natural voice may have partly played. Your message:'
    : 'The natural voice did not play. Your message:';

  return (
    <div className="board">
      <section className="anchor" aria-label="Current question">
        {open ? (
          open.anchor.mode === 'reply' ? (
            <>
              <SurfaceTitle>Partner asked:</SurfaceTitle>
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
      <TargetList targets={leftover} runtime={runtime} layout="row" className="board-primary" />

      {failed && (
        <section className="voice-problem" aria-label="Voice problem">
          <p className="voice-problem-head"><span aria-hidden="true">⊘ </span>{voiceProblemHead}</p>
          <blockquote className="voice-problem-text" lang={state.settings.language}>{failed.text}</blockquote>
          <TargetList targets={recovery} runtime={runtime} layout="row" label="Voice problem" className="voice-problem-actions" />
        </section>
      )}

      {lastUser && lastUser.role === 'user' && (
        <p className={`last-said${lastUser.value.delivery === 'failed' ? ' last-said-failed' : ''}`}>
          <span className="meta-label">You last said:</span> “{lastUser.value.text}” <span className="muted">— {DELIVERY_LABELS[lastUser.value.delivery]}</span>
        </p>
      )}

      <div className="board-footer">
        <nav className="board-tools" aria-label="Conversation tools">
          <TargetList targets={actions} runtime={runtime} layout="actions" className="action-row" />
        </nav>
        <BlinkHint runtime={runtime} />
        {/* Demo simplicity: the context line only appears when the person has guided the reply. */}
        {open && guidanceParts.length > 0 && (
          <p className="board-context">
            <span className="meta-label">Active context:</span> {open.anchor.mode === 'reply' ? 'Reply' : 'Starting'}
            {' · '}{sourceLabel}
            {' • '}<span className="meta-label">Guidance:</span> {guidanceParts.length ? guidanceParts.join(' · ') : 'none'}
            {' • '}<span className="meta-label">Approved style:</span>{' '}
            {styleEntries.length
              ? styleEntries.map((e) => `${describeSetting(e!.setting)} (${PROVENANCE_LABELS[e!.provenance]})`).join('; ')
              : 'default'}
          </p>
        )}
      </div>
    </div>
  );
}
