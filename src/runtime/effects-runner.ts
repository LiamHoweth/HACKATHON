// Executes reducer-queued effects exactly once each (StrictMode-safe via an executed-id set),
// then acknowledges them with EFFECTS_DONE. All decisions stay in the reducer; this file only
// performs I/O and reports results back as actions stamped with performance.now().
import type { Action, Effect, State } from '@/core/state';
import type { ApiResult, Id, ReplyRequest, ReplyResponseData } from '@/core/types';
import { ACCESS_HEADER, type TranscriptDraftState } from './contract';
import { SpeechController } from '@/audio/speech-controller';
import { getSharedElevenPlayer, type ElevenPlayer } from '@/audio/eleven-player';
import { RecordingController, recordingSupported } from '@/audio/recording-controller';
import { transcribe } from '@/audio/transcript-client';
import * as store from '@/adaptation/preference-store';
import { downloadMetrics } from '@/metrics/export';

export const GENERATION_TIMEOUT_MS = 30_000;
export const SPEECH_TAIL_GUARD_MS = 600;

const NETWORK_MESSAGE = 'Could not reach the server. Your phrases and own words still work.';

export type RunnerDeps = {
  dispatch: (a: Action) => void;
  getState: () => State;
  getAccessCode: () => string;
  /** serverStatus.transcription.configured */
  transcriptionConfigured: () => boolean;
  setTranscript: (t: TranscriptDraftState) => void;
  speech: SpeechController | null;
  /** Natural-voice (ElevenLabs) player. Omitted → the page-wide shared player (also used by useAudio). */
  eleven?: Pick<ElevenPlayer, 'speak' | 'stop' | 'cancelAll'> | null;
  newId: () => Id;
  now?: () => number;
  fetchImpl?: typeof fetch;
};

export class EffectsRunner {
  private executed = new Set<Id>();
  private generations = new Map<Id, { ctrl: AbortController; cancelledByEffect: boolean; timedOut: boolean }>();
  private transcription: { ctrl: AbortController; captureId: Id } | null = null;
  private lastSpeechEndAt = -Infinity;
  readonly recorder: RecordingController;
  private now: () => number;

  private get eleven() {
    return this.deps.eleven === undefined ? getSharedElevenPlayer() : this.deps.eleven;
  }

  constructor(private deps: RunnerDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.recorder = new RecordingController(deps.newId, () => void this.finishRecording());
  }

  /** Run every not-yet-executed effect, then acknowledge the whole list. */
  run(effects: Effect[]): void {
    if (!effects.length) return;
    for (const e of effects) {
      if (this.executed.has(e.id)) continue;
      this.executed.add(e.id);
      try {
        this.execute(e);
      } catch (err) {
        console.error('[still-here] effect failed', e.kind, err);
      }
    }
    while (this.executed.size > 2000) this.executed.delete(this.executed.values().next().value as Id);
    this.deps.dispatch({ type: 'EFFECTS_DONE', ids: effects.map((e) => e.id) });
  }

  get speechRecentlyEnded(): boolean {
    return this.now() - this.lastSpeechEndAt < SPEECH_TAIL_GUARD_MS;
  }

  /** Unmount / teardown. Keeps the executed set so a StrictMode remount cannot re-run effects. */
  dispose(): void {
    for (const g of this.generations.values()) {
      g.cancelledByEffect = true;
      g.ctrl.abort();
    }
    this.generations.clear();
    this.deps.speech?.cancelAll();
    this.eleven?.cancelAll();
    this.recorder.discard();
    this.transcription?.ctrl.abort();
    this.transcription = null;
  }

