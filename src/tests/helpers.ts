// Deterministic test driver for the Still Here reducer. All time is explicit (a
// monotonically advancing fake clock); ids for input events/cycles are fresh per call.
import { expect } from 'vitest';
import { reducer } from '@/core/reducer';
import { targetsFor, activeWorkspace } from '@/core/targets';
import { DEFAULT_SETTINGS, currentSurface } from '@/core/state';
import type { Action, Effect, Settings, State, Surface, Target, Workspace } from '@/core/state';
import { initialState } from '@/core/state';
import type { CandidateAct, ReplyRequest, ReplyResponseData } from '@/core/types';

let seq = 0;
export const freshId = (prefix: string) => `${prefix}-${++seq}`;

export type ActivateOpts = {
  at?: number;
  cycleId?: string;
  eventId?: string;
  surfaceRevision?: number;
  sessionEpoch?: string;
  source?: 'switch' | 'pointer' | 'keyboard';
};

export type GenEffect = Extract<Effect, { kind: 'generate' }>;
export type SpeakEffect = Extract<Effect, { kind: 'speak' }>;
export type ActivateAction = Extract<Action, { type: 'ACTIVATE' }>;

export type FixtureCandidate = { text: string; meaning: { act: CandidateAct; summary: string } };

// Lengths 1 / 7 / 17 words: a meaningful length spread (>= minLengthSpreadWords).
export const SPREAD_CANDIDATES: FixtureCandidate[] = [
  { text: 'Yes.', meaning: { act: 'accept', summary: 'Agrees.' } },
  { text: 'Sure, I can do that later today.', meaning: { act: 'conditional', summary: 'Agrees, later today.' } },
  {
    text: 'I would rather not do that right now, but maybe we can talk about it again tomorrow.',
    meaning: { act: 'decline', summary: 'Declines for now; open to tomorrow.' },
  },
];

// Lengths 3 / 3 / 4 words: no meaningful length opportunity.
export const SIMILAR_CANDIDATES: FixtureCandidate[] = [
  { text: 'Yes, sounds good.', meaning: { act: 'accept', summary: 'Agrees.' } },
  { text: 'No, not today.', meaning: { act: 'decline', summary: 'Declines.' } },
  { text: 'Maybe later this week.', meaning: { act: 'conditional', summary: 'Maybe later.' } },
];

export const ALT_CANDIDATES: FixtureCandidate[] = [
  { text: 'Okay.', meaning: { act: 'accept', summary: 'Okay.' } },
  { text: 'What time works for you?', meaning: { act: 'question', summary: 'Asks about time.' } },
  { text: 'Could we do something else instead, like a walk outside?', meaning: { act: 'alternative', summary: 'Suggests a walk.' } },
];

export function okResult(identity: ReplyRequest['identity'], candidates: FixtureCandidate[] = SPREAD_CANDIDATES): Extract<Action, { type: 'GENERATION_RESULT' }> {
  const data: ReplyResponseData = { candidates, source: 'demo-fixture', model: null, repaired: false };
  return { type: 'GENERATION_RESULT', identity, result: { ok: true, requestId: identity.requestId, data }, at: 0 };
}

export const ids = (s: State) => targetsFor(s).map((t) => t.id);

export class Driver {
  s: State;
  t: number;

  constructor(settings: Partial<Settings> = {}, prior: State = initialState(), epoch = 'e1', at = 0) {
    this.t = at;
    this.s = reducer(prior, {
      type: 'SETUP_START', settings: { ...DEFAULT_SETTINGS, aiMode: 'fixture', ...settings },
      profileDraft: null, epoch, at,
    });
  }

  tick(ms = 1000): number { this.t += ms; return this.t; }

  dispatch(a: Action): State { this.s = reducer(this.s, a); return this.s; }

  surface(): Surface { return currentSurface(this.s); }
  ws(): Workspace | null { return activeWorkspace(this.s); }
  targets(): Target[] { return targetsFor(this.s); }
  target(id: string): Target | undefined { return this.targets().find((t) => t.id === id); }

