import { describe, expect, it } from 'vitest';
import { Driver, ALT_CANDIDATES, SIMILAR_CANDIDATES, SPREAD_CANDIDATES } from './helpers';
import { effectivePolicy, resolveSavedPreferences } from '@/adaptation/preference-policy';
import { observeConfirmedChoice } from '@/adaptation/observations';
import { LENGTH_POLICIES } from '@/core/limits';
import { EMPTY_GUIDANCE } from '@/core/state';
import type { ApprovedPreference, ChoiceBatch, Guidance, Scope, StyleSetting } from '@/core/types';
import type { Surface } from '@/core/state';

const GLOBAL: Scope = { relationship: null, setting: null };
const FLAGS_ON = { usePreferences: true, personalizationPaused: false, sessionAdaptation: true };

let n = 0;
function pref(setting: StyleSetting, scope: Scope = GLOBAL, approvedAt = 1): ApprovedPreference {
  return { id: `p${++n}`, setting, scope, origin: 'manual', approvalEventId: `ev${n}`, approvedAt, enabled: true, version: 1 };
}

function batchOf(cands: typeof SPREAD_CANDIDATES, kind: ChoiceBatch['kind'] = 'suggestions'): ChoiceBatch {
  return {
    id: 'b1',
    identity: { sessionEpoch: 'e1', workspaceId: 'w1', requestId: 'r1', contextRevision: 0, preferenceRevision: 0 },
    anchor: { mode: 'reply', turnId: 't1', turnContentRevision: 0 },
    candidates: cands.map((c, i) => ({ id: `c${i}`, ...c })) as ChoiceBatch['candidates'],
    source: 'demo-fixture', kind, receivedAt: 0,
  };
}

// Three distinct turns choosing the shortest candidate produce a pending length proposal.
function withLengthProposal(settings = {}) {
  const d = new Driver({ sessionAdaptation: true, ...settings });
  d.fullTurn('Turn one?', 0);
  d.fullTurn('Turn two?', 0);
  expect(d.s.proposals).toHaveLength(0);
  d.fullTurn('Turn three?', 0);
  return d;
}

