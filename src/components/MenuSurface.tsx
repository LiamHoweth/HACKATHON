'use client';

import type { StillHereRuntime } from '@/runtime/contract';
import type { PendingChange, State, Surface } from '@/core/state';
import { activeWorkspace, anchorLabel } from '@/core/targets';
import { describeScope, describeSetting } from '@/adaptation/preference-policy';
import { TargetList } from './TargetButton';
import { SurfaceTitle } from './SurfaceTitle';
import {
  DELIVERY_LABELS, MESSAGE_SOURCE_LABELS, PARTNER_SOURCE_LABELS, formatTime, metricsSummary,
} from './labels';

type MenuKind = Exclude<Surface['kind'], 'board' | 'review' | 'compose' | 'speaking' | 'paused'>;

const HEADINGS: Record<MenuKind, { title: string; sub: string }> = {
  guide: { title: 'Guide my response', sub: 'Choose a direction or wording. New suggestions follow your guidance; you still choose and review.' },
  quick: { title: 'Quick phrases', sub: 'Choose a phrase to say it.' },
  initiate: { title: 'Start a conversation', sub: 'No question needed. Pick a kind of opener, or write your own.' },
  'initiate-topics': { title: 'Choose a topic', sub: 'Only approved interests and things actually said this session are listed.' },
  tools: { title: 'More tools', sub: 'Conversation history, preferences, and session controls.' },
  history: { title: 'History and waiting', sub: 'The full conversation in order. Dismissing a waiting item does not erase anything that was said.' },
  preferences: { title: 'Preferences and memory', sub: 'Nothing is saved without your approval.' },
  'style-edit': { title: 'My style preferences', sub: 'Saved preferences shape suggestions. Wording chosen for one response always takes priority.' },
  scope: { title: 'Who and where', sub: 'Preferences can apply to everyone, or to a specific person type or setting.' },
  memory: { title: 'What is saved', sub: 'Everything Still Here is using about you. Turn items off or delete them.' },
  proposal: { title: 'Preference suggestion', sub: 'Still Here noticed a possible pattern during this session.' },
  'confirm-change': { title: 'Please confirm', sub: 'Review exactly what will change.' },
  controls: { title: 'Controls', sub: 'Pause, recording, scan speed, measurement, and ending the session.' },
  metrics: { title: 'Measurements', sub: 'Counts and timings from this session. No message text is included.' },
  'change-wording': { title: 'Change wording', sub: 'Ask for a reworded version or edit it yourself. You will review the new text before anything is spoken.' },
  'compose-clear': { title: 'Clear all text?', sub: 'This removes everything you have typed in this draft.' },
  'end-confirm': { title: 'End this session?', sub: 'The conversation and temporary session learning are cleared. Items you approved to remember on this device stay saved.' },
};

export function MenuSurface({ runtime, surface }: { runtime: StillHereRuntime; surface: Surface }) {
  const { state, targets } = runtime;
  const kind = surface.kind as MenuKind;
  const heading = HEADINGS[kind] ?? { title: 'Menu', sub: '' };
  let title = heading.title;
  if (surface.kind === 'guide' && surface.page === 'direction') title = 'Choose a direction';
  if (surface.kind === 'guide' && surface.page === 'wording') title = 'Change the wording';
  if (surface.kind === 'initiate-topics') title = surface.mode === 'interest' ? 'Talk about an approved interest' : 'Return to an earlier topic';
  if (surface.kind === 'style-edit' && surface.key) title = `Style: ${surface.key}`;

  const decisionLayout = targets.length > 0 && targets.every((t) => t.region === 'review');

  return (
    <div className={`menu menu-${surface.kind}`}>
      <SurfaceTitle sub={heading.sub}>{title}</SurfaceTitle>
      <MenuDetail state={state} surface={surface} />
      <TargetList targets={targets} runtime={runtime} layout={decisionLayout ? 'row' : 'stack'} label={title} className={decisionLayout ? 'decision-actions' : 'menu-targets'} />
    </div>
  );
}

