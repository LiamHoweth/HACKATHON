// Authoritative application state, surfaces, commands, effects, and actions.
import type {
  AccessMode, AiMode, ApiResult, ApprovedPreference, ApprovedProfileEntry, Anchor, Candidate,
  ChoiceBatch, ConfirmedUtterance, ConversationEntry, Guidance, Id, InitiationCategory, Intent,
  PartnerTurnSource, PreferenceProposal, ProfileDraft, RejectedBatch, ReplyRequest, ReplyResponseData,
  ReviewSnapshot, SavedPhrase, Scope, SessionObservation, StyleKey, StyleSetting, ApiError,
} from './types';
import { SCAN_DEFAULTS } from './limits';
import { BUILT_IN_PHRASES } from './phrases';

export type ComposePurpose = 'message' | 'seed' | 'phrase';

export type PendingChange =
  | { kind: 'save-preference'; setting: StyleSetting; scope: Scope; origin: 'manual' | 'approved-proposal'; proposalId: Id | null }
  | { kind: 'remove-preference'; key: StyleKey; scope: Scope }
  | { kind: 'approve-profile' }
  | { kind: 'delete-item'; item: 'preference' | 'profile' | 'phrase'; id: Id; label: string }
  | { kind: 'toggle-item'; item: 'preference' | 'profile'; id: Id; label: string; enabled: boolean }
  | { kind: 'save-phrase'; text: string }
  | { kind: 'enable-persistence' }
  | { kind: 'delete-all-saved' }
  | { kind: 'clear-session-learning' }
  | { kind: 'suppress-dimension'; key: StyleKey; proposalId: Id };

export type Surface =
  | { kind: 'board' }
  | { kind: 'guide'; page: 'root' | 'direction' | 'wording' }
  | { kind: 'quick'; page: number }
  | { kind: 'compose'; purpose: ComposePurpose; group: number | null; seedFor: 'guide' | 'initiate' | null }
  | { kind: 'compose-clear' }
  | { kind: 'initiate' }
  | { kind: 'initiate-topics'; mode: 'interest' | 'earlier' }
  | { kind: 'tools' }
  | { kind: 'history' }
  | { kind: 'preferences' }
  | { kind: 'style-edit'; key: StyleKey | null }
  | { kind: 'memory' }
  | { kind: 'proposal'; proposalId: Id }
  | { kind: 'confirm-change'; change: PendingChange }
  | { kind: 'controls' }
  | { kind: 'scope' }
  | { kind: 'metrics' }
  | { kind: 'review' }
  | { kind: 'change-wording' }
  | { kind: 'speaking' }
  | { kind: 'paused' }
  | { kind: 'end-confirm' };

export type WorkspaceStatus = 'idle' | 'generating' | 'choosing' | 'error' | 'stale';
export type Workspace = {
  id: Id;
  anchor: Anchor;
  createdAt: number;
  guidance: Guidance;
  batch: ChoiceBatch | null;
  rejected: RejectedBatch[];
  failedBatches: number;
  status: WorkspaceStatus;
  error: ApiError | null;
  pending: { requestId: Id; kind: 'suggestions' | 'refinement'; startedAt: number } | null;
  refineTarget: Candidate | null;
  refineMode: 'shorter' | 'different-tone' | null;
  parked: boolean;
  closed: 'answered' | 'dismissed' | null;
  unseenResult: boolean;
};

export type ReviewOrigin =
  | { kind: 'candidate'; workspaceId: Id; batchId: Id; candidateId: Id }
  | { kind: 'composed' }
  | { kind: 'phrase'; phraseId: Id };

export type ReviewState = {
  snapshot: ReviewSnapshot;
  origin: ReviewOrigin;
  cancelStack: Surface[];
  afterStack: Surface[];
};

export type SpeechState = {
  utterance: ConfirmedUtterance;
  afterStack: Surface[];
  userTurnId: Id;
};

export type Settings = {
  accessMode: AccessMode;
  scanIntervalMs: number;
  readingPauseMs: number;
  voiceURI: string | null;
  rate: number;
  aiMode: AiMode;
  cloudConsent: boolean;
  sessionAdaptation: boolean;
  persistOnDevice: boolean;
  usePreferences: boolean;
  personalizationPaused: boolean;
  measurement: boolean;
  language: string;
  scope: Scope;
  demoProfile: boolean;
};