  private execute(e: Effect): void {
    const { dispatch, getState } = this.deps;
    switch (e.kind) {
      case 'generate':
        void this.generate(e.request);
        return;
      case 'generate-path':
        // Branching flow prefetch: same endpoint, headers, timeout and abort handling as 'generate'.
        void this.generatePath(e.request, e.batchId, e.pathIndex);
        return;
      case 'abort-generation': {
        const g = this.generations.get(e.requestId);
        if (g) {
          g.cancelledByEffect = true;
          g.ctrl.abort();
          this.generations.delete(e.requestId);
        }
        return;
      }
      case 'speak': {
        const u = e.utterance;
        const report = (kind: 'start' | 'end' | 'error' | 'interrupted' | 'uncertain') => {
          if (kind !== 'start') this.lastSpeechEndAt = this.now();
          dispatch({ type: 'SPEECH_EVENT', utteranceId: u.id, sessionEpoch: u.sessionEpoch, kind, at: this.now() });
        };
        // Never record over the app's own voice.
        if (this.recorder.status !== 'idle') this.discardRecording();
        if (u.provider === 'elevenlabs') {
          // Natural voice: exactly the confirmed text goes to /api/speech. Failures report 'error'
          // (the reducer then offers the labeled basic-voice retry); never a silent fallback.
          const eleven = this.eleven;
          if (!eleven) {
            report('error');
            return;
          }
          this.deps.speech?.cancelAll(); // never overlap the basic voice
          eleven.speak(u, { accessCode: this.deps.getAccessCode(), listener: (ev) => report(ev.kind), startedAt: this.now() });
          return;
        }
        // Labeled basic device voice (browser speechSynthesis).
        this.eleven?.cancelAll();
        if (!this.deps.speech) {
          report('error');
          return;
        }
        const st = getState().settings;
        this.deps.speech.speak(u, { voiceURI: st.voiceURI, rate: st.rate, lang: st.language }, (ev) => report(ev.kind));
        return;
      }
      case 'stop-speech':
        this.lastSpeechEndAt = this.now();
        this.deps.speech?.stop(e.utteranceId);
        this.eleven?.stop(e.utteranceId);
        return;
      case 'cancel-all-speech':
        this.lastSpeechEndAt = this.now();
        this.deps.speech?.cancelAll();
        this.eleven?.cancelAll();
        return;
      case 'persist': {
        const s = getState();
        if (!s.settings.persistOnDevice) return;
        dispatch({ type: 'STORAGE_WRITE_RESULT', ok: store.save(s) });
        return;
      }
      case 'clear-storage':
        store.clear();
        return;
      case 'start-recording':
        void this.startRecording();
        return;
      case 'finish-recording':
        void this.finishRecording();
        return;
      case 'discard-recording':
        this.discardRecording();
        return;
      case 'export-metrics':
        downloadMetrics(getState());
        return;
    }
  }

