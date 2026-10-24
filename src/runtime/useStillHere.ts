'use client';
// Browser runtime: owns the reducer, executes effects, drives scanning/switch input, speech,
// recording, storage, and server status. Implements StillHereRuntime (src/runtime/contract.ts).
// Face input: useBlink owns the camera, the gesture machines and the ONE gesture arbiter; this
// hook is the arbiter's single command handler. 'brow-blink' (default): NO scanning timer — the
// highlight starts on the surface's first (safe) target and moves one step (wrapping) only on an
// accepted NAV_NEXT (eyebrow, or Tab/ArrowRight). 'blink': timed auto-scan as before. In both,
// the target highlighted at blink-closure onset is snapshotted (attributeClosure), the highlight
// is frozen while the eyes are closed, and an accepted SELECT commits that snapshot through the
// same guarded ACTIVATE (source 'blink').
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { Action, InputSource, Settings, State } from '@/core/state';
import { currentSurface, initialState } from '@/core/state';
import type { ProfileDraft } from '@/core/types';
import { newId, reducer } from '@/core/reducer';
import { targetsFor } from '@/core/targets';
import { ACCESS_HEADER, type ServerStatus, type StillHereRuntime, type TranscriptDraftState, type VoiceInfo } from './contract';
import { CALIBRATING_STAGES, useBlink, type FaceCommandEvent, type FaceCommandResult } from './useBlink';
import { EffectsRunner } from './effects-runner';
import {
  ACQUIRE_HOLD_MAX_MS, acquireHoldActive as isAcquireHoldActive, ATTRIBUTION_TIMING, attributeClosure, logHighlight, nextAcquireHold, ScanController,
  type AcquireHold, type HighlightLogEntry,
} from '@/access/scan-controller';
import { hasHighlight, InputController, isFaceMode, isManualNavMode } from '@/access/input-controller';
import type { ScanConfig } from '@/access/scan-controller';
import { SpeechController, type SynthLike } from '@/audio/speech-controller';
import { getSynth, speakVoiceTest, subscribeVoices } from '@/audio/voices';
import { recordingSupported } from '@/audio/recording-controller';
import * as store from '@/adaptation/preference-store';
import { useAudio } from './useAudio';
import { getSharedGestureMetrics } from '@/metrics/gesture-metrics';

const ACCESS_KEY = 'still-here:access';
/**
 * The access-code status re-check waits this long after typing stops, so a code typed one
 * character at a time is checked once (not once per keystroke, which would burn the server's
 * failed-attempt budget and trigger its throttle). The first check on mount is immediate.
 */
export const STATUS_RECHECK_DEBOUNCE_MS = 700;
const now = () => performance.now();
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function readAccessCode(): string {
  try {
    return window.sessionStorage.getItem(ACCESS_KEY) ?? '';
  } catch {
    return '';
  }
}

// Access code: a tiny external store (sessionStorage-backed, in-memory fallback).
let accessCodeCache: string | null = null;
const accessListeners = new Set<() => void>();
const accessStore = {
  subscribe(fn: () => void) {
    accessListeners.add(fn);
    return () => accessListeners.delete(fn);
  },
  get(): string {
    if (accessCodeCache === null) accessCodeCache = readAccessCode();
    return accessCodeCache;
  },
  set(v: string) {
    accessCodeCache = v;
    try {
      if (v) window.sessionStorage.setItem(ACCESS_KEY, v);
      else window.sessionStorage.removeItem(ACCESS_KEY);
    } catch {
      /* session-only in memory */
    }
    accessListeners.forEach((fn) => fn());
  },
};
const noopSubscribe = () => () => {};
const serverFalse = () => false;
const serverEmpty = () => '';
const speechSnapshot = () => !!getSynth();
const subscribeVisibility = (fn: () => void) => {
  document.addEventListener('visibilitychange', fn);
  return () => document.removeEventListener('visibilitychange', fn);
};
const hiddenSnapshot = () => document.hidden;

function isServerStatus(x: unknown): x is ServerStatus {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.replies === 'object' && o.replies !== null && typeof o.transcription === 'object' && o.transcription !== null;
}

