// Contract between the browser runtime (useStillHere) and the presentation components.
// Owned by the integrator. Components consume this; the runtime implements it.
import type { Action, InputSource, Settings, State, Target } from '@/core/state';
import type { AccessMode, Id, ProfileDraft, VoiceOption } from '@/core/types';

export type ServerStatus = {
  replies: { configured: boolean; provider: string | null; model: string | null };
  transcription: { configured: boolean; provider: string | null };
  fixturesEnabled: boolean;
  accessRequired: boolean;
  /** null when no access code was sent with the status request. */
  accessCodeValid?: boolean | null;
  /** ElevenLabs text-to-speech availability (never secret values). */
  speech?: { configured: boolean; provider: 'elevenlabs' | null; model: string | null };
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
  /** Face gesture adapter: eyebrow NEXT + blink SELECT (primary), or auto-scan + blink. */
  blink: BlinkRuntime;
  /** Speech output (ElevenLabs primary, labeled basic-voice fallback). */
  audio: AudioRuntime;
};

export const VOICE_TEST_TEXT = 'This is a voice test. It is not part of the conversation.';
export const ACCESS_HEADER = 'x-still-here-access';

// ---------------------------------------------------------------------------
// Blink-first access (primary input). Implemented by src/runtime/useBlink.ts and
// src/access/blink-*.ts; consumed by the calibration screen and status UI.
// Detection is local face-landmark eye-closure scoring, not gaze tracking or identity.

export type BlinkStatus =
  | 'off'              // camera not started
  | 'unsupported'      // no camera / no secure context / model failed to load
  | 'permission-denied'
  | 'starting'         // requesting camera, loading model
  | 'no-face'          // running, no face found (position guidance)
  | 'multiple-faces'   // >1 face: selection held, nothing commits
  | 'ready'            // eyes open, armed
  | 'closing'          // closure in progress; target frozen at onset
  | 'selected'         // a valid deliberate closure just committed
  | 'cooldown'         // re-arming after a selection or discarded closure
  | 'face-lost';       // face lost during use: gesture discarded, app paused

export type BlinkCalibration = {
  /** Eye-closure score (0 open … 1 closed) at or above which the eyes count as closed. */
  closedThreshold: number;
  /** Score at or below which the eyes count as open again (hysteresis). */
  openThreshold: number;
  /** A closure shorter than this is an ordinary blink and never selects. */
  minClosureMs: number;
  /** A closure longer than this is discarded (rest / eyes closed), never selects. */
  maxClosureMs: number;
  cooldownMs: number;
  calibratedAt: number;
  /** Longest natural blink observed during calibration (ms), if measured. */
  naturalMaxMs: number | null;
  /** Shortest deliberate closure observed during calibration (ms), if measured. */
  deliberateMinMs: number | null;
};

/** Raw gesture events from the detector, for calibration/practice screens. */
export type BlinkGestureEvent =
  | { type: 'closure-start'; at: number }
  | { type: 'select'; at: number; durationMs: number }
  | { type: 'discard'; at: number; durationMs: number; reason: 'too-short' | 'too-long' | 'face-lost' | 'multiple-faces' | 'stale' }
  | { type: 'face-lost'; at: number }
  | { type: 'face-found'; at: number }
  | { type: 'brow-start'; at: number }
  | { type: 'brow-next'; at: number; heldMs: number }
  | { type: 'brow-cancel'; at: number; heldMs: number; reason: 'too-short' | 'blink-preempted' | 'face-lost' | 'ambiguous' | 'stale' };

export type CalibrationStage =
  | 'consent' | 'position' | 'baseline'
  | 'brow-neutral' | 'brow-raise' | 'brow-practice'   // eyebrow NEXT calibration (brow-blink mode)
  | 'natural' | 'deliberate' | 'review'
  | 'practice-select' | 'practice-confirm' | 'done' | 'failed';

// ---------------------------------------------------------------------------
// Eyebrow NEXT (primary navigation in 'brow-blink' mode). A continuous both-brow raise held
// for >= browHoldMs proposes exactly one NAV_NEXT; holding longer never repeats; a stable
// return to neutral plus cooldown re-arms. The gesture arbiter is the only emitter of accepted
// commands: blink closure onset cancels a pending brow raise and freezes the target.

export type GestureCommand = 'NAV_NEXT' | 'SELECT';
export type BrowStatus = 'disabled' | 'neutral' | 'rising' | 'latched' | 'rearming';

export type BrowCalibration = {
  /** Brow-raise score (0..1, from browInnerUp/browOuterUp blendshapes) at rest. */
  neutral: number;
  /** Score at or above which brows count as raised. */
  raisedThreshold: number;
  /** Score at or below which brows count as back to neutral (hysteresis). */
  releaseThreshold: number;
  /** Continuous raised time required for one NAV_NEXT (user-requested 500 ms). */
  holdMs: number;
  /** Stable neutral time required before re-arming. */
  releaseMs: number;
  cooldownMs: number;
};

