import { describe, expect, it } from 'vitest';
import { Driver, SPREAD_CANDIDATES } from './helpers';

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

  it('a new partner line replaces open suggestions instead of waiting', () => {
    const d = fast();
    const first = d.ws()!.id;
    d.partner('Actually, do you want pizza?');
    expect(d.s.staged).toHaveLength(0);
    expect(d.ws()!.id).not.toBe(first);
    expect(d.ws()!.status).toBe('generating');
  });

  it('a partner line pulls the person out of a menu straight to the new suggestions', () => {
    const d = fast();
    d.act('quick');
    expect(d.surface().kind).toBe('quick');
    d.partner('Do you want water?');
    expect(d.surface().kind).toBe('board');
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
