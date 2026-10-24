// The authoritative reducer. All decisions happen here; effects are queued as data
// and executed by the browser runtime (src/runtime/effects-runner.ts) exactly once each.
import type {
  Anchor, Candidate, ConfirmedUserTurn, ConfirmedUtterance, Delivery, Id, PartnerTurn,
  RejectedBatch, ReviewSnapshot, StyleSetting,
} from './types';
import type { Action, Command, Effect, MetricEvent, PendingChange, State, Surface, Workspace } from './state';
import { currentSurface, EMPTY_GUIDANCE, initialState } from './state';
import { activeWorkspace, targetsFor } from './targets';
import { buildReplyRequest } from './context-builder';
import { LIMITS } from './limits';
import { BUILT_IN_PHRASES } from './phrases';
import { maybePropose, observeConfirmedChoice, observeExplicitLengthFeedback, pruneObservations } from '@/adaptation/observations';

export const newId = (): Id =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;

type EffectInput = Effect extends infer E ? (E extends { id: Id } ? Omit<E, 'id'> : never) : never;

function addEffects(s: State, ...effects: EffectInput[]): State {
  return { ...s, effects: [...s.effects, ...effects.map((e) => ({ ...e, id: newId() }) as Effect)] };
}

function metric(s: State, kind: MetricEvent['kind'], t: number, extra: Omit<MetricEvent, 'kind' | 't'> = {}): State {
  if (!s.settings.measurement) return s;
  return { ...s, metrics: [...s.metrics, { kind, t, ...extra }].slice(-LIMITS.metricsEvents) };
}

function setStack(s: State, stack: Surface[], at: number): State {
  return { ...s, stack: stack.length ? stack : [{ kind: 'board' }], surfaceRevision: s.surfaceRevision + 1, surfaceOpenedAt: at };
}
const push = (s: State, surface: Surface, at: number) => setStack(s, [...s.stack, surface], at);
const pop = (s: State, at: number) => setStack(s, s.stack.slice(0, -1), at);
const replaceTop = (s: State, surface: Surface, at: number) => setStack(s, [...s.stack.slice(0, -1), surface], at);
const toBoard = (s: State, at: number) => setStack(s, [{ kind: 'board' }], at);

function notice(s: State, text: string, at: number): State {
  return { ...s, notice: { text, at } };
}

function updateWorkspace(s: State, id: Id, patch: Partial<Workspace>): State {
  const ws = s.workspaces[id];
  if (!ws) return s;
  return { ...s, workspaces: { ...s.workspaces, [id]: { ...ws, ...patch } } };
}

function partnerTurn(s: State, id: Id): PartnerTurn | null {
  const e = s.conversation.find((c) => c.role === 'partner' && c.value.id === id);
  return e && e.role === 'partner' ? e.value : null;
}

function updatePartnerTurn(s: State, id: Id, patch: Partial<PartnerTurn>): State {
  return {
    ...s,
    conversation: s.conversation.map((e) => (e.role === 'partner' && e.value.id === id ? { role: 'partner', value: { ...e.value, ...patch } } : e)),
  };
}

function setDelivery(s: State, utteranceId: Id, delivery: Delivery): State {
  return {
    ...s,
    conversation: s.conversation.map((e) => (e.role === 'user' && e.value.utteranceId === utteranceId ? { role: 'user', value: { ...e.value, delivery } } : e)),
    speech: s.speech && s.speech.utterance.id === utteranceId ? { ...s.speech, utterance: { ...s.speech.utterance, delivery } } : s.speech,
  };
}

function createWorkspace(s: State, anchor: Anchor, at: number): { s: State; id: Id } {
  const id = newId();
  const ws: Workspace = {
    id, anchor, createdAt: at, guidance: EMPTY_GUIDANCE(s.settings.scope),
    batch: null, rejected: [], failedBatches: 0, status: 'idle', error: null,
    pending: null, refineTarget: null, refineMode: null, parked: false, closed: null, unseenResult: false,
  };
  return { s: { ...s, workspaces: { ...s.workspaces, [id]: ws } }, id };
}

// Parks the currently active open workspace (visible in History) so new work never replaces it silently.
function parkActive(s: State): State {
  const ws = activeWorkspace(s);
  if (!ws || ws.closed) return { ...s, activeWorkspaceId: null };
  return { ...updateWorkspace(s, ws.id, { parked: true }), activeWorkspaceId: null };
}

function startGeneration(s: State, wsId: Id, kind: 'suggestions' | 'refinement', at: number): State {
  let ws = s.workspaces[wsId];
  if (!ws) return s;
  if (s.settings.aiMode === 'local-only') return updateWorkspace(s, wsId, { status: 'idle', pending: null });
  if (ws.pending) s = addEffects(s, { kind: 'abort-generation', requestId: ws.pending.requestId });
  const requestId = newId();
  s = updateWorkspace(s, wsId, {
    pending: { requestId, kind, startedAt: at }, status: 'generating', error: null,
    refineTarget: kind === 'refinement' ? ws.refineTarget : null,
    refineMode: kind === 'refinement' ? ws.refineMode : null, unseenResult: false,
  });
  ws = s.workspaces[wsId];
  const request = buildReplyRequest(s, ws, requestId);
  s = addEffects(s, { kind: 'generate', request });
  return metric(s, 'generation-start', at, { workspaceId: wsId, requestId });
}

