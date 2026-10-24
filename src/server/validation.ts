// Validates model output beyond schema conformance: lengths, duplicates, repeats.
// These are screening checks, not proof of semantic diversity or relevance.
import type { ReplyRequest } from '@/core/types';
import { modelOutputSchema } from '@/core/schemas';
import { normalizeForDuplicate, wordCount } from '@/core/limits';
import type { z } from 'zod';

// C0/C1 control characters and DEL (the same set /api/speech refuses).
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

export type ModelOutput = z.infer<typeof modelOutputSchema>;
export type CheckResult = { ok: true; output: ModelOutput } | { ok: false; problems: string[] };

export function checkModelOutput(raw: unknown, request: ReplyRequest): CheckResult {
  const parsed = modelOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: ['Output did not match the required schema with exactly three candidates.'] };
  const out = parsed.data;
  const problems: string[] = [];
  const { maxWords, maxCharacters } = request.lengthPolicy;
  const seen = new Set<string>();
  const offered = new Set(request.rejected.flatMap((b) => b.candidates.map((c) => normalizeForDuplicate(c.text))));
  out.candidates.forEach((c, i) => {
    const text = c.text.trim();
    if (!text) problems.push(`Candidate ${i + 1} is empty.`);
    // Small tolerance: a hard cap would silently truncate; we ask for a repair instead.
    if (wordCount(text) > maxWords + 3 || text.length > Math.round(maxCharacters * 1.15)) {
      problems.push(`Candidate ${i + 1} exceeds the length policy (${maxWords} words / ${maxCharacters} characters).`);
    }
    if (/[<>]/.test(text) || /```/.test(text)) problems.push(`Candidate ${i + 1} contains markup.`);
    // Line breaks, tabs and other control characters are refused by /api/speech; ask for a repair
    // instead of normalizing here, so the displayed text is always the spoken text.
    if (CONTROL_CHARS.test(text)) problems.push(`Candidate ${i + 1} contains a line break, tab or other control character; write it as one line.`);
    const n = normalizeForDuplicate(text);
    if (seen.has(n)) problems.push(`Candidate ${i + 1} duplicates another candidate.`);
    seen.add(n);
    if (!request.refineTarget && offered.has(n)) problems.push(`Candidate ${i + 1} repeats a previously offered candidate.`);
  });
  return problems.length ? { ok: false, problems } : { ok: true, output: { candidates: out.candidates.map((c) => ({ ...c, text: c.text.trim() })) } };
}
