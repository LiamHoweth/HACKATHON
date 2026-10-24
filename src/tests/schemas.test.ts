import { describe, expect, it } from 'vitest';
import { modelOutputSchema, replyRequestSchema } from '@/core/schemas';
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

describe('normalizeForDuplicate', () => {
  it('GEN-09 keeps negations distinct', () => {
    expect(normalizeForDuplicate('I can come.')).not.toBe(normalizeForDuplicate('I cannot come.'));
    expect(normalizeForDuplicate('I do.')).not.toBe(normalizeForDuplicate("I don't."));
    expect(normalizeForDuplicate('I can come.')).toBe(normalizeForDuplicate('i CAN come!'));
  });
});
