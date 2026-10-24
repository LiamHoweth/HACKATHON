import { describe, expect, it } from 'vitest';
import { branchingModelOutputSchema, modelOutputSchema, replyModeOf, replyRequestSchema } from '@/core/schemas';
import { normalizeForDuplicate, LIMITS } from '@/core/limits';
import { Driver, SPREAD_CANDIDATES } from './helpers';

const three = SPREAD_CANDIDATES.map((c) => ({ text: c.text, meaning: { ...c.meaning } }));

describe('modelOutputSchema', () => {
  it('accepts exactly 3 well-formed candidates', () => {
    expect(modelOutputSchema.safeParse({ candidates: three }).success).toBe(true);
  });
  it('rejects 2 or 4 candidates', () => {
    expect(modelOutputSchema.safeParse({ candidates: three.slice(0, 2) }).success).toBe(false);
    expect(modelOutputSchema.safeParse({ candidates: [...three, three[0]] }).success).toBe(false);
  });
  it('rejects extra fields', () => {
    expect(modelOutputSchema.safeParse({ candidates: three, note: 'x' }).success).toBe(false);
    expect(modelOutputSchema.safeParse({ candidates: [{ ...three[0], id: 'model' }, three[1], three[2]] }).success).toBe(false);
    expect(modelOutputSchema.safeParse({ candidates: [{ ...three[0], meaning: { ...three[0].meaning, extra: 1 } }, three[1], three[2]] }).success).toBe(false);
  });
  it('rejects an unknown act', () => {
    const bad = [{ ...three[0], meaning: { act: 'insult', summary: 'x' } }, three[1], three[2]];
    expect(modelOutputSchema.safeParse({ candidates: bad }).success).toBe(false);
  });
});

describe('replyRequestSchema', () => {
  function realRequest() {
    const d = new Driver();
    d.partner('Would you like some water?');
    return d.lastGenerate().request;
  }
  it('accepts a request built by the app', () => {
    const r = replyRequestSchema.safeParse(realRequest());
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });
  it('rejects an unsupported lengthPolicy', () => {
    expect(replyRequestSchema.safeParse({ ...realRequest(), lengthPolicy: { maxWords: 500, maxCharacters: 5000 } }).success).toBe(false);
    expect(replyRequestSchema.safeParse({ ...realRequest(), lengthPolicy: { maxWords: 15, maxCharacters: 100 } }).success).toBe(false);
  });
  it('rejects oversized partner text', () => {
    const r = realRequest();
    expect(replyRequestSchema.safeParse({ ...r, activePartnerText: 'a'.repeat(LIMITS.partnerInputChars) }).success).toBe(true);
    expect(replyRequestSchema.safeParse({ ...r, activePartnerText: 'a'.repeat(LIMITS.partnerInputChars + 1) }).success).toBe(false);
  });
});

describe('branching flow schemas', () => {
  function realRequest() {
    const d = new Driver();
    d.partner('How was your day?');
    return d.lastGenerate().request;
  }
  const paths = [
    { label: 'Rough day', summary: 'Say the day was hard' },
    { label: 'Pretty normal', summary: 'Say it was ordinary' },
    { label: 'Ask about theirs', summary: 'Turn it back to them' },
  ];

  it('accepts optional branching and pathHint, and old requests without them', () => {
    const r = realRequest();
    const legacy: Record<string, unknown> = { ...r };
    delete legacy.branching;
    delete legacy.pathHint;
    expect(replyRequestSchema.safeParse(legacy).success).toBe(true);
    expect(replyRequestSchema.safeParse({ ...r, branching: true }).success).toBe(true);
    expect(replyRequestSchema.safeParse({ ...r, branching: false, pathHint: null }).success).toBe(true);
    const hinted = replyRequestSchema.safeParse({ ...r, pathHint: { label: '  Rough day ', summary: 'Say the day was hard' } });
    expect(hinted.success).toBe(true);
    expect(hinted.success && hinted.data.pathHint).toEqual({ label: 'Rough day', summary: 'Say the day was hard' });
  });

  it('rejects malformed branching fields', () => {
    const r = realRequest();
    const bad = (over: Record<string, unknown>) => replyRequestSchema.safeParse({ ...r, ...over }).success;
    expect(bad({ branching: 'yes' })).toBe(false);
    expect(bad({ pathHint: { label: '', summary: 'x' } })).toBe(false);
    expect(bad({ pathHint: { label: '   ', summary: 'x' } })).toBe(false);
    expect(bad({ pathHint: { label: 'x'.repeat(41), summary: 'x' } })).toBe(false);
    expect(bad({ pathHint: { label: 'ok', summary: 'x'.repeat(141) } })).toBe(false);
    expect(bad({ pathHint: { label: 'ok', summary: '' } })).toBe(false);
    expect(bad({ pathHint: { label: 'line\nbreak', summary: 'x' } })).toBe(false);
    expect(bad({ pathHint: { label: 'ok', summary: 'x', extra: 1 } })).toBe(false);
    expect(bad({ pathHint: 'Rough day' })).toBe(false);
    expect(bad({ pathHint: { label: 'x'.repeat(40), summary: 'y'.repeat(140) } })).toBe(true);
  });

  it('chooses the output mode from the request: pathHint wins, refinement stays normal', () => {
    expect(replyModeOf({})).toBe('normal');
    expect(replyModeOf({ branching: true })).toBe('branching');
    expect(replyModeOf({ branching: true, pathHint: paths[0] })).toBe('path');
    expect(replyModeOf({ pathHint: paths[0] })).toBe('path');
    expect(replyModeOf({ branching: true, refineTarget: { text: 'x' } })).toBe('normal');
  });

  it('branching model output: exactly 2 candidates and 3-5 paths, strict', () => {
    const ok = (o: unknown) => branchingModelOutputSchema.safeParse(o).success;
    expect(ok({ candidates: three.slice(0, 2), paths })).toBe(true);
    expect(ok({ candidates: three.slice(0, 2), paths: [...paths, ...paths.slice(0, 2)] })).toBe(true);
    expect(ok({ candidates: three, paths })).toBe(false);
    expect(ok({ candidates: three.slice(0, 2), paths: paths.slice(0, 2) })).toBe(false);
    expect(ok({ candidates: three.slice(0, 2), paths: [...paths, ...paths] })).toBe(false);
    expect(ok({ candidates: three.slice(0, 2) })).toBe(false);
    expect(ok({ candidates: three.slice(0, 2), paths: [{ ...paths[0], extra: 1 }, paths[1], paths[2]] })).toBe(false);
    expect(modelOutputSchema.safeParse({ candidates: three, paths }).success).toBe(false);
  });
});

describe('normalizeForDuplicate', () => {
  it('GEN-09 keeps negations distinct', () => {
    expect(normalizeForDuplicate('I can come.')).not.toBe(normalizeForDuplicate('I cannot come.'));
    expect(normalizeForDuplicate('I do.')).not.toBe(normalizeForDuplicate("I don't."));
    expect(normalizeForDuplicate('I can come.')).toBe(normalizeForDuplicate('i CAN come!'));
  });
});
