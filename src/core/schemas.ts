// Runtime boundary schemas (zod). Client values are untrusted; model output is untrusted.
import { z } from 'zod';
import {
  CANDIDATE_ACTS, INITIATION_CATEGORIES, INTENTS, PROFILE_FIELDS, RELATIONSHIPS, SETTINGS,
} from './types';
import { LIMITS, LENGTH_POLICIES } from './limits';

const id = z.string().min(1).max(80);
const boundedText = (max: number) => z.string().max(max);

export const scopeSchema = z.object({
  relationship: z.enum(RELATIONSHIPS).nullable(),
  setting: z.enum(SETTINGS).nullable(),
}).strict();

export const styleSettingSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('length'), value: z.enum(['short', 'balanced', 'detailed']) }).strict(),
  z.object({ key: z.literal('directness'), value: z.enum(['gentle', 'direct']) }).strict(),
  z.object({ key: z.literal('formality'), value: z.enum(['casual', 'neutral', 'formal']) }).strict(),
  z.object({ key: z.literal('humor'), value: z.enum(['neutral', 'light']) }).strict(),
  z.object({ key: z.literal('warmth'), value: z.enum(['neutral', 'warm', 'restrained']) }).strict(),
  z.object({ key: z.literal('follow-up'), value: z.enum(['neutral', 'welcome']) }).strict(),
]);

export const meaningSchema = z.object({
  act: z.enum(CANDIDATE_ACTS),
  summary: z.string().min(1).max(LIMITS.candidateSummaryChars),
}).strict();

const anchorSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('reply'), turnId: id, turnContentRevision: z.number().int().min(0) }).strict(),
  z.object({
    mode: z.literal('initiate'), topicId: id,
    category: z.enum(INITIATION_CATEGORIES),
    userTopicOrSeed: boundedText(LIMITS.seedChars * 4).nullable(),
  }).strict(),
]);

const allowedLengthPolicies = Object.values(LENGTH_POLICIES);

// C0/C1 control characters and DEL (the same set /api/speech refuses).
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
// Trimmed single-line text with a minimum and maximum length (after trimming).
const lineText = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine((v) => !CONTROL_CHARS.test(v), 'Control characters are not allowed');

/** Branching flow: a direction the person chose behind "Other ways to answer…" (see ReplyPath). */
export const replyPathSchema = z.object({
  label: lineText(1, 40),
  summary: lineText(1, 140),
}).strict();

export const replyRequestSchema = z.object({
  identity: z.object({
    sessionEpoch: id, workspaceId: id, requestId: id,
    contextRevision: z.number().int().min(0), preferenceRevision: z.number().int().min(0),
  }).strict(),
  mode: z.enum(['live', 'fixture']),
  anchor: anchorSchema,
  activePartnerText: boundedText(LIMITS.partnerInputChars).nullable(),
  language: z.string().min(2).max(20),
  recentConversation: z.array(z.discriminatedUnion('role', [
    z.object({
      role: z.literal('partner'), text: boundedText(LIMITS.turnChars),
      source: z.enum(['partner-typed', 'partner-transcribed', 'partner-edited']),
    }).strict(),
    z.object({
      role: z.literal('user'), text: boundedText(LIMITS.turnChars),
      delivery: z.enum(['queued', 'speaking', 'completed', 'interrupted', 'failed', 'uncertain']),
    }).strict(),
  ])).max(LIMITS.recentTurns),
  approvedProfile: z.array(z.object({
    id, field: z.enum(PROFILE_FIELDS), value: boundedText(120),
  }).strict()).max(LIMITS.profileEntries),
  guidance: z.object({
    intent: z.enum(INTENTS).nullable(),
    wording: z.array(styleSettingSchema).max(6),
    userTopicOrSeed: boundedText(LIMITS.seedChars).nullable(),
    scope: scopeSchema,
  }).strict(),
  approvedPreferences: z.array(z.object({ setting: styleSettingSchema, scope: scopeSchema }).strict()).max(12),
  sessionStyleHints: z.array(styleSettingSchema).max(6),
  rejected: z.array(z.object({
    candidates: z.array(z.object({ text: boundedText(400), meaning: meaningSchema }).strict()).max(3),
    feedback: z.enum(['none-fit', 'different-meaning', 'too-long', 'different-tone', 'too-specific']),
  }).strict()).max(Math.ceil(LIMITS.rejectedTexts / 3)),
  refineTarget: z.object({ text: boundedText(400), meaning: meaningSchema, mode: z.enum(['shorter', 'different-tone']) }).strict().nullable(),
  lengthPolicy: z.object({ maxWords: z.number().int(), maxCharacters: z.number().int() }).strict()
    .refine(
      (p) => allowedLengthPolicies.some((a) => a.maxWords === p.maxWords && a.maxCharacters === p.maxCharacters),
      'Unsupported length policy',
    ),
  // Branching flow ("Other ways to answer"). Both optional so older clients stay valid.
  branching: z.boolean().optional(),
  pathHint: replyPathSchema.nullable().optional(),
}).strict()
  .refine((r) => JSON.stringify(r.approvedProfile).length <= LIMITS.profileChars + 400, 'Profile too large');

