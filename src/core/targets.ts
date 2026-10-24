// The single authoritative target registry. Every input source (pointer, keyboard,
// switch scanning) activates targets from this list through one guarded reducer path.
import type { State, Surface, Target, Workspace } from './state';
import { currentSurface } from './state';
import { INTENTS, INITIATION_CATEGORIES, STYLE_KEYS, STYLE_VALUES, RELATIONSHIPS, SETTINGS } from './types';
import type { StyleSetting } from './types';
import { INITIATION_LABELS, INTENT_LABELS, KEY_GROUPS, QUICK_PAGE_SIZE } from './phrases';
import { LIMITS, SCAN_DEFAULTS } from './limits';
import { describeScope, describeSetting, resolveSavedPreferences } from '@/adaptation/preference-policy';

const back = (label = 'Back'): Target => ({ id: 'back', label, enabled: true, command: { type: 'back' }, region: 'menu', tone: 'quiet' });
const open = (id: string, label: string, surface: Surface, extra: Partial<Target> = {}): Target => ({
  id, label, enabled: true, command: { type: 'open', surface }, region: 'tools', ...extra,
});

export function activeWorkspace(s: State): Workspace | null {
  const id = s.activeWorkspaceId;
  return id ? s.workspaces[id] ?? null : null;
}

export function partnerText(s: State, turnId: string): string {
  const e = s.conversation.find((c) => c.role === 'partner' && c.value.id === turnId);
  return e ? e.value.text : '';
}

