import { describe, expect, it } from 'vitest';
import { Driver, SPREAD_CANDIDATES, ALT_CANDIDATES } from './helpers';
import { LIMITS, MERGE_WINDOW_MS } from '@/core/limits';

// Fast, conversational demo mode (settings.speakOnSelect).
function fast() {
  const d = new Driver({ speakOnSelect: true });
  d.partner('Are you coming to dinner tonight?');
  d.resolve();
  return d;
}

describe('fast mode (speak on select)', () => {
  it('the top suggestion is the first target, and one selection speaks exactly it', () => {
    const d = fast();
    expect(d.targets()[0].id).toBe('cand-0');
    d.act('cand-0');
    expect(d.s.review).toBeNull();
    expect(d.surface().kind).toBe('speaking');
    const sp = d.speaks();
    expect(sp).toHaveLength(1);
    expect(sp[0].utterance.exactText).toBe(SPREAD_CANDIDATES[0].text);
    expect(d.userTurns()).toHaveLength(1);
  });

  it('quick phrases also speak on one selection', () => {
    const d = new Driver({ speakOnSelect: true });
    d.act('quick');
    const phrase = d.targets().find((t) => t.command.type === 'quick-phrase')!;
    d.act(phrase.id);
    expect(d.speaks()).toHaveLength(1);
    expect(d.s.review).toBeNull();
  });

  it('a follow-up within the window continues the open question in the same workspace', () => {
    const d = fast();
    const first = d.ws()!.id;
    const turnId = (d.ws()!.anchor as { turnId: string }).turnId;
    d.partner('Actually, do you want pizza?');
    expect(d.s.staged).toHaveLength(0);
    expect(d.ws()!.id).toBe(first);
    expect(d.ws()!.status).toBe('generating');
    expect(d.partnerTurns()).toHaveLength(1);
    const turn = d.partnerTurns()[0].value;
    expect(turn.id).toBe(turnId);
    expect(turn.text).toBe('Are you coming to dinner tonight? Actually, do you want pizza?');
    expect(turn.contentRevision).toBe(1);
    // Suggestions are regenerated from the combined question; old cards are gone meanwhile.
    expect(d.targets().some((t) => t.id.startsWith('cand-'))).toBe(false);
    const req = d.lastGenerate().request;
    expect(JSON.stringify(req)).toContain('do you want pizza');
    d.resolve(ALT_CANDIDATES);
    expect(d.ws()!.status).toBe('choosing');
    expect(d.target('cand-0')!.label).toBe(ALT_CANDIDATES[0].text);
  });

  it('the first request is aborted and its late result is ignored after a merge', () => {
    const d = new Driver({ speakOnSelect: true });
    d.partner('Are you coming to dinner tonight?');
    const stale = d.lastGenerate().request;
    d.partner('And what time?');
    expect(d.s.effects.some((e) => e.kind === 'abort-generation' && e.requestId === stale.identity.requestId)).toBe(true);
    d.resolve(SPREAD_CANDIDATES, stale);
    expect(d.ws()!.status).toBe('generating');
    d.resolve(ALT_CANDIDATES);
    expect(d.ws()!.status).toBe('choosing');
  });

  it('repeated follow-ups keep merging while each arrives within the window of the last', () => {
    const d = fast();
    d.partner('First follow-up.');
    d.t += 15_000;
    d.partner('Second follow-up.');
    d.t += 15_000;
    d.partner('Third follow-up.');
    expect(d.partnerTurns()).toHaveLength(1);
    expect(d.partnerTurns()[0].value.text).toBe('Are you coming to dinner tonight? First follow-up. Second follow-up. Third follow-up.');
    expect(d.ws()!.status).toBe('generating');
  });

  it('outside the merge window a new partner line replaces the open suggestions', () => {
    const d = fast();
    const first = d.ws()!.id;
    d.t += MERGE_WINDOW_MS + 1000;
    d.partner('Actually, do you want pizza?');
    expect(d.s.staged).toHaveLength(0);
    expect(d.ws()!.id).not.toBe(first);
    expect(d.partnerTurns()).toHaveLength(2);
    expect(d.ws()!.status).toBe('generating');
  });

  it('once the person has answered, a new line starts a new question', () => {
    const d = fast();
    const first = d.ws()!.id;
    d.act('cand-0');
    d.speech('start');
    d.speech('end');
    d.partner('And tomorrow?');
    expect(d.ws()!.id).not.toBe(first);
    expect(d.partnerTurns()).toHaveLength(2);
  });

  it('a follow-up heard in a menu merges and leaves the person in that menu', () => {
    const d = fast();
    const first = d.ws()!.id;
    d.act('quick');
    expect(d.surface().kind).toBe('quick');
    const rev = d.s.surfaceRevision;
    d.partner('Do you want water?');
    expect(d.surface().kind).toBe('quick');
    expect(d.s.surfaceRevision).toBe(rev);
    expect(d.s.staged).toHaveLength(0);
    expect(d.ws()!.id).toBe(first);
    expect(d.ws()!.status).toBe('generating');
    expect(d.partnerTurns()[0].value.text).toContain('Do you want water?');
    // Back on the board the refreshed suggestions wait, starting at the first one.
    d.resolve(ALT_CANDIDATES);
    expect(d.surface().kind).toBe('quick');
    d.act('back');
    expect(d.surface().kind).toBe('board');
    expect(d.targets()[0].id).toBe('cand-0');
    expect(d.target('cand-0')!.label).toBe(ALT_CANDIDATES[0].text);
  });

  it('a new question while in a menu with nothing open still shows the board', () => {
    const d = new Driver({ speakOnSelect: true });
    d.act('quick');
    d.partner('Do you want water?');
    expect(d.surface().kind).toBe('board');
    expect(d.ws()!.status).toBe('generating');
  });

  it('a follow-up that would exceed the character limit starts a new question instead', () => {
    const d = new Driver({ speakOnSelect: true });
    d.partner('a'.repeat(LIMITS.partnerInputChars - 5));
    const first = d.ws()!.id;
    d.partner('this is too long to merge');
    expect(d.ws()!.id).not.toBe(first);
    expect(d.partnerTurns()).toHaveLength(2);
  });

  it('a follow-up never touches an open review or a speaking utterance; it waits', () => {
    const d = fast();
    // Review (non-instant path) holds the reviewed text.
    d.s = { ...d.s, settings: { ...d.s.settings, speakOnSelect: false } };
    d.act('cand-0');
    d.s = { ...d.s, settings: { ...d.s.settings, speakOnSelect: true } };
    expect(d.s.review).not.toBeNull();
    const snap = d.s.review!.snapshot;
    d.partner('One more thing.');
    expect(d.s.review!.snapshot).toBe(snap);
    expect(d.s.review!.snapshot.exactText).toBe(SPREAD_CANDIDATES[0].text);
    expect(d.s.staged).toHaveLength(1);
    expect(d.partnerTurns()[0].value.text).toBe('Are you coming to dinner tonight?');

    const e = fast();
    e.act('cand-0');
    e.speech('start');
    const spoken = e.s.speech!.utterance.exactText;
    e.partner('One more thing.');
    expect(e.s.speech!.utterance.exactText).toBe(spoken);
    expect(e.s.staged).toHaveLength(1);
  });

  it('a partner line never knocks the person out of Pause; it waits', () => {
    const d = fast();
    d.dispatch({ type: 'SAFETY_PAUSE', at: d.tick() });
    expect(d.surface().kind).toBe('paused');
    d.partner('Hello? Are you there?');
    expect(d.surface().kind).toBe('paused');
    expect(d.s.staged).toHaveLength(1);
  });

  it('Pause during speech does not start new suggestions behind the pause screen', () => {
    const d = fast();
    d.act('cand-0');
    d.speech('start');
    d.partner('Wait, one more thing?');
    const gens = d.generates().length;
    d.dispatch({ type: 'SAFETY_PAUSE', at: d.tick() });
    expect(d.surface().kind).toBe('paused');
    expect(d.generates().length).toBe(gens);
    expect(d.s.staged).toHaveLength(1);
    d.act('pa-resume');
    expect(d.surface().kind).toBe('board');
    expect(d.s.staged).toHaveLength(0);
    expect(d.ws()!.status).toBe('generating');
  });

  it('a partner line heard while speaking is answered after Stop too', () => {
    const d = fast();
    d.act('cand-0');
    d.speech('start');
    d.partner('Wait, what did you say?');
    expect(d.s.staged).toHaveLength(1);
    d.dispatch({ type: 'SAFETY_STOP', at: d.tick() });
    expect(d.s.staged).toHaveLength(0);
    expect(d.ws()!.status).toBe('generating');
  });

  it('a partner line heard while speaking is answered when speech ends', () => {
    const d = fast();
    d.act('cand-0');
    d.speech('start');
    d.partner('Great, see you at seven?');
    expect(d.s.staged).toHaveLength(1);
    d.speech('end');
    expect(d.s.staged).toHaveLength(0);
    expect(d.ws()!.status).toBe('generating');
  });

  it('without fast mode, selection still opens review and needs a separate confirmation', () => {
    const d = new Driver();
    d.partner('Are you coming to dinner tonight?');
    d.resolve();
    d.act('cand-0');
    expect(d.s.review).not.toBeNull();
    expect(d.speaks()).toHaveLength(0);
  });
});
