// Contract between the browser runtime (useStillHere) and the presentation components.
// Owned by the integrator. Components consume this; the runtime implements it.
import type { Action, InputSource, Settings, State, Target } from '@/core/state';
import type { Id, ProfileDraft } from '@/core/types';

export type ServerStatus = {
  replies: { configured: boolean; provider: string | null; model: string | null };
  transcription: { configured: boolean; provider: string | null };
  fixturesEnabled: boolean;
  accessRequired: boolean;
  /** null when no access code was sent with the status request. */
  accessCodeValid?: boolean | null;
};

export type VoiceInfo = { voiceURI: string; name: string; lang: string; localService: boolean; default: boolean };

export type TranscriptDraftState =
  | { status: 'none' }
  | { status: 'ready'; captureId: Id; text: string }
  | { status: 'empty'; captureId: Id }
  | { status: 'failed'; message: string };

export type StillHereRuntime = {
  state: State;
  /** The authoritative target list for the visible surface (from targetsFor). */
  targets: Target[];
  /** Scanning highlight in switch mode; null when not scanning. Separate from DOM focus. */
  highlightedTargetId: string | null;
  /** True while a switch press is held (scanning frozen on the pressed target). */
  switchHeld: boolean;
  /** Pointer / native keyboard activation path. Converges on the same guarded ACTIVATE. */
  activate: (targetId: string, source: InputSource) => void;
  dispatch: (action: Action) => void;
  startSession: (settings: Settings, profileDraft: ProfileDraft | null) => void;
  serverStatus: ServerStatus | null;
  voices: VoiceInfo[];
  speechAvailable: boolean;
  /** Setup voice test. Speaks fixed text; never enters conversation history. */
  testVoice: (voiceURI: string | null, rate: number) => void;
  partner: {
    submit: (text: string, source: 'partner-typed' | 'partner-transcribed' | 'partner-edited') => void;
    canRecord: boolean; // secure context + MediaRecorder + transcription configured + consent
    startRecording: () => void;
    finishRecording: () => void;
    transcript: TranscriptDraftState;
    discardTranscript: () => void;
  };
  /** Access code for a protected deployment (kept in sessionStorage, sent as a header). */
  accessCode: string;
  setAccessCode: (code: string) => void;
};

export const VOICE_TEST_TEXT = 'This is a voice test. It is not part of the conversation.';
export const ACCESS_HEADER = 'x-still-here-access';
