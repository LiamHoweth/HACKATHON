// Configurable bounds. These are prototype engineering defaults, not clinical guidance.
import type { LengthPolicy, StyleValueByKey } from './types';

export const MERGE_WINDOW_MS = 20_000;

export const LIMITS = {
  recentTurns: 10,
  turnChars: 600,
  partnerInputChars: 1000,
  profileChars: 1000,
  profileEntries: 12,
  rejectedTexts: 24,
  stagedQueue: 10,
  composeChars: 500,
  seedChars: 120,
  phraseChars: 160,
  candidateSummaryChars: 140,
  observationWindow: 20,
  observationTtlMs: 30 * 60 * 1000,
  proposalMinTurns: 3,
  sessionHintMinTurns: 2,
  minLengthSpreadWords: 4,
  consumedCycleMemory: 200,
  metricsEvents: 1000,
  confirmArmMs: 600,
  failedBatchesBeforeHelp: 2,
  maxRequestBytes: 64_000,
  // Fast mode: a partner line this soon after the open question, before the person has answered,
  // is treated as a continuation of that question rather than a new one.
  mergeWindowMs: MERGE_WINDOW_MS,
  // Branching flow: most "other ways to answer" shown, and most prefetch requests per batch.
  maxPaths: 5,
} as const;

export const LENGTH_POLICIES: Record<StyleValueByKey['length'], LengthPolicy> = {
  short: { maxWords: 14, maxCharacters: 100 },
  balanced: { maxWords: 24, maxCharacters: 160 },
  detailed: { maxWords: 40, maxCharacters: 260 },
};

export const SCAN_DEFAULTS = {
  intervalMs: 1500,
  readingPauseMs: 2000,
  minIntervalMs: 700,
  maxIntervalMs: 5000,
  stepMs: 250,
  switchCooldownMs: 250,
} as const;

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// Screening only: lowercases and strips punctuation but keeps every word,
// so negations ("can" vs "cannot", "do" vs "don't") stay distinct.
export function normalizeForDuplicate(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
