// Explicit, deterministic demo fixtures. Only used when the client requests fixture mode,
// and always labeled 'demo-fixture'. Never substituted for a failed live request.
import type { CandidateAct, ReplyRequest, ReplyResponseData } from '@/core/types';
import { normalizeForDuplicate } from '@/core/limits';

type F = { text: string; act: CandidateAct; summary: string };
const f = (text: string, act: CandidateAct, summary: string): F => ({ text, act, summary });

const REPLY_DEFAULT: F[] = [
  f('Yes, that works for me.', 'accept', 'Accept the offer.'),
  f('No, not this time.', 'decline', 'Decline for now.'),
  f('Can you tell me more first?', 'question', 'Ask for details before deciding.'),
  f('Maybe, if we can keep it short.', 'conditional', 'Accept on a condition.'),
  f('Could we do it another time instead?', 'alternative', 'Propose a different time.'),
  f("I'd rather not decide right now.", 'boundary', 'Defer the decision.'),
  f('What were you thinking of?', 'question', 'Ask what the partner has in mind.'),
  f('Can we talk about something else?', 'topic-change', 'Change the subject.'),
  f('Let me think about it for a minute.', 'other', 'Ask for time to think.'),
];

const BY_INTENT: Record<string, F[]> = {
  agree: [
    f("Yes, I'm in.", 'accept', 'Agree plainly.'),
    f('Yes, as long as it is not too late.', 'conditional', 'Agree with a condition about timing.'),
    f('Sounds good. Who else is coming?', 'accept', 'Agree and ask who else is involved.'),
    f('I agree with that.', 'accept', 'State agreement.'),
    f("Yes, let's do it.", 'accept', 'Agree with enthusiasm.'),
    f('Sure, if you can help me get ready.', 'conditional', 'Agree and ask for help.'),
  ],
  disagree: [
    f("No, I don't think so.", 'decline', 'Disagree plainly.'),
    f('I see it differently.', 'decline', 'Signal a different view without detail.'),
    f("That doesn't work for me.", 'boundary', 'Set a boundary.'),
    f("I disagree, but I'm happy to talk about it.", 'decline', 'Disagree and invite discussion.'),
    f('No. Please respect that.', 'boundary', 'Decline firmly.'),
    f('Why do you think that?', 'question', 'Challenge with a question.'),
  ],
  'ask-question': [
    f('What time were you thinking?', 'question', 'Ask about timing.'),
    f('Who else will be there?', 'question', 'Ask who is involved.'),
    f('Why do you ask?', 'question', 'Ask about the reason for the question.'),
    f('Can you say more about that?', 'question', 'Ask for more detail.'),
    f('Where would we go?', 'question', 'Ask about the place.'),
    f('What do you think?', 'question', "Ask for the partner's opinion."),
  ],
  'suggest-alternative': [
    f('Could we do it tomorrow instead?', 'alternative', 'Propose tomorrow.'),
    f('How about we stay in tonight?', 'alternative', 'Propose staying in.'),
    f('Can we plan something for the weekend?', 'alternative', 'Propose the weekend.'),
    f('What if we keep it short?', 'alternative', 'Propose a shorter version.'),
    f('Could you come over here instead?', 'alternative', 'Propose meeting here.'),
    f("Let's pick a different day.", 'alternative', 'Propose a different day.'),
  ],
  'express-need': [
    f('I need a short break.', 'request', 'Ask for a break.'),
    f('I need more time to answer.', 'request', 'Ask for more time.'),
    f('Could you move a little closer?', 'request', 'Ask the partner to come closer.'),
    f('Can you help me get comfortable?', 'request', 'Ask for help with comfort.'),
    f('Please speak a little slower.', 'request', 'Ask the partner to slow down.'),
    f('I need some quiet for a minute.', 'request', 'Ask for quiet.'),
  ],
  'change-topic': [
    f('Can we talk about something else?', 'topic-change', 'Ask to change the subject.'),
    f("Let's change the subject.", 'topic-change', 'Change the subject.'),
    f('Tell me about your day instead.', 'topic-change', "Redirect to the partner's day."),
    f('I want to talk about something different.', 'topic-change', 'Signal a new topic.'),
  ],
  explain: [
    f('Let me explain what I mean.', 'other', 'Offer to explain.'),
    f("There's more to it than that.", 'other', 'Signal there is more context.'),
    f("It's complicated. Give me a moment to explain.", 'other', 'Ask for time to explain.'),
    f('I meant something different.', 'other', 'Clarify a misunderstanding.'),
  ],
};

