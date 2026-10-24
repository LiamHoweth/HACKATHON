'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { BlinkCalibration as Calibration, BlinkGestureEvent, BlinkRuntime, CalibrationStage, StillHereRuntime } from '@/runtime/contract';
import { BlinkStatus, ClosureBar } from './BlinkStatus';
import { BLINK_ARMED } from './labels';

type Props = {
  runtime: StillHereRuntime;
  /** Scan speed chosen in setup; the practice highlight uses the same pace. */
  scanIntervalMs: number;
  /** Calibration + practice finished: enter the session with blink control. */
  onComplete: () => void;
  /** Blink is not working for this person: enter the session with switch scanning. */
  onFallback: () => void;
  /** Back to the setup form. */
  onBack: () => void;
};

const STEPS: { stage: CalibrationStage; label: string }[] = [
  { stage: 'consent', label: 'Camera' },
  { stage: 'position', label: 'Position' },
  { stage: 'baseline', label: 'Look normally' },
  { stage: 'natural', label: 'Natural blinks' },
  { stage: 'deliberate', label: 'Deliberate blinks' },
  { stage: 'review', label: 'Check timing' },
  { stage: 'practice-select', label: 'Practice select' },
  { stage: 'practice-confirm', label: 'Practice confirm' },
];

const MIN_DELIBERATE_SAMPLES = 3;
const MIN_CLOSURE_STEP_MS = 50;

/**
 * Guided blink calibration and tutorial. A helper may click the setup controls here
 * (camera permission, Continue, Accept); the practice targets are blink-operated only.
 */
export function BlinkCalibration({ runtime, scanIntervalMs, onComplete, onFallback, onBack }: Props) {
  const { blink } = runtime;
  const cal = blink.calibrator;
  const uid = useId();
  const cameraBlocked = blink.status === 'unsupported' || blink.status === 'permission-denied';
  const stepIndex = STEPS.findIndex((s) => s.stage === cal.stage);

  return (
    <main className="setup calibration" aria-labelledby={`${uid}-title`}>
      <header className="setup-head">
        <p className="wordmark" aria-hidden="true">STILL HERE</p>
        <h1 id={`${uid}-title`}>Set up blink control</h1>
        <p className="muted">
          A helper can click the buttons on this screen, including the browser’s camera permission.
          The practice steps at the end are done with blinks only.
        </p>
      </header>

      <ol className="cal-steps" aria-label="Calibration steps">
        {STEPS.map((s, i) => (
          <li
            key={s.stage}
            className={i === stepIndex ? 'is-current' : i < stepIndex || cal.stage === 'done' ? 'is-done' : ''}
            aria-current={i === stepIndex ? 'step' : undefined}
          >
            {s.label}
          </li>
        ))}
      </ol>

      <section className="cal-panel" aria-label="Current step">
        {cameraBlocked ? (
          <CameraProblem blink={blink} onFallback={onFallback} />
        ) : (
          <StageBody
            runtime={runtime}
            scanIntervalMs={scanIntervalMs}
            onComplete={onComplete}
            onFallback={onFallback}
          />
        )}
      </section>

      {cal.stage !== 'consent' && !cameraBlocked && cal.stage !== 'done' && (
        <section className="cal-diagnostics" aria-label="Camera diagnostics">
          <BlinkStatus blink={blink} variant="pill" announce />
          <EyeMeter blink={blink} />
          <p className="diag-line">
            Faces: {blink.faceCount} · Processing: {blink.fps > 0 ? `${Math.round(blink.fps)} frames/s` : 'not measured yet'}
            {blink.message ? <> · {blink.message}</> : null}
          </p>
        </section>
      )}

      <div className="cal-actions">
        <button type="button" className="btn btn-quiet" onClick={onBack}>Back to setup</button>
        {cal.stage !== 'consent' && cal.stage !== 'done' && (
          <button type="button" className="btn btn-quiet" onClick={cal.restart}>Start calibration over</button>
        )}
        <button type="button" className="btn" onClick={onFallback}>Use keyboard / switch instead</button>
      </div>
    </main>
  );
}

function CameraProblem({ blink, onFallback }: { blink: BlinkRuntime; onFallback: () => void }) {
  return (
    <div className="cal-body">
      <h2>{blink.status === 'permission-denied' ? 'Camera permission was not given' : 'The camera is not available here'}</h2>
      <p>
        {blink.status === 'permission-denied'
          ? 'Blink control needs the camera. A helper can allow it from the camera icon in the browser’s address bar, then try again.'
          : 'This browser, device, or connection cannot run blink detection (it needs a camera and a secure page).'}
      </p>
      {blink.message && <p className="muted">{blink.message}</p>}
      <div className="cal-row">
        <button type="button" className="btn btn-primary btn-large" onClick={onFallback}>Use keyboard / switch instead</button>
        <button type="button" className="btn" onClick={() => { void blink.startCamera(); }}>Try the camera again</button>
      </div>
    </div>
  );
}

