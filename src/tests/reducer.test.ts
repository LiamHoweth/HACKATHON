import { describe, expect, it } from 'vitest';
import { Driver, ids, okResult, ALT_CANDIDATES, SPREAD_CANDIDATES } from './helpers';
import { reducer } from '@/core/reducer';
import { targetsFor } from '@/core/targets';
import { LIMITS } from '@/core/limits';
import type { Surface } from '@/core/state';

// Board with a ready batch for a partner turn.
function choosing(text = 'Do you want to go to the park?', settings = {}) {
  const d = new Driver(settings);
  d.partner(text);
  d.resolve();
  expect(d.ws()?.status).toBe('choosing');
  return d;
}

// My words: types letters by scanning group -> key.
function typeLetters(d: Driver, letters: string) {
  const groups = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX'];
  for (const ch of letters) {
    const g = groups.findIndex((x) => x.includes(ch));
    d.act(`grp-${g}`);
    d.act(`key-${ch}`);
  }
}

describe('Core safety', () => {
  it('CORE-02 installed batch has exactly 3 candidates with app-assigned ids distinct from model-supplied ids', () => {
    const d = new Driver();
    d.partner('How are you?');
    const req = d.lastGenerate().request;
    const modelCands = SPREAD_CANDIDATES.map((c, i) => ({ ...c, id: `model-id-${i}` }));
    d.dispatch({ ...okResult(req.identity, modelCands), at: d.tick() });
    const batch = d.ws()!.batch!;
    expect(batch.candidates).toHaveLength(3);
    const cids = batch.candidates.map((c) => c.id);
    expect(new Set(cids).size).toBe(3);
    for (const id of cids) {
      expect(id.startsWith('model-id')).toBe(false);
      expect(id).not.toBe(req.identity.requestId);
    }
    expect(batch.candidates.map((c) => c.text)).toEqual(SPREAD_CANDIDATES.map((c) => c.text));
    expect(targetsFor(d.s).filter((t) => t.region === 'candidates' && t.id.startsWith('cand-'))).toHaveLength(3);
  });

  it('CORE-03 selecting a candidate opens review and does not speak', () => {
    const d = choosing();
    d.act('cand-1');
    expect(d.surface().kind).toBe('review');
    expect(d.s.review?.snapshot.exactText).toBe(SPREAD_CANDIDATES[1].text);
    expect(d.speaks()).toHaveLength(0);
    expect(d.s.speech).toBeNull();
    expect(d.userTurns()).toHaveLength(0);
  });

  it('CORE-04 cancel prevents speech and restores the prior surface (candidate)', () => {
    const d = choosing();
    const stackBefore = d.s.stack;
    d.act('cand-0');
    d.act('rv-cancel');
    expect(d.s.review).toBeNull();
    expect(d.s.stack).toEqual(stackBefore);
    expect(d.speaks()).toHaveLength(0);
    expect(d.userTurns()).toHaveLength(0);
    expect(d.ws()?.status).toBe('choosing');
  });

  it('CORE-04 cancel from a My words review returns to the composer with the draft intact', () => {
    const d = new Driver();
    d.act('my-words');
    typeLetters(d, 'HI');
    const stackBefore = d.s.stack;
    d.act('c-done');
    expect(d.surface().kind).toBe('review');
    d.act('rv-cancel');
    expect(d.s.stack).toEqual(stackBefore);
    expect(d.surface()).toMatchObject({ kind: 'compose', purpose: 'message' });
    expect(d.s.drafts.message).toBe('Hi');
    expect(d.speaks()).toHaveLength(0);
    expect(d.userTurns()).toHaveLength(0);
  });

  it('CORE-05 speak payload equals the reviewed text exactly', () => {
    const d = choosing();
    d.act('cand-2');
    const reviewed = d.s.review!.snapshot.exactText;
    d.act('rv-speak');
    const sp = d.speaks();
    expect(sp).toHaveLength(1);
    expect(sp[0].utterance.exactText).toBe(reviewed);
    expect(sp[0].utterance.exactText).toBe(SPREAD_CANDIDATES[2].text);
    const turns = d.userTurns();
    expect(turns).toHaveLength(1);
    expect(turns[0].value.text).toBe(reviewed);
    expect(d.surface().kind).toBe('speaking');
  });

  describe('CORE-06 confirmation needs a fresh, armed, current gesture', () => {
    it('CORE-06 reusing the selection cycleId to confirm is rejected', () => {
      const d = choosing();
      const sel = d.act('cand-0');
      const before = d.s;
      d.tryAct('rv-speak', { cycleId: sel.cycleId });
      expect(d.s).toBe(before);
      expect(d.speaks()).toHaveLength(0);
    });

    it('CORE-06 reusing the selection eventId to confirm is rejected', () => {
      const d = choosing();
      const sel = d.act('cand-0');
      const before = d.s;
      d.tryAct('rv-speak', { eventId: sel.eventId });
      expect(d.s).toBe(before);
      expect(d.speaks()).toHaveLength(0);
    });

    it('CORE-06 a stale surfaceRevision is rejected', () => {
      const d = choosing();
      const revOnBoard = d.s.surfaceRevision;
      d.act('cand-0');
      const before = d.s;
      d.tryAct('rv-speak', { surfaceRevision: revOnBoard });
      expect(d.s).toBe(before);
      d.tryAct('rv-speak', { surfaceRevision: d.s.surfaceRevision - 1 });
      expect(d.s).toBe(before);
      expect(d.speaks()).toHaveLength(0);
    });

    it('CORE-06 confirm before the arming delay is rejected; after it, accepted', () => {
      const d = choosing();
      d.act('cand-0');
      const before = d.s;
      d.tryAct('rv-speak', { at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs - 1 });
      expect(d.s).toBe(before);
      expect(d.speaks()).toHaveLength(0);
      d.act('rv-speak', { at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs });
      expect(d.speaks()).toHaveLength(1);
    });

    it('CORE-06 wrong session epoch is rejected', () => {
      const d = choosing();
      d.act('cand-0');
      const before = d.s;
      d.tryAct('rv-speak', { sessionEpoch: 'other' });
      expect(d.s).toBe(before);
    });
  });

  describe('CORE-08 an open review is immutable', () => {
    it('CORE-08 a new PARTNER_SUBMIT while reviewing does not change the review', () => {
      const d = choosing();
      d.act('cand-1');
      const snap = d.s.review!.snapshot;
      const wsId = d.s.activeWorkspaceId;
      d.partner('Actually, what about tomorrow?');
      expect(d.s.review!.snapshot).toBe(snap);
      expect(d.s.review!.snapshot.exactText).toBe(SPREAD_CANDIDATES[1].text);
      expect(d.s.activeWorkspaceId).toBe(wsId);
      expect(d.s.staged).toHaveLength(1);
      expect(d.surface().kind).toBe('review');
    });

    it('CORE-08 a preference toggle while reviewing does not change the review', () => {
      const d = choosing();
      d.act('cand-1');
      const snap = d.s.review!.snapshot;
      // No review target leads to Preferences, so overlay it to exercise the reducer invariant.
      d.s = { ...d.s, stack: [...d.s.stack, { kind: 'preferences' } as Surface] };
      const pref = d.s.preferenceRevision;
      d.act('p-pause');
      expect(d.s.preferenceRevision).toBe(pref + 1);
      expect(d.s.review!.snapshot).toBe(snap);
      expect(d.s.review!.snapshot.exactText).toBe(SPREAD_CANDIDATES[1].text);
    });

    it('CORE-08 a late GENERATION_RESULT while reviewing a candidate does not change the review', () => {
      const d = new Driver();
      d.partner('Want tea?');
      const firstReq = d.lastGenerate().request;
      d.resolve(SPREAD_CANDIDATES, firstReq);
      d.act('cand-0');
      const snap = d.s.review!.snapshot;
      // Re-deliver the (now consumed) request with different text.
      d.dispatch({ ...okResult(firstReq.identity, ALT_CANDIDATES), at: d.tick() });
      expect(d.s.review!.snapshot).toBe(snap);
      expect(d.s.review!.snapshot.exactText).toBe('Yes.');
    });

    it('CORE-08 a pending result arriving while reviewing a quick phrase installs without touching the review', () => {
      const d = new Driver();
      d.partner('Want tea?');
      d.act('quick');
      d.act('qp-qp-moment');
      const snap = d.s.review!.snapshot;
      d.resolve(ALT_CANDIDATES);
      expect(d.s.review!.snapshot).toBe(snap);
      expect(d.s.review!.snapshot.exactText).toBe('Please give me a moment.');
      expect(d.surface().kind).toBe('review');
    });
  });

  it('CORE-09 one speak effect per confirmation; interrupted/error never become completed', () => {
    const d = choosing();
    d.act('cand-0');
    d.act('rv-speak');
    expect(d.speaks()).toHaveLength(1);
    // A second confirm attempt (repeat press) cannot queue another speak.
    d.tryAct('rv-speak');
    expect(d.speaks()).toHaveLength(1);
    expect(ids(d.s)).toEqual(['sp-stop']);
    const uttId = d.s.speech!.utterance.id;
    d.speech('start');
    d.speech('interrupted');
    expect(d.userTurns()[0].value.delivery).toBe('interrupted');
    d.speech('end', uttId); // late 'end' after interruption must not relabel
    expect(d.userTurns()[0].value.delivery).toBe('interrupted');

    const e = choosing();
    e.act('cand-0');
    e.act('rv-speak');
    const u2 = e.s.speech!.utterance.id;
    e.speech('start');
    e.speech('error');
    expect(e.userTurns()[0].value.delivery).toBe('failed');
    e.speech('end', u2);
    expect(e.userTurns()[0].value.delivery).toBe('failed');
    expect(e.speaks()).toHaveLength(1);
  });

  it('CORE-09 Stop marks the utterance interrupted', () => {
    const d = choosing();
    d.act('cand-0');
    d.act('rv-speak');
    d.speech('start');
    d.act('sp-stop');
    expect(d.userTurns()[0].value.delivery).toBe('interrupted');
    expect(d.s.effects.some((x) => x.kind === 'stop-speech')).toBe(true);
    d.speech('end');
    expect(d.userTurns()[0].value.delivery).toBe('interrupted');
  });

  it('CORE-11 after End session, old-epoch results/speech are ignored, conversation cleared, device-retained preferences kept', () => {
    const d = new Driver({ persistOnDevice: true });
    d.savePreference('length', 'detailed');
    expect(d.s.approvedPreferences).toHaveLength(1);
    // A spoken turn in the old session (gives an old utterance id).
    d.fullTurn('Hello there');
    const oldUtt = d.userTurns()[0].value.utteranceId;
    // A pending generation in the old session.
    d.partner('Are you hungry?');
    const oldReq = d.lastGenerate().request;
    const oldEpoch = d.s.sessionEpoch;
    d.act('more');
    d.act('t-controls');
    d.act('ct-end');
    d.act('end-confirm');
    expect(d.s.phase).toBe('setup');
    expect(d.s.sessionEpoch).not.toBe(oldEpoch);
    expect(d.s.conversation).toEqual([]);
    expect(d.s.workspaces).toEqual({});
    expect(d.s.approvedPreferences).toHaveLength(1);
    expect(d.s.effects.some((e) => e.kind === 'abort-generation' && e.requestId === oldReq.identity.requestId)).toBe(true);
    expect(d.s.effects.some((e) => e.kind === 'cancel-all-speech')).toBe(true);

    let before = d.s;
    d.dispatch({ ...okResult(oldReq.identity), at: d.tick() });
    d.speech('end', oldUtt, oldEpoch);
    expect(d.s).toBe(before);

    // New session starts; old-epoch events still ignored, preferences carried.
    d.dispatch({ type: 'SETUP_START', settings: d.s.settings, profileDraft: null, epoch: 'e2', at: d.tick() });
    expect(d.s.approvedPreferences).toHaveLength(1);
    before = d.s;
    d.dispatch({ ...okResult(oldReq.identity), at: d.tick() });
    d.speech('end', oldUtt, oldEpoch);
    expect(d.s).toBe(before);
    expect(d.s.conversation).toEqual([]);
  });
});