const INITIATE: Record<string, F[]> = {
  'ask-question': [
    f('How was your day?', 'question', "Ask about the partner's day."),
    f('What have you been up to?', 'question', 'Ask what the partner has been doing.'),
    f('Can I ask you something?', 'question', 'Open with a request to ask.'),
    f('What are you reading or watching lately?', 'question', 'Ask about media.'),
  ],
  'tell-something': [
    f('I wanted to tell you something.', 'social', 'Announce something to share.'),
    f('I have something to say.', 'social', 'Signal wanting to speak.'),
    f("There's something on my mind.", 'social', 'Signal a thought to share.'),
  ],
  'share-thought': [
    f("I've been thinking about something.", 'social', 'Introduce a thought.'),
    f('Here is a thought.', 'social', 'Share a thought.'),
    f('I had an idea.', 'social', 'Introduce an idea.'),
  ],
  'make-request': [
    f('Could you help me with something?', 'request', 'Ask for help.'),
    f('Can you do me a favor?', 'request', 'Ask for a favor.'),
    f('Would you sit with me for a bit?', 'request', 'Ask for company.'),
  ],
  'tell-joke': [
    f('Want to hear a joke?', 'social', 'Offer a joke.'),
    f("Why don't skeletons fight? They don't have the guts.", 'social', 'Tell a generic pun.'),
    f('I have a terrible joke for you.', 'social', 'Set up a joke.'),
  ],
};

function interestPool(seed: string | null): F[] {
  if (!seed) {
    return [
      f('Can we talk about something I like?', 'topic-change', 'Invite talking about an interest.'),
      f("I'd like to talk about one of my interests.", 'topic-change', 'Introduce an interest generically.'),
      f('Want to hear about something I enjoy?', 'social', 'Offer to share an interest.'),
    ];
  }
  return [
    f(`Can we talk about ${seed}?`, 'topic-change', 'Invite talking about the approved interest.'),
    f(`Have you heard anything new about ${seed}?`, 'question', 'Ask the partner about the interest.'),
    f(`I've been thinking about ${seed}.`, 'social', 'Bring up the approved interest.'),
  ];
}

function earlierPool(seed: string | null): F[] {
  if (!seed) {
    return [
      f('Can we go back to something from before?', 'topic-change', 'Return to an earlier topic, generically.'),
      f('I want to come back to an earlier topic.', 'topic-change', 'Signal returning to a topic.'),
      f('About what we said earlier, can we talk more?', 'topic-change', 'Invite revisiting the conversation.'),
    ];
  }
  const clip = seed.length > 60 ? `${seed.slice(0, 57)}…` : seed;
  return [
    f('Can we go back to what we said earlier?', 'topic-change', 'Return to the earlier turn.'),
    f(`I want to come back to this: "${clip}"`, 'topic-change', 'Quote the earlier turn to revisit it.'),
    f('I have more to say about that earlier topic.', 'social', 'Signal more to say about it.'),
  ];
}

function seedPool(seed: string): F[] {
  return [
    f(`About ${seed}: what do you think?`, 'question', 'Ask the partner about the topic.'),
    f(`I want to talk about ${seed}.`, 'topic-change', 'Bring up the topic.'),
    f(`Can we come back to ${seed} later?`, 'alternative', 'Defer the topic.'),
    f(`${seed[0].toUpperCase()}${seed.slice(1)}, please.`, 'request', 'Request the topic directly.'),
  ];
}

function refinePool(r: ReplyRequest): F[] {
  const t = r.refineTarget!;
  const m = t.meaning;
  const base = t.text.replace(/[.!?]+$/, '');
  if (t.mode === 'shorter') {
    const words = base.split(/\s+/);
    const first = base.split(/[,;:—-]/)[0].trim();
    return [
      f(`${first}.`, m.act, m.summary),
      f(`${words.slice(0, Math.max(2, Math.ceil(words.length / 2))).join(' ')}.`, m.act, m.summary),
      f(`${words.slice(0, Math.max(2, Math.ceil(words.length * 0.7))).join(' ')}.`, m.act, m.summary),
    ];
  }
  return [
    f(`Honestly, ${base[0].toLowerCase()}${base.slice(1)}.`, m.act, m.summary),
    f(`${base}, if that's okay.`, m.act, m.summary),
    f(`${base}!`, m.act, m.summary),
  ];
}

export function fixtureReplies(r: ReplyRequest): ReplyResponseData {
  let pool: F[];
  if (r.refineTarget) pool = refinePool(r);
  else if (r.guidance.userTopicOrSeed) pool = seedPool(r.guidance.userTopicOrSeed);
  else if (r.anchor.mode === 'initiate') {
    const c = r.anchor.category;
    pool = c === 'approved-interest' ? interestPool(r.anchor.userTopicOrSeed)
      : c === 'earlier-topic' ? earlierPool(r.anchor.userTopicOrSeed)
        : INITIATE[c] ?? INITIATE['tell-something'];
  } else pool = (r.guidance.intent && BY_INTENT[r.guidance.intent]) || REPLY_DEFAULT;

  const offered = new Set(r.rejected.flatMap((b) => b.candidates.map((c) => normalizeForDuplicate(c.text))));
  const fresh = pool.filter((p) => !offered.has(normalizeForDuplicate(p.text)));
  // Deterministic: fresh items in order, then wrap around the pool if fewer than three remain.
  const picked: F[] = [];
  for (const p of [...fresh, ...pool]) {
    if (picked.length === 3) break;
    if (!picked.some((x) => normalizeForDuplicate(x.text) === normalizeForDuplicate(p.text))) picked.push(p);
  }
  while (picked.length < 3) picked.push(REPLY_DEFAULT[picked.length]);
  return {
    candidates: picked.map((p) => ({ text: p.text, meaning: { act: p.act, summary: p.summary } })),
    source: 'demo-fixture',
    model: null,
    repaired: false,
  };
}
