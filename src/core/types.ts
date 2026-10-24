// Shared domain contracts for Still Here. Pure types only; no browser or server code.

export type Id = string;
export type AccessMode = 'pointer' | 'keyboard' | 'switch' | 'blink';
export type CandidateSource = 'live-model' | 'demo-fixture';
export type MessageSource = CandidateSource | 'saved-phrase' | 'user-composed';
export type Delivery = 'queued' | 'speaking' | 'completed' | 'interrupted' | 'failed' | 'uncertain';
export type AiMode = 'live' | 'fixture' | 'local-only';

export const INTENTS = [
  'agree', 'disagree', 'ask-question', 'suggest-alternative',
  'express-need', 'change-topic', 'explain', 'other',
] as const;
export type Intent = (typeof INTENTS)[number];

export const STYLE_KEYS = ['length', 'directness', 'formality', 'humor', 'warmth', 'follow-up'] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];
export type StyleValueByKey = {
  length: 'short' | 'balanced' | 'detailed';
  directness: 'gentle' | 'direct';
  formality: 'casual' | 'neutral' | 'formal';
  humor: 'neutral' | 'light';
  warmth: 'neutral' | 'warm' | 'restrained';
  'follow-up': 'neutral' | 'welcome';
};
export const STYLE_VALUES: { [K in StyleKey]: readonly StyleValueByKey[K][] } = {
  length: ['short', 'balanced', 'detailed'],
  directness: ['gentle', 'direct'],
  formality: ['casual', 'neutral', 'formal'],
  humor: ['neutral', 'light'],
  warmth: ['neutral', 'warm', 'restrained'],
  'follow-up': ['neutral', 'welcome'],
};
export type StyleSetting = {
  [K in StyleKey]: { key: K; value: StyleValueByKey[K] }
}[StyleKey];

export const RELATIONSHIPS = ['family', 'friend', 'caregiver', 'clinician', 'colleague'] as const;
export const SETTINGS = ['home', 'social', 'medical', 'work'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];
export type SettingPlace = (typeof SETTINGS)[number];
export type Scope = { relationship: Relationship | null; setting: SettingPlace | null };

export type Guidance = {
  intent: Intent | null;
  wording: StyleSetting[];
  userTopicOrSeed: string | null;
  scope: Scope;
};

export type PartnerTurnSource = 'partner-typed' | 'partner-transcribed' | 'partner-edited';
export type PartnerTurn = {
  id: Id; sequence: number; contentRevision: number;
  text: string; createdAt: number;
  source: PartnerTurnSource;
  acceptedForContext: boolean;
  dismissed: boolean;
};
export type ConfirmedUserTurn = {
  id: Id; sequence: number; text: string;
  confirmedAt: number; delivery: Delivery;
  anchorTurnId: Id | null; utteranceId: Id; source: MessageSource;
};
export type ConversationEntry =
  | { role: 'partner'; value: PartnerTurn }
  | { role: 'user'; value: ConfirmedUserTurn };

export type Anchor =
  | { mode: 'reply'; turnId: Id; turnContentRevision: number }
  | { mode: 'initiate'; topicId: Id; category: InitiationCategory; userTopicOrSeed: string | null };

export const INITIATION_CATEGORIES = [
  'ask-question', 'tell-something', 'share-thought', 'make-request',
  'tell-joke', 'approved-interest', 'earlier-topic', 'express-feeling', 'original',
] as const;
export type InitiationCategory = (typeof INITIATION_CATEGORIES)[number];

export const CANDIDATE_ACTS = [
  'accept', 'decline', 'question', 'alternative', 'conditional',
  'boundary', 'request', 'social', 'topic-change', 'other',
] as const;
export type CandidateAct = (typeof CANDIDATE_ACTS)[number];
export type CandidateMeaning = { act: CandidateAct; summary: string };
export type Candidate = { id: Id; text: string; meaning: CandidateMeaning };

