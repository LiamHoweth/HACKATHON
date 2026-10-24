'use client';
// Browser runtime: owns the reducer, executes effects, drives scanning/switch input, speech,
// recording, storage, and server status. Implements StillHereRuntime (src/runtime/contract.ts).
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { Action, InputSource, Settings, State } from '@/core/state';
import { initialState } from '@/core/state';
import type { ProfileDraft } from '@/core/types';
import { newId, reducer } from '@/core/reducer';
import { targetsFor } from '@/core/targets';
import { ACCESS_HEADER, type ServerStatus, type StillHereRuntime, type TranscriptDraftState, type VoiceInfo } from './contract';
import { EffectsRunner } from './effects-runner';
import { ScanController } from '@/access/scan-controller';
import { InputController } from '@/access/input-controller';
import { SpeechController, type SynthLike } from '@/audio/speech-controller';
import { getSynth, speakVoiceTest, subscribeVoices } from '@/audio/voices';
import { recordingSupported } from '@/audio/recording-controller';
import * as store from '@/adaptation/preference-store';

const ACCESS_KEY = 'still-here:access';
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

  // ---- Server status (refetched when the access code changes) ----
  useEffect(() => {
    const ctrl = new AbortController();
    const headers: Record<string, string> = {};
    if (accessCode) headers[ACCESS_HEADER] = accessCode;
    fetch('/api/status', { headers, signal: ctrl.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((json: unknown) => {
        const s = isServerStatus(json) ? json : null;
        serverStatusRef.current = s;
        setServerStatus(s);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        serverStatusRef.current = null;
        setServerStatus(null);
      });
    return () => ctrl.abort();
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
  }, [state.sessionEpoch]);

  // ---- Targets and scanning ----
  const targets = useMemo(() => targetsFor(state), [state]);
  const enabledIds = useMemo(() => targets.filter((t) => t.enabled).map((t) => t.id), [targets]);
  const enabledKey = enabledIds.join('|');
  const scanning = state.settings.accessMode === 'switch' && state.phase === 'active';

  useEffect(() => {
    if (!scanRef.current) scanRef.current = new ScanController(setHighlighted);
    scanRef.current.update({
      active: scanning,
      ids: enabledKey ? enabledKey.split('|') : [],
      surfaceRevision: state.surfaceRevision,
      intervalMs: state.settings.scanIntervalMs,
      readingPauseMs: state.settings.readingPauseMs,
      held: scanning && switchHeld,
      hidden,
    });
  }, [scanning, enabledKey, state.surfaceRevision, state.settings.scanIntervalMs, state.settings.readingPauseMs, switchHeld, hidden]);

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

  useEffect(() => {
    const input = new InputController({
      getMode: () => stateRef.current.settings.accessMode,
      getHighlighted: () => (stateRef.current.phase === 'active' ? scanRef.current?.current ?? null : null),
      getSurfaceRevision: () => stateRef.current.surfaceRevision,
      newId,
      onSwitchActivate: ({ targetId, surfaceRevision, cycleId }) => {
        const s = stateRef.current;
        dispatch({
          type: 'ACTIVATE', targetId, eventId: newId(), cycleId,
          surfaceRevision, sessionEpoch: s.sessionEpoch, source: 'switch', at: now(),
        });
      },
      onHeldChange: setSwitchHeld,
      onSafetyPause: () => dispatch({ type: 'SAFETY_PAUSE', at: now() }),
    });
    return input.attach(window);
  }, []);

  // ---- Session, voice test, partner ----
  const startSession = useCallback((settings: Settings, profileDraft: ProfileDraft | null) => {
    getRunner().dispose(); // stop any voice test / stale capture before the new epoch
    dispatch({ type: 'SETUP_START', settings, profileDraft, epoch: newId(), at: now() });
  }, [getRunner]);

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
    switchHeld: scanning && switchHeld,
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
  };
}
