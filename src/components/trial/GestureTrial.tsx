'use client';
// /trial — on-device gesture acceptance-trial recorder (brief §24). Presentation + wiring only:
// the protocol and all counting live in trial-session.ts. Uses the face engine standalone via
// useBlink('brow-blink'); its accepted commands go ONLY to the trial session (dummy targets),
// never to the app reducer. No image, video or landmark data is stored or exported.
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useBlink } from '@/runtime/useBlink';
import type { BrowStatus } from '@/runtime/contract';
import { BLINK_STATUS_LABELS } from '@/components/labels';
import {
  PROTOCOL, RESUME_TARGET, TRIAL_LABEL, TRIAL_TARGETS, TrialSession, stepSpec, summarize, type StepId, type TrialView,
} from './trial-session';
import { TrialResults } from './TrialResults';
import styles from './trial.module.css';

const TICK_MS = 200;
const ACK_SHOW_MS = 1500;

type Conditions = { lighting: string; glasses: string; angle: string; notes: string };

function orientationNow(): string {
  if (typeof window === 'undefined') return 'unknown';
  const t = typeof screen !== 'undefined' ? screen.orientation?.type : undefined;
  if (t) return t;
  return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
}

function deviceInfo(): Record<string, unknown> {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? null,
    screen: {
      width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    orientation: orientationNow(),
  };
}

function fileStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function GestureTrial() {
  const blink = useBlink('brow-blink');
  const { engine, subscribe, attachPreview, startCamera, stopCamera } = blink;
  const [session] = useState(() => new TrialSession(
    typeof performance !== 'undefined' ? performance.now() : 0, new Date().toISOString(),
  ));
  const view: TrialView = useSyncExternalStore(session.subscribe, session.getView, session.getView);
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<StepId>('A');
  const [conditions, setConditions] = useState<Conditions>({ lighting: '', glasses: '', angle: '', notes: '' });
  const [copied, setCopied] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const calibrated = blink.calibration !== null && blink.browCalibration !== null;
  const cameraOn = blink.cameraOn;
  const tracking = cameraOn && !['off', 'unsupported', 'permission-denied', 'starting'].includes(blink.status);

  // The trial is the ONLY consumer of accepted commands on this page (no app dispatch).
  useEffect(() => {
    engine.setCommandHandler((e) => session.handleCommand(e, performance.now()));
    const unsub = subscribe((e) => session.handleRaw(e, performance.now()));
    return () => {
      unsub();
      engine.setCommandHandler(null);
    };
  }, [engine, subscribe, session]);

  // Mirrored self-view; the engine owns the stream (attach once, detach on unmount).
  useEffect(() => {
    attachPreview(videoRef.current);
    return () => attachPreview(null);
  }, [attachPreview]);

  // Clock: auto-advance settle/fixed windows and countdowns; sample processed FPS once a second.
  const fpsRef = useRef(0);
  useEffect(() => {
    fpsRef.current = blink.fps;
  }, [blink.fps]);
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      const t = performance.now();
      session.tick(t);
      setNow(t);
      n += 1;
      if (n % Math.round(1000 / TICK_MS) === 0) session.sampleFps(fpsRef.current);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [session]);

  // Brow status (~10 Hz) for approximate hold durations.
  const browStatus: BrowStatus = blink.browStatus;
  useEffect(() => {
    session.onBrowStatus(browStatus, performance.now());
  }, [browStatus, session]);

  // Environment changes the brief asks to test: orientation and background/resume.
  const [orientation, setOrientation] = useState('unknown');
  useEffect(() => {
    const onOrient = () => {
      const o = orientationNow();
      setOrientation(o);
      session.logEnv(performance.now(), 'orientation-change', o);
    };
    const onVis = () => session.logEnv(performance.now(), document.hidden ? 'page-hidden' : 'page-visible');
    const t = setTimeout(() => setOrientation(orientationNow()), 0);
    window.addEventListener('orientationchange', onOrient);
    window.addEventListener('resize', onOrient);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(t);
      window.removeEventListener('orientationchange', onOrient);
      window.removeEventListener('resize', onOrient);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [session]);

  const activeId = view.activeStep;
  const shownId: StepId = activeId ?? selected;
  const spec = stepSpec(shownId);
  const run = view.runs[shownId];
  const prompt = run && run.status === 'running' ? run.prompts[run.current] : null;
  const promptSpec = prompt ? spec.prompts[prompt.index] : null;
  const remaining = prompt && promptSpec?.windowMs ? Math.max(0, promptSpec.windowMs - ((now - session.t0) - prompt.startedAt)) : null;
  const settling = prompt?.phase === 'settling';
  const canMiss = !!prompt && prompt.phase === 'open' && prompt.expect !== 'none';
  const ack = view.lastAck && (now - session.t0) - view.lastAck.at < ACK_SHOW_MS ? view.lastAck : null;
  const summary = summarize(view.runs);
  const stepSummary = summary.steps.find((s) => s.id === shownId);

  const startStep = () => {
    engine.resetGestures(); // a new step behaves like a new surface: no gesture carries over
    session.startStep(shownId, performance.now());
  };

  const buildJson = () => {
    const cal = blink.calibration;
    const brow = blink.browCalibration;
    const data = session.exportData({
      device: deviceInfo(),
      conditions: { ...conditions },
      calibration: { blink: cal ? { ...cal } : null, brow: brow ? { ...brow } : null, mode: 'brow-blink' },
    }, new Date().toISOString());
    return JSON.stringify(data, null, 2);
  };

  const download = () => {
    const blob = new Blob([buildJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `still-here-gesture-trial-${fileStamp(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildJson());
      setCopied('Copied JSON to the clipboard.');
    } catch {
      setCopied('Copy failed — use Download instead.');
    }
  };

  const resetAll = () => {
    if (window.confirm('Clear every recorded step and event? This cannot be undone.')) session.resetAll(performance.now());
  };

  const statusLabel = BLINK_STATUS_LABELS[blink.status]?.text ?? blink.status;
  const expectLabel = (e: string) => (e === 'NAV_NEXT' ? 'Next' : e === 'SELECT' ? 'Select' : e === 'resume' ? 'Pause → blink resume' : 'No command');

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.h1}>Still Here — gesture trial recorder</h1>
          <p className={styles.badge} role="note">{TRIAL_LABEL}</p>
        </div>
        <Link href="/" className="btn btn-quiet">Back to app / setup</Link>
      </header>

      <div className={styles.layout}>
        {/* ---------- Left: camera + steps ---------- */}
        <aside className={styles.side} aria-label="Camera and protocol steps">
          <section className={styles.card}>
            <div className={styles.previewFrame}>
              <video
                ref={videoRef}
                className={styles.previewVideo}
                muted
                playsInline
                autoPlay
                aria-label="Live camera self-view, mirrored. Not recorded."
              />
              {!tracking && <span className={styles.previewOff}>{statusLabel}</span>}
            </div>
            <p className={styles.caption}>Live preview — not recorded, not saved</p>
            <p className={styles.status} aria-live="polite"><strong>{statusLabel}</strong> · {blink.feedback.label}</p>
            <p className={styles.meta}>Faces {blink.faceCount} · {blink.fps} fps processed · {orientation}</p>
            {!cameraOn ? (
              <button type="button" className="btn btn-primary btn-large" onClick={() => void startCamera()}>Turn camera on</button>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={stopCamera}>Turn camera off</button>
            )}
            {(blink.status === 'unsupported' || blink.status === 'permission-denied') && <p className={styles.warn}>{blink.message}</p>}
          </section>

          <section className={styles.card}>
            <h2 className={styles.h2}>Calibration</h2>
            {calibrated ? (
              <p className={styles.ok}>
                Saved calibration in use: blink ≥ {blink.calibration?.minClosureMs} ms, eyebrow hold {blink.browCalibration?.holdMs} ms.
              </p>
            ) : (
              <p className={styles.warn}>
                No saved eyebrow + blink calibration on this device. <Link href="/">Run setup and calibration first</Link>, then return to /trial.
              </p>
            )}
          </section>

          <nav className={styles.card} aria-label="Protocol steps">
            <h2 className={styles.h2}>Protocol</h2>
            <ol className={styles.stepList}>
              {PROTOCOL.map((s) => {
                const r = view.runs[s.id];
                const done = r ? r.prompts.filter((p) => p.phase === 'done' && p.outcome !== 'not-run').length : 0;
                const state = r?.status === 'running' ? 'running' : r?.status === 'complete' ? 'done' : r ? 'ended early' : 'not run';
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`${styles.stepBtn} ${shownId === s.id ? styles.stepBtnOn : ''}`}
                      aria-current={shownId === s.id ? 'step' : undefined}
                      disabled={activeId !== null && activeId !== s.id}
                      onClick={() => setSelected(s.id)}
                    >
                      <span className={styles.stepLetter}>{s.id}</span>
                      <span>{s.title}<br /><small>{state} · {done}/{s.prompts.length}</small></span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>

        {/* ---------- Main: current step ---------- */}
        <section className={styles.main} aria-label="Current step">
          <div className={styles.card}>
            <h2 className={styles.stepTitle}>Step {spec.id} — {spec.title}</h2>
            <p className={styles.facilitator}><strong>Facilitator:</strong> {spec.facilitator}</p>
          </div>

          <div className={`${styles.prompt} ${view.paused ? styles.promptPaused : settling ? styles.promptSettling : ''}`} aria-live="polite">
            {view.paused ? (
              <>
                <p className={styles.promptKicker}>Paused — face lost</p>
                <p className={styles.promptTitle}>Look at the screen, then one long blink to resume</p>
              </>
            ) : prompt && promptSpec ? (
              <>
                <p className={styles.promptKicker}>
                  Prompt {prompt.index + 1} of {spec.prompts.length} · expects: {expectLabel(prompt.expect)}
                  {remaining !== null && ` · ${Math.ceil(remaining / 1000)} s left`}
                </p>
                <p className={styles.promptTitle}>{settling ? 'Relax…' : promptSpec.title}</p>
                <p className={styles.promptDetail}>
                  {settling ? 'Recorded. The next prompt opens in a moment.' : prompt.target ? `${promptSpec.detail} Select: ${prompt.target}.` : promptSpec.detail}
                </p>
              </>
            ) : (
              <>
                <p className={styles.promptKicker}>{run ? `Step ${spec.id} ${run.status === 'complete' ? 'complete' : 'ended early'}` : 'Ready'}</p>
                <p className={styles.promptTitle}>{run ? 'Pick the next step, or run this one again' : 'Tap Start step when the participant is ready'}</p>
              </>
            )}
            <div className={styles.meters}>
              <Meter label="Eyebrow hold" value={blink.browProgress} />
              <Meter label="Eye closure" value={blink.closureProgress} />
            </div>
          </div>

          <div className={styles.board} aria-label="Dummy targets (trial only)">
            {view.paused ? (
              <div className={`${styles.target} ${styles.targetOn}`}>{RESUME_TARGET}</div>
            ) : TRIAL_TARGETS.map((t, i) => (
              <div
                key={t}
                className={`${styles.target} ${view.highlight === i ? styles.targetOn : ''} ${prompt?.target === t ? styles.targetPrompted : ''}`}
              >
                {t}{prompt?.target === t && <small>select this</small>}
              </div>
            ))}
            <p className={styles.ack} aria-live="assertive">
              {ack ? (ack.command === 'NAV_NEXT' ? `Next → ${ack.target}` : ack.command === 'SELECT' ? `Selected ${ack.target}`
                : ack.command === 'RESUME' ? 'Resumed' : 'Next blocked (paused)') : ' '}
            </p>
          </div>

          <div className={styles.controls}>
            {!activeId ? (
              <button type="button" className="btn btn-primary btn-large" disabled={!calibrated || !tracking} onClick={startStep}>
                {run ? `Restart step ${spec.id} (replaces results)` : `Start step ${spec.id}`}
              </button>
            ) : (
              <>
                <button type="button" className={`btn btn-large ${styles.missBtn}`} disabled={!canMiss}
                  onClick={() => session.markMiss(performance.now())}>Mark miss</button>
                <button type="button" className={`btn btn-large ${styles.wrongBtn}`}
                  onClick={() => session.markWrongTarget(performance.now())}>Mark wrong target</button>
                <button type="button" className="btn btn-quiet" onClick={() => session.endStepEarly(performance.now())}>End step early</button>
              </>
            )}
            {view.paused && (
              <button type="button" className="btn btn-quiet" onClick={() => session.touchResume(performance.now())}>Facilitator resume (touch)</button>
            )}
            {!calibrated && <p className={styles.warn}>Start is disabled until a saved calibration exists.</p>}
            {calibrated && !tracking && <p className={styles.meta}>Turn the camera on to start.</p>}
          </div>

          {stepSummary && (
            <dl className={styles.counters} aria-label={`Step ${spec.id} live counters`}>
              <Counter k="Hits" v={stepSummary.hits} />
              <Counter k="Missed" v={stepSummary.missed} bad />
              <Counter k="Inadvertent Next" v={stepSummary.inadvertentNext} bad />
              <Counter k="Extra Next (hold)" v={stepSummary.extraNextDuringHold} bad />
              <Counter k="Inadvertent Select" v={stepSummary.inadvertentSelect + stepSummary.extraSelect} bad />
              <Counter k="Wrong target" v={stepSummary.wrongTargetSelections} bad />
              <Counter k="Face-loss pauses" v={stepSummary.faceLossPauses} />
              <Counter k="Closure ms (median)" v={stepSummary.closureMs.median ?? '—'} />
            </dl>
          )}
        </section>
      </div>

      <TrialResults summary={summary} />

      <section className={styles.card} aria-label="Conditions and export">
        <h2 className={styles.h2}>Conditions and export</h2>
        <p className={styles.meta}>Do not enter names or identifying details. Device info, counts and timings only; no images or video are exported.</p>
        <div className={styles.condGrid}>
          <label>Lighting
            <select value={conditions.lighting} onChange={(e) => setConditions({ ...conditions, lighting: e.target.value })}>
              <option value="">Not recorded</option>
              <option>Bright indoor</option>
              <option>Normal indoor</option>
              <option>Dim</option>
              <option>Backlit (window behind)</option>
            </select>
          </label>
          <label>Glasses
            <select value={conditions.glasses} onChange={(e) => setConditions({ ...conditions, glasses: e.target.value })}>
              <option value="">Not recorded</option>
              <option>No glasses</option>
              <option>Glasses</option>
            </select>
          </label>
          <label>Device angle / distance
            <input type="text" maxLength={80} placeholder="e.g. stand, 45 cm, slightly below eye level"
              value={conditions.angle} onChange={(e) => setConditions({ ...conditions, angle: e.target.value })} />
          </label>
          <label className={styles.condWide}>Notes
            <textarea maxLength={500} rows={2} value={conditions.notes}
              onChange={(e) => setConditions({ ...conditions, notes: e.target.value })} />
          </label>
        </div>
        <div className={styles.controls}>
          <button type="button" className="btn btn-primary btn-large" onClick={download}>Download results (JSON)</button>
          <button type="button" className="btn btn-quiet" onClick={() => void copy()}>Copy JSON</button>
          <button type="button" className="btn btn-quiet" onClick={resetAll}>Clear all results</button>
          <span className={styles.meta} aria-live="polite">{copied ?? `${view.eventCount} events logged`}</span>
        </div>
      </section>
    </main>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={styles.meter}>
      <span>{label}</span>
      <div className={styles.meterTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={styles.meterFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Counter({ k, v, bad }: { k: string; v: number | string; bad?: boolean }) {
  return (
    <div className={`${styles.counter} ${bad && typeof v === 'number' && v > 0 ? styles.counterBad : ''}`}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