export function parkedWorkspaces(s: State): Workspace[] {
  return Object.values(s.workspaces)
    .filter((w) => w.parked && !w.closed && w.id !== s.activeWorkspaceId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

const short = (t: string, n = 48) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function anchorLabel(s: State, ws: Workspace): string {
  if (ws.anchor.mode === 'reply') return `“${partnerText(s, ws.anchor.turnId)}”`;
  const seed = ws.anchor.userTopicOrSeed;
  return `${INITIATION_LABELS[ws.anchor.category] ?? 'Start a conversation'}${seed ? `: ${seed}` : ''}`;
}

function boardTargets(s: State): Target[] {
  const ws = activeWorkspace(s);
  const t: Target[] = [];
  const waiting = s.staged.length + parkedWorkspaces(s).length;
  if (ws && !ws.closed) {
    if (ws.status === 'choosing' && ws.batch) {
      ws.batch.candidates.forEach((c, i) => t.push({
        id: `cand-${i}`, label: c.text, enabled: true,
        command: { type: 'select-candidate', candidateId: c.id }, region: 'candidates',
      }));
      t.push({
        id: 'none', label: ws.batch.kind === 'refinement' ? 'None of these — back to new suggestions' : 'None of these — new suggestions',
        enabled: s.settings.aiMode !== 'local-only', command: { type: 'none-of-these' }, region: 'candidates', tone: 'quiet',
      });
      if (ws.failedBatches >= LIMITS.failedBatchesBeforeHelp) {
        t.push({ id: 'help-own-words', label: 'Write it myself', enabled: true,
          command: { type: 'open', surface: { kind: 'compose', purpose: 'message', group: null, seedFor: null } }, region: 'primary' });
      }
    } else if (ws.status === 'error' || ws.status === 'stale') {
      t.push({ id: 'retry', label: ws.status === 'stale' ? 'Refresh suggestions' : 'Try again', enabled: s.settings.aiMode !== 'local-only',
        command: { type: ws.status === 'stale' ? 'refresh' : 'retry' }, region: 'primary' });
    } else if (ws.status === 'idle' && s.settings.aiMode !== 'local-only') {
      t.push({ id: 'refresh', label: 'Get suggestions', enabled: true, command: { type: 'refresh' }, region: 'primary' });
    }
    t.push(open('guide', 'Guide my response', { kind: 'guide', page: 'root' }, { enabled: s.settings.aiMode !== 'local-only' }));
    t.push(open('quick', 'Quick phrases', { kind: 'quick', page: 0 }));
    t.push(open('my-words', 'My words', { kind: 'compose', purpose: 'message', group: null, seedFor: null }));
  } else {
    t.push(open('start', 'Start a conversation', { kind: 'initiate' }, { region: 'primary' }));
    t.push(open('quick', 'Quick phrases', { kind: 'quick', page: 0 }));
    t.push(open('my-words', 'My words', { kind: 'compose', purpose: 'message', group: null, seedFor: null }));
  }
  if (waiting > 0) t.push(open('waiting', `Waiting: ${waiting}`, { kind: 'history' }));
  t.push(open('more', 'More tools', { kind: 'tools' }));
  return t;
}

function guideTargets(s: State, page: 'root' | 'direction' | 'wording'): Target[] {
  const ws = activeWorkspace(s);
  const hasGuidance = !!ws && (ws.guidance.intent !== null || ws.guidance.wording.length > 0 || !!ws.guidance.userTopicOrSeed);
  if (page === 'root') {
    return [
      { id: 'g-direction', label: 'Choose a direction', detail: 'Agree, disagree, ask, suggest…', enabled: true, command: { type: 'open', surface: { kind: 'guide', page: 'direction' } }, region: 'menu' },
      { id: 'g-wording', label: 'Change the wording', detail: 'Humor, direct, shorter…', enabled: true, command: { type: 'open', surface: { kind: 'guide', page: 'wording' } }, region: 'menu' },
      { id: 'g-seed', label: 'Type a topic or keyword', enabled: true, command: { type: 'open', surface: { kind: 'compose', purpose: 'seed', group: null, seedFor: 'guide' } }, region: 'menu' },
      { id: 'g-clear', label: 'Clear guidance', enabled: hasGuidance, command: { type: 'clear-guidance' }, region: 'menu' },
      back(),
    ];
  }
  if (page === 'direction') {
    return [
      ...INTENTS.map((intent): Target => intent === 'other'
        ? { id: `i-${intent}`, label: INTENT_LABELS[intent], detail: 'Type a topic or keyword', enabled: true,
            command: { type: 'open', surface: { kind: 'compose', purpose: 'seed', group: null, seedFor: 'guide' } }, region: 'menu' }
        : { id: `i-${intent}`, label: INTENT_LABELS[intent], enabled: true, command: { type: 'set-intent', intent }, region: 'menu' }),
      back(),
    ];
  }
  const w = (id: string, label: string, setting: StyleSetting, feedback?: 'shorter' | 'longer'): Target =>
    ({ id, label, enabled: true, command: { type: 'add-wording', setting, feedback }, region: 'menu' });
  return [
    w('w-humor', 'Be humorous', { key: 'humor', value: 'light' }),
    w('w-direct', 'Be direct', { key: 'directness', value: 'direct' }),
    w('w-shorter', 'Shorter', { key: 'length', value: 'short' }, 'shorter'),
    w('w-detail', 'More detail', { key: 'length', value: 'detailed' }, 'longer'),
    w('w-gentle', 'Gentler', { key: 'directness', value: 'gentle' }),
    w('w-casual', 'More casual', { key: 'formality', value: 'casual' }),
    w('w-formal', 'More formal', { key: 'formality', value: 'formal' }),
    w('w-warm', 'Warmer', { key: 'warmth', value: 'warm' }),
    back(),
  ];
}

export function allPhrases(s: State) {
  return s.savedPhrases;
}

function quickTargets(s: State, page: number): Target[] {
  const phrases = allPhrases(s);
  const pages = Math.max(1, Math.ceil(phrases.length / QUICK_PAGE_SIZE));
  const p = Math.min(page, pages - 1);
  const slice = phrases.slice(p * QUICK_PAGE_SIZE, (p + 1) * QUICK_PAGE_SIZE);
  const t: Target[] = slice.map((ph) => ({
    id: `qp-${ph.id}`, label: ph.text, enabled: true, command: { type: 'quick-phrase', phraseId: ph.id }, region: 'menu',
  }));
  if (pages > 1) {
    t.push({ id: 'qp-more', label: p + 1 < pages ? `More phrases (${p + 2} of ${pages})` : 'First phrases', enabled: true,
      command: { type: 'quick-page', page: (p + 1) % pages }, region: 'menu', tone: 'quiet' });
  }
  t.push({ id: 'qp-add', label: 'Add a saved phrase', enabled: true,
    command: { type: 'open', surface: { kind: 'compose', purpose: 'phrase', group: null, seedFor: null } }, region: 'menu', tone: 'quiet' });
  t.push(back());
  return t;
}

function composeTargets(s: State, surface: Extract<Surface, { kind: 'compose' }>): Target[] {
  const draft = s.drafts[surface.purpose];
  if (surface.group !== null) {
    const g = KEY_GROUPS[surface.group];
    return [
      ...g.keys.map((k): Target => ({ id: `key-${k}`, label: k, enabled: true, command: { type: 'compose-key', key: k }, region: 'keys' })),
      { id: 'key-back', label: 'Back to groups', enabled: true, command: { type: 'compose-group', group: null }, region: 'keys', tone: 'quiet' },
    ];
  }
  const doneLabel = surface.purpose === 'message' ? 'Review message' : surface.purpose === 'seed' ? 'Use this topic' : 'Review phrase';
  return [
    { id: 'c-done', label: doneLabel, enabled: draft.trim().length > 0, command: { type: 'compose-done' }, region: 'keys', tone: 'speak' },
    { id: 'c-space', label: 'Space', enabled: true, command: { type: 'compose-space' }, region: 'keys' },
    ...KEY_GROUPS.map((g, i): Target => ({ id: `grp-${i}`, label: g.label, enabled: true, command: { type: 'compose-group', group: i }, region: 'keys' })),
    { id: 'c-delete', label: 'Delete', enabled: draft.length > 0, command: { type: 'compose-delete' }, region: 'keys' },
    { id: 'c-clear', label: 'Clear…', enabled: draft.length > 0, command: { type: 'open', surface: { kind: 'compose-clear' } }, region: 'keys', tone: 'quiet' },
    ...(surface.purpose === 'message' ? [open('c-quick', 'Quick phrases', { kind: 'quick', page: 0 }, { region: 'keys', tone: 'quiet' })] : []),
    back(surface.purpose === 'message' ? 'Back (keep draft)' : 'Back'),
  ];
}

function initiateTargets(s: State): Target[] {
  return [
    ...INITIATION_CATEGORIES.map((c): Target => {
      if (c === 'original' || c === 'express-feeling') {
        return { id: `init-${c}`, label: INITIATION_LABELS[c], enabled: true,
          command: { type: 'open', surface: { kind: 'compose', purpose: 'message', group: null, seedFor: null } }, region: 'menu' };
      }
      if (c === 'approved-interest') {
        return { id: `init-${c}`, label: INITIATION_LABELS[c], enabled: s.settings.aiMode !== 'local-only',
          command: { type: 'open', surface: { kind: 'initiate-topics', mode: 'interest' } }, region: 'menu' };
      }
      if (c === 'earlier-topic') {
        return { id: `init-${c}`, label: INITIATION_LABELS[c], enabled: s.settings.aiMode !== 'local-only',
          command: { type: 'open', surface: { kind: 'initiate-topics', mode: 'earlier' } }, region: 'menu' };
      }
      return { id: `init-${c}`, label: INITIATION_LABELS[c], enabled: s.settings.aiMode !== 'local-only',
        command: { type: 'initiate', category: c, seed: null }, region: 'menu' };
    }),
    back(),
  ];
}

function initiateTopicTargets(s: State, mode: 'interest' | 'earlier'): Target[] {
  const t: Target[] = [];
  if (mode === 'interest') {
    const personalizationOn = s.settings.usePreferences && !s.settings.personalizationPaused;
    const interests = personalizationOn ? s.approvedProfile.filter((p) => p.enabled && p.field === 'interest') : [];
    interests.slice(0, 6).forEach((p) => t.push({ id: `topic-${p.id}`, label: p.value, enabled: true,
      command: { type: 'initiate', category: 'approved-interest', seed: p.value }, region: 'menu' }));
    t.push({ id: 'topic-generic', label: interests.length ? 'Something else I like' : 'Something I like (no approved interests yet)', enabled: true,
      command: { type: 'initiate', category: 'approved-interest', seed: null }, region: 'menu' });
  } else {
    const earlier = s.conversation
      .filter((e) => (e.role === 'partner' ? e.value.acceptedForContext && !e.value.dismissed : e.value.delivery !== 'failed'))
      .slice(-6).reverse();
    earlier.forEach((e) => t.push({ id: `topic-${e.value.id}`, label: short(e.value.text, 60),
      detail: e.role === 'partner' ? 'Partner said' : 'You said', enabled: true,
      command: { type: 'initiate', category: 'earlier-topic', seed: e.value.text }, region: 'menu' }));
    t.push({ id: 'topic-generic', label: earlier.length ? 'Something else from before' : 'Something from before (no topics this session)', enabled: true,
      command: { type: 'initiate', category: 'earlier-topic', seed: null }, region: 'menu' });
  }
  t.push(back());
  return t;
}

function toolsTargets(s: State): Target[] {
  const ws = activeWorkspace(s);
  const waiting = s.staged.length + parkedWorkspaces(s).length;
  return [
    open('t-start', 'Start a conversation', { kind: 'initiate' }, { region: 'menu' }),
    { id: 't-park', label: 'Keep this question for later', enabled: !!ws && !ws.closed, command: { type: 'park-active' }, region: 'menu' },
    open('t-history', `History and waiting (${waiting})`, { kind: 'history' }, { region: 'menu' }),
    open('t-prefs', s.proposals.some((p) => p.status === 'pending') ? 'Preferences · suggestion available' : 'Preferences and memory', { kind: 'preferences' }, { region: 'menu' }),
    open('t-controls', 'Controls', { kind: 'controls' }, { region: 'menu' }),
    back(),
  ];
}

function historyTargets(s: State): Target[] {
  const t: Target[] = [];
  for (const id of s.staged) {
    const text = short(partnerText(s, id));
    t.push({ id: `h-answer-${id}`, label: `Answer: ${text}`, enabled: true, command: { type: 'history-answer', turnId: id }, region: 'menu' });
    t.push({ id: `h-dismiss-${id}`, label: `Dismiss from pending: ${text}`, enabled: true, command: { type: 'history-dismiss-staged', turnId: id }, region: 'menu', tone: 'quiet' });
  }
  for (const ws of parkedWorkspaces(s)) {
    const label = short(anchorLabel(s, ws));
    t.push({ id: `h-return-${ws.id}`, label: `Return to: ${label}`, enabled: true, command: { type: 'history-return', workspaceId: ws.id }, region: 'menu' });
    t.push({ id: `h-drop-${ws.id}`, label: `Dismiss from pending: ${label}`, enabled: true, command: { type: 'history-dismiss-workspace', workspaceId: ws.id }, region: 'menu', tone: 'quiet' });
  }
  t.push(back());
  return t;
}

function prefsTargets(s: State): Target[] {
  const st = s.settings;
  const pending = s.proposals.find((p) => p.status === 'pending');
  const t: Target[] = [];
  if (pending) t.push({ id: 'p-proposal', label: 'Review preference suggestion', enabled: true, command: { type: 'open', surface: { kind: 'proposal', proposalId: pending.id } }, region: 'menu' });
  t.push(
    { id: 'p-edit', label: 'Edit my style preferences', detail: `For ${describeScope(st.scope)}`, enabled: true, command: { type: 'open', surface: { kind: 'style-edit', key: null } }, region: 'menu' },
    { id: 'p-memory', label: 'What is saved (memory)', enabled: true, command: { type: 'open', surface: { kind: 'memory' } }, region: 'menu' },
    { id: 'p-pause', label: st.personalizationPaused ? 'Resume personalization' : 'Pause personalization', enabled: true, command: { type: 'toggle-flag', flag: 'personalizationPaused' }, region: 'menu' },
    { id: 'p-use', label: `Use saved preferences: ${st.usePreferences ? 'on' : 'off'}`, enabled: true, command: { type: 'toggle-flag', flag: 'usePreferences' }, region: 'menu' },
    { id: 'p-session', label: `Learn from this session: ${st.sessionAdaptation ? 'on' : 'off'}`, enabled: true, command: { type: 'toggle-flag', flag: 'sessionAdaptation' }, region: 'menu' },
    st.persistOnDevice
      ? { id: 'p-persist', label: 'Remember on this device: on', enabled: true, command: { type: 'disable-persistence' }, region: 'menu' }
      : { id: 'p-persist', label: 'Remember on this device: off', enabled: true, command: { type: 'request-change', change: { kind: 'enable-persistence' } }, region: 'menu' },
    { id: 'p-clear-session', label: 'Clear session learning', enabled: s.observations.length > 0 || s.proposals.length > 0, command: { type: 'request-change', change: { kind: 'clear-session-learning' } }, region: 'menu' },
    back(),
  );
  return t;
}

function styleEditTargets(s: State, key: (typeof STYLE_KEYS)[number] | null): Target[] {
  const scope = s.settings.scope;
  const exact = (k: string) => s.approvedPreferences.find((p) => p.enabled && p.setting.key === k
    && p.scope.relationship === scope.relationship && p.scope.setting === scope.setting);
  if (key === null) {
    const resolved = resolveSavedPreferences(s.approvedPreferences, scope);
    return [
      ...STYLE_KEYS.map((k): Target => {
        const r = resolved.find((p) => p.setting.key === k);
        return { id: `se-${k}`, label: r ? describeSetting(r.setting) : `${k[0].toUpperCase()}${k.slice(1)}: no saved preference`,
          detail: r ? `Saved for ${describeScope(r.scope)}` : undefined, enabled: true,
          command: { type: 'open', surface: { kind: 'style-edit', key: k } }, region: 'menu' };
      }),
      { id: 'se-scope', label: `Applies to: ${describeScope(scope)}`, detail: 'Change who/where', enabled: true, command: { type: 'open', surface: { kind: 'scope' } }, region: 'menu' },
      back(),
    ];
  }
  const current = exact(key);
  const values = STYLE_VALUES[key] as readonly string[];
  return [
    ...values.map((v): Target => {
      const setting = { key, value: v } as StyleSetting;
      return { id: `sv-${v}`, label: describeSetting(setting) + (current?.setting.value === v ? ' (saved)' : ''), enabled: current?.setting.value !== v,
        command: { type: 'request-change', change: { kind: 'save-preference', setting, scope, origin: 'manual', proposalId: null } }, region: 'menu' };
    }),
    { id: 'sv-none', label: 'No saved preference here', enabled: !!current, command: { type: 'request-change', change: { kind: 'remove-preference', key, scope } }, region: 'menu' },
    back(),
  ];
}

function scopeTargets(s: State): Target[] {
  const sc = s.settings.scope;
  const nextRel = sc.relationship === null ? RELATIONSHIPS[0] : RELATIONSHIPS[RELATIONSHIPS.indexOf(sc.relationship) + 1] ?? null;
  const nextSet = sc.setting === null ? SETTINGS[0] : SETTINGS[SETTINGS.indexOf(sc.setting) + 1] ?? null;
  return [
    { id: 'sc-rel', label: `Talking with: ${sc.relationship ?? 'anyone'}`, detail: `Next: ${nextRel ?? 'anyone'}`, enabled: true, command: { type: 'set-scope', scope: { ...sc, relationship: nextRel } }, region: 'menu' },
    { id: 'sc-set', label: `Setting: ${sc.setting ?? 'anywhere'}`, detail: `Next: ${nextSet ?? 'anywhere'}`, enabled: true, command: { type: 'set-scope', scope: { ...sc, setting: nextSet } }, region: 'menu' },
    back(),
  ];
}

function memoryTargets(s: State): Target[] {
  const t: Target[] = [];
  if (s.profileDraft && (s.profileDraft.preferredName || s.profileDraft.interests.length)) {
    t.push({ id: 'm-approve-profile', label: 'Review profile draft entered at setup', enabled: true, command: { type: 'request-change', change: { kind: 'approve-profile' } }, region: 'menu' });
  }
  for (const p of s.approvedPreferences) {
    const label = `${describeSetting(p.setting)} · ${describeScope(p.scope)}`;
    t.push({ id: `m-toggle-${p.id}`, label: `${p.enabled ? 'Turn off' : 'Turn on'}: ${label}`, enabled: true,
      command: { type: 'request-change', change: { kind: 'toggle-item', item: 'preference', id: p.id, label, enabled: !p.enabled } }, region: 'menu' });
    t.push({ id: `m-del-${p.id}`, label: `Delete: ${label}`, enabled: true,
      command: { type: 'request-change', change: { kind: 'delete-item', item: 'preference', id: p.id, label } }, region: 'menu', tone: 'quiet' });
  }
  for (const p of s.approvedProfile) {
    const label = `${p.field === 'preferredName' ? 'Name' : p.field === 'interest' ? 'Interest' : 'Language'}: ${p.value}`;
    t.push({ id: `m-del-${p.id}`, label: `Delete: ${label}`, enabled: true,
      command: { type: 'request-change', change: { kind: 'delete-item', item: 'profile', id: p.id, label } }, region: 'menu', tone: 'quiet' });
  }
  for (const p of s.savedPhrases.filter((x) => !x.builtIn)) {
    t.push({ id: `m-del-${p.id}`, label: `Delete phrase: ${short(p.text)}`, enabled: true,
      command: { type: 'request-change', change: { kind: 'delete-item', item: 'phrase', id: p.id, label: p.text } }, region: 'menu', tone: 'quiet' });
  }
  const anySaved = s.approvedPreferences.length + s.approvedProfile.length + s.savedPhrases.filter((x) => !x.builtIn).length > 0;
  t.push({ id: 'm-delete-all', label: 'Delete everything saved', enabled: anySaved, command: { type: 'request-change', change: { kind: 'delete-all-saved' } }, region: 'menu', tone: 'quiet' });
  t.push(back());
  return t;
}

function controlsTargets(s: State): Target[] {
  const iv = s.settings.scanIntervalMs;
  const rec = s.recording.status;
  return [
    { id: 'ct-pause', label: 'Pause', enabled: true, command: { type: 'pause' }, region: 'menu' },
    rec === 'recording'
      ? { id: 'ct-rec', label: 'Finish recording', enabled: true, command: { type: 'record-finish' }, region: 'menu' }
      : { id: 'ct-rec', label: 'Record partner speech', detail: s.settings.cloudConsent ? 'Sends audio for transcription' : 'Needs cloud consent at setup',
          enabled: s.settings.cloudConsent && rec !== 'transcribing' && rec !== 'requesting' && !s.speech, command: { type: 'record-start' }, region: 'menu' },
    { id: 'ct-slower', label: `Scan slower (now ${(iv / 1000).toFixed(2)}s)`, enabled: iv < SCAN_DEFAULTS.maxIntervalMs, command: { type: 'scan-speed', deltaMs: SCAN_DEFAULTS.stepMs }, region: 'menu' },
    { id: 'ct-faster', label: 'Scan faster', enabled: iv > SCAN_DEFAULTS.minIntervalMs, command: { type: 'scan-speed', deltaMs: -SCAN_DEFAULTS.stepMs }, region: 'menu' },
    open('ct-scope', `Who/where: ${describeScope(s.settings.scope)}`, { kind: 'scope' }, { region: 'menu' }),
    { id: 'ct-measure', label: `Measurement mode: ${s.settings.measurement ? 'on' : 'off'}`, enabled: true, command: { type: 'toggle-flag', flag: 'measurement' }, region: 'menu' },
    open('ct-metrics', 'View measurements', { kind: 'metrics' }, { region: 'menu' }),
    open('ct-end', 'End session…', { kind: 'end-confirm' }, { region: 'menu', tone: 'quiet' }),
    back(),
  ];
}

function confirmTargets(label: string): Target[] {
  return [
    { id: 'cf-cancel', label: 'Cancel', enabled: true, command: { type: 'back' }, region: 'review', tone: 'cancel' },
    { id: 'cf-confirm', label, enabled: true, command: { type: 'confirm-change' }, region: 'review', requiresArming: true, tone: 'speak' },
  ];
}

export function confirmLabel(change: Extract<Surface, { kind: 'confirm-change' }>['change']): string {
  switch (change.kind) {
    case 'save-preference': return 'Yes, save this preference';
    case 'remove-preference': return 'Yes, remove it';
    case 'approve-profile': return 'Yes, approve this profile';
    case 'delete-item': return 'Yes, delete it';
    case 'toggle-item': return change.enabled ? 'Yes, turn it on' : 'Yes, turn it off';
    case 'save-phrase': return 'Yes, save this phrase';
    case 'enable-persistence': return 'Yes, remember on this device';
    case 'delete-all-saved': return 'Yes, delete everything saved';
    case 'clear-session-learning': return 'Yes, clear session learning';
    case 'suppress-dimension': return "Yes, don't learn this";
  }
}

export function targetsFor(s: State): Target[] {
  if (s.phase !== 'active') return [];
  const surface = currentSurface(s);
  switch (surface.kind) {
    case 'board': return boardTargets(s);
    case 'guide': return guideTargets(s, surface.page);
    case 'quick': return quickTargets(s, surface.page);
    case 'compose': return composeTargets(s, surface);
    case 'compose-clear': return [
      { id: 'cc-keep', label: 'Keep my text', enabled: true, command: { type: 'back' }, region: 'review', tone: 'cancel' },
      { id: 'cc-clear', label: 'Clear all text', enabled: true, command: { type: 'compose-clear-confirm' }, region: 'review', requiresArming: true },
    ];
    case 'initiate': return initiateTargets(s);
    case 'initiate-topics': return initiateTopicTargets(s, surface.mode);
    case 'tools': return toolsTargets(s);
    case 'history': return historyTargets(s);
    case 'preferences': return prefsTargets(s);
    case 'style-edit': return styleEditTargets(s, surface.key);
    case 'scope': return scopeTargets(s);
    case 'memory': return memoryTargets(s);
    case 'proposal': {
      const p = s.proposals.find((x) => x.id === surface.proposalId);
      if (!p) return [back()];
      return [
        { id: 'pr-back', label: 'Back', enabled: true, command: { type: 'back' }, region: 'review', tone: 'cancel' },
        { id: 'pr-not-now', label: 'Not now', enabled: true, command: { type: 'proposal-decision', proposalId: p.id, decision: 'not-now' }, region: 'review' },
        { id: 'pr-no', label: "No, don't learn that", enabled: true, command: { type: 'request-change', change: { kind: 'suppress-dimension', key: p.proposedSetting.key, proposalId: p.id } }, region: 'review' },
        { id: 'pr-yes', label: 'Yes, remember this', enabled: true, command: { type: 'request-change', change: { kind: 'save-preference', setting: p.proposedSetting, scope: p.scope, origin: 'approved-proposal', proposalId: p.id } }, region: 'review' },
      ];
    }
    case 'confirm-change': return confirmTargets(confirmLabel(surface.change));
    case 'controls': return controlsTargets(s);
    case 'metrics': return [
      { id: 'mt-export', label: 'Download measurements (no message text)', enabled: s.metrics.length > 0, command: { type: 'export-metrics' }, region: 'menu' },
      back(),
    ];
    case 'review': {
      const fromCandidate = s.review?.origin.kind === 'candidate';
      return [
        { id: 'rv-cancel', label: 'Cancel', enabled: true, command: { type: 'review-cancel' }, region: 'review', tone: 'cancel' },
        { id: 'rv-speak', label: 'Speak', enabled: !!s.review, command: { type: 'review-speak' }, region: 'review', requiresArming: true, tone: 'speak' },
        { id: 'rv-change', label: 'Change wording', enabled: !!s.review, command: { type: 'open', surface: { kind: 'change-wording' } }, region: 'review',
          detail: fromCandidate ? 'Shorter, different tone, or edit' : 'Edit the text' },
      ];
    }
    case 'change-wording': {
      const fromCandidate = s.review?.origin.kind === 'candidate' && s.settings.aiMode !== 'local-only';
      return [
        { id: 'cw-shorter', label: 'Same idea, shorter', enabled: fromCandidate, command: { type: 'refine-candidate', mode: 'shorter' }, region: 'menu' },
        { id: 'cw-tone', label: 'Same idea, different tone', enabled: fromCandidate, command: { type: 'refine-candidate', mode: 'different-tone' }, region: 'menu' },
        { id: 'cw-edit', label: 'Edit it myself', enabled: true, command: { type: 'edit-review-text' }, region: 'menu' },
        back(),
      ];
    }
    case 'speaking': return [{ id: 'sp-stop', label: 'Stop speaking', enabled: true, command: { type: 'stop-speech' }, region: 'safety', tone: 'cancel' }];
    case 'paused': return [{ id: 'pa-resume', label: 'Resume', enabled: true, command: { type: 'resume' }, region: 'safety' }];
    case 'end-confirm': return [
      { id: 'end-cancel', label: 'Keep this session', enabled: true, command: { type: 'back' }, region: 'review', tone: 'cancel' },
      { id: 'end-confirm', label: 'End session and clear the conversation', enabled: true, command: { type: 'end-session' }, region: 'review', requiresArming: true },
    ];
  }
}
