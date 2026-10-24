// Accessibility ordering rules for the target registry (wave-3 audit fixes).
import { describe, expect, it } from 'vitest';
import { targetsFor } from '@/core/targets';
import type { State } from '@/core/state';
import { Driver, ids } from './helpers';

function choosing(settings = {}) {
  const d = new Driver(settings);
  d.partner('Do you want to go to the park?');
  d.resolve();
  expect(d.ws()?.status).toBe('choosing');
  return d;
}

const withFailedSpeech = (s: State): State => ({
  ...s,
  lastFailedSpeech: { utteranceId: 'u-failed', text: 'I would like some water.', source: 'demo-fixture', delivery: 'failed' },
});

describe('A11Y tools menu', () => {
  it('A11Y-01 Pause is the first tools target and the menu order is fixed', () => {
    const d = choosing();
    d.act('more');
    expect(ids(d.s)).toEqual(['t-pause', 't-start', 't-controls', 't-history', 't-prefs', 't-park', 'back']);
    expect(d.target('t-pause')?.command).toEqual({ type: 'pause' });
    d.act('t-pause');
    expect(d.surface().kind).toBe('paused');
  });

  it('A11Y-02 Controls still offers Pause; measurement targets sit at the end before Back', () => {
    const d = choosing();
    d.act('more');
    d.act('t-controls');
    const c = ids(d.s);
    expect(c[0]).toBe('ct-pause');
    expect(c.slice(-3)).toEqual(['ct-measure', 'ct-metrics', 'back']);
  });
});

describe('A11Y board positions', () => {
  it('A11Y-03 "None of these" keeps its index with or without a failed-speech recovery', () => {
    const d = choosing();
    const plain = ids(d.s);
    const failed = targetsFor(withFailedSpeech(d.s)).map((t) => t.id);
    expect(failed.indexOf('none')).toBe(plain.indexOf('none'));
    expect(failed.indexOf('cand-0')).toBe(0);
    // Recovery comes after the candidates + None of these, before Guide.
    expect(failed.indexOf('speak-basic')).toBeGreaterThan(failed.indexOf('none'));
    expect(failed.indexOf('dismiss-failed')).toBeLessThan(failed.indexOf('guide'));
  });

  it('A11Y-04 staged turns do not add a board target; the count rides on More tools', () => {
    const d = choosing();
    const before = ids(d.s);
    expect(d.target('more')?.detail).toBeUndefined();
    d.partner('Also, are you cold?');
    expect(d.s.staged).toHaveLength(1);
    const after = ids(d.s);
    expect(after).toEqual(before);
    expect(after).not.toContain('waiting');
    expect(after.indexOf('none')).toBe(before.indexOf('none'));
    expect(d.target('more')?.detail).toBe('1 waiting');
    // History stays reachable through the tools menu.
    d.act('more');
    expect(d.target('t-history')?.label).toBe('History and waiting (1)');
    const both = targetsFor(withFailedSpeech(d.s));
    expect(both.map((t) => t.id)).toContain('t-history');
  });

  it('A11Y-05 None index is stable with both a failed speech and staged turns', () => {
    const d = choosing();
    const base = ids(d.s).indexOf('none');
    d.partner('Also, are you cold?');
    d.partner('And hungry?');
    const combined = targetsFor(withFailedSpeech(d.s)).map((t) => t.id);
    expect(combined.indexOf('none')).toBe(base);
  });
});

describe('A11Y scan speed visibility', () => {
  it('A11Y-06 scan-speed targets are hidden in brow-blink (and other manual-step modes)', () => {
    for (const accessMode of ['brow-blink', 'keyboard', 'pointer'] as const) {
      const d = choosing({ accessMode });
      d.act('more');
      d.act('t-controls');
      expect(ids(d.s)).not.toContain('ct-slower');
      expect(ids(d.s)).not.toContain('ct-faster');
    }
  });

  it('A11Y-07 scan-speed targets show for timed scanning (blink, switch)', () => {
    for (const accessMode of ['blink', 'switch'] as const) {
      const d = choosing({ accessMode });
      d.act('more');
      d.act('t-controls');
      expect(ids(d.s)).toEqual(expect.arrayContaining(['ct-slower', 'ct-faster']));
    }
  });
});

describe('A11Y history labels', () => {
  it('A11Y-08 shortened history labels carry the full partner text as detail', () => {
    const d = choosing();
    const long = 'Would you rather go to the park this afternoon or wait until tomorrow morning?';
    const shortQ = 'Are you cold?';
    d.partner(long);
    d.partner(shortQ);
    d.act('more');
    d.act('t-history');
    const answers = d.targets().filter((t) => t.id.startsWith('h-answer-'));
    expect(answers).toHaveLength(2);
    const longT = answers.find((t) => t.detail === long);
    expect(longT?.label.endsWith('…')).toBe(true);
    const shortT = answers.find((t) => t.label === `Answer: ${shortQ}`);
    expect(shortT?.detail).toBeUndefined();
  });
});

describe('A11Y voice-problem wording', () => {
  it('A11Y-09 speak-basic detail reflects failed vs uncertain delivery', () => {
    const d = choosing();
    const failed = targetsFor(withFailedSpeech(d.s)).find((t) => t.id === 'speak-basic');
    expect(failed?.detail).toBe('The natural voice did not play. You will review it again first.');
    const base = withFailedSpeech(d.s);
    const uncertain = targetsFor({ ...base, lastFailedSpeech: { ...base.lastFailedSpeech!, delivery: 'uncertain' } })
      .find((t) => t.id === 'speak-basic');
    expect(uncertain?.detail).toBe('The natural voice may have partly played. You will review it again first.');
  });
});