describe('Session-only approvals', () => {
  it('CORE-11b approvals made for this session only end with the session', () => {
    const d = new Driver({ persistOnDevice: false });
    d.savePreference('length', 'detailed');
    expect(d.s.approvedPreferences).toHaveLength(1);
    d.act('more');
    d.act('t-controls');
    d.act('ct-end');
    d.act('end-confirm');
    expect(d.s.phase).toBe('setup');
    expect(d.s.approvedPreferences).toEqual([]);
  });
});

describe('Generation and intent', () => {
  it('GEN-01 "none" records a rejected batch, queues a new generate, adds no user turn', () => {
    const d = choosing();
    const ws = d.ws()!;
    const batch = ws.batch!;
    const gens = d.generates().length;
    d.act('none');
    const after = d.s.workspaces[ws.id];
    expect(after.rejected).toHaveLength(1);
    expect(after.rejected[0]).toMatchObject({ batchId: batch.id, workspaceId: ws.id, feedback: 'none-fit' });
    expect(after.rejected[0].candidates).toEqual(batch.candidates);
    expect(d.generates()).toHaveLength(gens + 1);
    expect(after.status).toBe('generating');
    expect(d.userTurns()).toHaveLength(0);
    expect(d.speaks()).toHaveLength(0);
  });

  it('GEN-02 the next request carries the actual rejected texts+meanings for the same anchor', () => {
    const d = choosing();
    const firstReq = d.lastGenerate().request;
    d.act('none');
    const req = d.lastGenerate().request;
    expect(req.identity.requestId).not.toBe(firstReq.identity.requestId);
    expect(req.anchor).toEqual(firstReq.anchor);
    expect(req.rejected).toEqual([
      { candidates: SPREAD_CANDIDATES.map((c) => ({ text: c.text, meaning: c.meaning })), feedback: 'none-fit' },
    ]);
    // Second rejection accumulates both batches.
    d.resolve(ALT_CANDIDATES);
    d.act('none');
    const req2 = d.lastGenerate().request;
    expect(req2.rejected.map((r) => r.candidates.map((c) => c.text))).toEqual([
      SPREAD_CANDIDATES.map((c) => c.text), ALT_CANDIDATES.map((c) => c.text),
    ]);
  });

  it('GEN-03 a new partner turn/workspace does not inherit rejections', () => {
    const d = choosing('First question?');
    d.act('none');
    expect(d.lastGenerate().request.rejected).toHaveLength(1);
    d.partner('Second question?');
    expect(d.s.staged).toHaveLength(1);
    const turnId = d.s.staged[0];
    d.act('more');
    d.act('t-history');
    d.act(`h-answer-${turnId}`);
    const req = d.lastGenerate().request;
    expect(req.anchor).toMatchObject({ mode: 'reply', turnId });
    expect(req.rejected).toEqual([]);
    expect(d.ws()!.rejected).toEqual([]);
  });

  it('GEN-03 a new session does not inherit rejections', () => {
    const d = choosing('First question?');
    d.act('none');
    d.act('more'); d.act('t-controls'); d.act('ct-end'); d.act('end-confirm');
    const n = new Driver(d.s.settings, d.s, 'e2', d.tick());
    n.partner('First question?');
    expect(n.lastGenerate().request.rejected).toEqual([]);
    expect(n.ws()!.rejected).toEqual([]);
  });

  it('GEN-05 PARTNER_EDIT_TURN on the anchored turn clears rejections and invalidates the pending result', () => {
    const d = choosing('Do you want pasta?');
    const ws = d.ws()!;
    const anchorTurn = (ws.anchor as { turnId: string }).turnId;
    d.act('none');
    const pending = d.lastGenerate().request;
    expect(d.s.workspaces[ws.id].rejected).toHaveLength(1);
    d.dispatch({ type: 'PARTNER_EDIT_TURN', turnId: anchorTurn, text: 'Do you want soup?', at: d.tick() });
    const w = d.s.workspaces[ws.id];
    expect(w.rejected).toEqual([]);
    expect(w.pending).toBeNull();
    expect(w.status).toBe('stale');
    expect(d.s.effects.some((e) => e.kind === 'abort-generation' && e.requestId === pending.identity.requestId)).toBe(true);
    d.resolve(ALT_CANDIDATES, pending);
    expect(d.s.workspaces[ws.id].batch).toBeNull();
    expect(d.s.workspaces[ws.id].status).toBe('stale');
    // Refreshing yields a request for the edited text with no rejections.
    d.act('retry');
    const req = d.lastGenerate().request;
    expect(req.activePartnerText).toBe('Do you want soup?');
    expect(req.rejected).toEqual([]);
    expect(req.anchor).toMatchObject({ mode: 'reply', turnContentRevision: 1 });
  });

  it('GEN-06 Change wording -> shorter sends refineTarget with the selected meaning and does not reject it', () => {
    const d = choosing();
    d.act('cand-2');
    d.act('rv-change');
    d.act('cw-shorter');
    const req = d.lastGenerate().request;
    expect(req.refineTarget).toEqual({ text: SPREAD_CANDIDATES[2].text, meaning: SPREAD_CANDIDATES[2].meaning, mode: 'shorter' });
    expect(req.rejected).toEqual([]);
    expect(d.ws()!.rejected).toEqual([]);
    expect(d.s.review).toBeNull();
    expect(d.speaks()).toHaveLength(0);
    // Leaving the refinement via "none" is also not a rejection of the meaning.
    d.resolve(ALT_CANDIDATES);
    expect(d.ws()!.batch!.kind).toBe('refinement');
    d.act('none');
    expect(d.ws()!.rejected).toEqual([]);
    expect(d.lastGenerate().request.rejected).toEqual([]);
    expect(d.lastGenerate().request.refineTarget).toBeNull();
  });

  it('GEN-07 Guide -> direction -> Disagree sets intent and persists into the next "none" regeneration', () => {
    const d = choosing();
    d.act('guide');
    d.act('g-direction');
    d.act('i-disagree');
    expect(d.surface().kind).toBe('board');
    expect(d.ws()!.guidance.intent).toBe('disagree');
    expect(d.lastGenerate().request.guidance.intent).toBe('disagree');
    d.resolve(ALT_CANDIDATES);
    d.act('none');
    const req = d.lastGenerate().request;
    expect(req.guidance.intent).toBe('disagree');
    expect(req.rejected).toHaveLength(1);
  });

  it('GEN-10 after 2 rejected batches "Write it myself" appears and "none" stays enabled', () => {
    const d = choosing();
    expect(d.target('help-own-words')).toBeUndefined();
    d.act('none');
    d.resolve(ALT_CANDIDATES);
    expect(d.target('help-own-words')).toBeUndefined();
    d.act('none');
    d.resolve(SPREAD_CANDIDATES);
    expect(d.target('help-own-words')?.enabled).toBe(true);
    expect(d.target('none')?.enabled).toBe(true);
    d.act('help-own-words');
    expect(d.surface()).toMatchObject({ kind: 'compose', purpose: 'message' });
  });
});