function acceptPartnerTurn(s: State, turnId: Id, at: number): State {
  s = updatePartnerTurn(s, turnId, { acceptedForContext: true });
  s = { ...s, staged: s.staged.filter((x) => x !== turnId), contextRevision: s.contextRevision + 1 };
  s = parkActive(s);
  const turn = partnerTurn(s, turnId)!;
  const created = createWorkspace(s, { mode: 'reply', turnId, turnContentRevision: turn.contentRevision }, at);
  s = { ...created.s, activeWorkspaceId: created.id };
  s = metric(s, 'partner-accepted', at, { workspaceId: created.id });
  return startGeneration(s, created.id, 'suggestions', at);
}

function learningOn(s: State) {
  return s.settings.sessionAdaptation && !s.settings.personalizationPaused;
}

function afterObservation(s: State, at: number): State {
  const obs = pruneObservations(s.observations, at, s.sessionEpoch);
  const proposal = maybePropose({
    obs, existing: s.proposals, suppressed: s.suppressedDimensions,
    approved: s.approvedPreferences, scope: s.settings.scope, newId,
  });
  s = { ...s, observations: obs };
  if (proposal) {
    s = { ...s, proposals: [...s.proposals, proposal] };
    s = notice(s, 'Preference suggestion available in Preferences.', at);
  }
  return s;
}

function openReview(s: State, snapshot: Omit<ReviewSnapshot, 'id' | 'sessionEpoch' | 'openedAt'>, origin: NonNullable<State['review']>['origin'], afterStack: Surface[], at: number): State {
  const full: ReviewSnapshot = Object.freeze({ ...snapshot, id: newId(), sessionEpoch: s.sessionEpoch, openedAt: at });
  s = { ...s, review: { snapshot: full, origin, cancelStack: s.stack, afterStack } };
  s = push(s, { kind: 'review' }, at);
  return metric(s, 'review-open', at, { source: full.source, workspaceId: full.workspaceId });
}

const stackWithout = (stack: Surface[], kinds: Surface['kind'][]) => {
  const out = [...stack];
  while (out.length > 1 && kinds.includes(out[out.length - 1].kind)) out.pop();
  return out;
};

function persist(s: State, at: number, what = 'Saved'): State {
  if (s.settings.persistOnDevice) return addEffects(s, { kind: 'persist' });
  return notice({ ...s, storageStatus: 'session-only' }, `${what} for this session only. "Remember on this device" is off.`, at);
}