  private headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h['content-type'] = 'application/json';
    const code = this.deps.getAccessCode();
    if (code) h[ACCESS_HEADER] = code;
    return h;
  }

  private async generate(request: ReplyRequest): Promise<void> {
    const result = await this.fetchReplies(request);
    if (!result) return; // superseded; the reducer would also reject it
    this.deps.dispatch({ type: 'GENERATION_RESULT', identity: request.identity, result, at: this.now() });
  }

  private async generatePath(request: ReplyRequest, batchId: Id, pathIndex: number): Promise<void> {
    const result = await this.fetchReplies(request);
    if (!result) return;
    this.deps.dispatch({ type: 'PATH_RESULT', identity: request.identity, batchId, pathIndex, result, at: this.now() });
  }

  /** POST /api/replies. Resolves null when an abort-generation effect cancelled the request. */
  private async fetchReplies(request: ReplyRequest): Promise<ApiResult<ReplyResponseData> | null> {
    const requestId = request.identity.requestId;
    const entry = { ctrl: new AbortController(), cancelledByEffect: false, timedOut: false };
    this.generations.get(requestId)?.ctrl.abort();
    this.generations.set(requestId, entry);
    const timeout = setTimeout(() => {
      entry.timedOut = true;
      entry.ctrl.abort();
    }, GENERATION_TIMEOUT_MS);
    const fail = (code: 'NETWORK' | 'TIMEOUT' | 'PROVIDER_UNAVAILABLE', message: string): ApiResult<ReplyResponseData> => ({
      ok: false, requestId, error: { code, message, recoverable: true },
    });
    let result: ApiResult<ReplyResponseData>;
    try {
      const res = await (this.deps.fetchImpl ?? fetch)('/api/replies', {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify(request),
        signal: entry.ctrl.signal,
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      result =
        json && typeof json === 'object' && typeof (json as { ok?: unknown }).ok === 'boolean'
          ? (json as ApiResult<ReplyResponseData>)
          : fail('PROVIDER_UNAVAILABLE', 'The suggestion service had a problem. Your phrases and own words still work.');
    } catch {
      result = entry.timedOut
        ? fail('TIMEOUT', 'Suggestions took too long. Your phrases and own words still work.')
        : fail('NETWORK', NETWORK_MESSAGE);
    } finally {
      clearTimeout(timeout);
    }
    if (this.generations.get(requestId) === entry) this.generations.delete(requestId);
    if (entry.cancelledByEffect) return null;
    return result;
  }

  /** Shared by the start-recording effect and the partner Talk button. */
  async startRecording(): Promise<void> {
    const { dispatch, getState } = this.deps;
    const s = getState();
    const refuse = (message: string) => dispatch({ type: 'RECORDING_STATUS', status: 'idle', message });
    if (s.phase !== 'active') return refuse('Start a session before recording.');
    if (s.speech || this.speechRecentlyEnded) return refuse('Recording is available after the app finishes speaking.');
    if (!s.settings.cloudConsent) return refuse('Recording needs consent to send audio for transcription.');
    if (!recordingSupported()) return refuse('Recording is not available here (needs a secure page and a supported browser). Type instead.');
    if (!this.deps.transcriptionConfigured()) return refuse('Transcription is not configured. Type the message instead.');
    if (this.recorder.status !== 'idle' || this.transcription) return;
    this.deps.setTranscript({ status: 'none' });
    dispatch({ type: 'RECORDING_STATUS', status: 'requesting', message: 'Waiting for microphone permission…' });
    const epoch = s.sessionEpoch;
    const r = await this.recorder.start();
    if (getState().sessionEpoch !== epoch) {
      this.recorder.discard();
      return;
    }
    if (r.ok) {
      // Speech may have begun while the permission prompt was open.
      if (getState().speech) {
        this.discardRecording();
        return;
      }
      dispatch({ type: 'RECORDING_STATUS', status: 'recording', message: 'Recording. Choose Finish when done (20 seconds maximum).' });
    } else if (!r.cancelled) {
      dispatch({ type: 'RECORDING_STATUS', status: 'error', message: r.message });
    }
  }

  async finishRecording(): Promise<void> {
    const { dispatch, getState } = this.deps;
    if (this.recorder.status !== 'recording') return;
    const epoch = getState().sessionEpoch;
    dispatch({ type: 'RECORDING_STATUS', status: 'transcribing', message: 'Transcribing…' });
    const fin = await this.recorder.finish();
    if (getState().sessionEpoch !== epoch) return;
    if (!fin.ok) {
      if (fin.message !== 'Recording discarded.') {
        this.deps.setTranscript({ status: 'failed', message: fin.message });
        dispatch({ type: 'RECORDING_STATUS', status: 'error', message: fin.message });
      }
      return;
    }
    const ctrl = new AbortController();
    const job = { ctrl, captureId: fin.capture.captureId };
    this.transcription = job;
    const result = await transcribe(fin.capture, epoch, this.deps.getAccessCode(), ctrl.signal, this.deps.fetchImpl);
    if (this.transcription !== job || ctrl.signal.aborted || getState().sessionEpoch !== epoch) return;
    this.transcription = null;
    if (!result.ok) {
      this.deps.setTranscript({ status: 'failed', message: result.error.message });
      dispatch({ type: 'RECORDING_STATUS', status: 'error', message: result.error.message });
      return;
    }
    const text = result.data.text.trim();
    // A DRAFT for partner review. Never auto-submitted.
    this.deps.setTranscript(text ? { status: 'ready', captureId: job.captureId, text } : { status: 'empty', captureId: job.captureId });
    dispatch({ type: 'RECORDING_STATUS', status: 'review', message: text ? 'Review the transcript before using it.' : 'No words were heard. Try again or type.' });
  }

  discardRecording(): void {
    const wasCapturing = this.recorder.discard();
    const wasTranscribing = !!this.transcription;
    this.transcription?.ctrl.abort();
    this.transcription = null;
    if (!wasCapturing && !wasTranscribing) return;
    const s = this.deps.getState();
    if (s.phase !== 'active') {
      this.deps.setTranscript({ status: 'none' });
      this.deps.dispatch({ type: 'RECORDING_STATUS', status: 'idle', message: null });
      return;
    }
    const message = s.speech
      ? 'Recording discarded because the app started speaking.'
      : 'Recording stopped and discarded.';
    this.deps.dispatch({ type: 'RECORDING_STATUS', status: 'idle', message });
  }
}