function StageBody({ runtime, scanIntervalMs, onComplete, onFallback }: Omit<Props, 'onBack'>) {
  const { blink } = runtime;
  const cal = blink.calibrator;
  const armed = BLINK_ARMED.has(blink.status);

  switch (cal.stage) {
    case 'consent':
      return (
        <div className="cal-body">
          <h2>Turn on the camera</h2>
          <ul className="plain-list">
            <li>The camera image stays on this device. No video or photos are saved or sent.</li>
            <li>Still Here only measures how closed the eyes are. It does not track where you look and does not recognize who you are.</li>
            <li>The browser will ask for camera permission. A helper may need to click <strong>Allow</strong>.</li>
          </ul>
          <button type="button" className="btn btn-primary btn-large" onClick={cal.begin}>Turn on camera</button>
        </div>
      );

    case 'position':
      return (
        <div className="cal-body cal-split">
          <Preview blink={blink} />
          <div className="cal-copy">
            <h2>Position your face</h2>
            <p className="cal-instruction">{cal.instructions || 'Sit so your whole face is in the frame, about an arm’s length from the screen.'}</p>
            <p className={`face-feedback ${armed ? 'is-ok' : ''}`} role="status">
              {armed ? '✓ Face found' : blink.status === 'multiple-faces' ? 'Two faces are visible. Only one person should be in view.' : 'Looking for a face…'}
            </p>
            <button type="button" className="btn btn-primary" onClick={cal.advance} disabled={!armed}>Continue</button>
          </div>
        </div>
      );

    case 'baseline':
    case 'natural':
    case 'deliberate':
      return <SampleStage blink={blink} />;

    case 'review':
      return <ReviewStage blink={blink} />;

    case 'practice-select':
    case 'practice-confirm':
      return <Practice blink={blink} scanIntervalMs={scanIntervalMs} onComplete={onComplete} />;

    case 'done':
      return <Done onComplete={onComplete} />;

    case 'failed':
      return (
        <div className="cal-body">
          <h2>Blink calibration did not work this time</h2>
          <p>{cal.failureReason ?? 'Ordinary blinks and deliberate closures could not be told apart reliably.'}</p>
          <p className="muted">This is common and nothing is wrong. Keyboard and switch scanning work the same way, with the same review and confirmation.</p>
          <div className="cal-row">
            <button type="button" className="btn btn-primary btn-large" onClick={onFallback}>Use keyboard / switch instead</button>
            <button type="button" className="btn btn-large" onClick={cal.restart}>Try again</button>
          </div>
        </div>
      );
  }
}

function SampleStage({ blink }: { blink: BlinkRuntime }) {
  const cal = blink.calibrator;
  const deliberate = cal.stage === 'deliberate';
  const natural = cal.stage === 'natural';
  const title = cal.stage === 'baseline'
    ? 'Look at the screen normally'
    : natural ? 'Blink naturally a few times' : 'Close your eyes for about one second, then open';
  const fallback = cal.stage === 'baseline'
    ? 'Keep your eyes open and relaxed. This measures your open-eye level.'
    : natural ? 'Just blink the way you normally do. These blinks will be ignored later.'
      : 'Close comfortably, count “one”, then open. Repeat a few times with a short rest between.';
  const count = deliberate ? cal.deliberateSamplesMs.length : natural ? cal.naturalSamplesMs.length : null;
  const canContinue = !deliberate || cal.deliberateSamplesMs.length >= MIN_DELIBERATE_SAMPLES;

  return (
    <div className="cal-body cal-split">
      <Preview blink={blink} />
      <div className="cal-copy">
        <h2>{title}</h2>
        <p className="cal-instruction">{cal.instructions || fallback}</p>
        <ClosureBar value={cal.progress} />
        {count !== null && (
          <p className="sample-count">
            {deliberate ? 'Deliberate closures captured' : 'Natural blinks seen'}: <strong>{count}</strong>
            {deliberate && count < MIN_DELIBERATE_SAMPLES ? ` (at least ${MIN_DELIBERATE_SAMPLES})` : ''}
          </p>
        )}
        <button type="button" className="btn" onClick={cal.advance} disabled={!canContinue}>Continue</button>
        <p className="hint">This step moves on by itself when it has enough. A helper can press Continue.</p>
      </div>
    </div>
  );
}

