'use client';

import { useId, useState } from 'react';
import type { StillHereRuntime } from '@/runtime/contract';
import { LIMITS } from '@/core/limits';
import { DELIVERY_LABELS } from './labels';

export function PartnerPanel({ runtime }: { runtime: StillHereRuntime }) {
  const { state, partner } = runtime;
  const uid = useId();
  const [text, setText] = useState('');
  const [fullWarning, setFullWarning] = useState(false);
  const full = state.staged.length >= LIMITS.stagedQueue;
  const rec = state.recording.status;
  const recording = rec === 'recording';

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (full) {
      setFullWarning(true);
      return;
    }
    partner.submit(t, 'partner-typed');
    setText('');
    setFullWarning(false);
  };

  const recent = state.conversation.slice(-4);

  return (
    <aside className="partner" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="partner-title">Conversation partner</h2>
      <p className="hint">For the person talking with the user. Typing always works.</p>

      <form onSubmit={send} className="partner-form">
        <label htmlFor={`${uid}-say`}>Type what you said</label>
        <textarea
          id={`${uid}-say`}
          value={text}
          rows={3}
          maxLength={LIMITS.partnerInputChars}
          onChange={(e) => { setText(e.target.value); if (fullWarning) setFullWarning(false); }}
          aria-describedby={full ? `${uid}-full` : undefined}
        />
        <div className="partner-actions">
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>Send</button>
          <span className="hint">{text.length} / {LIMITS.partnerInputChars}</span>
        </div>
        {(full || fullWarning) && (
          <p id={`${uid}-full`} className="warning" role={fullWarning ? 'alert' : undefined}>
            The waiting list is full ({state.staged.length} waiting). Your text is kept; send it after the user answers or dismisses an item.
          </p>
        )}
      </form>

      <section className="partner-mic" aria-label="Record speech">
        {recording && (
          <p className="recording-indicator" role="status">
            <span className="rec-dot" aria-hidden="true" /> RECORDING — microphone is on
          </p>
        )}
        {rec === 'requesting' && <p role="status">Asking for microphone permission…</p>}
        {rec === 'transcribing' && <p role="status">Transcribing… The microphone is off.</p>}
        {rec === 'error' && state.recording.message && <p className="warning">{state.recording.message}</p>}

        {partner.canRecord ? (
          <>
            <div className="partner-actions">
              {recording ? (
                <button type="button" className="btn btn-stop" onClick={partner.finishRecording}>Finish</button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={partner.startRecording}
                  disabled={rec === 'requesting' || rec === 'transcribing' || partner.transcript.status === 'ready'}
                >
                  Talk
                </button>
              )}
            </div>
            <p className="hint">Talk records your voice and sends the audio to the transcription service. You review the text before it is used.</p>
          </>
        ) : (
          <p className="hint">Recording is unavailable: it needs cloud consent at setup, a configured transcription service, and a secure browser connection. Type instead.</p>
        )}

        {partner.transcript.status === 'ready' && (
          <TranscriptReview
            key={partner.transcript.captureId}
            initial={partner.transcript.text}
            onUse={(t, edited) => { if (t.trim()) partner.submit(t.trim(), edited ? 'partner-edited' : 'partner-transcribed'); }}
            onRerecord={() => { partner.discardTranscript(); partner.startRecording(); }}
            onBack={partner.discardTranscript}
            full={full}
          />
        )}
        {partner.transcript.status === 'empty' && (
          <div className="transcript">
            <p>No speech detected. Re-record or type instead.</p>
            <div className="partner-actions">
              <button type="button" className="btn" onClick={() => { partner.discardTranscript(); partner.startRecording(); }} disabled={!partner.canRecord}>Re-record</button>
              <button type="button" className="btn btn-quiet" onClick={partner.discardTranscript}>Back</button>
            </div>
          </div>
        )}
        {partner.transcript.status === 'failed' && (
          <div className="transcript">
            <p className="warning">{partner.transcript.message}</p>
            <button type="button" className="btn btn-quiet" onClick={partner.discardTranscript}>Back</button>
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="partner-recent" aria-label="Recent conversation">
          <h3>Recent</h3>
          <ol>
            {recent.map((e) => (
              <li key={e.value.id} className={e.role === 'partner' ? 'turn-partner' : 'turn-user'}>
                <span className="turn-who">{e.role === 'partner' ? 'Partner' : 'User'}</span>
                <span className="turn-text">{e.value.text}</span>
                {e.role === 'user' && <span className="item-meta">{DELIVERY_LABELS[e.value.delivery]}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}

function TranscriptReview({ initial, onUse, onRerecord, onBack, full }: {
  initial: string;
  onUse: (text: string, edited: boolean) => void;
  onRerecord: () => void;
  onBack: () => void;
  full: boolean;
}) {
  const uid = useId();
  const [value, setValue] = useState(initial);
  return (
    <div className="transcript">
      <label htmlFor={`${uid}-tx`}>Transcript (check and edit before using)</label>
      <textarea id={`${uid}-tx`} value={value} rows={3} maxLength={LIMITS.partnerInputChars} onChange={(e) => setValue(e.target.value)} />
      <div className="partner-actions">
        <button type="button" className="btn btn-primary" disabled={!value.trim() || full} onClick={() => onUse(value, value !== initial)}>Use this</button>
        <button type="button" className="btn" onClick={onRerecord}>Re-record</button>
        <button type="button" className="btn btn-quiet" onClick={onBack}>Back</button>
      </div>
      {full && <p className="warning">The waiting list is full. Keep this text until there is room.</p>}
    </div>
  );
}