  // Builds an ACTIVATE action for the current state with fresh ids.
  activation(targetId: string, o: ActivateOpts = {}): ActivateAction {
    return {
      type: 'ACTIVATE', targetId,
      eventId: o.eventId ?? freshId('ev'),
      cycleId: o.cycleId ?? freshId('cy'),
      surfaceRevision: o.surfaceRevision ?? this.s.surfaceRevision,
      sessionEpoch: o.sessionEpoch ?? this.s.sessionEpoch,
      source: o.source ?? 'switch',
      at: o.at ?? this.tick(),
    };
  }

  // Raw activation; no assertions. Returns the action used.
  tryAct(targetId: string, o: ActivateOpts = {}): ActivateAction {
    const a = this.activation(targetId, o);
    this.dispatch(a);
    return a;
  }

  // Activation that must exist, be enabled, and be accepted.
  act(targetId: string, o: ActivateOpts = {}): ActivateAction {
    const t = this.target(targetId);
    expect(t, `target ${targetId} on ${this.surface().kind}; have ${ids(this.s).join(',')}`).toBeDefined();
    expect(t!.enabled, `target ${targetId} enabled`).toBe(true);
    const rev = this.s.surfaceRevision;
    const a = this.tryAct(targetId, o);
    expect(this.s.surfaceRevision, `activation ${targetId} accepted`).toBeGreaterThan(rev);
    return a;
  }

  actAll(...targetIds: string[]) { for (const id of targetIds) this.act(id); }

  partner(text: string): State {
    return this.dispatch({ type: 'PARTNER_SUBMIT', text, source: 'partner-typed', at: this.tick() });
  }

  generates(): GenEffect[] { return this.s.effects.filter((e): e is GenEffect => e.kind === 'generate'); }
  speaks(): SpeakEffect[] { return this.s.effects.filter((e): e is SpeakEffect => e.kind === 'speak'); }
  lastGenerate(): GenEffect {
    const g = this.generates();
    expect(g.length, 'a generate effect is queued').toBeGreaterThan(0);
    return g[g.length - 1];
  }

  // Delivers a successful result for the given (default: latest) generate request.
  resolve(candidates: FixtureCandidate[] = SPREAD_CANDIDATES, request: ReplyRequest = this.lastGenerate().request): State {
    return this.dispatch({ ...okResult(request.identity, candidates), at: this.tick() });
  }

  speech(kind: 'start' | 'end' | 'error' | 'interrupted' | 'uncertain', utteranceId = this.s.speech?.utterance.id ?? 'none', sessionEpoch = this.s.sessionEpoch) {
    return this.dispatch({ type: 'SPEECH_EVENT', utteranceId, sessionEpoch, kind, at: this.tick() });
  }

  userTurns() { return this.s.conversation.filter((e) => e.role === 'user'); }
  partnerTurns() { return this.s.conversation.filter((e) => e.role === 'partner'); }

  // Navigate from the board to a tools sub-surface.
  toPreferences() { this.act('more'); this.act('t-prefs'); }

  // Saves a manual preference for the current scope through Preferences -> Edit -> key -> value -> confirm,
  // then returns to the board.
  savePreference(key: string, value: string) {
    this.toPreferences();
    this.act('p-edit');
    this.act(`se-${key}`);
    this.act(`sv-${value}`);
    this.act('cf-confirm');
    // back from style-edit(null) -> preferences -> tools -> board
    this.act('back'); this.act('back'); this.act('back');
    expect(this.surface().kind).toBe('board');
  }

  // One full partner turn: partner speaks, suggestions arrive, user selects candidate `index`,
  // confirms, and playback ends.
  fullTurn(partnerText: string, index = 0, candidates: FixtureCandidate[] = SPREAD_CANDIDATES) {
    this.partner(partnerText);
    this.resolve(candidates);
    this.act(`cand-${index}`);
    this.act('rv-speak');
    this.speech('start');
    this.speech('end');
    expect(this.surface().kind).toBe('board');
  }
}
