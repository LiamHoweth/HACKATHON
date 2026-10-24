// Explicit fixture-demo replies: deterministic, labeled 'demo-fixture', question-aware.
// These check fixture content rules, not model behavior.
import { describe, expect, it } from 'vitest';
import type { CandidateAct, Intent, LengthPolicy, ReplyRequest } from '@/core/types';
import { LENGTH_POLICIES, wordCount } from '@/core/limits';
import { checkModelOutput } from '@/server/validation';
import { fixtureReplies, matchTopic, TOPIC_SETS } from '@/server/fixtures';

const req = (activePartnerText: string | null, over: Partial<ReplyRequest> = {}): ReplyRequest => ({
  identity: { sessionEpoch: 'e1', workspaceId: 'w1', requestId: 'r1', contextRevision: 1, preferenceRevision: 0 },
  mode: 'fixture',
  anchor: { mode: 'reply', turnId: 't1', turnContentRevision: 0 },
  activePartnerText,
  language: 'en-US',
  recentConversation: activePartnerText ? [{ role: 'partner', text: activePartnerText, source: 'partner-typed' }] : [],
  approvedProfile: [],
  guidance: { intent: null, wording: [], userTopicOrSeed: null, scope: { relationship: null, setting: null } },
  approvedPreferences: [],
  sessionStyleHints: [],
  rejected: [],
  refineTarget: null,
  lengthPolicy: LENGTH_POLICIES.short,
  ...over,
});

const withIntent = (intent: Intent) => ({ intent, wording: [], userTopicOrSeed: null, scope: { relationship: null, setting: null } });

// One representative demo/judge question per set.
const QUESTIONS: Record<string, string> = {
  medication: 'The doctor wants to change your medication. Is that okay?',
  food: 'Are you coming to dinner tonight?',
  screen: 'Want to watch a movie later?',
  music: 'Should I put on some music?',
  outside: 'Do you want to go for a walk in the park?',
  weather: 'Did you see the weather? It is supposed to rain.',
  plans: 'What are your plans for the weekend?',
  opinion: 'What do you think about the new paint color?',
  help: 'Do you need anything?',
  wellbeing: 'How are you feeling today?',
};

/** Runs the first batch plus `rejections` "None of these" rounds, validating each against checkModelOutput. */
function rounds(base: ReplyRequest, rejections: number) {
  const batches: ReturnType<typeof fixtureReplies>[] = [];
  let r = base;
  for (let i = 0; i <= rejections; i++) {
    const out = fixtureReplies(r);
    const check = checkModelOutput({ candidates: out.candidates }, r);
    expect(check, `round ${i + 1}: ${JSON.stringify(out.candidates)}`).toMatchObject({ ok: true });
    batches.push(out);
    r = { ...r, rejected: [...r.rejected, { candidates: out.candidates, feedback: 'none-fit' }] };
  }
  return batches;
}

const within = (text: string, p: LengthPolicy) => wordCount(text) <= p.maxWords && text.length <= p.maxCharacters;

describe('question-aware fixture sets', () => {
  it('covers every set with a matching question', () => {
    expect(Object.keys(QUESTIONS).sort()).toEqual(TOPIC_SETS.map((s) => s.id).sort());
    for (const [id, q] of Object.entries(QUESTIONS)) expect(matchTopic(q)?.id, q).toBe(id);
  });

  it('each set has at least 9 replies with diverse acts', () => {
    for (const set of TOPIC_SETS) {
      expect(set.replies.length, set.id).toBeGreaterThanOrEqual(9);
      expect(new Set(set.replies.map((x) => x.act)).size, set.id).toBeGreaterThanOrEqual(set.safetyLocked ? 4 : 6);
    }
  });

  it.each(Object.entries(QUESTIONS))('%s: three valid, labeled, short candidates', (_id, q) => {
    const out = fixtureReplies(req(q));
    expect(out.source).toBe('demo-fixture');
    expect(out.model).toBeNull();
    expect(out.candidates).toHaveLength(3);
    for (const c of out.candidates) expect(within(c.text, LENGTH_POLICIES.short), c.text).toBe(true);
  });

  it.each(Object.entries(QUESTIONS))('%s: three rejections give 12 distinct texts and fresh meanings', (_id, q) => {
    const batches = rounds(req(q), 3);
    const texts = batches.flatMap((b) => b.candidates.map((c) => c.text));
    expect(new Set(texts).size).toBe(texts.length);
    // The first three batches come from the question's own set, each with three different meanings.
    for (const b of batches.slice(0, 3)) expect(new Set(b.candidates.map((c) => c.meaning.summary)).size).toBe(3);
  });

  it.each(Object.entries(QUESTIONS))('%s: detailed policy allows longer, still-valid variants', (_id, q) => {
    const shortOut = rounds(req(q), 2).flatMap((b) => b.candidates);
    const longOut = rounds(req(q, { lengthPolicy: LENGTH_POLICIES.detailed }), 2).flatMap((b) => b.candidates);
    for (const c of longOut) expect(within(c.text, LENGTH_POLICIES.detailed), c.text).toBe(true);
    const total = (cs: typeof longOut) => cs.reduce((n, c) => n + wordCount(c.text), 0);
    expect(total(longOut)).toBeGreaterThan(total(shortOut));
    expect(longOut.some((c) => wordCount(c.text) > LENGTH_POLICIES.short.maxWords - 3)).toBe(true);
  });

  it('is deterministic', () => {
    expect(fixtureReplies(req(QUESTIONS.food))).toEqual(fixtureReplies(req(QUESTIONS.food)));
  });
});