export type StorageStatus = 'unknown' | 'empty' | 'loaded' | 'corrupt' | 'unavailable' | 'saved' | 'write-failed' | 'session-only';

export type MetricEvent = {
  t: number;
  kind:
    | 'partner-accepted' | 'generation-start' | 'generation-ready' | 'generation-error'
    | 'activation' | 'none-of-these' | 'guidance' | 'review-open' | 'confirm' | 'playback-start'
    | 'playback-end' | 'compose-key';
  workspaceId?: Id | null;
  requestId?: Id;
  source?: string;
  detail?: string;
};

export type Effect =
  | { id: Id; kind: 'generate'; request: ReplyRequest }
  | { id: Id; kind: 'abort-generation'; requestId: Id }
  | { id: Id; kind: 'speak'; utterance: ConfirmedUtterance }
  | { id: Id; kind: 'stop-speech'; utteranceId: Id }
  | { id: Id; kind: 'cancel-all-speech' }
  | { id: Id; kind: 'persist' }
  | { id: Id; kind: 'clear-storage' }
  | { id: Id; kind: 'start-recording' }
  | { id: Id; kind: 'finish-recording' }
  | { id: Id; kind: 'discard-recording' }
  | { id: Id; kind: 'export-metrics' };

export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'review' | 'error';

export type State = {
  phase: 'setup' | 'active';
  sessionEpoch: Id;
  settings: Settings;
  conversation: ConversationEntry[];
  nextSequence: number;
  staged: Id[]; // partner turn ids awaiting the user's attention (not yet in context)
  workspaces: Record<Id, Workspace>;
  activeWorkspaceId: Id | null;
  stack: Surface[]; // last element is the visible surface
  surfaceRevision: number;
  surfaceOpenedAt: number;
  consumedCycles: Id[];
  drafts: Record<ComposePurpose, string>;
  review: ReviewState | null;
  speech: SpeechState | null;
  contextRevision: number;
  preferenceRevision: number;
  approvedPreferences: ApprovedPreference[];
  approvedProfile: ApprovedProfileEntry[];
  profileDraft: ProfileDraft | null;
  savedPhrases: SavedPhrase[];
  suppressedDimensions: StyleKey[];
  observations: SessionObservation[];
  proposals: PreferenceProposal[];
  storageStatus: StorageStatus;
  recording: { status: RecordingStatus; message: string | null };
  notice: { text: string; at: number } | null;
  effects: Effect[];
  metrics: MetricEvent[];
};

export type Command =
  | { type: 'select-candidate'; candidateId: Id }
  | { type: 'none-of-these' }
  | { type: 'open'; surface: Surface }
  | { type: 'back' }
  | { type: 'set-intent'; intent: Intent }
  | { type: 'add-wording'; setting: StyleSetting; feedback?: 'shorter' | 'longer' }
  | { type: 'clear-guidance' }
  | { type: 'retry' }
  | { type: 'refresh' }
  | { type: 'quick-phrase'; phraseId: Id }
  | { type: 'quick-page'; page: number }
  | { type: 'compose-group'; group: number | null }
  | { type: 'compose-key'; key: string }
  | { type: 'compose-space' }
  | { type: 'compose-delete' }
  | { type: 'compose-clear-confirm' }
  | { type: 'compose-done' }
  | { type: 'review-cancel' }
  | { type: 'review-speak' }
  | { type: 'refine-candidate'; mode: 'shorter' | 'different-tone' }
  | { type: 'edit-review-text' }
  | { type: 'stop-speech' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'end-session' }
  | { type: 'initiate'; category: InitiationCategory; seed: string | null }
  | { type: 'history-answer'; turnId: Id }
  | { type: 'history-dismiss-staged'; turnId: Id }
  | { type: 'history-return'; workspaceId: Id }
  | { type: 'history-dismiss-workspace'; workspaceId: Id }
  | { type: 'park-active' }
  | { type: 'toggle-flag'; flag: 'usePreferences' | 'sessionAdaptation' | 'personalizationPaused' | 'measurement' }
  | { type: 'disable-persistence' }
  | { type: 'request-change'; change: PendingChange }
  | { type: 'confirm-change' }
  | { type: 'proposal-decision'; proposalId: Id; decision: 'not-now' }
  | { type: 'scan-speed'; deltaMs: number }
  | { type: 'set-scope'; scope: Scope }
  | { type: 'record-start' }
  | { type: 'record-finish' }
  | { type: 'export-metrics' };