describe('Preferences', () => {
  it('PREF-03 observations and proposals never reach approvedPreferences without the confirm-change flow', () => {
    const d = withLengthProposal();
    expect(d.s.observations.length).toBeGreaterThanOrEqual(3);
    expect(d.s.proposals).toHaveLength(1);
    expect(d.s.proposals[0]).toMatchObject({ status: 'pending', proposedSetting: { key: 'length', value: 'short' } });
    expect(d.s.approvedPreferences).toEqual([]);

    d.toPreferences();
    d.act('p-proposal');
    d.act('pr-yes');
    expect(d.surface().kind).toBe('confirm-change');
    expect(d.s.approvedPreferences).toEqual([]); // not yet confirmed
    d.act('cf-cancel');
    expect(d.s.approvedPreferences).toEqual([]);
    expect(d.surface().kind).toBe('proposal');
    d.act('pr-yes');
    d.act('cf-confirm');
    expect(d.s.approvedPreferences).toHaveLength(1);
    expect(d.s.approvedPreferences[0]).toMatchObject({ setting: { key: 'length', value: 'short' }, origin: 'approved-proposal' });
    expect(d.s.proposals[0].status).toBe('approved');
  });

  it('PREF-03 the confirm step itself requires arming', () => {
    const d = withLengthProposal();
    d.toPreferences();
    d.act('p-proposal');
    d.act('pr-yes');
    const before = d.s;
    d.tryAct('cf-confirm', { at: d.s.surfaceOpenedAt + 10 });
    expect(d.s).toBe(before);
    expect(d.s.approvedPreferences).toEqual([]);
  });

  it('PREF-04 an approved length preference changes lengthPolicy/approvedPreferences in the next request', () => {
    const d = new Driver();
    d.partner('Before?');
    const before = d.lastGenerate().request;
    expect(before.lengthPolicy).toEqual(LENGTH_POLICIES.short);
    expect(before.approvedPreferences).toEqual([]);
    d.resolve();
    d.act('cand-0'); d.act('rv-speak'); d.speech('end');

    d.savePreference('length', 'detailed');
    d.partner('After?');
    const after = d.lastGenerate().request;
    expect(after.lengthPolicy).toEqual(LENGTH_POLICIES.detailed);
    expect(after.approvedPreferences).toEqual([{ setting: { key: 'length', value: 'detailed' }, scope: GLOBAL }]);
  });

  it('PREF-05 explicit current wording overrides a conflicting saved preference', () => {
    const saved = pref({ key: 'length', value: 'detailed' });
    const guidance: Guidance = { ...EMPTY_GUIDANCE(GLOBAL), wording: [{ key: 'length', value: 'short' }] };
    const p = effectivePolicy(guidance, [saved], [], FLAGS_ON);
    expect(p.settings.length).toEqual({ setting: { key: 'length', value: 'short' }, provenance: 'this-response' });
    expect(p.lengthPolicy).toEqual(LENGTH_POLICIES.short);
    expect(p.appliedPreferences).toEqual([]);
    // Without the explicit wording the saved preference applies.
    const q = effectivePolicy(EMPTY_GUIDANCE(GLOBAL), [saved], [], FLAGS_ON);
    expect(q.settings.length?.provenance).toBe('saved');
    expect(q.lengthPolicy).toEqual(LENGTH_POLICIES.detailed);
  });

  it('PREF-05 explicit current wording also overrides a session hint', () => {
    const guidance: Guidance = { ...EMPTY_GUIDANCE(GLOBAL), wording: [{ key: 'length', value: 'detailed' }] };
    const p = effectivePolicy(guidance, [], [{ key: 'length', value: 'short' }], FLAGS_ON);
    expect(p.lengthPolicy).toEqual(LENGTH_POLICIES.detailed);
    expect(p.appliedHints).toEqual([]);
  });

  it('PREF-06 setting-scoped beats relationship-scoped beats global; latest approval wins ties', () => {
    const scope: Scope = { relationship: 'family', setting: 'home' };
    const g = pref({ key: 'length', value: 'detailed' }, GLOBAL, 30);
    const r = pref({ key: 'length', value: 'balanced' }, { relationship: 'family', setting: null }, 20);
    const st = pref({ key: 'length', value: 'short' }, { relationship: null, setting: 'home' }, 10);
    const pick = (prefs: ApprovedPreference[], sc: Scope = scope) => resolveSavedPreferences(prefs, sc).find((p) => p.setting.key === 'length')?.id;

    expect(pick([g, r, st])).toBe(st.id);
    expect(pick([st, r, g])).toBe(st.id);
    expect(pick([g, r])).toBe(r.id);
    expect(pick([r, g])).toBe(r.id);
    expect(pick([g])).toBe(g.id);
    // Non-matching scopes never apply.
    expect(pick([r, st], GLOBAL)).toBeUndefined();
    expect(pick([pref({ key: 'length', value: 'short' }, { relationship: 'clinician', setting: null })])).toBeUndefined();
    // Both dimensions matched beats either alone.
    const both = pref({ key: 'length', value: 'balanced' }, scope, 1);
    expect(pick([st, both, r])).toBe(both.id);
    // Ties: latest approval wins regardless of order.
    const g1 = pref({ key: 'length', value: 'short' }, GLOBAL, 100);
    const g2 = pref({ key: 'length', value: 'detailed' }, GLOBAL, 200);
    expect(pick([g1, g2])).toBe(g2.id);
    expect(pick([g2, g1])).toBe(g2.id);
    // Disabled preferences are skipped.
    expect(pick([{ ...st, enabled: false }, r])).toBe(r.id);
    // effectivePolicy follows the same resolution.
    expect(effectivePolicy(EMPTY_GUIDANCE(scope), [g, r, st], [], FLAGS_ON).lengthPolicy).toEqual(LENGTH_POLICIES.short);
  });

  it('PREF-07 Pause personalization removes saved prefs and hints from the request without deleting them', () => {
    const d = new Driver({ sessionAdaptation: true });
    d.savePreference('humor', 'light');
    d.fullTurn('One?', 0);
    d.fullTurn('Two?', 0);
    d.partner('Three?');
    const on = d.lastGenerate().request;
    expect(on.approvedPreferences).toEqual([{ setting: { key: 'humor', value: 'light' }, scope: GLOBAL }]);
    expect(on.sessionStyleHints).toEqual([{ key: 'length', value: 'short' }]);
    d.resolve(); d.act('cand-1'); d.act('rv-speak'); d.speech('end');

    const prefsBefore = d.s.approvedPreferences;
    const obsBefore = d.s.observations.length;
    d.toPreferences();
    d.act('p-pause');
    expect(d.s.settings.personalizationPaused).toBe(true);
    d.act('back'); d.act('back');
    d.partner('Four?');
    const paused = d.lastGenerate().request;
    expect(paused.approvedPreferences).toEqual([]);
    expect(paused.sessionStyleHints).toEqual([]);
    expect(paused.approvedProfile).toEqual([]);
    expect(paused.lengthPolicy).toEqual(LENGTH_POLICIES.short);
    expect(d.s.approvedPreferences).toEqual(prefsBefore);
    expect(d.s.observations.length).toBe(obsBefore);
  });

  it('PREF-08 "Not now" defers and no second length proposal appears in the same session', () => {
    const d = withLengthProposal();
    d.toPreferences();
    d.act('p-proposal');
    d.act('pr-not-now');
    expect(d.surface().kind).toBe('preferences');
    expect(d.s.proposals[0].status).toBe('deferred');
    expect(d.target('p-proposal')).toBeUndefined();
    d.act('back'); d.act('back');
    d.fullTurn('Turn four?', 0);
    d.fullTurn('Turn five?', 0);
    d.fullTurn('Turn six?', 0);
    expect(d.s.proposals.filter((p) => p.proposedSetting.key === 'length')).toHaveLength(1);
    expect(d.s.proposals.some((p) => p.status === 'pending')).toBe(false);
    expect(d.s.approvedPreferences).toEqual([]);
  });

  it('PREF-12 a choice made under explicit length guidance produces no length observation from the choice', () => {
    const d = new Driver({ sessionAdaptation: true });
    d.partner('Coffee?');
    d.resolve();
    d.act('guide'); d.act('g-wording'); d.act('w-shorter');
    d.resolve();
    d.act('cand-0');
    d.act('rv-speak');
    expect(d.s.observations.filter((o) => o.evidenceKind === 'confirmed-choice')).toEqual([]);
    // Direct check as well.
    const guidance: Guidance = { ...EMPTY_GUIDANCE(GLOBAL), wording: [{ key: 'length', value: 'short' }] };
    expect(observeConfirmedChoice({ batch: batchOf(SPREAD_CANDIDATES), chosenCandidateId: 'c0', guidance, turnKey: 't1', sessionEpoch: 'e1', at: 0, newId: () => 'o1' })).toBeNull();
  });

  // Bug: observations.ts only skips explicit *length* wording; a humor-guided choice is still
  // recorded as length evidence (evidenceCount 1, 'chose-shortest').
  it('PREF-12 a choice made under explicit humor guidance produces no length observation', () => {
    const guidance: Guidance = { ...EMPTY_GUIDANCE(GLOBAL), wording: [{ key: 'humor', value: 'light' }] };
    const o = observeConfirmedChoice({ batch: batchOf(SPREAD_CANDIDATES), chosenCandidateId: 'c0', guidance, turnKey: 't1', sessionEpoch: 'e1', at: 0, newId: () => 'o1' });
    expect(o === null || o.evidenceCount === 0).toBe(true);
  });

  it('PREF-13 a batch with similar lengths yields opportunityCount 0 / evidenceCount 0', () => {
    for (const id of ['c0', 'c1', 'c2']) {
      const o = observeConfirmedChoice({ batch: batchOf(SIMILAR_CANDIDATES), chosenCandidateId: id, guidance: EMPTY_GUIDANCE(GLOBAL), turnKey: 't1', sessionEpoch: 'e1', at: 0, newId: () => 'o1' });
      if (o) {
        expect(o.opportunityCount).toBe(0);
        expect(o.evidenceCount).toBe(0);
      }
    }
    // Through the reducer: three similar-length turns never produce a proposal or hint.
    const d = new Driver({ sessionAdaptation: true });
    for (const t of ['A?', 'B?', 'C?', 'D?']) d.fullTurn(t, 0, SIMILAR_CANDIDATES);
    expect(d.s.observations.every((o) => o.evidenceCount === 0 && o.opportunityCount === 0)).toBe(true);
    expect(d.s.proposals).toEqual([]);
    d.partner('E?');
    expect(d.lastGenerate().request.sessionStyleHints).toEqual([]);
  });

  it('PREF-15 a preference change while a request is pending causes that result to be rejected', () => {
    const d = new Driver();
    d.partner('Lunch?');
    const ws = d.ws()!;
    const pending = d.lastGenerate().request;
    d.toPreferences();
    d.act('p-use');
    expect(d.s.preferenceRevision).toBeGreaterThan(pending.identity.preferenceRevision);
    d.resolve(SPREAD_CANDIDATES, pending);
    const w = d.s.workspaces[ws.id];
    expect(w.batch).toBeNull();
    expect(w.pending).toBeNull();
    expect(w.status).not.toBe('choosing');
  });

  it('PREF-15 a preference change keeps an existing batch but rejects the pending refresh, and never mutates an open review', () => {
    const d = new Driver();
    d.partner('Lunch?');
    d.resolve();
    const ws = d.ws()!;
    const batch = d.s.workspaces[ws.id].batch!;
    d.act('none');
    const pending = d.lastGenerate().request;
    d.act('quick');
    d.act('qp-qp-moment');
    const snap = d.s.review!.snapshot;
    // Overlay Preferences above the open review (no review target navigates there).
    d.s = { ...d.s, stack: [...d.s.stack, { kind: 'preferences' } as Surface] };
    d.act('p-session');
    d.act('p-use');
    d.resolve(ALT_CANDIDATES, pending);
    expect(d.s.workspaces[ws.id].batch).toBe(batch);
    expect(d.s.review!.snapshot).toBe(snap);
    expect(d.s.review!.snapshot.exactText).toBe('Please give me a moment.');
  });
});