describe('Conversation', () => {
  it('CONV-01 partner input while a question is active is staged; activeWorkspaceId unchanged', () => {
    const d = new Driver();
    d.partner('First?');
    const wsId = d.s.activeWorkspaceId;
    const gens = d.generates().length;
    d.partner('Second?');
    expect(d.s.activeWorkspaceId).toBe(wsId);
    expect(d.s.staged).toHaveLength(1);
    expect(d.generates()).toHaveLength(gens);
    expect(d.s.notice?.text).toMatch(/waiting/i);
    // Staged text is not in generation context.
    d.resolve();
    d.act('none');
    expect(d.lastGenerate().request.recentConversation.map((e) => e.text)).toEqual(['First?']);
  });

  it('CONV-02 returning to a parked question via History does not reorder the conversation', () => {
    const d = new Driver();
    d.partner('Question A?');
    d.resolve();
    const wsA = d.s.activeWorkspaceId!;
    d.act('more');
    d.act('t-park');
    expect(d.s.activeWorkspaceId).toBeNull();
    expect(d.s.workspaces[wsA].parked).toBe(true);
    d.partner('Question B?');
    const wsB = d.s.activeWorkspaceId!;
    expect(wsB).not.toBe(wsA);
    d.resolve(ALT_CANDIDATES);
    const convBefore = d.s.conversation;
    d.act('more');
    d.act('t-history');
    d.act(`h-return-${wsA}`);
    expect(d.s.activeWorkspaceId).toBe(wsA);
    expect(d.s.workspaces[wsB].parked).toBe(true);
    expect(d.s.conversation).toEqual(convBefore);
    expect(d.s.conversation.map((e) => e.value.text)).toEqual(['Question A?', 'Question B?']);
    // Answering A appends at the end; nothing is reordered.
    d.act('cand-0');
    d.act('rv-speak');
    expect(d.s.conversation.map((e) => e.value.text)).toEqual(['Question A?', 'Question B?', 'Yes.']);
    const seqs = d.s.conversation.map((e) => e.value.sequence);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  // Opens Quick phrases from inside My words, using a real target if one exists.
  function openQuickFromCompose(d: Driver) {
    const opener = d.targets().find((t) => t.command.type === 'open' && t.command.surface.kind === 'quick');
    if (opener) d.act(opener.id);
    else d.s = { ...d.s, stack: [...d.s.stack, { kind: 'quick', page: 0 }] };
  }

  it('CONV-03 My words offers a Quick phrases target', () => {
    const d = new Driver();
    d.act('my-words');
    const opener = d.targets().find((t) => t.command.type === 'open' && t.command.surface.kind === 'quick');
    expect(opener).toBeDefined();
  });

  it('CONV-03 + CONV-04 a quick phrase from inside My words goes through review/confirm and returns to the composer with the draft intact', () => {
    const d = new Driver();
    d.act('my-words');
    typeLetters(d, 'OK');
    expect(d.s.drafts.message).toBe('Ok');
    openQuickFromCompose(d);
    expect(d.surface().kind).toBe('quick');
    d.act('qp-qp-moment');
    expect(d.surface().kind).toBe('review');
    expect(d.speaks()).toHaveLength(0);
    d.act('rv-speak');
    expect(d.speaks()).toHaveLength(1);
    expect(d.speaks()[0].utterance.exactText).toBe('Please give me a moment.');
    d.speech('start');
    d.speech('end');
    expect(d.surface()).toMatchObject({ kind: 'compose', purpose: 'message' });
    expect(d.s.stack.map((x) => x.kind)).toEqual(['board', 'compose']);
    expect(d.s.drafts.message).toBe('Ok');
  });

  it('CONV-05 speaking a quick phrase while generation is pending invalidates that result', () => {
    const d = new Driver();
    d.partner('Shall we go?');
    const ws = d.ws()!;
    const pending = d.lastGenerate().request;
    d.act('quick');
    d.act('qp-qp-moment');
    d.act('rv-speak');
    d.speech('start');
    d.speech('end');
    d.resolve(SPREAD_CANDIDATES, pending);
    const w = d.s.workspaces[ws.id];
    expect(w.status).not.toBe('choosing');
    expect(w.batch).toBeNull();
    expect(w.pending).toBeNull();
    expect(d.targets().some((t) => t.id.startsWith('cand-'))).toBe(false);
  });

  it('CONV-06 Start a conversation creates an initiate anchor and no partner turn', () => {
    const d = new Driver();
    d.act('start');
    d.act('init-ask-question');
    const ws = d.ws()!;
    expect(ws.anchor).toMatchObject({ mode: 'initiate', category: 'ask-question', userTopicOrSeed: null });
    expect(d.partnerTurns()).toHaveLength(0);
    const req = d.lastGenerate().request;
    expect(req.anchor.mode).toBe('initiate');
    expect(req.activePartnerText).toBeNull();
    expect(d.surface().kind).toBe('board');
  });

  it('CONV-08 composing "HI" by scanning yields exactText "Hi"', () => {
    const d = new Driver();
    d.act('my-words');
    d.act('grp-1');
    d.act('key-H');
    d.act('grp-1');
    d.act('key-I');
    d.act('c-done');
    expect(d.s.review!.snapshot.exactText).toBe('Hi');
    expect(d.s.review!.snapshot.source).toBe('user-composed');
    d.act('rv-speak');
    expect(d.speaks()[0].utterance.exactText).toBe('Hi');
    expect(d.userTurns()[0].value.text).toBe('Hi');
    expect(d.s.drafts.message).toBe('');
  });

  it('CONV-10 the 11th staged partner message is refused with a notice and nothing is dropped', () => {
    const d = new Driver();
    d.partner('Active question?');
    for (let i = 1; i <= LIMITS.stagedQueue; i++) d.partner(`Waiting ${i}`);
    expect(d.s.staged).toHaveLength(LIMITS.stagedQueue);
    const stagedBefore = d.s.staged;
    const convBefore = d.s.conversation;
    d.partner('One too many');
    expect(d.s.staged).toEqual(stagedBefore);
    expect(d.s.conversation).toEqual(convBefore);
    expect(d.partnerTurns().map((e) => e.value.text)).not.toContain('One too many');
    expect(d.s.notice?.text).toMatch(/full/i);
  });
});

describe('Access', () => {
  it('ACCESS-04 a group selection does not insert a letter', () => {
    const d = new Driver();
    d.act('my-words');
    d.act('grp-0');
    expect(d.s.drafts.message).toBe('');
    expect(d.surface()).toMatchObject({ kind: 'compose', group: 0 });
    expect(ids(d.s)).toContain('key-A');
    d.act('key-back');
    expect(d.s.drafts.message).toBe('');
  });

  it('ACCESS-07 on speaking the only target is Stop; on paused only Resume', () => {
    const d = choosing();
    d.act('cand-0');
    d.act('rv-speak');
    expect(d.surface().kind).toBe('speaking');
    expect(ids(d.s)).toEqual(['sp-stop']);
    d.speech('end');
    d.act('more');
    d.act('t-controls');
    d.act('ct-pause');
    expect(d.surface().kind).toBe('paused');
    expect(ids(d.s)).toEqual(['pa-resume']);
    // SAFETY_PAUSE while speaking also leaves only Resume.
    const e = choosing();
    e.act('cand-0');
    e.act('rv-speak');
    e.dispatch({ type: 'SAFETY_PAUSE', at: e.tick() });
    expect(ids(e.s)).toEqual(['pa-resume']);
    expect(reducer(e.s, { type: 'SAFETY_PAUSE', at: e.tick() })).toBe(e.s);
  });
});
