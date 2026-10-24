'use client';

import { useId, useState } from 'react';
import type { StillHereRuntime } from '@/runtime/contract';
import { LIMITS } from '@/core/limits';
import { DELIVERY_LABELS } from './labels';
import type { ContinuousListening } from '@/runtime/useContinuousListening';

const LISTEN_LABELS = {
  off: 'Not listening',
  starting: 'Starting the microphone…',
  listening: 'Listening. Just talk.',
  hearing: 'Hearing you…',
  paused: 'Paused while Still Here speaks',
  error: 'Listening stopped',
} as const;

export function PartnerPanel({ runtime, listening }: { runtime: StillHereRuntime; listening?: ContinuousListening }) {
  const { state, partner } = runtime;
  const uid = useId();
  const [text, setText] = useState('');
  const [fullWarning, setFullWarning] = useState(false);
  // Collapsing only hides the body (it stays mounted), so typed text and transcripts are kept.
  const [collapsed, setCollapsed] = useState(false);
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

  const recent = state.conversation.slice(-6);

  return (
    <aside className={`partner${collapsed ? ' is-collapsed' : ''}`} aria-labelledby={`${uid}-title`}>
      <div className="partner-head">
        <h2 id={`${uid}-title`} className="partner-title">Conversation</h2>
        <button
          type="button"
          className="btn btn-small btn-quiet partner-toggle"
          aria-expanded={!collapsed}
          aria-controls={`${uid}-body`}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? 'Show' : 'Hide'}
          <span className="sr-only"> partner panel</span>
        </button>
      </div>
      <div id={`${uid}-body`} className="partner-body" hidden={collapsed}>

        {listening?.available && (
          <section className={`listen listen-${listening.enabled ? listening.status : 'off'}`}>
            <p className="listen-status" aria-live="off">
              <span className="listen-dot" aria-hidden="true" />
              {listening.enabled ? LISTEN_LABELS[listening.status] : 'Hands-free listening is off'}
              {listening.transcribing > 0 && <span className="listen-sub"> · Transcribing…</span>}
            </p>
            {listening.message && <p className="warning" role="alert">{listening.message}</p>}
            {listening.lastHeard && <p className="listen-heard">Heard: “{listening.lastHeard}”</p>}
            <button type="button" className="btn btn-small btn-quiet" onClick={() => listening.setEnabled(!listening.enabled)}>
              {listening.enabled ? 'Stop listening' : 'Listen hands-free'}
            </button>
          </section>
        )}

        {recent.length > 0 && (
          <section className="chat" tabIndex={0} aria-label="Recent conversation">
            <ol role="list">
              {recent.map((e) => (
                <li key={e.value.id} className={`bubble ${e.role === 'partner' ? 'bubble-partner' : 'bubble-user'}`}>
                  <span className="sr-only">{e.role === 'partner' ? 'Partner: ' : 'User: '}</span>
                  <span className="bubble-text">{e.value.text}</span>
                  {e.role === 'user' && <span className="bubble-meta">{DELIVERY_LABELS[e.value.delivery]}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}

        <details className="partner-manual" open={!(listening?.available && listening.enabled) || undefined}>
          <summary>Type or record instead</summary>
          <div className="partner-manual-body">
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

            <section className="partner-mic">
              {recording && (
                <p className="recording-indicator" role="status">
                  <span className="rec-dot" aria-hidden="true" /> RECORDING · mic is on
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
                  <p className="hint">Talk sends your voice to a transcription service. You check the text before it’s used.</p>
                </>
              ) : (
                <p className="hint">Recording needs cloud consent at setup, a transcription service, and a secure connection. Type instead for now.</p>
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
                  <p>Didn’t catch any speech. Record again or type it.</p>
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
          </div>
        </details>

      </div>
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
      {full && <p className="warning">The waiting list is full. Hold on to this text until there’s room.</p>}
    </div>
  );
}
