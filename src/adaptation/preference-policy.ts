// Deterministic resolution of style settings.
// Order: explicit current-turn wording > approved saved preference (most specific scope,
// then latest approval) > session hint > default.
import type { ApprovedPreference, Guidance, LengthPolicy, Scope, StyleKey, StyleSetting } from '@/core/types';
import { STYLE_KEYS } from '@/core/types';
import { LENGTH_POLICIES } from '@/core/limits';

export type Provenance = 'this-response' | 'saved' | 'session-hint' | 'default';
export type EffectiveSetting = { setting: StyleSetting; provenance: Provenance; preferenceId?: string };
export type EffectivePolicy = {
  settings: Partial<Record<StyleKey, EffectiveSetting>>;
  appliedPreferences: ApprovedPreference[];
  appliedHints: StyleSetting[];
  lengthPolicy: LengthPolicy;
};

export type PersonalizationFlags = {
  usePreferences: boolean;
  personalizationPaused: boolean;
  sessionAdaptation: boolean;
};

// Returns -1 when the preference scope does not match, otherwise a specificity score.
// A setting match (where) outranks a relationship match (who); both outrank global.
export function scopeSpecificity(prefScope: Scope, current: Scope): number {
  let score = 0;
  if (prefScope.relationship !== null) {
    if (prefScope.relationship !== current.relationship) return -1;
    score += 1;
  }
  if (prefScope.setting !== null) {
    if (prefScope.setting !== current.setting) return -1;
    score += 2;
  }
  return score;
}

export function resolveSavedPreferences(prefs: ApprovedPreference[], scope: Scope): ApprovedPreference[] {
  const best = new Map<StyleKey, ApprovedPreference>();
  for (const p of prefs) {
    if (!p.enabled) continue;
    const spec = scopeSpecificity(p.scope, scope);
    if (spec < 0) continue;
    const current = best.get(p.setting.key);
    if (!current) { best.set(p.setting.key, p); continue; }
    const currentSpec = scopeSpecificity(current.scope, scope);
    if (spec > currentSpec || (spec === currentSpec && p.approvedAt > current.approvedAt)) {
      best.set(p.setting.key, p);
    }
  }
  return STYLE_KEYS.flatMap((k) => (best.has(k) ? [best.get(k)!] : []));
}

export function effectivePolicy(
  guidance: Guidance,
  approved: ApprovedPreference[],
  sessionHints: StyleSetting[],
  flags: PersonalizationFlags,
): EffectivePolicy {
  const settings: Partial<Record<StyleKey, EffectiveSetting>> = {};
  for (const w of guidance.wording) settings[w.key] = { setting: w, provenance: 'this-response' };

  const usingSaved = flags.usePreferences && !flags.personalizationPaused;
  const appliedPreferences: ApprovedPreference[] = [];
  if (usingSaved) {
    for (const p of resolveSavedPreferences(approved, guidance.scope)) {
      if (settings[p.setting.key]) continue; // explicit current choice wins
      settings[p.setting.key] = { setting: p.setting, provenance: 'saved', preferenceId: p.id };
      appliedPreferences.push(p);
    }
  }

  const appliedHints: StyleSetting[] = [];
  if (flags.sessionAdaptation && !flags.personalizationPaused) {
    for (const h of sessionHints) {
      if (settings[h.key]) continue; // hints only fill gaps
      settings[h.key] = { setting: h, provenance: 'session-hint' };
      appliedHints.push(h);
    }
  }

  const length = settings.length?.setting;
  const lengthValue = length && length.key === 'length' ? length.value : 'short';
  return { settings, appliedPreferences, appliedHints, lengthPolicy: LENGTH_POLICIES[lengthValue] };
}

export function describeSetting(s: StyleSetting): string {
  switch (s.key) {
    case 'length': return { short: 'Short replies', balanced: 'Medium-length replies', detailed: 'More detailed replies' }[s.value];
    case 'directness': return s.value === 'direct' ? 'Direct wording' : 'Gentle wording';
    case 'formality': return { casual: 'Casual wording', neutral: 'Neutral formality', formal: 'Formal wording' }[s.value];
    case 'humor': return s.value === 'light' ? 'Light humor welcome' : 'No humor by default';
    case 'warmth': return { neutral: 'Neutral warmth', warm: 'Warm wording', restrained: 'Restrained wording' }[s.value];
    case 'follow-up': return s.value === 'welcome' ? 'Include follow-up questions' : 'No extra follow-up questions';
  }
}

export function describeScope(scope: Scope): string {
  if (!scope.relationship && !scope.setting) return 'all conversations';
  const parts: string[] = [];
  if (scope.relationship) parts.push(`with ${scope.relationship}`);
  if (scope.setting) parts.push(`in ${scope.setting} settings`);
  return parts.join(' ');
}
