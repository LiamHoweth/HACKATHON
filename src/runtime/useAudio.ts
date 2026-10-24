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
import { getSharedElevenPlayer, MESSAGES, type ElevenSnapshot } from '@/audio/eleven-player';

export type UseAudioDeps = {
  getState: () => State;
  /** Reserved for the integrator; speech events are dispatched by the effects runner. */
  dispatch: (a: Action) => void;
  serverStatus: ServerStatus | null;
  accessCode: string;
};

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

  // Approved voices: fetched once per (configured, access code); never exposes provider secrets.
  const [fetched, setFetched] = useState<{ key: string; voices: VoiceOption[] } | null>(null);
  const voicesKey = configured ? `on:${accessCode}` : null;
  useEffect(() => {
    if (!voicesKey) return;
    const ctrl = new AbortController();
    const headers: Record<string, string> = {};
    if (accessCode) headers[ACCESS_HEADER] = accessCode;
    fetch('/api/voices', { headers, signal: ctrl.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((json: unknown) => setFetched({ key: voicesKey, voices: parseVoices(json) ?? [] }))
      .catch(() => {
        if (!ctrl.signal.aborted) setFetched({ key: voicesKey, voices: [] });
      });
    return () => ctrl.abort();
  }, [voicesKey, accessCode]);
  const voices = voicesKey && fetched?.key === voicesKey ? fetched.voices : EMPTY_VOICES;

  const enableAudio = useCallback((): Promise<boolean> => {
    const player = getSharedElevenPlayer();
    return player ? player.enableAudio() : Promise.resolve(false);
  }, []);

  const testNaturalVoice = useCallback(async (voiceChoiceId?: Id | null): Promise<void> => {
    const player = getSharedElevenPlayer();
    if (!player) return;
    // Unlock synchronously inside this same gesture, before any await.
    const unlocking = player.getSnapshot().unlocked ? null : player.enableAudio();
    if (!configuredRef.current) {
      await unlocking;
      player.notice(`${MESSAGES.notConfigured}. The basic device voice is still available.`);
      return;
    }
    const s = getStateRef.current();
    if (s.speech) {
      player.notice(MESSAGES.previewBusy); // never talk over a conversational utterance
      return;
    }
    if (unlocking && !(await unlocking)) return; // blocked: the player already shows why
    await player.preview({ accessCode: accessRef.current, voiceChoiceId: voiceChoiceId === undefined ? s.settings.voiceChoiceId : voiceChoiceId });
  }, []);

  return useMemo(
    () => ({
      unlocked: snap.unlocked,
      state: snap.state,
      message: snap.message,
      elevenLabsConfigured: configured,
      voices,
      enableAudio,
      testNaturalVoice,
      lastConfirmToPlayMs: snap.lastConfirmToPlayMs,
    }),
    [snap, configured, voices, enableAudio, testNaturalVoice],
  );
}

const EMPTY_VOICES: VoiceOption[] = [];
