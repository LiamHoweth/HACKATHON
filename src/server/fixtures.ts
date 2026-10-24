// Explicit, deterministic demo fixtures. Only used when the client requests fixture mode,
// and always labeled 'demo-fixture'. Never substituted for a failed live request.
import type { CandidateAct, Intent, LengthPolicy, ReplyRequest, ReplyResponseData } from '@/core/types';
import { LENGTH_POLICIES, normalizeForDuplicate, wordCount } from '@/core/limits';

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
    f('That works for me.', 'accept', 'Agree that it works.'),
    f('Okay, if we can take it slowly.', 'conditional', 'Agree on a condition about pace.'),
    f('Good idea. Count me in.', 'accept', 'Agree and join in.'),
  ],
  disagree: [
    f("No, I don't think so.", 'decline', 'Disagree plainly.'),
    f('I see it differently.', 'decline', 'Signal a different view without detail.'),
    f("That doesn't work for me.", 'boundary', 'Set a boundary.'),
    f("I disagree, but I'm happy to talk about it.", 'decline', 'Disagree and invite discussion.'),
    f('No. Please respect that.', 'boundary', 'Decline firmly.'),
    f('Why do you think that?', 'question', 'Challenge with a question.'),
    f('Not for me, thanks.', 'decline', 'Decline politely.'),
    f("I'd like to keep things as they are.", 'boundary', 'Prefer no change.'),
    f("I'm not on board with that.", 'decline', 'State disagreement directly.'),
  ],
  'ask-question': [
    f('What time were you thinking?', 'question', 'Ask about timing.'),
    f('Who else will be there?', 'question', 'Ask who is involved.'),
    f('Why do you ask?', 'question', 'Ask about the reason for the question.'),
    f('Can you say more about that?', 'question', 'Ask for more detail.'),
    f('Where would we go?', 'question', 'Ask about the place.'),
    f('What do you think?', 'question', "Ask for the partner's opinion."),
    f('How long would it take?', 'question', 'Ask about duration.'),
    f('What made you think of that?', 'question', 'Ask what prompted the idea.'),
    f('Is there a reason it has to be now?', 'question', 'Ask about the urgency.'),
  ],
  'suggest-alternative': [
    f('Could we do it tomorrow instead?', 'alternative', 'Propose tomorrow.'),
    f('How about we stay in tonight?', 'alternative', 'Propose staying in.'),
    f('Can we plan something for the weekend?', 'alternative', 'Propose the weekend.'),
    f('What if we keep it short?', 'alternative', 'Propose a shorter version.'),
    f('Could you come over here instead?', 'alternative', 'Propose meeting here.'),
    f("Let's pick a different day.", 'alternative', 'Propose a different day.'),
    f('Could we try something quieter?', 'alternative', 'Propose something quieter.'),
    f('Maybe later this week instead?', 'alternative', 'Propose later in the week.'),
    f('How about just the two of us?', 'alternative', 'Propose a smaller group.'),
  ],
  'express-need': [
    f('I need a short break.', 'request', 'Ask for a break.'),
    f('I need more time to answer.', 'request', 'Ask for more time.'),
    f('Could you move a little closer?', 'request', 'Ask the partner to come closer.'),
    f('Can you help me get comfortable?', 'request', 'Ask for help with comfort.'),
    f('Please speak a little slower.', 'request', 'Ask the partner to slow down.'),
    f('I need some quiet for a minute.', 'request', 'Ask for quiet.'),
    f('Could you repeat that, please?', 'request', 'Ask the partner to repeat.'),
    f('Please wait while I answer.', 'request', 'Ask the partner to wait.'),
    f('I need you to ask me directly.', 'boundary', 'Ask to be addressed directly.'),
  ],
  'change-topic': [
    f('Can we talk about something else?', 'topic-change', 'Ask to change the subject.'),
    f("Let's change the subject.", 'topic-change', 'Change the subject.'),
    f('Tell me about your day instead.', 'topic-change', "Redirect to the partner's day."),
    f('I want to talk about something different.', 'topic-change', 'Signal a new topic.'),
    f("What's new with you?", 'topic-change', "Ask about the partner's news."),
    f('Can we come back to this later?', 'topic-change', 'Set the topic aside for later.'),
    f('Tell me something good.', 'topic-change', 'Invite a lighter topic.'),
    f('Have you heard any good news lately?', 'topic-change', 'Move to recent news.'),
    f("Let's talk about something fun.", 'topic-change', 'Invite a fun topic.'),
  ],
  explain: [
    f('Let me explain what I mean.', 'other', 'Offer to explain.'),
    f("There's more to it than that.", 'other', 'Signal there is more context.'),
    f("It's complicated. Give me a moment to explain.", 'other', 'Ask for time to explain.'),
    f('I meant something different.', 'other', 'Clarify a misunderstanding.'),
    f('Let me say it another way.', 'other', 'Offer to rephrase.'),
    f('That is not quite what I meant.', 'other', 'Correct a misreading.'),
    f('Here is why I said that.', 'other', 'Offer the reason behind a reply.'),
    f('Can I add something to that?', 'other', 'Ask to add context.'),
    f('Let me start from the beginning.', 'other', 'Offer to explain from the start.'),
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

// ---- Question-aware reply sets ------------------------------------------------------------
// Picked by simple keyword matching on the partner's active question (lowercased). Generic and
// synthetic: no personal facts, memories, symptoms, or relationships. Each set is ordered so the
// first three batches ("None of these" twice more) each offer three different meanings.
// `long` is used only when the length policy is longer than the short default.
type T = F & { long?: string };
const t = (text: string, act: CandidateAct, summary: string, long?: string): T => ({ text, act, summary, long });

type TopicSet = { id: string; match: RegExp; replies: T[]; safetyLocked?: boolean };

// Order matters: the first matching set wins. Medication is checked first so a consequential
// question can never fall through to a set that offers consent.
export const TOPIC_SETS: TopicSet[] = [
  {
    id: 'medication',
    safetyLocked: true,
    match: /\b(medications?|medicines?|meds|pills?|tablets?|doses?|dosage|prescriptions?|doctors?|dr\.?|nurses?|pharmacy|injections?|treatments?|side effects?)\b/,
    replies: [
      t('What is this one for?', 'question', 'Ask what the medication is for.',
        'What is this one for? I would like to understand it before anything else happens.'),
      t('I want to talk to the doctor first.', 'boundary', 'Ask to speak with the doctor before anything changes.',
        'I would like to talk with the doctor directly before anything changes.'),
      t('Can you write down what they said?', 'request', 'Ask for the information in writing.',
        'Can you write down exactly what was said, so I can read it myself?'),
      t('What are the side effects?', 'question', 'Ask about possible side effects.',
        'What are the possible side effects, and are there any other options?'),
      t('Can we ask the doctor together?', 'alternative', 'Propose asking the doctor together.',
        'Can we ask the doctor together next time, so I can hear it too?'),
      t('Please don’t decide this for me.', 'boundary', 'Insist on being part of the decision.',
        'Please don’t decide this for me. I want to be part of every decision about it.'),
      t('Is this a change from before?', 'question', 'Ask whether something has changed.',
        'Is this a change from before? If it is, I would like to know why.'),
      t('Please give me time to think.', 'request', 'Ask for time before anything is done.',
        'Please give me some time to think before we do anything.'),
      t('I need more information first.', 'other', 'Say more information is needed before answering.',
        'I need more information before I can answer that.'),
      t('I’m not deciding anything yet.', 'boundary', 'Hold off on any decision for now.',
        'I’m not deciding anything yet. Let’s go over it step by step.'),
    ],
  },
  {
    id: 'food',
    match: /\b(dinner|lunch|breakfast|brunch|supper|eat|eating|food|hungry|meals?|snacks?|cook|cooking)\b/,
    replies: [
      t('Yes, that sounds good.', 'accept', 'Accept the meal.',
        'Yes, that sounds good to me. Just let me know when it’s ready.'),
      t('Not right now, thanks.', 'decline', 'Decline for now.',
        'Not right now, thanks. I would rather wait a little while before eating.'),
      t('What are we having?', 'question', 'Ask what the food is.',
        'What are we having? I would like to know before I decide.'),
      t('Could we eat a little later?', 'alternative', 'Propose eating later.',
        'Could we eat a little later instead? I’m not quite ready yet.'),
      t('Sure, if it’s something simple.', 'conditional', 'Accept if the food is simple.',
        'Sure, as long as it’s something simple. Nothing too heavy, please.'),
      t('I’d like to choose for myself.', 'boundary', 'Ask to make the food choice personally.',
        'I would like to choose what I eat myself. Can you tell me the options?'),
      t('Only if there’s dessert.', 'social', 'Make a light joke about dessert.',
        'Only if there’s dessert afterward. That is my one condition.'),
      t('Who else is eating with us?', 'question', 'Ask who else will be there.',
        'Who else is eating with us? I would like to know who is coming.'),
      t('Just a small portion, please.', 'request', 'Ask for a small portion.',
        'Just a small portion for me, please. I can always ask for more later.'),
      t('Can we talk about something else?', 'topic-change', 'Change the subject.',
        'Can we talk about something else for now? I will think about food later.'),
    ],
  },
  {
    id: 'screen',
    match: /\b(movies?|films?|watch|watching|tv|television|tv shows?|series|episodes?|documentary)\b/,
    replies: [
      t('Yes, let’s watch something.', 'accept', 'Accept watching something.',
        'Yes, let’s watch something together. I’m happy to start whenever you are.'),
      t('I’ll pass this time.', 'decline', 'Decline watching for now.',
        'I’ll pass this time, thanks. Maybe another day would be better.'),
      t('What did you have in mind?', 'question', 'Ask what they want to watch.',
        'What did you have in mind? Tell me a little about it first.'),
      t('Could we pick something lighter?', 'alternative', 'Propose something lighter.',
        'Could we pick something lighter instead? I’m not in the mood for anything heavy.'),
      t('Sure, if it’s not too long.', 'conditional', 'Accept if it is short.',
        'Sure, as long as it’s not too long. Something shorter would be good.'),
      t('Nothing scary for me, please.', 'boundary', 'Rule out scary content.',
        'Nothing scary or too intense for me, please. I would rather keep it calm.'),
      t('Only if I get the comfy seat.', 'social', 'Make a light joke about the best seat.',
        'Only if I get the comfy seat. Those are my terms.'),
      t('Can we turn on subtitles?', 'request', 'Ask for subtitles.',
        'Can we turn on subtitles, please? It helps me follow along.'),
      t('You pick this time.', 'other', 'Let the partner choose.',
        'You pick this time. I trust your choice, and I can tell you if it’s not for me.'),
      t('Can we just talk instead?', 'topic-change', 'Propose talking instead of watching.',
        'Could we skip the screen and just talk for a while instead?'),
    ],
  },
  {
    id: 'music',
    match: /\b(music|songs?|albums?|bands?|playlists?|radio|listen|listening|singing|concerts?)\b/,
    replies: [
      t('Yes, put something on.', 'accept', 'Accept putting music on.',
        'Yes, please put something on. Some music would be nice right now.'),
      t('I’d prefer quiet for now.', 'decline', 'Decline music for now.',
        'I would prefer some quiet for now, thanks. Maybe a little later.'),
      t('What were you thinking of playing?', 'question', 'Ask what they would play.',
        'What were you thinking of playing? Tell me a bit about it first.'),
      t('Something calm, maybe?', 'alternative', 'Propose calmer music.',
        'Could we put on something calm instead? Nothing too loud or busy.'),
      t('Sure, if it’s not too loud.', 'conditional', 'Accept if the volume stays low.',
        'Sure, as long as it’s not too loud. We can turn it up later if it’s good.'),
      t('I’d like to pick the music.', 'boundary', 'Ask to choose the music personally.',
        'I would like to pick the music myself this time. Can you show me the options?'),
      t('Only if you sing along.', 'social', 'Make a light joke about singing along.',
        'Only if you promise to sing along. Loudly, and slightly off key.'),
      t('Who sings this one?', 'question', 'Ask who the artist is.',
        'Who sings this one? I would like to know more about it.'),
      t('Could you turn it down a little?', 'request', 'Ask to lower the volume.',
        'Could you turn it down a little, please? It’s a bit much for me right now.'),
      t('Maybe later. What’s on your mind?', 'topic-change', 'Defer music and change the subject.',
        'Maybe later. For now I would rather hear what’s on your mind.'),
    ],
  },
  {
    id: 'outside',
    match: /\b(walks?|walking|stroll|outside|outdoors|park|garden|fresh air|go out|head out)\b/,
    replies: [
      t('Yes, some fresh air sounds nice.', 'accept', 'Accept going outside.',
        'Yes, some fresh air sounds nice. Let’s go whenever you’re ready.'),
      t('Not today, thanks.', 'decline', 'Decline going out today.',
        'Not today, thanks. I would rather stay in for now.'),
      t('How long would we be out?', 'question', 'Ask how long it would take.',
        'How long would we be out, and how far were you thinking of going?'),
      t('Could we sit by the window instead?', 'alternative', 'Propose sitting by the window.',
        'Could we sit by an open window instead? That might be enough for today.'),
      t('Sure, if it’s a short one.', 'conditional', 'Accept if it stays short.',
        'Sure, as long as it’s a short one and we can turn back whenever I want.'),
      t('I want to decide when we head back.', 'boundary', 'Keep control of when to return.',
        'If we go, I would like to be the one who decides when we head back.'),
      t('Only if you promise not to race me.', 'social', 'Make a light joke about racing.',
        'Only if you promise not to race me. Slow and steady wins this one.'),
      t('Can you help me get ready first?', 'request', 'Ask for help getting ready.',
        'Can you help me get ready first? I would like a jacket, just in case.'),
      t('Who else is coming?', 'question', 'Ask who else is coming.',
        'Who else is coming along? I would like to know before we go.'),
      t('Maybe later. What’s new with you?', 'topic-change', 'Defer and change the subject.',
        'Maybe later. First, tell me what’s new with you.'),
    ],
  },
  {
    id: 'weather',
    match: /\b(weather|forecast|rain|raining|rainy|snow|snowing|snowy|sunny|windy|storms?|stormy|temperature)\b/,
    replies: [
      t('What’s it like out there?', 'question', 'Ask what the weather is like.',
        'What’s it like out there right now? Tell me what you can see.'),
      t('Yes, I noticed that.', 'accept', 'Acknowledge the weather comment.',
        'Yes, I noticed that too. It’s hard to miss.'),
      t('Perfect weather for a nap.', 'social', 'Make a light joke about napping.',
        'Honestly, it sounds like perfect weather for a nap. Any weather is, really.'),
      t('Good day to stay in, maybe.', 'alternative', 'Suggest staying in.',
        'It might be a good day to stay in. We could find something to do here.'),
      t('If it clears up, let’s go out.', 'conditional', 'Go out only if the weather improves.',
        'If it clears up later, I would like to go outside for a bit.'),
      t('I’d rather stay inside today.', 'boundary', 'Prefer to stay inside.',
        'I would rather stay inside today, whatever the weather does.'),
      t('Could you help me see outside?', 'request', 'Ask to see outside.',
        'Could you help me see outside? I would like to look for myself.'),
      t('Should I bring a jacket?', 'question', 'Ask whether a jacket is needed.',
        'Should I bring a jacket if we go anywhere? What do you think?'),
      t('I’d rather not go out in it.', 'decline', 'Decline going out in the weather.',
        'I would rather not go out in it today, thanks.'),
      t('Enough about the weather. What’s new?', 'topic-change', 'Change the subject.',
        'Enough about the weather. Tell me something new instead.'),
    ],
  },
  {
    id: 'plans',
    match: /\b(weekend|saturday|sunday|plans?|planning|tomorrow|next week|later today|this evening)\b/,
    replies: [
      t('Nothing planned yet.', 'other', 'Say there are no plans yet.',
        'Nothing planned yet. I’m open to ideas if you have any.'),
      t('I’m open to doing something.', 'accept', 'Accept doing something together.',
        'I’m open to doing something together. Let me know what you’re thinking.'),
      t('What are your plans?', 'question', 'Ask about the partner’s plans.',
        'What are your plans? I would like to hear what you’re thinking first.'),
      t('Something quiet at home, maybe.', 'alternative', 'Suggest a quiet plan at home.',
        'Maybe something quiet at home. I’m not up for a busy day.'),
      t('Maybe, depending on the day.', 'conditional', 'Keep the plan conditional.',
        'Maybe, depending on how the day goes. Can we decide closer to the time?'),
      t('I’d like to keep my schedule open.', 'boundary', 'Keep the schedule open.',
        'I would like to keep my schedule open for now and decide later.'),
      t('Rest. Very ambitious plans.', 'social', 'Make a light joke about resting.',
        'Lots of rest. Very ambitious plans, I know. Try to keep up.'),
      t('Probably not this time.', 'decline', 'Decline the plan for now.',
        'Probably not this time, thanks. Maybe we can do something another week.'),
      t('Who else will be there?', 'question', 'Ask who else is involved.',
        'Who else will be there? That might help me decide.'),
      t('Let’s plan later. What’s new?', 'topic-change', 'Defer planning and change the subject.',
        'Let’s plan that later. For now, tell me what’s new with you.'),
    ],
  },
  {
    id: 'opinion',
    match: /\b(what do you think|do you think|your opinion|what are your thoughts|your thoughts|thoughts on|do you agree|how do you feel about)\b/,
    replies: [
      t('I think it’s a good idea.', 'accept', 'Agree it is a good idea.',
        'I think it’s a good idea, and I would be glad to go along with it.'),
      t('I’m not sure I like it.', 'decline', 'Express doubt.',
        'I’m not sure I like it. Something about it doesn’t sit right with me.'),
      t('What do you think first?', 'question', 'Ask for the partner’s view first.',
        'What do you think? I would like to hear your view before I give mine.'),
      t('It depends on the details.', 'conditional', 'Make the opinion depend on details.',
        'It depends on the details. Can you tell me a little more?'),
      t('Is there another way to do it?', 'alternative', 'Ask about other options.',
        'Is there another way to do it? I would like to hear the other options.'),
      t('I’d rather not say right now.', 'boundary', 'Keep the opinion private for now.',
        'I would rather not share my opinion right now, if that’s okay.'),
      t('I have opinions. Many opinions.', 'social', 'Make a light joke about having opinions.',
        'Oh, I have opinions. Many opinions. Pick a topic and get comfortable.'),
      t('I need a moment to think.', 'other', 'Ask for time to think.',
        'I need a moment to think about it before I answer.'),
      t('Why do you ask?', 'question', 'Ask why the partner wants to know.',
        'Why do you ask? I would like to know what you’re thinking.'),
      t('Let’s talk about something lighter.', 'topic-change', 'Change to a lighter subject.',
        'Can we talk about something lighter instead? I will come back to this.'),
    ],
  },
  {
    id: 'help',
    match: /\b(help|need anything|anything you need|need something|get you anything|get you something|can i get you|anything i can do|want anything)\b/,
    replies: [
      t('Yes, please.', 'accept', 'Accept the offer of help.',
        'Yes, please. I would appreciate a hand with something.'),
      t('No, I’m okay for now.', 'decline', 'Decline help for now.',
        'No, I’m okay for now, thanks. I will let you know if that changes.'),
      t('What were you thinking of?', 'question', 'Ask what kind of help is offered.',
        'What were you thinking of? Tell me what you had in mind.'),
      t('Some water would be nice.', 'request', 'Ask for water.',
        'Some water would be nice, please, whenever you have a moment.'),
      t('Could you check back in a bit?', 'alternative', 'Ask the partner to check back later.',
        'Could you check back in a little while? I may need something then.'),
      t('I’d like to try it myself first.', 'boundary', 'Try independently first.',
        'I would like to try it myself first. I will ask if I need you.'),
      t('Just your company is enough.', 'social', 'Ask only for company.',
        'Just your company is enough right now. Could you stay for a bit?'),
      t('If you have time, yes.', 'conditional', 'Accept if the partner has time.',
        'If you have time, yes. Please don’t rush anything for me, though.'),
      t('Can you help me get comfortable?', 'request', 'Ask for help getting comfortable.',
        'Can you help me get a little more comfortable? I will tell you what to adjust.'),
      t('I’m fine. Tell me about your day.', 'topic-change', 'Turn the conversation to the partner.',
        'I’m fine for now. Tell me about your day instead.'),
    ],
  },
  {
    id: 'wellbeing',
    match: /\b(how are you|how're you|how are things|how you doing|how are you doing|how's it going|feeling|are you ok|are you okay|you alright|you all right|doing okay|doing ok|how do you feel)\b/,
    replies: [
      t('I’m doing okay, thanks.', 'social', 'Say things are okay.',
        'I’m doing okay, thanks for asking. It has been a fairly ordinary day.'),
      t('Honestly, not my best day.', 'social', 'Say it is not a great day, without detail.',
        'Honestly, it’s not my best day. I would rather not go into detail right now.'),
      t('Pretty good. How about you?', 'question', 'Answer briefly and ask back.',
        'Pretty good, thanks. How about you? How has your day been?'),
      t('I’d rather not talk about it.', 'boundary', 'Decline to discuss it.',
        'I would rather not talk about how I’m feeling right now, if that’s okay.'),
      t('Can I tell you a bit later?', 'alternative', 'Offer to answer later.',
        'Can I tell you a bit later? I need a moment to put it into words.'),
      t('Could you sit with me for a bit?', 'request', 'Ask for company.',
        'Could you sit with me for a bit? I don’t need to talk much.'),
      t('Still here, as you can see.', 'social', 'Answer with light humor.',
        'Still here, as you can see. Can’t get rid of me that easily.'),
      t('It’s hard to explain.', 'other', 'Say it is hard to put into words.',
        'It’s hard to explain. Give me a moment and I will try.'),
      t('Let’s talk about you instead.', 'topic-change', 'Turn the conversation to the partner.',
        'Let’s talk about you instead. What has been going on?'),
    ],
  },
];

// Generic tail so a fourth "None of these" still gets fresh, harmless options.
const SAFE_TAIL: T[] = [
  t('Let me think about it for a minute.', 'other', 'Ask for time to think.'),
  t('Can you say that another way?', 'request', 'Ask the partner to rephrase.'),
  t('Can we come back to this later?', 'alternative', 'Defer the question.'),
];

// Acts that fit each explicit intent. Topic replies outside these are left out.
const INTENT_ACTS: Partial<Record<Intent, CandidateAct[]>> = {
  agree: ['accept', 'conditional'],
  disagree: ['decline', 'boundary'],
  'ask-question': ['question'],
  'suggest-alternative': ['alternative'],
  'express-need': ['request', 'boundary'],
  'change-topic': ['topic-change'],
  explain: ['other'],
};

export function matchTopic(partnerText: string | null): TopicSet | null {
  if (!partnerText) return null;
  const text = partnerText.toLowerCase().replace(/[’]/g, "'");
  return TOPIC_SETS.find((s) => s.match.test(text)) ?? null;
}

function fits(text: string, p: LengthPolicy): boolean {
  return wordCount(text) <= p.maxWords && text.length <= p.maxCharacters;
}

function sized(items: T[], p: LengthPolicy): F[] {
  const longer = p.maxWords > LENGTH_POLICIES.short.maxWords;
  return items.map(({ long, ...rest }) => (longer && long && fits(long, p) ? { ...rest, text: long } : rest));
}

function topicPool(set: TopicSet, r: ReplyRequest): F[] {
  const intent = r.guidance.intent;
  const acts = intent ? INTENT_ACTS[intent] : undefined;
  let items: T[];
  if (set.safetyLocked) {
    // Consequential topics stay clarification/boundary only, whatever the intent: compatible
    // replies first, then the rest of the same locked set. Never a generic intent pool.
    items = acts ? [...set.replies.filter((x) => acts.includes(x.act)), ...set.replies.filter((x) => !acts.includes(x.act))] : set.replies;
    return sized([...items, ...SAFE_TAIL], r.lengthPolicy);
  }
  if (acts && intent) {
    // Explicit intent: only topic replies with a compatible act, then the generic intent pool.
    items = [...set.replies.filter((x) => acts.includes(x.act)), ...(BY_INTENT[intent] ?? [])];
    return sized(items, r.lengthPolicy);
  }
  return sized([...set.replies, ...SAFE_TAIL], r.lengthPolicy);
}

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
  } else {
    const topic = matchTopic(r.activePartnerText);
    pool = topic ? topicPool(topic, r) : (r.guidance.intent && BY_INTENT[r.guidance.intent]) || REPLY_DEFAULT;
  }

  const offered = new Set(r.rejected.flatMap((b) => b.candidates.map((c) => normalizeForDuplicate(c.text))));
  const fresh = pool.filter((p) => !offered.has(normalizeForDuplicate(p.text)));
  // Deterministic: fresh items in order, then wrap around the pool if fewer than three remain.
  const picked: F[] = [];
  for (const p of [...fresh, ...pool]) {
    if (picked.length === 3) break;
    if (!picked.some((x) => normalizeForDuplicate(x.text) === normalizeForDuplicate(p.text))) picked.push(p);
  }
  // Last resort only for tiny pools; the safe tail never accepts or consents.
  for (const p of SAFE_TAIL) {
    if (picked.length === 3) break;
    if (!picked.some((x) => normalizeForDuplicate(x.text) === normalizeForDuplicate(p.text))) picked.push(p);
  }
  return {
    candidates: picked.map((p) => ({ text: p.text, meaning: { act: p.act, summary: p.summary } })),
    source: 'demo-fixture',
    model: null,
    repaired: false,
  };
}