function MenuDetail({ state, surface }: { state: State; surface: Surface }) {
  switch (surface.kind) {
    case 'guide': {
      const ws = activeWorkspace(state);
      return ws && !ws.closed ? <p className="context-line"><span className="meta-label">For:</span> {anchorLabel(state, ws)}</p> : null;
    }
    case 'change-wording':
      return state.review ? <blockquote className="quote-medium">{state.review.snapshot.exactText}</blockquote> : null;
    case 'compose-clear': {
      const below = state.stack[state.stack.length - 2];
      const draft = below && below.kind === 'compose' ? state.drafts[below.purpose] : '';
      return draft ? <blockquote className="quote-medium">{draft}</blockquote> : null;
    }
    case 'proposal': return <ProposalDetail state={state} proposalId={surface.proposalId} />;
    case 'confirm-change': return <ConfirmDetail state={state} change={surface.change} />;
    case 'memory': return <MemoryDetail state={state} />;
    case 'history': return <HistoryDetail state={state} />;
    case 'metrics': return <MetricsDetail state={state} />;
    case 'scope':
    case 'style-edit':
      return <p className="context-line"><span className="meta-label">Currently applies to:</span> {describeScope(state.settings.scope)}</p>;
    default: return null;
  }
}

function ProposalDetail({ state, proposalId }: { state: State; proposalId: string }) {
  const p = state.proposals.find((x) => x.id === proposalId);
  if (!p) return <p className="muted">This suggestion is no longer available.</p>;
  return (
    <div className="detail-card">
      <p>{p.explanation}</p>
      <dl className="kv">
        <div className="kv-row"><dt>Proposed preference</dt><dd>{describeSetting(p.proposedSetting)}</dd></div>
        <div className="kv-row"><dt>Would apply to</dt><dd>{describeScope(p.scope)}</dd></div>
        <div className="kv-row"><dt>Would be stored</dt><dd>{state.settings.persistOnDevice ? 'On this device' : 'For this session only'}</dd></div>
      </dl>
      <p className="emphasis">This is a tentative pattern, not a fact about you.</p>
    </div>
  );
}

function storageWhere(state: State): string {
  return state.settings.persistOnDevice
    ? 'Stored in this browser on this device.'
    : 'Kept for this session only; nothing is written to this device.';
}

