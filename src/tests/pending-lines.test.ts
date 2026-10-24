import { describe, expect, it, vi } from 'vitest';
import type { State, Target } from '@/core/state';
import { Driver } from './helpers';
import { LIMITS } from '@/core/limits';

// Exposes the `answer-pending` command on every surface so the reducer logic can be tested
// independently of where the UI places its button (including surfaces where it must no-op).
vi.mock('@/core/targets', async (importOriginal) => {
  const m = await importOriginal<typeof import('@/core/targets')>();
  const extra: Target = { id: 'test-answer-pending', label: 'Answer now', enabled: true, command: { type: 'answer-pending' }, region: 'keys' };
  return { ...m, targetsFor: (s: State) => [...m.targetsFor(s), extra] };
});

function typeLetters(d: Driver, letters: string) {
  const groups = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX'];
  for (const ch of letters) {
    d.act(`grp-${groups.findIndex((x) => x.includes(ch))}`);
    d.act(`key-${ch}`);
  }
}

function fast() {
  const d = new Driver({ speakOnSelect: true });
  d.partner('Are you coming to dinner tonight?');
  d.resolve();
  return d;
}

const turn = (d: Driver, id: string) => d.partnerTurns().find((e) => e.value.id === id)!.value;
const wsCount = (d: Driver) => Object.keys(d.s.workspaces).length;
const anchorTurnId = (d: Driver) => (d.ws()!.anchor as { turnId: string }).turnId;

describe('fast mode: partner lines while the person is busy', () => {
  it('three lines heard in My words become one combined waiting entry', () => {
    const d = fast();
    d.act('my-words');
    typeLetters(d, 'HI');
    d.partner('Hello?');
    d.partner('Are you there?');
    d.partner('Dinner is ready.');
    expect(d.surface().kind).toBe('compose');
    expect(d.s.drafts.message).toBe('Hi');
    expect(d.s.staged).toHaveLength(1);
    expect(d.partnerTurns()).toHaveLength(2);
    expect(turn(d, d.s.staged[0]).text).toBe('Hello? Are you there? Dinner is ready.');
    expect(turn(d, d.s.staged[0]).acceptedForContext).toBe(false);
  });

  it('after My words is spoken, the combined line is answered with full context', () => {
    const d = fast();
    d.act('my-words');
    typeLetters(d, 'HI');
    d.partner('Hello?');
    d.partner('Are you there?');
    d.act('c-done');
    expect(d.surface().kind).toBe('review');
    const snap = d.s.review!.snapshot;
    d.partner('Dinner is ready.');
    expect(d.s.review!.snapshot).toBe(snap);
    expect(d.s.staged).toHaveLength(1);
    const pendingId = d.s.staged[0];
    d.act('rv-speak');
    d.speech('start');
    expect(d.s.staged).toHaveLength(1);
    const before = wsCount(d);
    d.speech('end');
    expect(d.s.staged).toEqual([]);
    expect(d.partnerTurns().every((e) => e.value.acceptedForContext)).toBe(true);
    expect(wsCount(d)).toBe(before + 1);
    expect(anchorTurnId(d)).toBe(pendingId);
    expect(d.ws()!.status).toBe('generating');
    const req = d.lastGenerate().request;
    expect(req.activePartnerText).toBe('Hello? Are you there? Dinner is ready.');
    expect(req.recentConversation.map((t) => t.text)).toContain('Hello? Are you there? Dinner is ready.');
  });

  it('two lines heard while speaking combine; the speaking utterance is untouched', () => {
    const d = fast();
    d.act('cand-0');
    d.speech('start');
    const spoken = d.s.speech!.utterance;
    d.partner('Great.');
    d.partner('See you at seven?');
    expect(d.s.speech!.utterance).toBe(spoken);
    expect(d.s.staged).toHaveLength(1);
    expect(turn(d, d.s.staged[0]).text).toBe('Great. See you at seven?');
    d.speech('end');
    expect(d.s.staged).toEqual([]);
    expect(d.ws()!.status).toBe('generating');
    expect(d.lastGenerate().request.activePartnerText).toBe('Great. See you at seven?');
  });

  it('lines heard during Pause combine and are answered on resume', () => {
    const d = fast();
    d.dispatch({ type: 'SAFETY_PAUSE', at: d.tick() });
    d.partner('Hello?');
    d.partner('Are you okay?');
    expect(d.surface().kind).toBe('paused');
    expect(d.s.staged).toHaveLength(1);
    d.act('pa-resume');
    expect(d.surface().kind).toBe('board');
    expect(d.s.staged).toEqual([]);
    expect(d.lastGenerate().request.activePartnerText).toBe('Hello? Are you okay?');
  });

  it('a line that would overflow the character limit waits as a second entry; both reach the AI', () => {
    const d = fast();
    d.act('my-words');
    d.partner('a'.repeat(LIMITS.partnerInputChars - 5));
    d.partner('This is too long to fit.');
    expect(d.s.staged).toHaveLength(2);
    d.partner('Okay?');
    expect(d.s.staged).toHaveLength(2);
    const [olderId, newestId] = d.s.staged;
    expect(turn(d, newestId).text).toBe('This is too long to fit. Okay?');
    const before = wsCount(d);
    d.act('test-answer-pending');
    expect(d.s.staged).toEqual([]);
    expect(turn(d, olderId).acceptedForContext).toBe(true);
    expect(turn(d, newestId).acceptedForContext).toBe(true);
    // Earlier waiting lines become context only: exactly one new question, for the newest line.
    expect(wsCount(d)).toBe(before + 1);
    expect(anchorTurnId(d)).toBe(newestId);
    const texts = d.lastGenerate().request.recentConversation.map((t) => t.text);
    const iOld = texts.findIndex((t) => t.startsWith('aaaa'));
    const iNew = texts.indexOf('This is too long to fit. Okay?');
    expect(iOld).toBeGreaterThanOrEqual(0);
    expect(iNew).toBeGreaterThan(iOld);
  });
});

