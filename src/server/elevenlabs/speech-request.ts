import 'server-only';
// Validation and spend controls for POST /api/speech.
import { z } from 'zod';

export const MAX_SPEECH_BODY_BYTES = 4_096;
export const MAX_SPEECH_CHARS = 500;

const id = z.string().min(1).max(80);
// C0/C1 control characters (including newlines and tabs) and DEL are refused outright.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export const speechRequestSchema = z.object({
  utteranceId: id,
  reviewSnapshotId: id,
  sessionEpoch: id,
  exactText: z.string().min(1).max(MAX_SPEECH_CHARS)
    .refine((t) => t.trim().length > 0, 'empty')
    .refine((t) => !CONTROL.test(t), 'control characters'),
  voiceChoiceId: id.nullable(),
}).strict();

// Per-process daily character budget (UTC day). Characters are counted when a provider request
// is attempted, which over-counts failures rather than under-counting spend. One instance only.
let budget = { day: '', used: 0 };
const today = () => new Date().toISOString().slice(0, 10);

export function reserveCharacters(chars: number, dailyLimit: number): boolean {
  const d = today();
  if (budget.day !== d) budget = { day: d, used: 0 };
  if (budget.used + chars > dailyLimit) return false;
  budget.used += chars;
  return true;
}

export function resetSpeechBudget() { budget = { day: '', used: 0 }; }
