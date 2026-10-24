// Small deterministic evidence model for session-level length tendencies.
// Observations are tentative signals about wording choices, never facts about the person.
import type {
  ApprovedPreference, ChoiceBatch, Guidance, Id, PreferenceProposal, Scope,
  SessionObservation, StyleKey, StyleSetting,
} from '@/core/types';
import { LIMITS, wordCount } from '@/core/limits';
import { describeScope, resolveSavedPreferences } from './preference-policy';

type ObserveArgs = {
  batch: ChoiceBatch;
  chosenCandidateId: Id;
  guidance: Guidance;
  turnKey: Id;
  sessionEpoch: Id;
  at: number;
  newId: () => Id;
};

// Records a confirmed choice. Returns null when the choice offers no meaningful
// length opportunity or was constrained by an explicit length request.
export function observeConfirmedChoice(args: ObserveArgs): SessionObservation | null {
  const { batch, chosenCandidateId, guidance } = args;
  if (batch.kind === 'refinement') return null; // wording refinements are recorded as explicit feedback
  // Any explicit wording request (length, humor, tone…) constrains the choice: not independent evidence.
  if (guidance.wording.length > 0) return null;
  const counts = batch.candidates.map((c) => wordCount(c.text));
  const chosenIndex = batch.candidates.findIndex((c) => c.id === chosenCandidateId);
  if (chosenIndex < 0) return null;
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const spread = max - min;
  const chosen = counts[chosenIndex];
  const meaningful = spread >= LIMITS.minLengthSpreadWords;
  let noteCode: SessionObservation['noteCode'] = 'chose-middle';
  let evidence = 0;
  if (meaningful && chosen === min && counts.filter((c) => c === min).length === 1) { noteCode = 'chose-shortest'; evidence = 1; }
  else if (meaningful && chosen === max && counts.filter((c) => c === max).length === 1) { noteCode = 'chose-longest'; evidence = 1; }
  return {
    id: args.newId(), sessionEpoch: args.sessionEpoch, dimension: 'length',
    evidenceKind: 'confirmed-choice', scope: guidance.scope,
    createdAt: args.at, expiresAt: args.at + LIMITS.observationTtlMs,
    evidenceCount: evidence, opportunityCount: meaningful ? 1 : 0,
    noteCode, turnKey: args.turnKey,
  };
}

export function observeExplicitLengthFeedback(args: {
  direction: 'shorter' | 'longer'; scope: Scope; turnKey: Id; sessionEpoch: Id; at: number; newId: () => Id;
}): SessionObservation {
  return {
    id: args.newId(), sessionEpoch: args.sessionEpoch, dimension: 'length',
    evidenceKind: 'explicit-feedback', scope: args.scope,
    createdAt: args.at, expiresAt: args.at + LIMITS.observationTtlMs,
    evidenceCount: 2, opportunityCount: 1,
    noteCode: args.direction === 'shorter' ? 'asked-shorter' : 'asked-longer',
    turnKey: args.turnKey,
  };
}

export function pruneObservations(obs: SessionObservation[], now: number, epoch: Id): SessionObservation[] {
  return obs.filter((o) => o.sessionEpoch === epoch && o.expiresAt > now).slice(-LIMITS.observationWindow);
}

type Tally = { shortTurns: Set<Id>; longTurns: Set<Id>; shortEvidence: number; longEvidence: number; ids: { short: Id[]; long: Id[] } };
function tally(obs: SessionObservation[]): Tally {
  const t: Tally = { shortTurns: new Set(), longTurns: new Set(), shortEvidence: 0, longEvidence: 0, ids: { short: [], long: [] } };
  for (const o of obs) {
    if (o.dimension !== 'length' || o.evidenceCount === 0) continue;
    if (o.noteCode === 'chose-shortest' || o.noteCode === 'asked-shorter') {
      t.shortTurns.add(o.turnKey); t.shortEvidence += o.evidenceCount; t.ids.short.push(o.id);
    } else if (o.noteCode === 'chose-longest' || o.noteCode === 'asked-longer') {
      t.longTurns.add(o.turnKey); t.longEvidence += o.evidenceCount; t.ids.long.push(o.id);
    }
  }
  return t;
}

// Weak, session-only wording hint. Never influences intent.
export function sessionHints(obs: SessionObservation[]): StyleSetting[] {
  const t = tally(obs);
  if (t.shortTurns.size >= LIMITS.sessionHintMinTurns && t.shortEvidence > t.longEvidence * 2) {
    return [{ key: 'length', value: 'short' }];
  }
  if (t.longTurns.size >= LIMITS.sessionHintMinTurns && t.longEvidence > t.shortEvidence * 2) {
    return [{ key: 'length', value: 'balanced' }];
  }
  return [];
}

export function maybePropose(args: {
  obs: SessionObservation[];
  existing: PreferenceProposal[];
  suppressed: StyleKey[];
  approved: ApprovedPreference[];
  scope: Scope;
  newId: () => Id;
}): PreferenceProposal | null {
  if (args.suppressed.includes('length')) return null;
  // One proposal per dimension per session: pending, deferred, approved, or rejected all block repeats.
  if (args.existing.some((p) => p.proposedSetting.key === 'length')) return null;
  const t = tally(args.obs);
  let setting: StyleSetting | null = null;
  let ids: Id[] = [];
  let explanation = '';
  if (t.shortTurns.size >= LIMITS.proposalMinTurns && t.shortEvidence > t.longEvidence * 2) {
    setting = { key: 'length', value: 'short' };
    ids = t.ids.short;
    explanation = `You've often chosen or asked for shorter responses in this session (${t.shortTurns.size} different turns). Would you like shorter suggestions more often?`;
  } else if (t.longTurns.size >= LIMITS.proposalMinTurns && t.longEvidence > t.shortEvidence * 2) {
    setting = { key: 'length', value: 'detailed' };
    ids = t.ids.long;
    explanation = `You've often chosen or asked for longer responses in this session (${t.longTurns.size} different turns). Would you like more detailed suggestions more often?`;
  }
  if (!setting) return null;
  const active = resolveSavedPreferences(args.approved, args.scope).find((p) => p.setting.key === 'length');
  if (active && active.setting.value === setting.value) return null;
  return {
    id: args.newId(), proposedSetting: setting, scope: args.scope, evidenceIds: ids,
    explanation: `${explanation} This is a tentative pattern from this session only. It would apply to ${describeScope(args.scope)}.`,
    status: 'pending',
  };
}