/**
 * Output mode, chosen by the server from the request:
 * - 'normal': 3 candidates (default; also whenever refineTarget is set, since refinement keeps a meaning).
 * - 'branching': `branching: true` and no pathHint → the 2 most likely candidates + 3–5 `paths`.
 * - 'path': a pathHint is present → 3 candidates that all follow that direction (pathHint wins over branching).
 */
export type ReplyMode = 'normal' | 'branching' | 'path';
export function replyModeOf(r: { branching?: boolean; pathHint?: unknown; refineTarget?: unknown }): ReplyMode {
  if (r.refineTarget) return 'normal';
  if (r.pathHint) return 'path';
  return r.branching ? 'branching' : 'normal';
}
export const CANDIDATE_COUNT: Record<ReplyMode, number> = { normal: 3, branching: 2, path: 3 };
export const PATH_COUNT = { min: 3, max: 5 } as const;

const candidateOutputSchema = z.object({
  text: z.string().min(1).max(400),
  meaning: meaningSchema,
}).strict();

// What the model may return. Anything else is rejected.
export const modelOutputSchema = z.object({
  candidates: z.array(candidateOutputSchema).length(3),
}).strict();

// Branching mode: exactly two candidates plus 3–5 other directions.
export const branchingModelOutputSchema = z.object({
  candidates: z.array(candidateOutputSchema).length(2),
  paths: z.array(z.object({
    label: z.string().min(1).max(40),
    summary: z.string().min(1).max(140),
  }).strict()).min(PATH_COUNT.min).max(PATH_COUNT.max),
}).strict();

const candidateJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'meaning'],
  properties: {
    text: { type: 'string' },
    meaning: {
      type: 'object',
      additionalProperties: false,
      required: ['act', 'summary'],
      properties: {
        act: { type: 'string', enum: [...CANDIDATE_ACTS] },
        summary: { type: 'string' },
      },
    },
  },
} as const;

// JSON Schema handed to the provider's structured-output mode (kept in sync with modelOutputSchema).
// Counts are enforced by zod + the single repair attempt, not by minItems/maxItems.
export const modelOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: { type: 'array', items: candidateJsonSchema },
  },
} as const;

// Branching-mode JSON Schema (kept in sync with branchingModelOutputSchema). Strict mode needs
// every property required, so this is a separate schema rather than an optional `paths`.
export const branchingModelOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'paths'],
  properties: {
    candidates: { type: 'array', items: candidateJsonSchema },
    paths: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'summary'],
        properties: { label: { type: 'string' }, summary: { type: 'string' } },
      },
    },
  },
} as const;

/** Structured-output format (name + JSON Schema) for a mode. 'path' uses the normal 3-candidate schema. */
export function outputFormatFor(mode: ReplyMode) {
  return mode === 'branching'
    ? { name: 'aac_branching', schema: branchingModelOutputJsonSchema }
    : { name: 'aac_candidates', schema: modelOutputJsonSchema };
}

// Local storage: versioned, validated. Only approved items are ever written.
export const storedDataSchema = z.object({
  version: z.literal(1),
  approvedPreferences: z.array(z.object({
    id, setting: styleSettingSchema, scope: scopeSchema,
    origin: z.enum(['manual', 'approved-proposal']),
    approvalEventId: id, approvedAt: z.number(), enabled: z.boolean(), version: z.number().int(),
  }).strict()).max(50),
  approvedProfile: z.array(z.object({
    id, field: z.enum(PROFILE_FIELDS), value: boundedText(120),
    approvedAt: z.number(), approvalEventId: id, enabled: z.boolean(),
  }).strict()).max(LIMITS.profileEntries),
  savedPhrases: z.array(z.object({
    id, text: z.string().min(1).max(LIMITS.phraseChars), builtIn: z.literal(false), group: z.literal('custom'),
  }).strict()).max(40),
  suppressedDimensions: z.array(z.enum(['length', 'directness', 'formality', 'humor', 'warmth', 'follow-up'])).max(6),
}).strict();
export type StoredData = z.infer<typeof storedDataSchema>;
