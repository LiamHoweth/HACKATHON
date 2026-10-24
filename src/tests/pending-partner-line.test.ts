import { describe, expect, it } from 'vitest';
import { Driver, ids } from './helpers';
import { newestStagedText, partnerText, targetsFor } from '@/core/targets';
import type { State } from '@/core/state';

// Feature C: while composing in fast mode, a newly staged partner line can be jumped to.
// Staging itself is reducer behavior (owned elsewhere); these tests set s.staged directly so
// they only pin the target/banner contract.
function composing(speakOnSelect: boolean) {
  const d = new Driver({ speakOnSelect });
  d.partner('Are you coming to dinner tonight?');
  d.resolve();
  d.act('my-words');
  expect(d.surface().kind).toBe('compose');
  const partnerIds = d.s.conversation.filter((e) => e.role === 'partner').map((e) => e.value.id);
  return { d, partnerIds };
}

const withStaged = (s: State, staged: string[]): State => ({ ...s, staged });

describe('pending partner line on My words', () => {
  it('fast mode + staged line adds "Answer the new message" at the end, before Back', () => {
    const { d, partnerIds } = composing(true);
    const before = ids(d.s);
    expect(before).not.toContain('c-answer-new');
    const after = ids(withStaged(d.s, [partnerIds[0]]));
    const i = after.indexOf('c-answer-new');
    expect(i).toBeGreaterThan(0);
    expect(after[0]).toBe(before[0]);
    expect(after[i + 1]).toBe('back');
    expect(after.filter((x) => x !== 'c-answer-new')).toEqual(before);
    const t = targetsFor(withStaged(d.s, [partnerIds[0]])).find((x) => x.id === 'c-answer-new')!;
    expect(t.label).toBe('Answer the new message');
    expect(t.enabled).toBe(true);
    expect(t.command).toEqual({ type: 'answer-pending' });
  });

  it('is absent without fast mode, even with a staged line', () => {
    const { d, partnerIds } = composing(false);
    expect(ids(withStaged(d.s, [partnerIds[0]]))).not.toContain('c-answer-new');
  });

  it('newestStagedText returns the last staged partner turn text', () => {
    const { d, partnerIds } = composing(true);
    expect(newestStagedText(d.s)).toBeNull();
    const s = withStaged(d.s, [partnerIds[0]]);
    expect(newestStagedText(s)).toBe(partnerText(s, partnerIds[0]));
    expect(newestStagedText(withStaged(d.s, ['missing']))).toBeNull();
  });
});
