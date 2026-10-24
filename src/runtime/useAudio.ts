'use client';
// React adapter for the natural-voice (ElevenLabs) player. Implements AudioRuntime
// (src/runtime/contract.ts). Playback of conversation messages is driven by the effects runner's
// `speak` effect through the same page-wide ElevenPlayer; this hook only exposes state, the
// gesture-bound enableAudio(), the setup preview, and the server's approved voice list.
//
// Integrator: inside useStillHere, add
//   const audio = useAudio({ getState: () => stateRef.current, dispatch, serverStatus, accessCode });
// and return `audio` on the runtime object. Call `audio.enableAudio()` / `audio.testNaturalVoice()`
// ONLY directly from a real click/touch handler (iPad Safari autoplay policy); never from a blink,
// timer, or effect.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Action, State } from '@/core/state';
import type { Id, VoiceOption } from '@/core/types';
import { ACCESS_HEADER, type AudioRuntime, type ServerStatus } from './contract';
import { getSharedElevenPlayer, MESSAGES, type ElevenSnapshot, type PreviewOutcome } from '@/audio/eleven-player';
import { observeElevenPlayer } from '@/metrics/gesture-metrics';

export type { PreviewOutcome };
/**
 * testNaturalVoice with its real outcome. AudioRuntime in contract.ts still declares
 * Promise<void>; until the integrator widens it, callers cast to this type.
 */
export type NaturalVoiceTest = (voiceChoiceId?: Id | null) => Promise<PreviewOutcome>;

export type UseAudioDeps = {
  getState: () => State;
  /** Reserved for the integrator; speech events are dispatched by the effects runner. */
  dispatch: (a: Action) => void;
  serverStatus: ServerStatus | null;
  /** Current access code (sent with previews). */
  accessCode: string;
  /**
   * The access code `serverStatus` was checked with (the debounced value). Voices are fetched
   * with this code, never per keystroke. Defaults to `accessCode`.
   */
  statusAccessCode?: string;
};

/**
 * Whether /api/voices may be requested: natural voice is configured AND either the server needs
 * no access code or it confirmed the code in use is valid. A wrong or half-typed code never
 * reaches /api/voices, so typing cannot spend failed-attempt budget there.
 */
export function voicesFetchAllowed(status: ServerStatus | null): boolean {
  if (!status?.speech?.configured) return false;
  return status.accessCodeValid === true || status.accessRequired === false;
}

const IDLE: ElevenSnapshot = { state: 'idle', message: null, unlocked: false, lastConfirmToPlayMs: null };
const subscribe = (fn: () => void) => getSharedElevenPlayer()?.subscribe(fn) ?? (() => {});
const getSnapshot = () => getSharedElevenPlayer()?.getSnapshot() ?? IDLE;
const getServerSnapshot = () => IDLE;

function parseVoices(json: unknown): VoiceOption[] | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as { ok?: unknown; data?: { voices?: unknown } };
  if (o.ok !== true || !o.data || !Array.isArray(o.data.voices)) return null;
  return o.data.voices
    .filter((v): v is { id: string; name: string; description?: unknown } =>
      !!v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' && typeof (v as { name?: unknown }).name === 'string')
    .map((v) => ({ id: v.id, name: v.name, description: typeof v.description === 'string' ? v.description : null }));
}

export function useAudio(deps: UseAudioDeps): AudioRuntime {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const configured = !!deps.serverStatus?.speech?.configured;
  const { accessCode } = deps;

  const getStateRef = useRef(deps.getState);
  const configuredRef = useRef(configured);
  const accessRef = useRef(accessCode);
  useEffect(() => {
    getStateRef.current = deps.getState;
    configuredRef.current = configured;
    accessRef.current = accessCode;
  });

  // Approved voices: fetched once per validated (status, access code); never per keystroke and
  // never with an unconfirmed code. Never exposes provider secrets.
  const statusCode = deps.statusAccessCode ?? accessCode;
  const allowed = voicesFetchAllowed(deps.serverStatus);
  const [fetched, setFetched] = useState<{ key: string; voices: VoiceOption[] } | null>(null);
  const voicesKey = allowed ? `on:${statusCode}` : null;
  useEffect(() => {
    if (!voicesKey) return;
    const ctrl = new AbortController();
    const headers: Record<string, string> = {};
    if (statusCode) headers[ACCESS_HEADER] = statusCode;
    fetch('/api/voices', { headers, signal: ctrl.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((json: unknown) => setFetched({ key: voicesKey, voices: parseVoices(json) ?? [] }))
      .catch(() => {
        if (!ctrl.signal.aborted) setFetched({ key: voicesKey, voices: [] });
      });
    return () => ctrl.abort();
  }, [voicesKey, statusCode]);
  const voices = voicesKey && fetched?.key === voicesKey ? fetched.voices : EMPTY_VOICES;

  const enableAudio = useCallback((): Promise<boolean> => {
    const player = getSharedElevenPlayer();
    return player ? player.enableAudio() : Promise.resolve(false);
  }, []);

  // Content-free voice timing for measurement mode.
  useEffect(() => {
    const p = getSharedElevenPlayer();
    return p ? observeElevenPlayer(p) : undefined;
  }, []);

  const testNaturalVoice = useCallback<NaturalVoiceTest>(async (voiceChoiceId) => {
    const player = getSharedElevenPlayer();
    if (!player) return 'failed';
    // Unlock synchronously inside this same gesture, before any await.
    const unlocking = player.getSnapshot().unlocked ? null : player.enableAudio();
    if (!configuredRef.current) {
      await unlocking;
      player.notice(`${MESSAGES.notConfigured}. The basic device voice is still available.`);
      return 'not-configured';
    }
    const s = getStateRef.current();
    if (s.speech) {
      player.notice(MESSAGES.previewBusy); // never talk over a conversational utterance
      return 'busy';
    }
    if (unlocking && !(await unlocking)) {
      // The player already shows why (blocked by autoplay policy, or no audio element).
      return player.getSnapshot().state === 'blocked' ? 'blocked' : 'failed';
    }
    return player.preview({ accessCode: accessRef.current, voiceChoiceId: voiceChoiceId === undefined ? s.settings.voiceChoiceId : voiceChoiceId });
  }, []);

  return useMemo(
    () => ({
      unlocked: snap.unlocked,
      state: snap.state,
      message: snap.message,
      elevenLabsConfigured: configured,
      voices,
      enableAudio,
      // Returns the PreviewOutcome at runtime; see NaturalVoiceTest.
      testNaturalVoice,
      lastConfirmToPlayMs: snap.lastConfirmToPlayMs,
    }),
    [snap, configured, voices, enableAudio, testNaturalVoice],
  );
}

const EMPTY_VOICES: VoiceOption[] = [];