function ReviewStage({ blink }: { blink: BlinkRuntime }) {
  const cal = blink.calibrator;
  const p = cal.proposed;
  if (!p) {
    return (
      <div className="cal-body">
        <h2>Working out your timing…</h2>
        <p className="muted">One moment.</p>
      </div>
    );
  }
  const fmt = (ms: number | null) => (ms === null ? 'not measured' : `${Math.round(ms)} ms`);
  const tight = p.naturalMaxMs !== null && p.minClosureMs <= p.naturalMaxMs;
  return (
    <div className="cal-body">
      <h2>Check your timing</h2>
      <dl className="kv cal-kv">
        <div className="kv-row"><dt>Longest natural blink</dt><dd>{fmt(p.naturalMaxMs)}</dd></div>
        <div className="kv-row"><dt>Shortest deliberate closure</dt><dd>{fmt(p.deliberateMinMs)}</dd></div>
        <div className="kv-row"><dt>Too long (ignored as resting)</dt><dd>over {fmt(p.maxClosureMs)}</dd></div>
      </dl>
      <div className="min-closure" role="group" aria-label="Minimum closure to select">
        <span className="min-closure-label">A selection needs the eyes closed for at least</span>
        <div className="cal-row">
          <button
            type="button" className="btn" aria-label="Shorter minimum closure"
            onClick={() => cal.setMinClosureMs(Math.max(MIN_CLOSURE_STEP_MS, p.minClosureMs - MIN_CLOSURE_STEP_MS))}
          >−</button>
          <output className="min-closure-value" aria-live="polite">{Math.round(p.minClosureMs)} ms</output>
          <button
            type="button" className="btn" aria-label="Longer minimum closure"
            onClick={() => cal.setMinClosureMs(Math.min(p.maxClosureMs - MIN_CLOSURE_STEP_MS, p.minClosureMs + MIN_CLOSURE_STEP_MS))}
          >+</button>
        </div>
        {tight && <p className="warning">This is at or below the longest natural blink, so ordinary blinks could select. Consider a longer minimum.</p>}
      </div>
      <div className="cal-row">
        <button type="button" className="btn btn-primary btn-large" onClick={cal.accept}>Accept and practice</button>
        <button type="button" className="btn btn-large" onClick={cal.restart}>Redo</button>
      </div>
      <p className="hint">These are prototype timing settings for this person, not clinical values. Only these numbers are kept — no images.</p>
    </div>
  );
}

const PRACTICE_SELECT = ['Water', 'Music'] as const;
const PRACTICE_CONFIRM = ['Cancel', 'Confirm'] as const;

type PracticeStep = 'select' | 'confirm';

/**
 * Blink-only practice. The highlight advances automatically; closure-start freezes the
 * highlighted target, a valid 'select' chooses it, a discard unfreezes. Confirm needs a
 * separate, new closure that starts after the confirm step appears (highlight starts on Cancel).
 */
