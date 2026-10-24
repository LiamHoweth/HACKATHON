// Validates model output beyond schema conformance: lengths, duplicates, repeats.
// These are screening checks, not proof of semantic diversity or relevance.
import type { ReplyPath, ReplyRequest } from '@/core/types';
import { branchingModelOutputSchema, CANDIDATE_COUNT, modelOutputSchema, PATH_COUNT, replyModeOf } from '@/core/schemas';
import { normalizeForDuplicate, wordCount } from '@/core/limits';
import type { z } from 'zod';

// C0/C1 control characters and DEL (the same set /api/speech refuses).
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
// Path labels are short card titles ("Rough day"); a small tolerance avoids a repair for one extra word.
const MAX_PATH_LABEL_WORDS = 4;

export type ModelOutput = z.infer<typeof modelOutputSchema>;
export type CheckedOutput = { candidates: ModelOutput['candidates']; paths?: ReplyPath[] };
export type CheckResult = { ok: true; output: CheckedOutput } | { ok: false; problems: string[] };

export function checkModelOutput(raw: unknown, request: ReplyRequest): CheckResult {
  const mode = replyModeOf(request);
  const parsed = mode === 'branching' ? branchingModelOutputSchema.safeParse(raw) : modelOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: [mode === 'branching'
        ? `Output did not match the required schema with exactly two candidates and ${PATH_COUNT.min}-${PATH_COUNT.max} paths.`
        : 'Output did not match the required schema with exactly three candidates.'],
    };
  }
  const out: { candidates: ModelOutput['candidates']; paths?: ReplyPath[] } = parsed.data;
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
  const candidates = out.candidates.map((c) => ({ ...c, text: c.text.trim() }));
  if (candidates.length !== CANDIDATE_COUNT[mode]) problems.push(`Expected exactly ${CANDIDATE_COUNT[mode]} candidates.`);

  let paths: ReplyPath[] | undefined;
  if (out.paths) {
    const labels = new Set<string>();
    paths = out.paths.map((p, i) => {
      const label = p.label.trim();
      const summary = p.summary.trim();
      if (!label || !summary) problems.push(`Path ${i + 1} has an empty label or summary.`);
      if (wordCount(label) > MAX_PATH_LABEL_WORDS) problems.push(`Path ${i + 1} label must be 1-3 words.`);
      if (CONTROL_CHARS.test(label) || CONTROL_CHARS.test(summary) || /[<>]|```/.test(label + summary)) {
        problems.push(`Path ${i + 1} contains markup or a control character.`);
      }
      const n = normalizeForDuplicate(label);
      if (labels.has(n)) problems.push(`Path ${i + 1} duplicates another path label.`);
      labels.add(n);
      return { label, summary };
    });
  }
  if (problems.length) return { ok: false, problems };
  return { ok: true, output: paths ? { candidates, paths } : { candidates } };
}
