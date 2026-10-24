import type { SavedPhrase } from './types';

// Critical interruption phrases come first so they are reached quickly when scanning.
export const BUILT_IN_PHRASES: SavedPhrase[] = [
  { id: 'qp-something-to-say', text: 'I have something to say.', builtIn: true, group: 'conversation' },
  { id: 'qp-moment', text: 'Please give me a moment.', builtIn: true, group: 'conversation' },
  { id: 'qp-not-finished', text: "I'm not finished.", builtIn: true, group: 'conversation' },
  { id: 'qp-repeat', text: 'Can you repeat that?', builtIn: true, group: 'conversation' },
  { id: 'qp-not-meant', text: "That's not what I meant.", builtIn: true, group: 'conversation' },
  { id: 'qp-earlier', text: 'I want to answer your earlier question.', builtIn: true, group: 'conversation' },
  { id: 'qp-change-subject', text: 'Let me change the subject.', builtIn: true, group: 'conversation' },
  { id: 'qp-question', text: 'I have a question.', builtIn: true, group: 'conversation' },
  { id: 'qp-stop', text: 'Please stop.', builtIn: true, group: 'practical' },
  { id: 'qp-help', text: 'Please get someone to help me.', builtIn: true, group: 'practical' },
];

export const QUICK_PAGE_SIZE = 6;

export const INITIATION_LABELS: Record<string, string> = {
  'ask-question': 'Ask someone a question',
  'tell-something': 'Tell someone something',
  'share-thought': 'Share a thought',
  'make-request': 'Make a request',
  'tell-joke': 'Tell a joke',
  'approved-interest': 'Talk about an approved interest',
  'earlier-topic': 'Return to an earlier topic',
  'express-feeling': 'Express a feeling in my own words',
  original: 'Write something original',
};

export const INTENT_LABELS: Record<string, string> = {
  agree: 'Agree',
  disagree: 'Disagree',
  'ask-question': 'Ask a question',
  'suggest-alternative': 'Suggest an alternative',
  'express-need': 'Express a need',
  'change-topic': 'Change the subject',
  explain: 'Explain something',
  other: 'Something else',
};

// Grouped-letter scanning layout. Each group opens a page of single keys.
export const KEY_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'A B C D E F', keys: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { label: 'G H I J K L', keys: ['G', 'H', 'I', 'J', 'K', 'L'] },
  { label: 'M N O P Q R', keys: ['M', 'N', 'O', 'P', 'Q', 'R'] },
  { label: 'S T U V W X', keys: ['S', 'T', 'U', 'V', 'W', 'X'] },
  { label: 'Y Z . , ? !', keys: ['Y', 'Z', '.', ',', '?', '!'] },
  { label: "' - 1 2 3 4 5", keys: ["'", '-', '1', '2', '3', '4', '5'] },
  { label: '6 7 8 9 0', keys: ['6', '7', '8', '9', '0'] },
];
