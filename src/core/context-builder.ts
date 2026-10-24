// Builds the bounded, attributed generation context for one workspace.
import type { ReplyRequest } from './types';
import type { State, Workspace } from './state';
import { LIMITS, LENGTH_POLICIES } from './limits';
import { effectivePolicy } from '@/adaptation/preference-policy';
import { sessionHints } from '@/adaptation/observations';

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) : t);

export function personalizationFlags(state: State) {
  return {
    usePreferences: state.settings.usePreferences,
    personalizationPaused: state.settings.personalizationPaused,
    sessionAdaptation: state.settings.sessionAdaptation,
  };
}

export function workspacePolicy(state: State, ws: Workspace) {
  const guidance = { ...ws.guidance, scope: state.settings.scope };
  return effectivePolicy(guidance, state.approvedPreferences, sessionHints(state.observations), personalizationFlags(state));
}

export function buildReplyRequest(state: State, ws: Workspace, requestId: string): ReplyRequest {
  const policy = workspacePolicy(state, ws);
  const anchor = ws.anchor;
  let activePartnerText: string | null = null;
  if (anchor.mode === 'reply') {
    const entry = state.conversation.find((e) => e.role === 'partner' && e.value.id === anchor.turnId);
    if (entry && entry.role === 'partner') activePartnerText = clip(entry.value.text, LIMITS.partnerInputChars);
  }

  // Chronological, accepted-for-context turns only; staged partner turns are excluded.
  const recent = state.conversation
    .filter((e) => (e.role === 'partner' ? e.value.acceptedForContext && !e.value.dismissed : true))
    .slice(-LIMITS.recentTurns)
    .map((e) =>
      e.role === 'partner'
        ? { role: 'partner' as const, text: clip(e.value.text, LIMITS.turnChars), source: e.value.source }
        : { role: 'user' as const, text: clip(e.value.text, LIMITS.turnChars), delivery: e.value.delivery },
    );

  const personalizationOn = state.settings.usePreferences && !state.settings.personalizationPaused;
  const approvedProfile = personalizationOn
    ? state.approvedProfile.filter((p) => p.enabled).slice(0, LIMITS.profileEntries)
        .map((p) => ({ id: p.id, field: p.field, value: p.value }))
    : [];

  // Bounded rejection context: the most recent batches for this workspace only.
  const rejected = ws.rejected.slice(-Math.ceil(LIMITS.rejectedTexts / 3)).map((r) => ({
    candidates: r.candidates.slice(0, 3).map((c) => ({ text: c.text, meaning: c.meaning })),
    feedback: r.feedback,
  }));

  const seed = ws.guidance.userTopicOrSeed ? clip(ws.guidance.userTopicOrSeed, LIMITS.seedChars) : null;

  return {
    identity: {
      sessionEpoch: state.sessionEpoch,
      workspaceId: ws.id,
      requestId,
      contextRevision: state.contextRevision,
      preferenceRevision: state.preferenceRevision,
    },
    mode: state.settings.aiMode === 'live' ? 'live' : 'fixture',
    anchor:
      anchor.mode === 'initiate'
        ? { ...anchor, userTopicOrSeed: anchor.userTopicOrSeed ? clip(anchor.userTopicOrSeed, LIMITS.seedChars * 4) : null }
        : anchor,
    activePartnerText,
    language: state.settings.language,
    recentConversation: recent,
    approvedProfile,
    guidance: { ...ws.guidance, userTopicOrSeed: seed, scope: state.settings.scope },
    approvedPreferences: policy.appliedPreferences.map((p) => ({ setting: p.setting, scope: p.scope })),
    sessionStyleHints: policy.appliedHints,
    rejected,
    refineTarget: ws.refineTarget ? { text: ws.refineTarget.text, meaning: ws.refineTarget.meaning, mode: ws.refineMode ?? 'different-tone' } : null,
    lengthPolicy: ws.refineTarget && ws.refineMode === 'shorter' ? LENGTH_POLICIES.short : policy.lengthPolicy,
  };
}
