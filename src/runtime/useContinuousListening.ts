'use client';
// Hands-free partner listening: keeps the microphone open during a session (when recording is
// allowed), and submits each transcribed utterance as a partner line, so nobody has to press Talk.
// Paused while the app speaks (plus a short tail) and during push-to-talk recording.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StillHereRuntime } from './contract';
import { ContinuousListener, usableTranscript, type ListenerSegment, type ListenerStatus } from '@/audio/continuous-listener';
import { transcribe } from '@/audio/transcript-client';
import { SPEECH_TAIL_GUARD_MS } from './effects-runner';

export type ContinuousListening = {
  available: boolean;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  status: ListenerStatus;
  message: string | null;
  transcribing: number;
  lastHeard: string | null;
};

let segmentSeq = 0;

export function useContinuousListening(runtime: StillHereRuntime): ContinuousListening {
  const { state, partner } = runtime;
  const available = state.phase === 'active' && partner.canRecord;
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<ListenerStatus>('off');
  const [message, setMessage] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(0);
  const [lastHeard, setLastHeard] = useState<string | null>(null);

  // Latest values for the listener callbacks (they outlive renders).
  const latest = useRef({ runtime });
  useEffect(() => {
    latest.current.runtime = runtime;
  });

  const onSegment = useCallback((seg: ListenerSegment) => {
    const rt = latest.current.runtime;
    const epoch = rt.state.sessionEpoch;
    const captureId = `listen-${Date.now()}-${++segmentSeq}`;
    setTranscribing((n) => n + 1);
    void transcribe({ captureId, blob: seg.blob, filename: `capture.${seg.ext}`, mimeType: seg.mimeType }, epoch, rt.accessCode)
      .then((result) => {
        const now = latest.current.runtime;
        if (now.state.sessionEpoch !== epoch || now.state.phase !== 'active') return;
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        const text = result.data.text.trim();
        if (!usableTranscript(text, seg.speechMs)) return;
        setMessage(null);
        setLastHeard(text);
        now.partner.submit(text, 'partner-transcribed');
      })
      .finally(() => setTranscribing((n) => Math.max(0, n - 1)));
  }, []);

  const listenerRef = useRef<ContinuousListener | null>(null);

  // Start/stop with the session and the toggle.
  useEffect(() => {
    if (!available || !enabled) return;
    const listener = new ContinuousListener(onSegment, (st, msg) => {
      setStatus(st);
      if (st === 'error') setMessage(msg ?? 'Listening stopped.');
      else if (st === 'listening') setMessage(null);
    });
    listenerRef.current = listener;
    void listener.start();
    return () => {
      listener.stop();
      if (listenerRef.current === listener) listenerRef.current = null;
      setStatus('off');
    };
  }, [available, enabled, onSegment]);

  // Never listen to the app's own voice, and leave the mic to push-to-talk when it is in use.
  const speaking = !!state.speech;
  const pushToTalk = state.recording.status === 'requesting' || state.recording.status === 'recording';
  useEffect(() => {
    const l = listenerRef.current;
    if (!l) return;
    if (speaking || pushToTalk) {
      l.setPaused(true);
      return;
    }
    const resume = setTimeout(() => l.setPaused(false), SPEECH_TAIL_GUARD_MS + 300);
    return () => clearTimeout(resume);
  }, [speaking, pushToTalk, status]);

  return { available, enabled, setEnabled, status, message, transcribing, lastHeard };
}