function Practice({ blink, scanIntervalMs, onComplete }: { blink: BlinkRuntime; scanIntervalMs: number; onComplete: () => void }) {
  const cal = blink.calibrator;
  const [step, setStep] = useState<PracticeStep>(cal.stage === 'practice-confirm' ? 'confirm' : 'select');
  const [index, setIndex] = useState(0);
  const [frozen, setFrozen] = useState<number | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');
  const [finished, setFinished] = useState(false);

  const items = step === 'select' ? PRACTICE_SELECT : PRACTICE_CONFIRM;
  const armed = BLINK_ARMED.has(blink.status);
  const scanning = armed && frozen === null && !finished && blink.status !== 'closing';

  // Latest values for the event subscription without resubscribing every tick.
  const live = useRef({ index, frozen, step, chosen, finished });
  useEffect(() => { live.current = { index, frozen, step, chosen, finished }; });

  // Automatic highlight. Pauses while frozen, while the face is not tracked, and after finishing.
  useEffect(() => {
    if (!scanning) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % items.length), Math.max(500, scanIntervalMs));
    return () => window.clearInterval(id);
  }, [scanning, items.length, scanIntervalMs]);

  useEffect(() => {
    const onEvent = (e: BlinkGestureEvent) => {
      const cur = live.current;
      if (cur.finished) return;
      switch (e.type) {
        case 'closure-start':
          setFrozen(cur.index);
          return;
        case 'discard':
          setFrozen(null);
          setFeedback(
            e.reason === 'too-short' ? 'That was an ordinary blink — nothing selected.'
              : e.reason === 'too-long' ? 'Eyes were closed too long — nothing selected.'
                : 'Tracking was interrupted — nothing selected.',
          );
          return;
        case 'face-lost':
          setFrozen(null);
          setFeedback('Face lost — look at the camera to continue.');
          return;
        case 'select': {
          // Only a closure that began during this step counts (a fresh gesture).
          if (cur.frozen === null) return;
          const picked = cur.step === 'select' ? PRACTICE_SELECT[cur.frozen] : PRACTICE_CONFIRM[cur.frozen];
          setFrozen(null);
          if (cur.step === 'select') {
            setChosen(picked);
            setFeedback(`Selected: ${picked}. Now confirm it with a new blink.`);
            setStep('confirm');
            setIndex(0); // confirm starts on Cancel
            cal.advance();
          } else if (picked === 'Cancel') {
            setIndex(0);
            setFeedback('Cancel selected — nothing confirmed. Wait for Confirm, then blink.');
          } else {
            setFeedback(`Confirmed: ${cur.chosen ?? ''}. Practice complete.`);
            setFinished(true);
            cal.finishPractice();
          }
          return;
        }
        default:
          return;
      }
    };
    return blink.subscribe(onEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once per blink adapter
  }, [blink.subscribe]);

  if (finished) return <Done onComplete={onComplete} />;

  return (
    <div className="cal-body practice">
      <h2>{step === 'select' ? 'Practice: choose one with a deliberate blink' : `Practice: confirm “${chosen ?? ''}” with a new blink`}</h2>
      <p className="cal-instruction">
        {step === 'select'
          ? 'The highlight moves by itself. When your choice is highlighted, close your eyes for about a second, then open.'
          : 'The highlight starts on Cancel. Wait until Confirm is highlighted, then make a new deliberate blink.'}
      </p>
      {!armed && <p className="warning">Waiting for one face to be tracked. The highlight pauses until then.</p>}
      <div className="practice-targets" role="group" aria-label="Practice targets (blink only)">
        {items.map((label, i) => {
          const highlighted = i === (frozen ?? index);
          const held = frozen === i;
          return (
            <div
              key={label}
              className={`practice-target target ${highlighted ? 'is-scan is-blink-scan' : ''} ${held ? 'is-held' : ''} ${label === 'Confirm' ? 'tone-speak' : label === 'Cancel' ? 'tone-cancel' : ''}`}
              aria-current={highlighted ? 'true' : undefined}
            >
              {highlighted && (
                <span className="blink-badge" aria-hidden="true">{held ? 'Selecting…' : '◉ Blink to select'}</span>
              )}
              <span className="target-label">{label}</span>
              {held && <ClosureBar value={blink.closureProgress} />}
            </div>
          );
        })}
      </div>
      <p className="practice-feedback" role="status">{feedback || (chosen ? `Selected: ${chosen}` : '')}</p>
    </div>
  );
}

function Done({ onComplete }: { onComplete: () => void }) {
  // Enter the session automatically so the person does not need a hand to start.
  const done = useRef(onComplete);
  useEffect(() => { done.current = onComplete; });
  useEffect(() => {
    const id = window.setTimeout(() => done.current(), 2000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="cal-body">
      <h2>Blink control is ready</h2>
      <p className="cal-instruction">Practice complete. Starting the conversation…</p>
      <button type="button" className="btn btn-primary btn-large" onClick={onComplete}>Start now</button>
    </div>
  );
}

function Preview({ blink }: { blink: BlinkRuntime }) {
  const ref = useRef<HTMLVideoElement>(null);
  const { attachPreview } = blink;
  useEffect(() => {
    attachPreview(ref.current);
    return () => attachPreview(null);
  }, [attachPreview]);
  return (
    <div className="preview-frame">
      <video ref={ref} className="preview-video" muted playsInline autoPlay aria-label="Camera framing preview (mirrored, stays on this device)" />
      <span className="preview-guide" aria-hidden="true" />
    </div>
  );
}

/** Live eye-closure meter with the calibrated thresholds marked. Decorative; text is in diagnostics. */
function EyeMeter({ blink }: { blink: BlinkRuntime }) {
  const cal: Calibration | null = blink.calibrator.proposed ?? blink.calibration;
  const score = blink.eyeScore;
  return (
    <div className="eye-meter" aria-hidden="true">
      <span className="eye-meter-end">open</span>
      <span className="eye-meter-track">
        <span className="eye-meter-fill" style={{ width: `${Math.round((score ?? 0) * 100)}%`, opacity: score === null ? 0.25 : 1 }} />
        {cal && <span className="eye-meter-mark mark-open" style={{ left: `${cal.openThreshold * 100}%` }} title="open threshold" />}
        {cal && <span className="eye-meter-mark mark-closed" style={{ left: `${cal.closedThreshold * 100}%` }} title="closed threshold" />}
      </span>
      <span className="eye-meter-end">closed</span>
    </div>
  );
}

// Re-exported for the setup screen's saved-calibration summary.
export function describeCalibration(c: Calibration): string {
  return `minimum closure ${Math.round(c.minClosureMs)} ms`;
}