describe('medication set is clarification and boundary only', () => {
  const CONSENT = /\b(yes|yeah|ok|okay|sure|fine|agree|agreed|go ahead|sounds good|that works|i'll take|i will take|let's do it|do it)\b/i;
  const ALLOWED: CandidateAct[] = ['question', 'boundary', 'request', 'alternative', 'other'];
  const intents: Array<Intent | null> = [null, 'agree', 'disagree', 'ask-question', 'express-need', 'suggest-alternative', 'other'];

  it.each(intents)('intent %s: no accept or consent wording across four rounds', (intent) => {
    for (const lengthPolicy of [LENGTH_POLICIES.short, LENGTH_POLICIES.detailed]) {
      const base = req(QUESTIONS.medication, { lengthPolicy, ...(intent ? { guidance: withIntent(intent) } : {}) });
      for (const c of rounds(base, 3).flatMap((b) => b.candidates)) {
        expect(ALLOWED, c.text).toContain(c.meaning.act);
        expect(c.text.replace(/[’]/g, "'"), c.text).not.toMatch(CONSENT);
      }
    }
  });

  it('wins over other keywords in the same question', () => {
    expect(matchTopic('Can you take your pills before dinner?')?.id).toBe('medication');
  });
});

describe('explicit intent and fallbacks', () => {
  it('disagree intent yields only disagree-compatible candidates for three rounds', () => {
    for (const q of [QUESTIONS.food, QUESTIONS.screen, QUESTIONS.plans, 'Something unrelated entirely.']) {
      const cs = rounds(req(q, { guidance: withIntent('disagree') }), 2).flatMap((b) => b.candidates);
      for (const c of cs) expect(['decline', 'boundary', 'question'], `${q} -> ${c.text}`).toContain(c.meaning.act);
      expect(cs.some((c) => c.meaning.act === 'accept' || c.meaning.act === 'conditional')).toBe(false);
    }
  });

  it('topic replies under an intent keep the matching act', () => {
    const cs = rounds(req(QUESTIONS.food, { guidance: withIntent('ask-question') }), 2).flatMap((b) => b.candidates);
    expect(cs.every((c) => c.meaning.act === 'question')).toBe(true);
    expect(cs[0].text).toBe('What are we having?');
  });

  it('an unknown question falls back to the default set', () => {
    const q = 'Did the package arrive?';
    expect(matchTopic(q)).toBeNull();
    expect(fixtureReplies(req(q)).candidates.map((c) => c.text)).toEqual([
      'Yes, that works for me.', 'No, not this time.', 'Can you tell me more first?',
    ]);
    expect(fixtureReplies(req(null)).candidates[0].text).toBe('Yes, that works for me.');
  });

  it('does not match keywords inside other words', () => {
    expect(matchTopic('That is a great seat.')).toBeNull(); // "eat" inside "great"/"seat"
    expect(matchTopic('The weather is nice')?.id).toBe('weather'); // not food via "eat"
  });

  it('initiation and seeds are unaffected by partner keywords', () => {
    const initiate = req('Want dinner?', { anchor: { mode: 'initiate', topicId: 'x', category: 'tell-joke', userTopicOrSeed: null } });
    expect(fixtureReplies(initiate).candidates[0].text).toBe('Want to hear a joke?');
    const seeded = req('Want dinner?', { guidance: { intent: null, wording: [], userTopicOrSeed: 'the garden', scope: { relationship: null, setting: null } } });
    expect(fixtureReplies(seeded).candidates[0].text).toContain('the garden');
  });
});