export type Target = {
  id: string;
  label: string;
  detail?: string;
  enabled: boolean;
  command: Command;
  region: 'candidates' | 'primary' | 'tools' | 'menu' | 'keys' | 'review' | 'safety';
  requiresArming?: boolean;
  tone?: 'normal' | 'speak' | 'cancel' | 'quiet';
};

export type InputSource = AccessMode;

export type Action =
  | { type: 'SETUP_START'; settings: Settings; profileDraft: ProfileDraft | null; epoch: Id; at: number }
  | { type: 'ACTIVATE'; targetId: string; eventId: Id; cycleId: Id; surfaceRevision: number; sessionEpoch: Id; source: InputSource; at: number }
  | { type: 'PARTNER_SUBMIT'; text: string; source: PartnerTurnSource; at: number }
  | { type: 'PARTNER_EDIT_TURN'; turnId: Id; text: string; at: number }
  | { type: 'GENERATION_RESULT'; identity: ReplyRequest['identity']; result: ApiResult<ReplyResponseData>; at: number }
  | { type: 'SPEECH_EVENT'; utteranceId: Id; sessionEpoch: Id; kind: 'start' | 'end' | 'error' | 'interrupted' | 'uncertain'; at: number }
  | { type: 'EFFECTS_DONE'; ids: Id[] }
  | { type: 'STORAGE_LOADED'; data: { approvedPreferences: ApprovedPreference[]; approvedProfile: ApprovedProfileEntry[]; savedPhrases: SavedPhrase[]; suppressedDimensions: StyleKey[] } | null; status: StorageStatus }
  | { type: 'STORAGE_WRITE_RESULT'; ok: boolean }
  | { type: 'RECORDING_STATUS'; status: RecordingStatus; message: string | null }
  | { type: 'COMPOSE_TEXT'; purpose: ComposePurpose; text: string }
  | { type: 'SAFETY_PAUSE'; at: number }
  | { type: 'SAFETY_STOP'; at: number }
  | { type: 'DISMISS_NOTICE' };

export const DEFAULT_SETTINGS: Settings = {
  accessMode: 'switch',
  scanIntervalMs: SCAN_DEFAULTS.intervalMs,
  readingPauseMs: SCAN_DEFAULTS.readingPauseMs,
  voiceURI: null,
  rate: 1,
  aiMode: 'fixture',
  cloudConsent: false,
  sessionAdaptation: false,
  persistOnDevice: false,
  usePreferences: true,
  personalizationPaused: false,
  measurement: false,
  language: 'en-US',
  scope: { relationship: null, setting: null },
  demoProfile: false,
};

export const EMPTY_GUIDANCE = (scope: Scope): Guidance => ({ intent: null, wording: [], userTopicOrSeed: null, scope });

export function initialState(epoch: Id = 'setup'): State {
  return {
    phase: 'setup',
    sessionEpoch: epoch,
    settings: DEFAULT_SETTINGS,
    conversation: [],
    nextSequence: 1,
    staged: [],
    workspaces: {},
    activeWorkspaceId: null,
    stack: [{ kind: 'board' }],
    surfaceRevision: 0,
    surfaceOpenedAt: 0,
    consumedCycles: [],
    drafts: { message: '', seed: '', phrase: '' },
    review: null,
    speech: null,
    contextRevision: 0,
    preferenceRevision: 0,
    approvedPreferences: [],
    approvedProfile: [],
    profileDraft: null,
    savedPhrases: BUILT_IN_PHRASES,
    suppressedDimensions: [],
    observations: [],
    proposals: [],
    storageStatus: 'unknown',
    recording: { status: 'idle', message: null },
    notice: null,
    effects: [],
    metrics: [],
  };
}

export const currentSurface = (s: State): Surface => s.stack[s.stack.length - 1];