function applyChange(s: State, change: PendingChange, a: Extract<Action, { type: 'ACTIVATE' }>): State {
  const at = a.at;
  switch (change.kind) {
    case 'save-preference': {
      const same = (p: State['approvedPreferences'][number]) => p.setting.key === change.setting.key
        && p.scope.relationship === change.scope.relationship && p.scope.setting === change.scope.setting;
      const pref = {
        id: newId(), setting: change.setting, scope: change.scope, origin: change.origin,
        approvalEventId: a.eventId, approvedAt: at, enabled: true, version: 1,
      };
      s = { ...s, approvedPreferences: [...s.approvedPreferences.filter((p) => !same(p)), pref], preferenceRevision: s.preferenceRevision + 1 };
      if (change.proposalId) s = { ...s, proposals: s.proposals.map((p) => (p.id === change.proposalId ? { ...p, status: 'approved' } : p)) };
      return persist(s, at, 'Preference applied');
    }
    case 'remove-preference': {
      s = {
        ...s, preferenceRevision: s.preferenceRevision + 1,
        approvedPreferences: s.approvedPreferences.filter((p) => !(p.setting.key === change.key
          && p.scope.relationship === change.scope.relationship && p.scope.setting === change.scope.setting)),
      };
      return persist(s, at, 'Change applied');
    }
    case 'approve-profile': {
      const d = s.profileDraft;
      if (!d) return s;
      const clean = (v: string) => v.trim().slice(0, 120);
      const incoming = [
        ...(d.preferredName ? [{ field: 'preferredName' as const, value: clean(d.preferredName) }] : []),
        ...d.interests.map((i) => ({ field: 'interest' as const, value: clean(i) })),
      ].filter((e) => e.value);
      // A new preferred name replaces the old one; duplicates are dropped; totals stay within the stored schema.
      const kept = s.approvedProfile.filter((p) => !(p.field === 'preferredName' && incoming.some((e) => e.field === 'preferredName')));
      const seen = new Set(kept.map((p) => `${p.field}:${p.value.toLowerCase()}`));
      const fresh = incoming.filter((e) => { const k = `${e.field}:${e.value.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .map((e) => ({ ...e, id: newId(), approvedAt: at, approvalEventId: a.eventId, enabled: true }));
      const approvedProfile = [...kept, ...fresh].slice(0, LIMITS.profileEntries);
      s = { ...s, approvedProfile, profileDraft: null, preferenceRevision: s.preferenceRevision + 1 };
      return persist(s, at, 'Profile approved');
    }
    case 'delete-item': {
      if (change.item === 'preference') s = { ...s, approvedPreferences: s.approvedPreferences.filter((p) => p.id !== change.id), preferenceRevision: s.preferenceRevision + 1 };
      if (change.item === 'profile') s = { ...s, approvedProfile: s.approvedProfile.filter((p) => p.id !== change.id), preferenceRevision: s.preferenceRevision + 1 };
      if (change.item === 'phrase') s = { ...s, savedPhrases: s.savedPhrases.filter((p) => p.id !== change.id || p.builtIn) };
      return persist(s, at, 'Deleted');
    }
    case 'toggle-item': {
      if (change.item === 'preference') s = { ...s, approvedPreferences: s.approvedPreferences.map((p) => (p.id === change.id ? { ...p, enabled: change.enabled } : p)) };
      else s = { ...s, approvedProfile: s.approvedProfile.map((p) => (p.id === change.id ? { ...p, enabled: change.enabled } : p)) };
      return persist({ ...s, preferenceRevision: s.preferenceRevision + 1 }, at, 'Change applied');
    }
    case 'save-phrase': {
      const text = change.text.trim().slice(0, LIMITS.phraseChars);
      if (!text) return s;
      if (s.savedPhrases.filter((p) => !p.builtIn).length >= 40) return notice(s, 'You have 40 saved phrases, the most this prototype keeps. Delete one in Memory first.', at);
      s = { ...s, savedPhrases: [...s.savedPhrases, { id: newId(), text, builtIn: false, group: 'custom' }], drafts: { ...s.drafts, phrase: '' } };
      return persist(s, at, 'Phrase saved');
    }
    case 'enable-persistence':
      return addEffects({ ...s, settings: { ...s.settings, persistOnDevice: true } }, { kind: 'persist' });
    case 'delete-all-saved':
      s = {
        ...s, approvedPreferences: [], approvedProfile: [], suppressedDimensions: [],
        savedPhrases: BUILT_IN_PHRASES, preferenceRevision: s.preferenceRevision + 1,
      };
      return notice(addEffects(s, { kind: 'clear-storage' }), 'Everything saved was deleted from this session and this device.', at);
    case 'clear-session-learning':
      return notice({ ...s, observations: [], proposals: [], preferenceRevision: s.preferenceRevision + 1 }, 'Session learning cleared.', at);
    case 'suppress-dimension':
      s = {
        ...s, suppressedDimensions: Array.from(new Set([...s.suppressedDimensions, change.key])),
        proposals: s.proposals.map((p) => (p.id === change.proposalId ? { ...p, status: 'rejected' } : p)),
        observations: s.observations.filter((o) => o.dimension !== change.key),
        preferenceRevision: s.preferenceRevision + 1,
      };
      return persist(s, at, 'Opt-out recorded');
  }
}

function insertKey(draft: string, key: string): string {
  if (/^[A-Z]$/.test(key)) {
    const sentenceStart = draft.trim() === '' || /[.?!]\s+$/.test(draft);
    return draft + (sentenceStart ? key : key.toLowerCase());
  }
  return draft + key;
}

/**
 * Replaces each run of C0/C1 control characters (newlines, tabs, DEL…) with one space. Used for
 * typed/pasted draft text before it is stored; the reviewed exact text is never altered later.
 */
export function stripControlChars(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ');
}

const draftLimit = (purpose: 'message' | 'seed' | 'phrase') =>
  purpose === 'message' ? LIMITS.composeChars : purpose === 'seed' ? LIMITS.seedChars : LIMITS.phraseChars;

function applyCommand(s: State, cmd: Command, a: Extract<Action, { type: 'ACTIVATE' }>): State {
  const at = a.at;
  const ws = activeWorkspace(s);
  const top = currentSurface(s);
  switch (cmd.type) {
    case 'select-candidate': {
      if (!ws?.batch) return s;
      const c = ws.batch.candidates.find((x) => x.id === cmd.candidateId);
      if (!c) return s;
      s = openReview(s, {
        workspaceId: ws.id, originatingBatchId: ws.batch.id, originatingCandidateId: c.id,
        source: ws.batch.source, exactText: c.text,
        selectedByEventId: a.eventId, selectedByInputCycleId: a.cycleId, returnSurface: 'board',
      }, { kind: 'candidate', workspaceId: ws.id, batchId: ws.batch.id, candidateId: c.id }, [{ kind: 'board' }], at);
      return s.settings.speakOnSelect ? confirmSpeak(s, a, true) : s;
    }
    case 'none-of-these': {
      if (!ws?.batch) return s;
      s = metric(s, 'none-of-these', at, { workspaceId: ws.id });
      if (ws.batch.kind === 'refinement') {
        // Leaving a wording refinement is not a rejection of the selected meaning.
        s = updateWorkspace(s, ws.id, { refineTarget: null });
        return startGeneration(s, ws.id, 'suggestions', at);
      }
      const rejected: RejectedBatch = {
        batchId: ws.batch.id, workspaceId: ws.id, anchor: ws.anchor,
        candidates: ws.batch.candidates, feedback: 'none-fit', at,
      };
      s = updateWorkspace(s, ws.id, {
        rejected: [...ws.rejected, rejected].slice(-Math.ceil(LIMITS.rejectedTexts / 3)),
        failedBatches: ws.failedBatches + 1,
      });
      return startGeneration(s, ws.id, 'suggestions', at);
    }
    case 'open': return push(s, cmd.surface, at);
    case 'back': return pop(s, at);
    case 'set-intent': {
      if (!ws) return toBoard(s, at);
      s = updateWorkspace(s, ws.id, { guidance: { ...ws.guidance, intent: cmd.intent }, refineTarget: null });
      s = metric({ ...s, contextRevision: s.contextRevision + 1 }, 'guidance', at, { workspaceId: ws.id, detail: cmd.intent });
      return toBoard(startGeneration(s, ws.id, 'suggestions', at), at);
    }
    case 'add-wording': {
      if (!ws) return toBoard(s, at);
      const wording: StyleSetting[] = [...ws.guidance.wording.filter((w) => w.key !== cmd.setting.key), cmd.setting];
      s = updateWorkspace(s, ws.id, { guidance: { ...ws.guidance, wording }, refineTarget: null });
      if (cmd.feedback && learningOn(s)) {
        const o = observeExplicitLengthFeedback({ direction: cmd.feedback, scope: s.settings.scope, turnKey: turnKeyOf(ws.anchor), sessionEpoch: s.sessionEpoch, at, newId });
        s = afterObservation({ ...s, observations: [...s.observations, o] }, at);
      }
      s = metric({ ...s, contextRevision: s.contextRevision + 1 }, 'guidance', at, { workspaceId: ws.id, detail: cmd.setting.key });
      return toBoard(startGeneration(s, ws.id, 'suggestions', at), at);
    }
    case 'clear-guidance': {
      if (!ws) return toBoard(s, at);
      s = updateWorkspace(s, ws.id, { guidance: EMPTY_GUIDANCE(s.settings.scope), refineTarget: null });
      s = { ...s, contextRevision: s.contextRevision + 1 };
      return toBoard(startGeneration(s, ws.id, 'suggestions', at), at);
    }
    case 'retry':
      if (!ws) return s;
      return startGeneration(s, ws.id, ws.refineTarget ? 'refinement' : 'suggestions', at);
    case 'refresh':
      if (!ws) return s;
      if (ws.anchor.mode === 'reply') {
        const turn = partnerTurn(s, ws.anchor.turnId);
        if (turn && turn.contentRevision !== ws.anchor.turnContentRevision) {
          s = updateWorkspace(s, ws.id, { anchor: { ...ws.anchor, turnContentRevision: turn.contentRevision } });
        }
      }
      return startGeneration(updateWorkspace(s, ws.id, { refineTarget: null }), ws.id, 'suggestions', at);
    case 'quick-phrase': {
      const ph = s.savedPhrases.find((p) => p.id === cmd.phraseId);
      if (!ph) return s;
      s = openReview(s, {
        workspaceId: null, originatingBatchId: null, originatingCandidateId: null,
        source: 'saved-phrase', exactText: ph.text,
        selectedByEventId: a.eventId, selectedByInputCycleId: a.cycleId, returnSurface: 'previous',
      }, { kind: 'phrase', phraseId: ph.id }, stackWithout(s.stack, ['quick']), at);
      return s.settings.speakOnSelect ? confirmSpeak(s, a, true) : s;
    }
    case 'quick-page': return replaceTop(s, { kind: 'quick', page: cmd.page }, at);
    case 'compose-group':
      if (top.kind !== 'compose') return s;
      return replaceTop(s, { ...top, group: cmd.group }, at);
    case 'compose-key': {
      if (top.kind !== 'compose') return s;
      const draft = s.drafts[top.purpose];
      const next = insertKey(draft, cmd.key);
      if (next.length > draftLimit(top.purpose)) return notice(s, `That is the ${draftLimit(top.purpose)}-character limit; the text was not changed.`, at);
      s = metric({ ...s, drafts: { ...s.drafts, [top.purpose]: next } }, 'compose-key', at);
      return replaceTop(s, { ...top, group: null }, at); // a selected letter returns to groups
    }
    case 'compose-space': {
      if (top.kind !== 'compose') return s;
      const draft = s.drafts[top.purpose];
      if (draft.endsWith(' ') || draft.length + 1 > draftLimit(top.purpose)) return s;
      return { ...s, drafts: { ...s.drafts, [top.purpose]: draft + ' ' } };
    }
    case 'compose-delete': {
      if (top.kind !== 'compose') return s;
      return { ...s, drafts: { ...s.drafts, [top.purpose]: s.drafts[top.purpose].slice(0, -1) } };
    }
    case 'compose-clear-confirm': {
      const below = s.stack[s.stack.length - 2];
      if (below?.kind !== 'compose') return pop(s, at);
      return pop({ ...s, drafts: { ...s.drafts, [below.purpose]: '' } }, at);
    }
    case 'compose-done': {
      if (top.kind !== 'compose') return s;
      const text = s.drafts[top.purpose].trim();
      if (!text) return s;
      if (top.purpose === 'message') {
        return openReview(s, {
          workspaceId: null, originatingBatchId: null, originatingCandidateId: null,
          source: 'user-composed', exactText: text,
          selectedByEventId: a.eventId, selectedByInputCycleId: a.cycleId, returnSurface: 'previous',
        }, { kind: 'composed' }, stackWithout(s.stack, ['compose']), at);
      }
      if (top.purpose === 'phrase') return push(s, { kind: 'confirm-change', change: { kind: 'save-phrase', text } }, at);
      // Seed: user-provided intent data for the active workspace.
      if (!ws) return toBoard(s, at);
      s = updateWorkspace(s, ws.id, { guidance: { ...ws.guidance, userTopicOrSeed: text, intent: ws.guidance.intent ?? 'other' }, refineTarget: null });
      s = { ...s, drafts: { ...s.drafts, seed: '' }, contextRevision: s.contextRevision + 1 };
      s = metric(s, 'guidance', at, { workspaceId: ws.id, detail: 'seed' });
      return toBoard(startGeneration(s, ws.id, 'suggestions', at), at);
    }
    case 'review-cancel': {
      if (!s.review) return pop(s, at);
      const back = s.review.cancelStack;
      return setStack({ ...s, review: null }, back, at);
    }
    case 'review-speak': return confirmSpeak(s, a);
    case 'refine-candidate': {
      const r = s.review;
      if (!r || r.origin.kind !== 'candidate') return s;
      const w = s.workspaces[r.origin.workspaceId];
      const c = w?.batch?.candidates.find((x) => x.id === (r.origin as { candidateId: Id }).candidateId);
      if (!w || !c) return s;
      const refineTarget: Candidate = { ...c };
      s = updateWorkspace({ ...s, review: null }, w.id, { refineTarget, refineMode: cmd.mode });
      if (cmd.mode === 'shorter' && learningOn(s)) {
        const o = observeExplicitLengthFeedback({ direction: 'shorter', scope: s.settings.scope, turnKey: turnKeyOf(w.anchor), sessionEpoch: s.sessionEpoch, at, newId });
        s = afterObservation({ ...s, observations: [...s.observations, o] }, at);
      }
      s = { ...s, activeWorkspaceId: w.id };
      return toBoard(startGeneration(s, w.id, 'refinement', at), at);
    }
    case 'edit-review-text': {
      if (!s.review) return s;
      const text = s.review.snapshot.exactText.slice(0, LIMITS.composeChars);
      s = { ...s, review: null, drafts: { ...s.drafts, message: text } };
      return setStack(s, [{ kind: 'board' }, { kind: 'compose', purpose: 'message', group: null, seedFor: null }], at);
    }
    case 'stop-speech': return stopSpeech(s, at);
    case 'review-basic-voice': {
      const f = s.lastFailedSpeech;
      if (!f) return s;
      // A fresh review and a fresh, separate confirmation are required before any basic-voice repeat.
      return openReview(s, {
        workspaceId: null, originatingBatchId: null, originatingCandidateId: null,
        source: f.source, exactText: f.text,
        selectedByEventId: a.eventId, selectedByInputCycleId: a.cycleId, returnSurface: 'board',
      }, { kind: 'basic-voice', originalUtteranceId: f.utteranceId }, [{ kind: 'board' }], at);
    }
    case 'dismiss-failed-speech': return { ...s, lastFailedSpeech: null };
    case 'set-speech-provider':
      return { ...s, settings: { ...s.settings, speechProvider: cmd.provider } };
    case 'pause': {
      if (s.recording.status === 'recording') s = addEffects(s, { kind: 'discard-recording' });
      return push(s, { kind: 'paused' }, at);
    }
    case 'resume': return pop(s, at);
    case 'end-session': return endSession(s, at);
    case 'initiate': {
      s = parkActive(s);
      const created = createWorkspace(s, { mode: 'initiate', topicId: newId(), category: cmd.category, userTopicOrSeed: cmd.seed }, at);
      s = { ...created.s, activeWorkspaceId: created.id };
      return toBoard(startGeneration(s, created.id, 'suggestions', at), at);
    }
    case 'history-answer': {
      if (!s.staged.includes(cmd.turnId)) return s;
      return toBoard(acceptPartnerTurn(s, cmd.turnId, at), at);
    }
    case 'history-dismiss-staged': {
      s = updatePartnerTurn(s, cmd.turnId, { dismissed: true });
      return { ...s, staged: s.staged.filter((x) => x !== cmd.turnId) };
    }
    case 'history-return': {
      const target = s.workspaces[cmd.workspaceId];
      if (!target || target.closed) return s;
      s = parkActive(s);
      s = updateWorkspace(s, target.id, { parked: false });
      if (target.anchor.mode === 'reply') {
        const turn = partnerTurn(s, target.anchor.turnId);
        if (turn && turn.contentRevision !== target.anchor.turnContentRevision) {
          s = updateWorkspace(s, target.id, { status: 'stale', batch: null, rejected: [] });
        }
      }
      return toBoard({ ...s, activeWorkspaceId: target.id }, at);
    }
    case 'history-dismiss-workspace': {
      s = updateWorkspace(s, cmd.workspaceId, { closed: 'dismissed', parked: false, rejected: [] });
      const w = s.workspaces[cmd.workspaceId];
      if (w?.pending) s = addEffects(updateWorkspace(s, w.id, { pending: null }), { kind: 'abort-generation', requestId: w.pending.requestId });
      return s;
    }
    case 'park-active': return toBoard(parkActive(s), at);
    case 'toggle-flag': {
      const settings = { ...s.settings, [cmd.flag]: !s.settings[cmd.flag] };
      const affectsPolicy = cmd.flag !== 'measurement';
      return { ...s, settings, preferenceRevision: affectsPolicy ? s.preferenceRevision + 1 : s.preferenceRevision };
    }
    case 'disable-persistence':
      s = addEffects({ ...s, settings: { ...s.settings, persistOnDevice: false }, storageStatus: 'session-only' }, { kind: 'clear-storage' });
      return notice(s, 'Removed from this device. Approved items stay for this session only.', at);
    case 'request-change': return push(s, { kind: 'confirm-change', change: cmd.change }, at);
    case 'confirm-change': {
      if (top.kind !== 'confirm-change') return s;
      s = applyChange(s, top.change, a);
      let stack = s.stack.slice(0, -1);
      stack = stackWithout(stack, top.change.kind === 'save-phrase' ? ['compose'] : ['proposal']);
      const last = stack[stack.length - 1];
      if (last?.kind === 'style-edit' && last.key !== null) stack = stack.slice(0, -1);
      return setStack(s, stack, at);
    }
    case 'proposal-decision':
      s = { ...s, proposals: s.proposals.map((p) => (p.id === cmd.proposalId ? { ...p, status: 'deferred' } : p)) };
      return pop(s, at);
    case 'scan-speed': {
      const v = Math.min(5000, Math.max(700, s.settings.scanIntervalMs + cmd.deltaMs));
      return { ...s, settings: { ...s.settings, scanIntervalMs: v } };
    }
    case 'set-scope':
      return { ...s, settings: { ...s.settings, scope: cmd.scope }, preferenceRevision: s.preferenceRevision + 1 };
    case 'record-start':
      if (s.speech || !s.settings.cloudConsent) return s;
      return addEffects({ ...s, recording: { status: 'requesting', message: null } }, { kind: 'start-recording' });
    case 'record-finish': return addEffects(s, { kind: 'finish-recording' });
    case 'export-metrics': return addEffects(s, { kind: 'export-metrics' });
  }
}

function turnKeyOf(anchor: Anchor): Id {
  return anchor.mode === 'reply' ? anchor.turnId : anchor.topicId;
}

// Fresh, separate confirmation of the exact reviewed text. The only path to speech.
// `instant` (settings.speakOnSelect) lets the selecting gesture also confirm, for the fast demo
// flow: the snapshot is still frozen first, so exactly the selected text is spoken.
function confirmSpeak(s: State, a: Extract<Action, { type: 'ACTIVATE' }>, instant = false): State {
  const r = s.review;
  if (!r) return s;
  const snap = r.snapshot;
  if (snap.sessionEpoch !== s.sessionEpoch) return s;
  if (!instant && (a.cycleId === snap.selectedByInputCycleId || a.eventId === snap.selectedByEventId)) return s;
  const at = a.at;
  const utterance: ConfirmedUtterance = {
    id: newId(), reviewId: snap.id, exactText: snap.exactText,
    selectionEventId: snap.selectedByEventId, confirmationEventId: a.eventId,
    selectionCycleId: snap.selectedByInputCycleId, confirmationCycleId: a.cycleId,
    delivery: 'queued', sessionEpoch: s.sessionEpoch,
    provider: r.origin.kind === 'basic-voice' ? 'browser' : s.settings.speechProvider,
    voiceChoiceId: s.settings.voiceChoiceId,
    confirmedAt: at,
  };
  let anchorTurnId: Id | null = null;
  if (r.origin.kind === 'candidate') {
    const w = s.workspaces[r.origin.workspaceId];
    if (w?.anchor.mode === 'reply') anchorTurnId = w.anchor.turnId;
  }
  const turn: ConfirmedUserTurn = {
    id: newId(), sequence: s.nextSequence, text: snap.exactText, confirmedAt: at,
    delivery: 'queued', anchorTurnId, utteranceId: utterance.id, source: snap.source,
  };
  s = {
    ...s,
    conversation: [...s.conversation, { role: 'user', value: turn }],
    nextSequence: s.nextSequence + 1,
    contextRevision: s.contextRevision + 1,
    review: null,
    speech: { utterance, afterStack: r.afterStack, userTurnId: turn.id },
    // Any new confirmed utterance supersedes an earlier failure's basic-voice offer.
    lastFailedSpeech: null,
  };
  if (r.origin.kind === 'candidate') {
    const origin = r.origin;
    const w = s.workspaces[origin.workspaceId];
    if (w) {
      if (learningOn(s) && w.batch && w.batch.id === origin.batchId) {
        const o = observeConfirmedChoice({ batch: w.batch, chosenCandidateId: origin.candidateId, guidance: w.guidance, turnKey: turnKeyOf(w.anchor), sessionEpoch: s.sessionEpoch, at, newId });
        if (o) s = afterObservation({ ...s, observations: [...s.observations, o] }, at);
      }
      // Turn feedback is cleared when the turn is completed.
      s = updateWorkspace(s, w.id, { closed: 'answered', parked: false, rejected: [], refineTarget: null });
      if (s.activeWorkspaceId === w.id) s = { ...s, activeWorkspaceId: null };
    }
  }
  if (r.origin.kind === 'composed') {
    s = { ...s, drafts: { ...s.drafts, message: '' } };
    // An own-words reply answers the active question (quick phrases do not).
    const active = s.activeWorkspaceId ? s.workspaces[s.activeWorkspaceId] : null;
    if (active && !active.closed) {
      if (active.pending) s = addEffects(s, { kind: 'abort-generation', requestId: active.pending.requestId });
      s = updateWorkspace(s, active.id, { closed: 'answered', parked: false, rejected: [], refineTarget: null, pending: null });
      s = { ...s, activeWorkspaceId: null };
      if (active.anchor.mode === 'reply') {
        const anchorId = active.anchor.turnId;
        s = { ...s, conversation: s.conversation.map((e) => (e.role === 'user' && e.value.id === turn.id ? { role: 'user', value: { ...e.value, anchorTurnId: anchorId } } : e)) };
      }
    }
  }
  if (s.recording.status === 'recording' || s.recording.status === 'requesting') s = addEffects(s, { kind: 'discard-recording' });
  s = addEffects(s, { kind: 'speak', utterance });
  s = metric(s, 'confirm', at, { source: snap.source, workspaceId: snap.workspaceId });
  return setStack(s, [...r.afterStack, { kind: 'speaking' }], at);
}

// After an ElevenLabs failure, offer a labeled basic-voice retry that needs its own new review and confirmation.
function rememberFailure(next: State, before: State, delivery: 'failed' | 'uncertain'): State {
  const u = before.speech?.utterance;
  if (!u || u.provider !== 'elevenlabs') return next;
  const turn = before.conversation.find((e) => e.role === 'user' && e.value.utteranceId === u.id);
  const source = turn && turn.role === 'user' ? turn.value.source : 'user-composed';
  return { ...next, lastFailedSpeech: { utteranceId: u.id, text: u.exactText, source, delivery } };
}

function stopSpeech(s: State, at: number): State {
  if (!s.speech) return currentSurface(s).kind === 'speaking' ? pop(s, at) : s;
  const { utterance, afterStack } = s.speech;
  s = setDelivery(s, utterance.id, 'interrupted');
  s = addEffects({ ...s, speech: null }, { kind: 'stop-speech', utteranceId: utterance.id });
  return setStack(s, afterStack, at);
}

function endSession(s: State, at: number): State {
  const aborts: EffectInput[] = Object.values(s.workspaces)
    .filter((w) => w.pending)
    .map((w) => ({ kind: 'abort-generation', requestId: w.pending!.requestId }));
  const keep = initialState(newId());
  const next: State = {
    ...keep,
    phase: 'setup',
    settings: s.settings,
    surfaceRevision: s.surfaceRevision + 1,
    surfaceOpenedAt: at,
    // Session-only approvals end with the session; device-retained ones remain until deleted.
    approvedPreferences: s.settings.persistOnDevice ? s.approvedPreferences : [],
    approvedProfile: s.settings.persistOnDevice ? s.approvedProfile : [],
    savedPhrases: s.settings.persistOnDevice ? s.savedPhrases : s.savedPhrases.filter((p) => p.builtIn),
    suppressedDimensions: s.settings.persistOnDevice ? s.suppressedDimensions : [],
    storageStatus: s.storageStatus,
    effects: [],
  };
  return addEffects(next, ...aborts, { kind: 'cancel-all-speech' }, { kind: 'discard-recording' });
}

function activate(s: State, a: Extract<Action, { type: 'ACTIVATE' }>): State {
  if (s.phase !== 'active') return s;
  if (a.sessionEpoch !== s.sessionEpoch) return s;
  if (a.surfaceRevision !== s.surfaceRevision) return s; // gesture began on a different surface
  if (s.consumedCycles.includes(a.cycleId) || s.consumedCycles.includes(a.eventId)) return s;
  const target = targetsFor(s).find((t) => t.id === a.targetId);
  if (!target || !target.enabled) return s;
  if (target.requiresArming && a.at - s.surfaceOpenedAt < LIMITS.confirmArmMs) return s;
  let next: State = { ...s, consumedCycles: [...s.consumedCycles, a.cycleId, a.eventId].slice(-LIMITS.consumedCycleMemory) };
  next = metric(next, 'activation', a.at, { source: a.source, detail: target.id });
  next = applyCommand(next, target.command, a);
  // Every accepted activation re-arms input: a held or repeated gesture cannot act twice.
  return { ...next, surfaceRevision: Math.max(next.surfaceRevision, s.surfaceRevision + 1), surfaceOpenedAt: a.at };
}

export function reducer(s: State, action: Action): State {
  switch (action.type) {
    case 'SETUP_START': {
      const base = initialState(action.epoch);
      return {
        ...base,
        phase: 'active',
        settings: action.settings,
        profileDraft: action.profileDraft,
        approvedPreferences: s.approvedPreferences,
        approvedProfile: s.approvedProfile,
        savedPhrases: s.savedPhrases,
        suppressedDimensions: s.suppressedDimensions,
        storageStatus: s.storageStatus,
        surfaceRevision: s.surfaceRevision + 1,
        surfaceOpenedAt: action.at,
        effects: action.settings.persistOnDevice ? [{ id: newId(), kind: 'persist' }] : [],
      };
    }
    case 'ACTIVATE': return activate(s, action);
    case 'PARTNER_SUBMIT': {
      if (s.phase !== 'active') return s;
      const text = action.text.trim().slice(0, LIMITS.partnerInputChars);
      if (!text) return s;
      const ws = activeWorkspace(s);
      // Fast mode (speakOnSelect) is conversational: the newest partner line replaces open
      // suggestions on the board at once (the old question is parked, not lost).
      const busy = s.settings.speakOnSelect
        ? currentSurface(s).kind !== 'board' || !!s.review || !!s.speech
        : (ws && !ws.closed) || currentSurface(s).kind !== 'board' || !!s.review || !!s.speech || s.staged.length > 0;
      if (busy && s.staged.length >= LIMITS.stagedQueue) {
        return notice(s, `The waiting list is full (${LIMITS.stagedQueue}). Answer or dismiss waiting messages first.`, action.at);
      }
      const turn: PartnerTurn = {
        id: newId(), sequence: s.nextSequence, contentRevision: 0, text, createdAt: action.at,
        source: action.source, acceptedForContext: false, dismissed: false,
      };
      s = { ...s, conversation: [...s.conversation, { role: 'partner', value: turn }], nextSequence: s.nextSequence + 1 };
      if (busy) return notice({ ...s, staged: [...s.staged, turn.id] }, 'New partner message waiting. Your current work is unchanged.', action.at);
      s = acceptPartnerTurn(s, turn.id, action.at);
      return { ...s, surfaceRevision: s.surfaceRevision + 1, surfaceOpenedAt: action.at };
    }
    case 'PARTNER_EDIT_TURN': {
      const turn = partnerTurn(s, action.turnId);
      const text = action.text.trim().slice(0, LIMITS.partnerInputChars);
      if (!turn || !text || text === turn.text) return s;
      s = updatePartnerTurn(s, turn.id, { text, contentRevision: turn.contentRevision + 1, source: 'partner-edited' });
      if (turn.acceptedForContext) s = { ...s, contextRevision: s.contextRevision + 1 };
      for (const w of Object.values(s.workspaces)) {
        if (w.anchor.mode !== 'reply' || w.anchor.turnId !== turn.id || w.closed) continue;
        if (w.pending) s = addEffects(s, { kind: 'abort-generation', requestId: w.pending.requestId });
        s = updateWorkspace(s, w.id, { status: 'stale', batch: null, rejected: [], failedBatches: 0, pending: null, refineTarget: null });
      }
      return { ...s, surfaceRevision: s.surfaceRevision + 1, surfaceOpenedAt: action.at };
    }
    case 'GENERATION_RESULT': {
      const { identity, result, at } = action;
      if (identity.sessionEpoch !== s.sessionEpoch) return s;
      const ws = s.workspaces[identity.workspaceId];
      if (!ws || !ws.pending || ws.pending.requestId !== identity.requestId) return s; // superseded
      const kind = ws.pending.kind;
      const anchorStale = ws.anchor.mode === 'reply' && partnerTurn(s, ws.anchor.turnId)?.contentRevision !== ws.anchor.turnContentRevision;
      if (identity.contextRevision !== s.contextRevision || identity.preferenceRevision !== s.preferenceRevision || anchorStale || ws.closed) {
        // Never fall back to a batch the user already rejected for this question.
        const batchRejected = !!ws.batch && ws.rejected.some((r) => r.batchId === ws.batch!.id);
        return updateWorkspace(s, ws.id, { pending: null, status: ws.batch && !anchorStale && !batchRejected ? 'choosing' : 'stale' });
      }
      if (!result.ok) {
        s = updateWorkspace(s, ws.id, { pending: null, status: 'error', error: result.error });
        return metric(s, 'generation-error', at, { workspaceId: ws.id, requestId: identity.requestId, detail: result.error.code });
      }
      const candidates = result.data.candidates.map((c) => ({ id: newId(), text: c.text, meaning: c.meaning })) as [Candidate, Candidate, Candidate];
      const visible = s.activeWorkspaceId === ws.id && currentSurface(s).kind === 'board';
      s = updateWorkspace(s, ws.id, {
        pending: null, status: 'choosing', error: null, unseenResult: !visible,
        batch: { id: newId(), identity, anchor: ws.anchor, candidates, source: result.data.source, kind, receivedAt: at },
      });
      s = metric(s, 'generation-ready', at, { workspaceId: ws.id, requestId: identity.requestId, source: result.data.source });
      return visible ? { ...s, surfaceRevision: s.surfaceRevision + 1, surfaceOpenedAt: at } : s;
    }
    case 'SPEECH_EVENT': {
      if (action.sessionEpoch !== s.sessionEpoch || !s.speech || s.speech.utterance.id !== action.utteranceId) return s;
      const at = action.at;
      const { afterStack } = s.speech;
      const leave = (st: State) => (currentSurface(st).kind === 'speaking' ? setStack({ ...st, speech: null }, afterStack, at) : { ...st, speech: null });
      switch (action.kind) {
        case 'start':
          return metric(setDelivery(s, action.utteranceId, 'speaking'), 'playback-start', at);
        case 'end': {
          let done = metric(leave(setDelivery(s, action.utteranceId, 'completed')), 'playback-end', at);
          // Fast mode: answer what the partner said while the app was speaking.
          if (done.settings.speakOnSelect && done.staged.length > 0 && currentSurface(done).kind === 'board' && !done.review) {
            done = acceptPartnerTurn(done, done.staged[done.staged.length - 1], at);
            done = { ...done, surfaceRevision: done.surfaceRevision + 1, surfaceOpenedAt: at };
          }
          return done;
        }
        case 'interrupted':
          return leave(setDelivery(s, action.utteranceId, 'interrupted'));
        case 'error':
          return notice(rememberFailure(leave(setDelivery(s, action.utteranceId, 'failed')), s, 'failed'), `Speech failed. Your message is shown on screen: “${s.speech.utterance.exactText}”`, at);
        case 'uncertain':
          return notice(rememberFailure(leave(setDelivery(s, action.utteranceId, 'uncertain')), s, 'uncertain'), 'Speech status is uncertain. It was not replayed automatically.', at);
      }
      return s;
    }
    case 'EFFECTS_DONE': {
      const done = new Set(action.ids);
      return { ...s, effects: s.effects.filter((e) => !done.has(e.id)) };
    }
    case 'STORAGE_LOADED': {
      if (!action.data) return { ...s, storageStatus: action.status };
      return {
        ...s,
        storageStatus: action.status,
        approvedPreferences: action.data.approvedPreferences,
        approvedProfile: action.data.approvedProfile,
        savedPhrases: [...BUILT_IN_PHRASES, ...action.data.savedPhrases],
        suppressedDimensions: action.data.suppressedDimensions,
        settings: { ...s.settings, persistOnDevice: true },
      };
    }
    case 'STORAGE_WRITE_RESULT':
      return action.ok
        ? { ...s, storageStatus: 'saved' }
        : notice({ ...s, storageStatus: 'write-failed' }, 'Applied for this session; could not save on this device.', Date.now());
    case 'RECORDING_STATUS':
      return { ...s, recording: { status: action.status, message: action.message } };
    case 'COMPOSE_TEXT': {
      // Line breaks, tabs and other control characters never reach a draft (speech refuses them).
      const text = stripControlChars(action.text).slice(0, draftLimit(action.purpose));
      return { ...s, drafts: { ...s.drafts, [action.purpose]: text } };
    }
    case 'SAFETY_PAUSE': {
      if (s.phase !== 'active' || currentSurface(s).kind === 'paused') return s;
      if (s.speech) s = stopSpeech(s, action.at);
      if (s.recording.status === 'recording') s = addEffects(s, { kind: 'discard-recording' });
      return push(s, { kind: 'paused' }, action.at);
    }
    case 'SAFETY_STOP':
      return s.speech ? stopSpeech(s, action.at) : s;
    case 'DISMISS_NOTICE':
      return { ...s, notice: null };
  }
}