describe('answer-pending', () => {
  it('from My words: keeps the draft, goes to the board, answers the waiting line', () => {
    const d = fast();
    const first = d.ws()!.id;
    d.act('my-words');
    typeLetters(d, 'HI');
    d.partner('Hello?');
    d.partner('Can you hear me?');
    const pendingId = d.s.staged[0];
    const ctx = d.s.contextRevision;
    const rev = d.s.surfaceRevision;
    d.act('test-answer-pending');
    expect(d.surface().kind).toBe('board');
    expect(d.s.stack.map((x) => x.kind)).toEqual(['board']);
    expect(d.s.drafts.message).toBe('Hi');
    expect(d.s.staged).toEqual([]);
    expect(d.s.surfaceRevision).toBeGreaterThan(rev);
    expect(d.s.contextRevision).toBeGreaterThan(ctx);
    expect(turn(d, pendingId).acceptedForContext).toBe(true);
    expect(d.ws()!.id).not.toBe(first);
    expect(anchorTurnId(d)).toBe(pendingId);
    expect(d.ws()!.status).toBe('generating');
    expect(d.s.workspaces[first].parked).toBe(true);
    // The kept draft is still there when the person goes back to My words.
    d.act('my-words');
    expect(d.s.drafts.message).toBe('Hi');
  });

  it('does nothing when nothing is waiting', () => {
    const d = fast();
    d.act('my-words');
    typeLetters(d, 'HI');
    const gens = d.generates().length;
    const ws = d.ws()!.id;
    d.tryAct('test-answer-pending');
    expect(d.surface().kind).toBe('compose');
    expect(d.generates().length).toBe(gens);
    expect(d.ws()!.id).toBe(ws);
  });

  it('does nothing while speaking', () => {
    const d = fast();
    d.act('cand-0');
    d.speech('start');
    d.partner('Wait, what?');
    const gens = d.generates().length;
    d.tryAct('test-answer-pending');
    expect(d.surface().kind).toBe('speaking');
    expect(d.s.speech).not.toBeNull();
    expect(d.s.staged).toHaveLength(1);
    expect(d.generates().length).toBe(gens);
  });

  it('does nothing while a review is open', () => {
    const d = fast();
    d.act('my-words');
    typeLetters(d, 'HI');
    d.act('c-done');
    d.partner('Hello?');
    const snap = d.s.review!.snapshot;
    d.tryAct('test-answer-pending');
    expect(d.surface().kind).toBe('review');
    expect(d.s.review!.snapshot).toBe(snap);
    expect(d.s.staged).toHaveLength(1);
  });
});

describe('without fast mode', () => {
  it('waiting partner lines stay separate entries (unchanged)', () => {
    const d = new Driver();
    d.partner('First question?');
    d.partner('Second question?');
    d.partner('Third question?');
    expect(d.s.staged).toHaveLength(2);
    expect(d.s.staged.map((id) => turn(d, id).text)).toEqual(['Second question?', 'Third question?']);
    expect(d.s.staged.every((id) => !turn(d, id).acceptedForContext)).toBe(true);
  });
});