export function useStillHere(): StillHereRuntime {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());
  const stateRef = useRef<State>(state);
  useIsoLayoutEffect(() => {
    stateRef.current = state;
  });

  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  // The access code the current serverStatus was checked with (debounced; see below).
  const [statusAccessCode, setStatusAccessCode] = useState('');
  const statusCheckedRef = useRef(false);
  const serverStatusRef = useRef<ServerStatus | null>(null);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const speechAvailable = useSyncExternalStore(noopSubscribe, speechSnapshot, serverFalse);
  const recordingApis = useSyncExternalStore(noopSubscribe, recordingSupported, serverFalse);
  const [transcript, setTranscript] = useState<TranscriptDraftState>({ status: 'none' });
  const accessCode = useSyncExternalStore(accessStore.subscribe, accessStore.get, serverEmpty);
  const accessRef = useRef('');
  useIsoLayoutEffect(() => {
    accessRef.current = accessCode;
  });
  const [highlightedTargetId, setHighlighted] = useState<string | null>(null);
  const [switchHeld, setSwitchHeld] = useState(false);
  const hidden = useSyncExternalStore(subscribeVisibility, hiddenSnapshot, serverFalse);

  // ---- Blink (primary input) ----
  const blink = useBlink(state.settings.accessMode);
  const [blinkHeld, setBlinkHeld] = useState(false);
  const blinkPinRef = useRef<string | null>(null);
  const blinkSnapRef = useRef<{ targetId: string; surfaceRevision: number; cycleId: string; at: number } | null>(null);
  const blinkUsableRef = useRef(false);
  const switchHeldRef = useRef(false);
  const lastSwitchActivateRef = useRef(-Infinity);
  const lastScanCfgRef = useRef<ScanConfig | null>(null);
  // Recent highlight changes with monotonic times, so a closure is matched to the target that
  // was highlighted when the eyes started closing (detection runs a frame or two behind).
  const highlightLogRef = useRef<HighlightLogEntry[]>([]);
  // requiresArming per current target id (unknown ids are treated as guarded).
  const armingRef = useRef<Map<string, boolean>>(new Map());
  // Face lost / tracking interrupted while speaking: pause deferred until the speech ends.
  const pendingPauseRef = useRef<'face-lost' | 'interrupted' | null>(null);

  // ---- Long-lived controllers (created once, client-side, in effects) ----
  const runnerRef = useRef<EffectsRunner | null>(null);
  const scanRef = useRef<ScanController | null>(null);
  const getRunner = useCallback((): EffectsRunner => {
    if (!runnerRef.current) {
      const synth = getSynth();
      runnerRef.current = new EffectsRunner({
        dispatch,
        getState: () => stateRef.current,
        getAccessCode: () => accessRef.current,
        transcriptionConfigured: () => !!serverStatusRef.current?.transcription.configured,
        setTranscript,
        speech: synth ? new SpeechController(synth as unknown as SynthLike) : null,
        newId,
        now,
      });
    }
    return runnerRef.current;
  }, []);

  // ---- Mount: storage and voices ----
  useEffect(() => {
    dispatch(store.loadedAction(store.load()));
    return subscribeVoices(getSynth(), setVoices);
  }, []);

  // ---- Server status (immediately on mount, then debounced while the access code is typed) ----
  useEffect(() => {
    const ctrl = new AbortController();
    const code = accessCode;
    const delay = statusCheckedRef.current ? STATUS_RECHECK_DEBOUNCE_MS : 0;
    const timer = window.setTimeout(() => {
      statusCheckedRef.current = true;
      const headers: Record<string, string> = {};
      if (code) headers[ACCESS_HEADER] = code;
      fetch('/api/status', { headers, signal: ctrl.signal, cache: 'no-store' })
        .then((r) => r.json())
        .then((json: unknown) => {
          const s = isServerStatus(json) ? json : null;
          serverStatusRef.current = s;
          setServerStatus(s);
          setStatusAccessCode(code);
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          serverStatusRef.current = null;
          setServerStatus(null);
          setStatusAccessCode(code);
        });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [accessCode]);

  // ---- Effects: exactly once each ----
  useEffect(() => {
    if (state.effects.length) getRunner().run(state.effects);
  }, [state.effects, getRunner]);

  useEffect(() => {
    return () => runnerRef.current?.dispose();
  }, []);

  // A new session epoch clears any transcript draft from the previous session.
  const epochRef = useRef(state.sessionEpoch);
  useEffect(() => {
    if (epochRef.current === state.sessionEpoch) return;
    epochRef.current = state.sessionEpoch;
    setTranscript({ status: 'none' });
    getSharedGestureMetrics().reset();
  }, [state.sessionEpoch]);
  // Opt-in measurement mode also gates gesture/voice timing capture (content-free).
  useEffect(() => { getSharedGestureMetrics().setEnabled(state.settings.measurement); }, [state.settings.measurement]);

  // ---- Targets and scanning ----
  const targets = useMemo(() => targetsFor(state), [state]);
  const enabledIds = useMemo(() => targets.filter((t) => t.enabled).map((t) => t.id), [targets]);
  const enabledKey = enabledIds.join('|');
  useIsoLayoutEffect(() => {
    armingRef.current = new Map(targets.map((t) => [t.id, !!t.requiresArming]));
  });
  // A highlight exists in switch / blink auto-scan (timed) and brow-blink (manual) modes.
  const scanning = hasHighlight(state.settings.accessMode) && state.phase === 'active';
  const manualNav = isManualNavMode(state.settings.accessMode) && state.phase === 'active';
  // Blink auto-scan in use but no stable single face yet: do not cycle choices before input is
  // possible. (Manual stepping has no timer, so nothing to hold.)
  const blinkAcquiring = !manualNav && blink.active && blink.cameraOn
    && (blink.status === 'starting' || blink.status === 'no-face' || blink.status === 'multiple-faces');
  // The acquisition hold is released after ACQUIRE_HOLD_MAX_MS or by any keyboard switch press,
  // and re-applies on the next acquisition episode.
  const [acquireHold, setAcquireHold] = useState<AcquireHold>({ acquiring: false, released: false });
  if (acquireHold.acquiring !== blinkAcquiring) setAcquireHold(nextAcquireHold(acquireHold, { type: 'acquiring', value: blinkAcquiring }));
  const acquireHoldActive = blinkAcquiring && isAcquireHoldActive(acquireHold);
  useEffect(() => {
    if (!acquireHoldActive) return;
    const id = window.setTimeout(() => setAcquireHold((h) => nextAcquireHold(h, { type: 'timeout' })), ACQUIRE_HOLD_MAX_MS);
    return () => window.clearTimeout(id);
  }, [acquireHoldActive]);

  useEffect(() => {
    if (!scanRef.current) {
      // The revision comes from the scan config that produced the highlight, never from React
      // state, so a timer tick can never pair an old-surface id with a new revision.
      scanRef.current = new ScanController((id, rev, at) => {
        // A gesture-driven step carries its own frame time (same clock as closure onsets);
        // everything else is stamped now. The log stays ordered by time.
        logHighlight(highlightLogRef.current, { id, at: at ?? now(), rev });
        setHighlighted(id);
      });
    }
    const cfg: ScanConfig = {
      active: scanning,
      ids: enabledKey ? enabledKey.split('|') : [],
      surfaceRevision: state.surfaceRevision,
      intervalMs: state.settings.scanIntervalMs,
      readingPauseMs: state.settings.readingPauseMs,
      held: scanning && (switchHeld || blinkHeld || acquireHoldActive),
      pin: blinkHeld ? blinkPinRef.current : null,
      hidden,
      manual: manualNav,
    };
    lastScanCfgRef.current = cfg;
    scanRef.current.update(cfg);
  }, [scanning, manualNav, enabledKey, state.surfaceRevision, state.settings.scanIntervalMs, state.settings.readingPauseMs, switchHeld, blinkHeld, acquireHoldActive, hidden]);

  useEffect(() => {
    return () => {
      scanRef.current?.dispose();
      scanRef.current = null;
    };
  }, []);

  // ---- Activation paths ----
  const activate = useCallback((targetId: string, source: InputSource) => {
    const s = stateRef.current;
    dispatch({
      type: 'ACTIVATE', targetId, eventId: newId(), cycleId: newId(),
      surfaceRevision: s.surfaceRevision, sessionEpoch: s.sessionEpoch, source, at: now(),
    });
  }, []);

  /**
   * One manual step (brow-blink). Refused while a switch press or blink closure holds the
   * highlight. `at` is the gesture's own time (eyebrow NEXT frame), logged as the change time.
   */
  const stepHighlight = useCallback((at?: number, direction: 'next' | 'previous' = 'next'): string | null => {
    const s = stateRef.current;
    if (s.phase !== 'active' || !isManualNavMode(s.settings.accessMode)) return null;
    if (switchHeldRef.current || blinkPinRef.current !== null) return null;
    const scan = scanRef.current;
    if (!scan) return null;
    return (direction === 'previous' ? scan.previous(at) : scan.next(at)) ?? null;
  }, []);

  useEffect(() => {
    const input = new InputController({
      getMode: () => stateRef.current.settings.accessMode,
      getHighlighted: () => (stateRef.current.phase === 'active' ? scanRef.current?.current ?? null : null),
      getSurfaceRevision: () => stateRef.current.surfaceRevision,
      newId,
      onSwitchActivate: ({ targetId, surfaceRevision, cycleId }) => {
        const s = stateRef.current;
        lastSwitchActivateRef.current = now();
        dispatch({
          type: 'ACTIVATE', targetId, eventId: newId(), cycleId,
          surfaceRevision, sessionEpoch: s.sessionEpoch, source: 'switch', at: now(),
        });
      },
      onHeldChange: (held) => {
        switchHeldRef.current = held;
        setSwitchHeld(held);
        // A keyboard switch press means someone is using the fallback: stop waiting for a face.
        if (held) setAcquireHold((h) => nextAcquireHold(h, { type: 'switch-press' }));
      },
      onSafetyPause: () => dispatch({ type: 'SAFETY_PAUSE', at: now() }),
      // Keyboard NAV_NEXT fallback (brow-blink only; the controller filters mode/editable/repeat).
      onNavNext: () => {
        stepHighlight();
      },
    });
    return input.attach(window);
  }, [stepHighlight]);

  // ---- Face gestures (arbiter output) → the same guarded ACTIVATE / manual step ----
  const blinkUsable = blink.active && !CALIBRATING_STAGES.has(blink.calibrator.stage);
  const blinkEngine = blink.engine;
  useIsoLayoutEffect(() => {
    blinkUsableRef.current = blinkUsable;
  });

  useEffect(() => {
    const freeze = (targetId: string) => {
      blinkPinRef.current = targetId;
      setBlinkHeld(true);
      // Freeze immediately (before the next render) so the highlight cannot move mid-closure.
      const cfg = lastScanCfgRef.current;
      if (cfg && cfg.active) scanRef.current?.update({ ...cfg, held: true, pin: targetId });
    };
    const unfreeze = () => {
      blinkSnapRef.current = null;
      blinkPinRef.current = null;
      setBlinkHeld(false);
    };
    const refused: FaceCommandResult = { applied: false, targetId: null };
    const onCommand = (e: FaceCommandEvent): FaceCommandResult => {
      const s = stateRef.current;
      const usable = blinkUsableRef.current && s.phase === 'active' && isFaceMode(s.settings.accessMode);
      switch (e.type) {
        case 'freeze': {
          blinkSnapRef.current = null;
          if (!usable || switchHeldRef.current) return refused; // a keyboard switch press owns this cycle
          if (!scanRef.current?.current) return refused;
          // Detection lags the real eyelid onset. Auto-scan: credit the previous highlight if the
          // timer moved it just before. Manual stepping: the user moved it, so a closure right
          // after a move is ambiguous and discarded. A guarded target that was not armed: discard.
          const a = attributeClosure(
            highlightLogRef.current, e.at, (id) => armingRef.current.get(id) ?? true, ATTRIBUTION_TIMING,
            { onRecentChange: isManualNavMode(s.settings.accessMode) ? 'discard' : 'previous' },
          );
          // Refused: the engine voids this closure; if it was deliberate the person is told the
          // highlight just moved (never a silent no-op).
          if (!a.ok) return a.reason === 'no-target' ? refused : { ...refused, refusal: 'highlight-moved' };
          blinkSnapRef.current = { targetId: a.targetId, surfaceRevision: a.surfaceRevision, cycleId: newId(), at: e.at };
          freeze(a.targetId);
          return { applied: true, targetId: a.targetId };
        }
        case 'unfreeze':
          unfreeze();
          return refused;
        case 'accept': {
          if (e.command === 'NAV_NEXT' || e.command === 'NAV_PREV') {
            // Eyebrow NEXT (incl. hold-to-repeat) and jaw-drop BACK: the same guarded manual step.
            if (!usable) return refused;
            const before = scanRef.current?.current ?? null;
            const id = stepHighlight(e.at, e.command === 'NAV_PREV' ? 'previous' : 'next'); // logged at the gesture's own frame time
            // "Next" only when the highlight actually moved (a one-target surface does not).
            return id && id !== before ? { applied: true, targetId: id } : refused;
          }
          // SELECT: the arbiter sends accept BEFORE unfreeze; commit the closure-onset snapshot.
          const snap = blinkSnapRef.current;
          unfreeze();
          if (!snap || !usable) return refused;
          if (snap.surfaceRevision !== s.surfaceRevision) return { ...refused, refusal: 'highlight-moved' }; // a new screen opened mid-closure
          if (lastSwitchActivateRef.current >= snap.at) return refused; // another input already acted
          const action: Action = {
            type: 'ACTIVATE', targetId: snap.targetId, eventId: newId(), cycleId: snap.cycleId,
            surfaceRevision: snap.surfaceRevision, sessionEpoch: s.sessionEpoch, source: 'blink', at: now(),
          };
          // "Selected" only if the reducer will actually consume this cycle (it refuses stale
          // revisions, disabled / unarmed targets and repeats). The reducer is pure, so the same
          // check it runs on dispatch can be evaluated here first.
          const consumed = reducer(s, action).consumedCycles.includes(snap.cycleId);
          dispatch(action);
          return consumed ? { applied: true, targetId: snap.targetId } : refused;
        }
        case 'face-lost': {
          // Face lost, or tracking interrupted (tab hidden, rotation, camera stall: e.cause).
          unfreeze();
          if (!usable) return refused;
          if (currentSurface(s).kind === 'speaking') {
            // Never cut off the confirmed sentence because the person looked at their partner:
            // gestures are already cancelled; pause after speech ends if tracking is still lost.
            pendingPauseRef.current = e.cause ? 'interrupted' : 'face-lost';
            return refused;
          }
          dispatch({ type: 'SAFETY_PAUSE', at: now() });
          return refused;
        }
      }
    };
    blinkEngine.setCommandHandler(onCommand);
    return () => blinkEngine.setCommandHandler(null);
  }, [blinkEngine, stepHighlight]);

  // New surface / revision / session: no gesture carries over. The arbiter's reset() does not
  // emit 'unfreeze', so clear the local freeze here too.
  const surfaceKey = `${state.surfaceRevision}:${state.sessionEpoch}:${state.settings.accessMode}`;
  const [heldSurfaceKey, setHeldSurfaceKey] = useState(surfaceKey);
  if (heldSurfaceKey !== surfaceKey) {
    // Adjust during render (not in an effect) so the scan config never sees a stale freeze.
    setHeldSurfaceKey(surfaceKey);
    if (blinkHeld) setBlinkHeld(false);
  }
  useEffect(() => {
    blinkSnapRef.current = null;
    blinkPinRef.current = null;
    blinkEngine.resetGestures();
  }, [blinkEngine, surfaceKey]);

  // A face loss / tracking interruption during speech was deferred (see 'face-lost' above). When
  // the speaking surface ends: pause if tracking is still lost (an interruption always pauses,
  // since gestures could not be observed); a face that came back needs no pause.
  const surfaceKind = currentSurface(state).kind;
  const blinkStatus = blink.status;
  useEffect(() => {
    const pending = pendingPauseRef.current;
    if (!pending || surfaceKind === 'speaking') return;
    pendingPauseRef.current = null;
    const s = stateRef.current;
    if (!blinkUsableRef.current || s.phase !== 'active' || !isFaceMode(s.settings.accessMode)) return;
    const lost = blinkStatus === 'face-lost' || blinkStatus === 'no-face' || blinkStatus === 'multiple-faces';
    if (pending === 'interrupted' || lost) dispatch({ type: 'SAFETY_PAUSE', at: now() });
  }, [surfaceKind, blinkStatus]);

  // ---- Session, voice test, partner ----
  const blinkStartCamera = blink.startCamera;
  const startSession = useCallback((settings: Settings, profileDraft: ProfileDraft | null) => {
    getRunner().dispose(); // stop any voice test / stale capture before the new epoch
    dispatch({ type: 'SETUP_START', settings, profileDraft, epoch: newId(), at: now() });
    // Face modes: start the camera inside this click (wake lock + iPad camera policy). The
    // effect below is the fallback; startCamera is a no-op when the camera is already on.
    if (isFaceMode(settings.accessMode)) void blinkStartCamera();
  }, [getRunner, blinkStartCamera]);

  // A session in a face mode with a saved calibration needs the camera running (the main-screen
  // preview never starts it). One automatic attempt per session epoch + mode, so a denied or
  // unsupported camera is not re-requested in a loop.
  const autoCameraKeyRef = useRef<string | null>(null);
  const faceSessionKey = state.phase === 'active' && isFaceMode(state.settings.accessMode) && blink.active
    ? `${state.sessionEpoch}:${state.settings.accessMode}` : null;
  useEffect(() => {
    if (!faceSessionKey || autoCameraKeyRef.current === faceSessionKey) return;
    autoCameraKeyRef.current = faceSessionKey;
    if (!blink.cameraOn && blink.status === 'off') void blinkStartCamera();
  }, [faceSessionKey, blink.cameraOn, blink.status, blinkStartCamera]);

  const testVoice = useCallback((voiceURI: string | null, rate: number) => {
    if (stateRef.current.speech) return; // never talk over a conversational utterance
    speakVoiceTest(voiceURI, rate, stateRef.current.settings.language);
  }, []);

  const submit = useCallback((text: string, source: 'partner-typed' | 'partner-transcribed' | 'partner-edited') => {
    dispatch({ type: 'PARTNER_SUBMIT', text, source, at: now() });
    if (source !== 'partner-typed') {
      setTranscript({ status: 'none' });
      if (stateRef.current.recording.status === 'review' || stateRef.current.recording.status === 'error') {
        dispatch({ type: 'RECORDING_STATUS', status: 'idle', message: null });
      }
    }
  }, []);

  const startRecording = useCallback(() => {
    void getRunner().startRecording();
  }, [getRunner]);

  const finishRecording = useCallback(() => {
    void getRunner().finishRecording();
  }, [getRunner]);

  const discardTranscript = useCallback(() => {
    setTranscript({ status: 'none' });
    const st = stateRef.current.recording.status;
    if (st === 'review' || st === 'error') dispatch({ type: 'RECORDING_STATUS', status: 'idle', message: null });
  }, []);

  const setAccessCode = useCallback((code: string) => {
    const v = code.trim();
    accessRef.current = v;
    accessStore.set(v);
  }, []);

  const audio = useAudio({ getState: () => stateRef.current, dispatch, serverStatus, accessCode, statusAccessCode });
  const canRecord = recordingApis && !!serverStatus?.transcription.configured && state.settings.cloudConsent;

  const partner = useMemo(
    () => ({ submit, canRecord, startRecording, finishRecording, transcript, discardTranscript }),
    [submit, canRecord, startRecording, finishRecording, transcript, discardTranscript],
  );

  const stableDispatch = useCallback((a: Action) => dispatch(a), []);

  return {
    state,
    targets,
    highlightedTargetId: scanning ? highlightedTargetId : null,
    switchHeld: scanning && (switchHeld || blinkHeld),
    activate,
    dispatch: stableDispatch,
    startSession,
    serverStatus,
    voices,
    speechAvailable,
    testVoice,
    partner,
    accessCode,
    setAccessCode,
    blink,
    audio,
  };
}