export type RequestIdentity = {
  sessionEpoch: Id; workspaceId: Id; requestId: Id;
  contextRevision: number; preferenceRevision: number;
};
export type ChoiceBatch = {
  id: Id; identity: RequestIdentity; anchor: Anchor;
  candidates: [Candidate, Candidate, Candidate];
  source: CandidateSource;
  kind: 'suggestions' | 'refinement';
  receivedAt: number;
};
export type RejectionFeedback = 'none-fit' | 'different-meaning' | 'too-long' | 'different-tone' | 'too-specific';
export type RejectedBatch = {
  batchId: Id; workspaceId: Id; anchor: Anchor;
  candidates: Candidate[];
  feedback: RejectionFeedback;
  at: number;
};

export type ReviewSnapshot = {
  id: Id; sessionEpoch: Id; workspaceId: Id | null;
  originatingBatchId: Id | null; originatingCandidateId: Id | null;
  source: MessageSource; exactText: string;
  selectedByEventId: Id; selectedByInputCycleId: Id;
  returnSurface: string;
  openedAt: number;
};
export type ConfirmedUtterance = {
  id: Id; reviewId: Id; exactText: string;
  selectionEventId: Id; confirmationEventId: Id;
  selectionCycleId: Id; confirmationCycleId: Id;
  delivery: Delivery;
  sessionEpoch: Id;
};

export type ObservationNote = 'chose-shortest' | 'chose-longest' | 'chose-middle' | 'asked-shorter' | 'asked-longer';
export type SessionObservation = {
  id: Id; sessionEpoch: Id; dimension: StyleKey;
  evidenceKind: 'explicit-feedback' | 'confirmed-choice';
  scope: Scope; createdAt: number; expiresAt: number;
  evidenceCount: number; opportunityCount: number;
  noteCode: ObservationNote;
  turnKey: Id; // anchor turn/topic id, used to count distinct turns
};
export type ApprovedPreference = {
  id: Id; setting: StyleSetting; scope: Scope;
  origin: 'manual' | 'approved-proposal';
  approvalEventId: Id; approvedAt: number;
  enabled: boolean; version: number;
};
export type PreferenceProposal = {
  id: Id; proposedSetting: StyleSetting; scope: Scope;
  evidenceIds: Id[]; explanation: string;
  status: 'pending' | 'approved' | 'deferred' | 'rejected';
};

export const PROFILE_FIELDS = ['preferredName', 'interest', 'language'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ApprovedProfileEntry = {
  id: Id; field: ProfileField; value: string;
  approvedAt: number; approvalEventId: Id; enabled: boolean;
};
export type ProfileDraft = { preferredName: string; interests: string[] };

export type SavedPhrase = { id: Id; text: string; builtIn: boolean; group: 'conversation' | 'practical' | 'custom' };

export type ApiErrorCode =
  | 'NOT_CONFIGURED' | 'UNAUTHORIZED' | 'INVALID_INPUT'
  | 'RATE_LIMITED' | 'TIMEOUT' | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REFUSAL' | 'INVALID_MODEL_OUTPUT'
  | 'TRANSCRIPTION_FAILED' | 'NETWORK';
export type ApiError = { code: ApiErrorCode; message: string; recoverable: boolean };
export type ApiResult<T> =
  | { ok: true; requestId: Id; data: T }
  | { ok: false; requestId: Id; error: ApiError };

export type LengthPolicy = { maxWords: number; maxCharacters: number };
export type ReplyRequest = {
  identity: RequestIdentity;
  mode: 'live' | 'fixture';
  anchor: Anchor;
  activePartnerText: string | null;
  language: string;
  recentConversation: Array<
    | { role: 'partner'; text: string; source: PartnerTurnSource }
    | { role: 'user'; text: string; delivery: Delivery }
  >;
  approvedProfile: Array<{ id: Id; field: ProfileField; value: string }>;
  guidance: Guidance;
  approvedPreferences: Array<{ setting: StyleSetting; scope: Scope }>;
  sessionStyleHints: StyleSetting[];
  rejected: Array<{ candidates: Array<{ text: string; meaning: CandidateMeaning }>; feedback: RejectionFeedback }>;
  refineTarget: { text: string; meaning: CandidateMeaning; mode: 'shorter' | 'different-tone' } | null;
  lengthPolicy: LengthPolicy;
};
export type ReplyResponseData = {
  candidates: Array<{ text: string; meaning: CandidateMeaning }>;
  source: CandidateSource;
  model: string | null;
  repaired: boolean;
};

export type TranscriptDraft = { captureId: Id; text: string; source: 'partner-transcribed' };