function ConfirmDetail({ state, change }: { state: State; change: PendingChange }) {
  const rows: Array<[string, string]> = [];
  let summary = '';
  switch (change.kind) {
    case 'save-preference':
      summary = `Save the preference “${describeSetting(change.setting)}”.`;
      rows.push(['Origin', change.origin === 'manual' ? 'Chosen by you' : 'Approved suggestion'], ['Applies to', describeScope(change.scope)], ['Where', storageWhere(state)]);
      break;
    case 'remove-preference':
      summary = `Remove your saved ${change.key} preference.`;
      rows.push(['Applies to', describeScope(change.scope)], ['Where', state.settings.persistOnDevice ? 'Removed from this session and this device.' : 'Removed from this session.']);
      break;
    case 'approve-profile': {
      const d = state.profileDraft;
      summary = 'Approve the profile draft entered at setup, so suggestions may use it.';
      if (d?.preferredName) rows.push(['Preferred name', d.preferredName]);
      if (d?.interests.length) rows.push(['Interests', d.interests.join(', ')]);
      rows.push(['Where', storageWhere(state)]);
      break;
    }
    case 'delete-item':
      summary = `Delete: ${change.label}`;
      rows.push(['Where', state.settings.persistOnDevice ? 'Deleted from this session and this device.' : 'Deleted from this session.']);
      break;
    case 'toggle-item':
      summary = `${change.enabled ? 'Turn on' : 'Turn off'}: ${change.label}`;
      rows.push(['Effect', change.enabled ? 'Suggestions may use it again.' : 'Kept, but not used for suggestions.'], ['Where', storageWhere(state)]);
      break;
    case 'save-phrase':
      summary = `Save this phrase to Quick phrases: “${change.text}”`;
      rows.push(['Where', storageWhere(state)]);
      break;
    case 'enable-persistence':
      summary = 'Remember approved preferences, approved profile entries, and custom phrases on this device.';
      rows.push(['Where', 'Stored in this browser on this device. Conversation text is never stored.']);
      break;
    case 'delete-all-saved':
      summary = 'Delete every approved preference, approved profile entry, and custom phrase.';
      rows.push(
        ['Counts', `${state.approvedPreferences.length} preferences, ${state.approvedProfile.length} profile entries, ${state.savedPhrases.filter((p) => !p.builtIn).length} custom phrases`],
        ['Where', 'Deleted from this session and from this device’s storage. Built-in phrases stay.'],
      );
      break;
    case 'clear-session-learning':
      summary = 'Clear temporary patterns noticed this session and any pending suggestions.';
      rows.push(['Not affected', 'Preferences you already approved.'], ['Where', 'This session only.']);
      break;
    case 'suppress-dimension':
      summary = `Stop suggesting ${change.key} preferences from your choices.`;
      rows.push(['Where', storageWhere(state)]);
      break;
  }
  return (
    <div className="detail-card">
      <p className="confirm-summary">{summary}</p>
      {rows.length > 0 && (
        <dl className="kv">
          {rows.map(([k, v]) => <div key={k} className="kv-row"><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
    </div>
  );
}

function MemoryDetail({ state }: { state: State }) {
  const phrases = state.savedPhrases.filter((p) => !p.builtIn);
  const draft = state.profileDraft;
  const nothing = !state.approvedPreferences.length && !state.approvedProfile.length && !phrases.length;
  return (
    <div className="detail-card memory-list">
      <p className="muted">{storageWhere(state)}</p>
      {draft && (draft.preferredName || draft.interests.length > 0) && (
        <section>
          <h2>Profile draft (not approved yet)</h2>
          <p>
            {draft.preferredName ? `Name: ${draft.preferredName}. ` : ''}
            {draft.interests.length ? `Interests: ${draft.interests.join(', ')}.` : ''}
          </p>
        </section>
      )}
      {state.approvedPreferences.length > 0 && (
        <section>
          <h2>Style preferences</h2>
          <ul>
            {state.approvedPreferences.map((p) => (
              <li key={p.id}>
                <strong>{describeSetting(p.setting)}</strong> · {describeScope(p.scope)}
                <span className="item-meta">
                  {p.origin === 'manual' ? 'Set manually' : 'Approved suggestion'} · approved {formatTime(p.approvedAt)} · {p.enabled ? 'on' : 'off'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {state.approvedProfile.length > 0 && (
        <section>
          <h2>Profile</h2>
          <ul>
            {state.approvedProfile.map((p) => (
              <li key={p.id}>
                <strong>{p.field === 'preferredName' ? 'Name' : p.field === 'interest' ? 'Interest' : 'Language'}: {p.value}</strong>
                <span className="item-meta">Approved {formatTime(p.approvedAt)} · all conversations · {p.enabled ? 'on' : 'off'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {phrases.length > 0 && (
        <section>
          <h2>Custom phrases</h2>
          <ul>{phrases.map((p) => <li key={p.id}><strong>{p.text}</strong><span className="item-meta">Added manually · all conversations</span></li>)}</ul>
        </section>
      )}
      {state.suppressedDimensions.length > 0 && (
        <p className="muted">Not learning: {state.suppressedDimensions.join(', ')}.</p>
      )}
      {nothing && <p>Nothing is saved yet.</p>}
    </div>
  );
}

function HistoryDetail({ state }: { state: State }) {
  if (state.conversation.length === 0) return <p className="muted">No conversation yet this session.</p>;
  return (
    <ol className="history-list">
      {state.conversation.map((e) => {
        if (e.role === 'partner') {
          const waiting = state.staged.includes(e.value.id);
          return (
            <li key={e.value.id} className="turn turn-partner">
              <span className="turn-who">Partner <span className="item-meta">({PARTNER_SOURCE_LABELS[e.value.source]})</span></span>
              <span className="turn-text">{e.value.text}</span>
              {waiting && <span className="tag">waiting</span>}
              {e.value.dismissed && <span className="tag tag-quiet">dismissed from pending</span>}
            </li>
          );
        }
        return (
          <li key={e.value.id} className="turn turn-user">
            <span className="turn-who">You <span className="item-meta">({MESSAGE_SOURCE_LABELS[e.value.source]})</span></span>
            <span className="turn-text">{e.value.text}</span>
            <span className={`tag delivery-${e.value.delivery}`}>{DELIVERY_LABELS[e.value.delivery]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function MetricsDetail({ state }: { state: State }) {
  const m = metricsSummary(state.metrics);
  return (
    <div className="detail-card">
      <p className="muted">Measurement mode is {state.settings.measurement ? 'on' : 'off'}.</p>
      <table className="metrics-table">
        <caption className="sr-only">Session measurements</caption>
        <thead><tr><th scope="col">Measure</th><th scope="col">Value</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">Median suggestion time</th>
            <td>{m.medianGenerationMs === null ? 'not measured' : `${(m.medianGenerationMs / 1000).toFixed(2)} s (${m.generationSamples} sample${m.generationSamples === 1 ? '' : 's'})`}</td>
          </tr>
          {m.counts.length === 0
            ? <tr><th scope="row">Events</th><td>not measured</td></tr>
            : m.counts.map(([k, n]) => <tr key={k}><th scope="row">{k}</th><td>{n}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