export type GestureFeedbackKind =
  | 'camera-off' | 'acquiring' | 'face-detected' | 'brow-progress'
  | 'brow-accepted' | 'blink-progress' | 'blink-accepted'
  | 'ambiguous' | 'tracking-paused' | 'cooldown';

export type GestureFeedback = {
  kind: GestureFeedbackKind;
  /** 0..1 progress only (never intent confidence). */
  progress01?: number;
  label: string;
};

/** Accepted command record for brief visual acknowledgement. */
export type AcceptedGesture = { command: GestureCommand; at: number; targetId: string | null };

export type BlinkRuntime = {
  status: BlinkStatus;
  /** Short human-readable status/guidance line (no confidence percentages). */
  message: string;
  /** 0..1 progress of the current closure toward minClosureMs (0 when not closing). */
  closureProgress: number;
  /** Latest smoothed eye-closure score 0..1 (calibration meter only); null when no face. */
  eyeScore: number | null;
  faceCount: number;
  /** Measured processing rate (frames per second), for honest diagnostics. */
  fps: number;
  calibration: BlinkCalibration | null;
  /** Eyebrow calibration (brow-blink mode); null until calibrated. */
  browCalibration: BrowCalibration | null;
  browStatus: BrowStatus;
  /** 0..1 elapsed/holdMs while a raise is held (0 otherwise). Progress only, never a command. */
  browProgress: number;
  /** Latest smoothed brow-raise score 0..1 (calibration meter only); null when no face. */
  browScore: number | null;
  /** Most recent accepted command, for a short "Next" / "Selected" acknowledgement. */
  lastAccepted: AcceptedGesture | null;
  /** Single combined feedback line for the compact preview/status area. */
  feedback: GestureFeedback;
  /** True when face input (blink or brow-blink mode) is active and calibrated. */
  active: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  /** Attach/detach a <video> element for the small framing preview (calibration only). */
  attachPreview: (el: HTMLVideoElement | null) => void;
  /** Subscribe to raw gesture events (calibration/practice). Returns unsubscribe. */
  subscribe: (listener: (e: BlinkGestureEvent) => void) => () => void;
  /** Sample collection for calibration. */
  calibrator: {
    stage: CalibrationStage;
    /** 0..1 progress within the current timed stage. */
    progress: number;
    instructions: string;
    naturalSamplesMs: number[];
    deliberateSamplesMs: number[];
    /** Proposed calibration after 'review'; null until computed. */
    proposed: BlinkCalibration | null;
    /** Why calibration failed (e.g. natural and deliberate closures overlap). */
    failureReason: string | null;
    /** From consent: starts camera, goes to position. mode 'blink' skips the brow stages (default: current accessMode). */
    begin: (mode?: AccessMode) => void;
    advance: () => void;    // move to next stage (UI decides when; timed stages auto-advance)
    restart: (mode?: AccessMode) => void;
    /** Accept the proposed calibration and enter practice. */
    accept: () => void;
    /** Mark practice complete (after a practice select and a separate practice confirm). */
    finishPractice: () => void;
    /** Adjust the proposed minimum closure (ms) before accepting. */
    setMinClosureMs: (ms: number) => void;
    /** Brow samples collected during brow-neutral / brow-raise (scores 0..1). */
    browNeutralSamples: number[];
    /** Per-frame brow scores across the brow-raise stage (input to computeBrowCalibration). */
    browRaiseSamples: number[];
    /** Distinct completed raises detected during brow-raise (for the UI count). */
    browRaiseCount: number;
    /** Proposed brow calibration after brow-raise; null until computed. */
    proposedBrow: BrowCalibration | null;
  };
};

// ---------------------------------------------------------------------------
// Speech output. ElevenLabs (server-side via POST /api/speech) is primary; the basic device
// voice is an explicitly labeled fallback. Audio plays only for a ConfirmedUtterance.

export type SpeechPlaybackState =
  | 'idle' | 'requesting' | 'buffering' | 'playing' | 'completed'
  | 'interrupted' | 'failed' | 'uncertain' | 'blocked';

export type AudioRuntime = {
  /** True once a genuine user gesture initialized audio (required by iPad Safari). */
  unlocked: boolean;
  state: SpeechPlaybackState;
  /** Factual status line (e.g. "Generating natural voice…", "Audio blocked — tap Enable audio"). */
  message: string | null;
  /** True when the server reports ElevenLabs configured. */
  elevenLabsConfigured: boolean;
  voices: VoiceOption[];
  /** Call ONLY from a real click/touch handler. Resolves true when audio can play. */
  enableAudio: () => Promise<boolean>;
  /** Setup preview with fixed text through the selected provider; never enters history. */
  testNaturalVoice: (voiceChoiceId?: Id | null) => Promise<void>;
  /** Milliseconds from confirmation to playback start for the last utterance, if measured. */
  lastConfirmToPlayMs: number | null;
};