describe('branching flow fixtures ("Other ways to answer")', () => {
  const PATH_QUESTIONS = [...Object.values(QUESTIONS), 'How was your day?', 'Is the blue one better?'];

  it.each(PATH_QUESTIONS)('%s: branching gives 2 valid candidates and 3-5 distinct paths', (q) => {
    const r = req(q, { branching: true });
    const out = fixtureReplies(r);
    expect(out.source).toBe('demo-fixture');
    expect(out.candidates).toHaveLength(2);
    expect(out.paths!.length).toBeGreaterThanOrEqual(3);
    expect(out.paths!.length).toBeLessThanOrEqual(5);
    expect(checkModelOutput({ candidates: out.candidates, paths: out.paths }, r)).toMatchObject({ ok: true });
    for (const p of out.paths!) {
      expect(wordCount(p.label), p.label).toBeLessThanOrEqual(3);
      expect(p.summary.length).toBeGreaterThan(0);
    }
    // A path label is never one of the two top replies.
    const top = new Set(out.candidates.map((c) => c.text.toLowerCase()));
    for (const p of out.paths!) expect(top.has(p.label.toLowerCase())).toBe(false);
  });

  it('uses the demo directions for "How was your day?" and dinner', () => {
    expect(fixtureReplies(req('How was your day?', { branching: true })).paths!.map((p) => p.label))
      .toEqual(['It was great', 'Rough day', 'Pretty normal', 'Ask about theirs', 'Not now']);
    expect(fixtureReplies(req(QUESTIONS.food, { branching: true })).paths!.map((p) => p.label))
      .toContain('Running late');
  });

  it('every offered path resolves to 3 valid candidates when chosen (pathHint), with no paths', () => {
    for (const q of PATH_QUESTIONS) {
      for (const p of fixtureReplies(req(q, { branching: true })).paths!) {
        const r = req(q, { branching: true, pathHint: p });
        const out = fixtureReplies(r);
        expect(out.paths).toBeUndefined();
        expect(out.candidates).toHaveLength(3);
        expect(checkModelOutput({ candidates: out.candidates }, r), `${q} / ${p.label}`).toMatchObject({ ok: true });
      }
    }
  });

  it('an unknown pathHint label falls back to generic, harmless replies keyed off the label', () => {
    const r = req(QUESTIONS.food, { pathHint: { label: 'Ask what time', summary: 'Ask when dinner is' } });
    const out = fixtureReplies(r);
    expect(out.candidates).toHaveLength(3);
    expect(out.candidates.every((c) => c.meaning.act === 'question')).toBe(true);
    expect(checkModelOutput({ candidates: out.candidates }, r)).toMatchObject({ ok: true });
    const other = fixtureReplies(req(QUESTIONS.food, { pathHint: { label: 'Totally random', summary: 'Something' } }));
    expect(other.candidates).toHaveLength(3);
  });

  it('medication branching stays clarification/boundary only', () => {
    const out = fixtureReplies(req(QUESTIONS.medication, { branching: true }));
    const acts: CandidateAct[] = ['question', 'boundary', 'request', 'alternative', 'other'];
    expect(out.candidates.every((c) => acts.includes(c.meaning.act))).toBe(true);
    for (const p of out.paths!) {
      for (const c of fixtureReplies(req(QUESTIONS.medication, { pathHint: p })).candidates) {
        expect(acts.includes(c.meaning.act), c.text).toBe(true);
      }
    }
  });

  it('is deterministic and leaves normal mode unchanged', () => {
    const r = req(QUESTIONS.food, { branching: true });
    expect(fixtureReplies(r)).toEqual(fixtureReplies(r));
    expect(fixtureReplies(req(QUESTIONS.food, { branching: false }))).toEqual(fixtureReplies(req(QUESTIONS.food)));
    expect(fixtureReplies(req(QUESTIONS.food)).paths).toBeUndefined();
  });
});
