'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type {
  BlinkCalibration as Calibration, BlinkGestureEvent, BlinkRuntime, BrowCalibration,
  CalibrationStage, StillHereRuntime,
} from '@/runtime/contract';
import type { AccessMode } from '@/core/types';
import { BlinkStatus, ClosureBar } from './BlinkStatus';
import { BLINK_ARMED, BROW_STATUS_LABELS } from './labels';
import { CALIBRATION_WARNING_TEXT, calibrationWarnings } from '@/access/blink-calibration';
import { ATTRIBUTION_TIMING } from '@/access/scan-controller';
import { HIGHLIGHT_MOVED_FEEDBACK } from '@/runtime/useBlink';
import css from './setup.module.css';

/** Face-input modes that use this calibration screen. */
export type FaceMode = Extract<AccessMode, 'brow-blink' | 'blink'>;

type Props = {
  runtime: StillHereRuntime;
  /** 'brow-blink' (primary) adds eyebrow stages; 'blink' is the auto-scan + blink fallback. */
  mode: FaceMode;
  /** Scan speed chosen in setup; only the auto-scan practice uses it. */
  scanIntervalMs: number;
  /** Calibration + practice finished: enter the session with the chosen face mode. */
  onComplete: () => void;
  /** Use a different input method instead (never framed as the person's failure). */
  onFallback: (mode: AccessMode) => void;
  /** Back to the setup form. */
  onBack: () => void;
};

const BROW_STEPS: { stage: CalibrationStage; label: string }[] = [
  { stage: 'brow-neutral', label: 'Relax brows' },
  { stage: 'brow-raise', label: 'Raise brows' },
  { stage: 'brow-practice', label: 'Practice Next' },
];

const BLINK_STEPS: { stage: CalibrationStage; label: string }[] = [
  { stage: 'baseline', label: 'Look normally' },
  { stage: 'natural', label: 'Natural blinks' },
  { stage: 'deliberate', label: 'Deliberate blinks' },
  { stage: 'review', label: 'Check settings' },
  { stage: 'practice-select', label: 'Practice select' },
  { stage: 'practice-confirm', label: 'Practice confirm' },
];

function stepsFor(mode: FaceMode) {
  return [
    { stage: 'consent' as CalibrationStage, label: 'Camera' },
    { stage: 'position' as CalibrationStage, label: 'Framing' },
    ...(mode === 'brow-blink' ? BROW_STEPS : []),
    ...BLINK_STEPS,
  ];
}

const MIN_DELIBERATE_SAMPLES = 3;
const MIN_CLOSURE_STEP_MS = 50;
const MIN_BROW_RAISES = 3;
const TARGET_BROW_RAISES = 5;
/** Successful eyebrow NEXT moves needed before the brow practice moves on. */
const BROW_PRACTICE_MOVES = 2;
/** Below this gap between rest and the raise threshold, small movements might count as Next. */
const BROW_SEPARATION_WARN = 0.15;

/**
 * Guided face-control calibration and tutorial. A helper may touch the setup controls here
 * (camera permission, Continue, Accept, alternatives); every practice step is operated by
 * gestures only — the practice targets are not buttons.
 */
export function BlinkCalibration({ runtime, mode, scanIntervalMs, onComplete, onFallback, onBack }: Props) {
  const { blink } = runtime;
  const cal = blink.calibrator;
  const uid = useId();
  const cameraBlocked = blink.status === 'unsupported' || blink.status === 'permission-denied';
  const steps = stepsFor(mode);
  const stepIndex = steps.findIndex((s) => s.stage === cal.stage);
  const brow = mode === 'brow-blink';

  return (
    <main className="setup calibration" aria-labelledby={`${uid}-title`}>
      <header className="setup-head">
        <p className="wordmark" aria-hidden="true">STILL HERE</p>
        <h1 id={`${uid}-title`}>{brow ? 'Set up eyebrow + blink control' : 'Set up auto-scan with blink'}</h1>
        <p className="muted">
          A helper can touch the buttons on this screen, including the browser’s camera permission.
          The practice steps are done with {brow ? 'eyebrow raises and blinks' : 'blinks'} only — touching the practice choices does nothing.
        </p>
      </header>

      <ol className="cal-steps" aria-label="Calibration steps">
        {steps.map((s, i) => (
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
          <StageBody runtime={runtime} mode={mode} scanIntervalMs={scanIntervalMs} onComplete={onComplete} onFallback={onFallback} />
        )}
      </section>

      {cal.stage !== 'consent' && !cameraBlocked && cal.stage !== 'done' && (
        <section className="cal-diagnostics" aria-label="Camera diagnostics">
          <BlinkStatus blink={blink} variant="pill" announce />
          {brow && <p className="diag-line">Eyebrows: {BROW_STATUS_LABELS[blink.browStatus]}</p>}
          {brow && <BrowMeter blink={blink} />}
          <EyeMeter blink={blink} />
          <p className="diag-line">
            Faces: {blink.faceCount} · Processing: {blink.fps > 0 ? `${Math.round(blink.fps)} frames/s` : 'not measured yet'}
            {blink.feedback?.label ? <> · {blink.feedback.label}</> : blink.message ? <> · {blink.message}</> : null}
          </p>
        </section>
      )}

      <div className="cal-actions">
        <button type="button" className="btn btn-quiet" onClick={onBack}>Back to setup</button>
        {cal.stage !== 'consent' && cal.stage !== 'done' && (
          <button type="button" className="btn btn-quiet" onClick={() => cal.restart(mode)}>Start calibration over</button>
        )}
        {/* When the camera is blocked, the problem card already offers these (one set only). */}
        {!cameraBlocked && <Alternatives mode={mode} cameraUsable onFallback={onFallback} />}
      </div>
    </main>
  );
}

/** Other ways to choose, offered plainly. Auto-scan needs a working camera. */
function Alternatives({ mode, cameraUsable, onFallback, primary = false }: {
  mode: FaceMode; cameraUsable: boolean; onFallback: (m: AccessMode) => void; primary?: boolean;
}) {
  const cls = primary ? 'btn btn-large' : 'btn';
  return (
    <>
      {mode === 'brow-blink' && cameraUsable && (
        <button type="button" className={cls} onClick={() => onFallback('blink')}>Use auto-scan with blink</button>
      )}
      <button type="button" className={cls} onClick={() => onFallback('switch')}>Use keyboard / switch</button>
      <button type="button" className={cls} onClick={() => onFallback('pointer')}>Use touch</button>
    </>
  );
}

type CameraProblemKind = 'insecure' | 'denied' | 'no-camera' | 'other';

/** Why the camera is blocked, so the copy names the real cause (not "needs https" on an https page). */
function cameraProblemKind(blink: BlinkRuntime): CameraProblemKind {
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure';
  if (blink.status === 'permission-denied') return 'denied';
  // The runtime reports NotFoundError / OverconstrainedError only through its message text.
  if (blink.message && /no usable camera/i.test(blink.message)) return 'no-camera';
  return 'other';
}

const CAMERA_PROBLEM_COPY: Record<CameraProblemKind, { title: string; body: string }> = {
  insecure: {
    title: 'This page needs a secure (https) connection',
    body: 'Browsers only allow the camera on secure pages. Open Still Here from its https:// address (or localhost on this computer), then try again.',
  },
  denied: {
    title: 'Camera permission was not given',
    body: 'Face control needs the camera. A helper can allow it — Safari on iPad: tap “aA” in the address bar → Website Settings → Camera → Allow. Chrome: tap the icon left of the address → Permissions (or Site settings) → Camera → Allow. Then try the camera again.',
  },
  'no-camera': {
    title: 'No camera was found on this device',
    body: 'Face control needs a front camera. If one is connected or built in, check that no other app is using it, then try again.',
  },
  other: {
    title: 'The camera could not be used here',
    body: 'This browser or device could not start the camera or face detection.',
  },
};

function CameraProblem({ blink, onFallback }: { blink: BlinkRuntime; onFallback: (m: AccessMode) => void }) {
  const kind = cameraProblemKind(blink);
  const copy = CAMERA_PROBLEM_COPY[kind];
  return (
    <div className="cal-body">
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      {kind === 'other' && blink.message && <p className="muted">{blink.message}</p>}
      <p className="muted">Keyboard, switch and touch work the same way, with the same review and separate confirmation.</p>
      <div className="cal-row">
        <button type="button" className="btn btn-primary btn-large" onClick={() => onFallback('switch')}>Use keyboard / switch</button>
        <button type="button" className="btn btn-large" onClick={() => onFallback('pointer')}>Use touch</button>
        <button type="button" className="btn" onClick={() => { void blink.startCamera(); }}>Try the camera again</button>
      </div>
    </div>
  );
}

function StageBody({ runtime, mode, scanIntervalMs, onComplete, onFallback }: Omit<Props, 'onBack'>) {
  const { blink } = runtime;
  const cal = blink.calibrator;
  const armed = BLINK_ARMED.has(blink.status);
  const brow = mode === 'brow-blink';

  switch (cal.stage) {
    case 'consent':
      return (
        <div className="cal-body">
          <h2>Turn on the camera</h2>
          <ul className="plain-list">
            <li>The camera image stays on this device. Nothing is recorded, saved or sent.</li>
            <li>
              Still Here detects {brow ? 'eyebrow and eye movement' : 'eye closure'} only. It does not identify who you are,
              track where you look, or read emotions.
            </li>
            <li>The browser will ask for camera permission. A helper may need to tap <strong>Allow</strong>.</li>
          </ul>
          <button type="button" className="btn btn-primary btn-large" onClick={() => cal.begin(mode)}>Turn on camera</button>
        </div>
      );

    case 'position':
      return (
        <div className={`cal-body cal-split ${css.splitLarge}`}>
          <Preview blink={blink} large />
          <div className="cal-copy">
            <h2>Frame your face</h2>
            <p className="cal-instruction">
              {cal.instructions || 'Sit so your whole face, including your eyebrows, is inside the oval — about an arm’s length from the iPad.'}
            </p>
            <p className={`face-feedback ${armed ? 'is-ok' : ''}`} role="status">
              {armed ? '✓ Face found' : blink.status === 'multiple-faces' ? 'Two faces are visible. Only one person should be in view.' : 'Looking for a face…'}
            </p>
            <p className="hint">The preview is mirrored, like a mirror. It is not a recording.</p>
            <button type="button" className="btn btn-primary" onClick={cal.advance} disabled={!armed}>Continue</button>
          </div>
        </div>
      );

    case 'brow-neutral':
    case 'brow-raise':
      return <BrowSampleStage blink={blink} />;

    case 'brow-practice':
      return <BrowNextPractice blink={blink} />;

    case 'baseline':
    case 'natural':
    case 'deliberate':
      return <SampleStage blink={blink} />;

    case 'review':
      return <ReviewStage blink={blink} mode={mode} />;

    case 'practice-select':
    case 'practice-confirm':
      return brow
        ? <BrowBlinkPractice blink={blink} onComplete={onComplete} />
        : <ScanPractice blink={blink} scanIntervalMs={scanIntervalMs} onComplete={onComplete} />;

    case 'done':
      return <Done mode={mode} onComplete={onComplete} />;

    case 'failed':
      return (
        <div className="cal-body">
          <h2>Calibration did not work this time</h2>
          <p>
            {cal.failureReason ?? (brow
              ? 'Resting and raised eyebrows, or ordinary and deliberate blinks, could not be told apart reliably.'
              : 'Ordinary blinks and deliberate closures could not be told apart reliably.')}
          </p>
          <p className="muted">
            This happens often with camera-based input — lighting, glasses, or how a face moves all matter. Nothing is wrong.
            The other methods use the same review and separate confirmation.
          </p>
          <div className="cal-row">
            <button type="button" className="btn btn-primary btn-large" onClick={() => cal.restart(mode)}>Try again</button>
            <Alternatives mode={mode} cameraUsable onFallback={onFallback} primary />
          </div>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Eyebrow calibration

function BrowSampleStage({ blink }: { blink: BlinkRuntime }) {
  const cal = blink.calibrator;
  const neutral = cal.stage === 'brow-neutral';
  const raises = cal.browRaiseCount;
  const canContinue = neutral || raises >= MIN_BROW_RAISES;

  return (
    <div className={`cal-body cal-split ${css.splitLarge}`}>
      <Preview blink={blink} large />
      <div className="cal-copy">
        <h2>{neutral ? 'Relax your eyebrows' : 'Raise both eyebrows and hold until the bar fills'}</h2>
        <p className="cal-instruction">
          {cal.instructions || (neutral
            ? 'Look at the screen with your face relaxed. This measures your resting eyebrow position.'
            : 'Raise both eyebrows comfortably, hold for half a second, then relax fully. Repeat with a short rest between.')}
        </p>
        <BrowMeter blink={blink} labelled />
        {neutral ? (
          <>
            <ClosureBar value={cal.progress} />
            <p className="sample-count">Resting samples: <strong>{cal.browNeutralSamples.length}</strong></p>
          </>
        ) : (
          <>
            <HoldBar value={blink.browProgress} />
            <p className="sample-count">
              Raises captured: <strong>{raises}</strong> of {TARGET_BROW_RAISES}
              {raises < MIN_BROW_RAISES ? ` (at least ${MIN_BROW_RAISES})` : ''}
            </p>
            {blink.browStatus === 'latched' && <p className={css.ack} role="status">✓ Held — now relax your eyebrows</p>}
          </>
        )}
        <button type="button" className="btn" onClick={cal.advance} disabled={!canContinue}>Continue</button>
        <p className="hint">This step moves on by itself when it has enough. A helper can tap Continue.</p>
      </div>
    </div>
  );
}

const BROW_PRACTICE_TARGETS = ['Water', 'Music'] as const;

/**
 * Eyebrow NEXT practice. Only an ACCEPTED NAV_NEXT (runtime.lastAccepted, emitted by the gesture
 * arbiter) moves the highlight, so a long hold moves once and a blink-pre-empted raise moves
 * nothing. After a couple of successful moves the calibrator moves on to the blink stages.
 */
function BrowNextPractice({ blink }: { blink: BlinkRuntime }) {
  const cal = blink.calibrator;
  const acc = blink.lastAccepted;
  const [seenAt, setSeenAt] = useState<number | null>(() => acc?.at ?? null);
  const [index, setIndex] = useState(0);
  const [moves, setMoves] = useState(0);
  const [ackAt, setAckAt] = useState<number | null>(null);

  // React to each newly accepted command exactly once (derived during render, no effect loop).
  if (acc && acc.at !== seenAt) {
    setSeenAt(acc.at);
    if (acc.command === 'NAV_NEXT' && moves < BROW_PRACTICE_MOVES) {
      setIndex((index + 1) % BROW_PRACTICE_TARGETS.length);
      setMoves(moves + 1);
      setAckAt(acc.at);
    }
  }

  const complete = moves >= BROW_PRACTICE_MOVES;
  const advance = cal.advance;
  useEffect(() => {
    if (!complete) return;
    const id = window.setTimeout(() => advance(), 1500);
    return () => window.clearTimeout(id);
  }, [complete, advance]);

  const armed = BLINK_ARMED.has(blink.status);

  return (
    <div className="cal-body practice">
      <h2>Practice: move the highlight with your eyebrows</h2>
      <p className="cal-instruction">
        Raise both eyebrows and hold for half a second to move to the next choice. Relax before the next raise.
        Holding longer still moves only once. Blinks do nothing in this step.
      </p>
      {!armed && <p className="warning">Waiting for one face to be tracked.</p>}
      <div className="practice-targets" role="group" aria-label="Practice choices (eyebrow raise only)">
        {BROW_PRACTICE_TARGETS.map((label, i) => {
          const highlighted = i === index;
          return (
            <div key={label} className={`practice-target target ${highlighted ? 'is-scan is-blink-scan' : ''}`} aria-current={highlighted ? 'true' : undefined}>
              {highlighted && <span className="blink-badge" aria-hidden="true">◉ Highlighted</span>}
              <span className="target-label">{label}</span>
              {highlighted && !complete && <TargetHold value={blink.browProgress} />}
            </div>
          );
        })}
      </div>
      <p className="practice-feedback" role="status">
        {ackAt !== null ? <span className={css.ack}>✓ Eyebrow raise detected — Next</span> : null}{' '}
        {complete
          ? 'Nice — eyebrow Next works. Moving on to blinks…'
          : blink.browStatus === 'rising' ? 'Keep holding…'
            : blink.browStatus === 'latched' ? 'Now relax your eyebrows.' : ''}
      </p>
      <p className={css.moveCount}>Moves: <strong>{moves}</strong> of {BROW_PRACTICE_MOVES}</p>
      <p className={css.helperNote}>If it is not moving, a helper can tap “Start calibration over” or choose another method below.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blink calibration

function SampleStage({ blink }: { blink: BlinkRuntime }) {
  const cal = blink.calibrator;
  const deliberate = cal.stage === 'deliberate';
  const natural = cal.stage === 'natural';
  const title = cal.stage === 'baseline'
    ? 'Look at the screen normally'
    : natural ? 'Blink naturally a few times' : 'Close your eyes in a long, deliberate blink, then open';
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
        <p className="hint">This step moves on by itself when it has enough. A helper can tap Continue.</p>
      </div>
    </div>
  );
}

function browWarnings(p: BrowCalibration | null, required: boolean): string[] {
  if (!p) return required ? ['Eyebrow settings were not measured. Redo calibration, or choose another method.'] : [];
  const out: string[] = [];
  if (p.raisedThreshold - p.neutral < BROW_SEPARATION_WARN) {
    out.push('Resting and raised eyebrows are close together. Small movements might count as Next — consider redoing with clearer raises.');
  }
  if (p.releaseThreshold <= p.neutral) {
    out.push('The relax level is at or below the measured rest level, so re-arming after a raise may be slow.');
  }
  return out;
}

function ReviewStage({ blink, mode }: { blink: BlinkRuntime; mode: FaceMode }) {
  const cal = blink.calibrator;
  const p = cal.proposed;
  const brow = mode === 'brow-blink';
  const b = cal.proposedBrow;
  if (!p) {
    return (
      <div className="cal-body">
        <h2>Working out your settings…</h2>
        <p className="muted">One moment.</p>
      </div>
    );
  }
  const fmt = (ms: number | null) => (ms === null ? 'not measured' : `${Math.round(ms)} ms`);
  const score = (x: number) => x.toFixed(2);
  const warnings = calibrationWarnings(p);
  const bWarnings = brow ? browWarnings(b, true) : [];
  const canAccept = !brow || b !== null;

  return (
    <div className="cal-body">
      <h2>Check your settings</h2>
      <div className={css.reviewGrid}>
        {brow && (
          <section className={css.reviewCard} aria-label="Eyebrow Next settings">
            <h3>Eyebrow raise = Next</h3>
            {b ? (
              <dl className="kv cal-kv">
                <div className="kv-row"><dt>Resting level</dt><dd>{score(b.neutral)}</dd></div>
                <div className="kv-row"><dt>Counts as raised at</dt><dd>{score(b.raisedThreshold)}</dd></div>
                <div className="kv-row"><dt>Counts as relaxed at</dt><dd>{score(b.releaseThreshold)}</dd></div>
                <div className="kv-row"><dt>Hold needed to move Next</dt><dd>{Math.round(b.holdMs)} ms</dd></div>
              </dl>
            ) : <p className="muted">Not measured.</p>}
            <p className="hint">Scores run from 0 (relaxed) to 1 (fully raised). One raise moves one step; relax before the next.</p>
            {bWarnings.map((w) => <p key={w} className="warning" role="status">{w}</p>)}
          </section>
        )}
        <section className={css.reviewCard} aria-label="Blink select settings">
          <h3>Long blink = Select</h3>
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
            {warnings.map((w) => <p key={w} className="warning" role="status">{CALIBRATION_WARNING_TEXT[w]}</p>)}
          </div>
        </section>
      </div>
      <div className="cal-row">
        <button type="button" className="btn btn-primary btn-large" onClick={cal.accept} disabled={!canAccept}>Accept and practice</button>
        <button type="button" className="btn btn-large" onClick={() => cal.restart(mode)}>Redo</button>
      </div>
      <p className="hint">These are prototype settings for this person, not clinical values. Only these numbers are kept — no images.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practice

const PRACTICE_SELECT = ['Water', 'Music'] as const;
const PRACTICE_CONFIRM = ['Cancel', 'Confirm'] as const;

type PracticeStep = 'select' | 'confirm';

/**
 * Eyebrow + blink practice (primary mode). The highlight moves ONLY on an accepted eyebrow
 * NAV_NEXT (no timer). An accepted SELECT chooses the highlighted item. The confirm step starts
 * on Cancel and needs a NEW long blink whose closure began after the confirm step appeared.
 * Practice output is silent; nothing is spoken and nothing enters the conversation.
 */
function BrowBlinkPractice({ blink, onComplete }: { blink: BlinkRuntime; onComplete: () => void }) {
  const cal = blink.calibrator;
  const acc = blink.lastAccepted;
  const [seenAt, setSeenAt] = useState<number | null>(() => acc?.at ?? null);
  const [step, setStep] = useState<PracticeStep>(cal.stage === 'practice-confirm' ? 'confirm' : 'select');
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [finished, setFinished] = useState(false);
  // A closure must START during the current step before its SELECT can count (fresh gesture).
  // 'void': it started within recentChangeMs of a highlight move, so (as in the app) it can
  // never select — the practice teaches the real timing.
  const [closureInStep, setClosureInStep] = useState<'none' | 'fresh' | 'void'>('none');
  const [movedAt, setMovedAt] = useState<number | null>(null);
  // Latest highlight-move time on the gesture clock, readable from the event listener.
  const lastMoveRef = useRef<number | null>(null);

  const items = step === 'select' ? PRACTICE_SELECT : PRACTICE_CONFIRM;

  if (acc && acc.at !== seenAt) {
    setSeenAt(acc.at);
    if (!finished) {
      if (acc.command === 'NAV_NEXT') {
        setIndex((index + 1) % items.length);
        setMovedAt(acc.at);
        setFeedback('Eyebrow raise detected — Next');
      } else if (acc.command === 'SELECT' && closureInStep === 'void') {
        setClosureInStep('none');
        setFeedback(HIGHLIGHT_MOVED_FEEDBACK.label);
      } else if (acc.command === 'SELECT' && closureInStep === 'fresh') {
        setClosureInStep('none');
        const picked = items[index];
        if (step === 'select') {
          setChosen(picked);
          setStep('confirm');
          setIndex(0); // confirm starts on Cancel
          setFeedback(`Selected: ${picked}. Now raise your eyebrows to move to Confirm, then make a new long blink.`);
        } else if (picked === 'Cancel') {
          setFeedback('Cancel selected — nothing confirmed. Raise your eyebrows to move to Confirm.');
        } else {
          setFeedback(`Confirmed: ${chosen ?? ''}. Practice complete (nothing was spoken).`);
          setFinished(true);
        }
      }
    }
  }

  useEffect(() => {
    if (movedAt !== null && (lastMoveRef.current === null || movedAt > lastMoveRef.current)) lastMoveRef.current = movedAt;
  }, [movedAt]);

  // Raw detector events only drive "fresh closure" bookkeeping and honest discard feedback.
  const subscribe = blink.subscribe;
  useEffect(() => subscribe((e: BlinkGestureEvent) => {
    if (e.type === 'brow-next') {
      // Proposed move (the accepted one may render a moment later): count it for the timing
      // rule right away, so a closure on the very next frames is judged correctly.
      if (lastMoveRef.current === null || e.at > lastMoveRef.current) lastMoveRef.current = e.at;
    } else if (e.type === 'closure-start') {
      const moved = lastMoveRef.current;
      setClosureInStep(moved !== null && e.at - moved < ATTRIBUTION_TIMING.recentChangeMs ? 'void' : 'fresh');
    } else if (e.type === 'discard') {
      setClosureInStep('none');
      setFeedback(
        e.reason === 'too-short' ? 'That was an ordinary blink — nothing selected.'
          : e.reason === 'too-long' ? 'Eyes were closed too long — nothing selected.'
            : 'Tracking was interrupted — nothing selected.',
      );
    } else if (e.type === 'face-lost') {
      setClosureInStep('none');
      setFeedback('Face lost — look at the camera to continue.');
    }
  }), [subscribe]);

  // Keep the calibrator's stage in step with the practice (external store; not React state).
  const { advance, finishPractice, stage } = cal;
  useEffect(() => {
    if (step === 'confirm' && stage === 'practice-select') advance();
  }, [step, stage, advance]);
  useEffect(() => {
    if (finished) finishPractice();
  }, [finished, finishPractice]);

  if (finished) return <Done mode="brow-blink" onComplete={onComplete} />;

  const armed = BLINK_ARMED.has(blink.status);
  const closing = blink.status === 'closing';

  return (
    <div className="cal-body practice">
      <h2>{step === 'select' ? 'Practice: choose one' : `Practice: confirm “${chosen ?? ''}” separately`}</h2>
      <p className="cal-instruction">
        {step === 'select'
          ? 'Raise your eyebrows (hold half a second) to move the highlight. When your choice is highlighted, close your eyes in a long, deliberate blink.'
          : 'The highlight starts on Cancel. Raise your eyebrows to move to Confirm, then make a new long blink.'}
      </p>
      {!armed && <p className="warning">Waiting for one face to be tracked.</p>}
      <div className="practice-targets" role="group" aria-label="Practice choices (eyebrows and blinks only)">
        {items.map((label, i) => {
          const highlighted = i === index;
          return (
            <div
              key={label}
              className={`practice-target target ${highlighted ? 'is-scan is-blink-scan' : ''} ${highlighted && closing ? 'is-held' : ''} ${label === 'Confirm' ? 'tone-speak' : label === 'Cancel' ? 'tone-cancel' : ''}`}
              aria-current={highlighted ? 'true' : undefined}
            >
              {highlighted && (
                <span className="blink-badge" aria-hidden="true">{closing ? 'Selecting…' : '◉ Long blink to select'}</span>
              )}
              <span className="target-label">{label}</span>
              {highlighted && closing && <ClosureBar value={blink.closureProgress} />}
              {highlighted && !closing && blink.browProgress > 0 && <TargetHold value={blink.browProgress} />}
            </div>
          );
        })}
      </div>
      <p className="practice-feedback" role="status">
        {feedback === 'Eyebrow raise detected — Next' ? <span className={css.ack}>✓ {feedback}</span> : feedback || (chosen ? `Selected: ${chosen}` : '')}
      </p>
    </div>
  );
}

/**
 * Auto-scan + blink practice (fallback mode). The highlight advances automatically; closure-start
 * freezes the highlighted target, a valid 'select' chooses it, a discard unfreezes. Confirm needs
 * a separate, new closure that starts after the confirm step appears (highlight starts on Cancel).
 */
function ScanPractice({ blink, scanIntervalMs, onComplete }: { blink: BlinkRuntime; scanIntervalMs: number; onComplete: () => void }) {
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
            setFeedback(`Confirmed: ${cur.chosen ?? ''}. Practice complete (nothing was spoken).`);
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

  if (finished) return <Done mode="blink" onComplete={onComplete} />;

  return (
    <div className="cal-body practice">
      <h2>{step === 'select' ? 'Practice: choose one with a deliberate blink' : `Practice: confirm “${chosen ?? ''}” with a new blink`}</h2>
      <p className="cal-instruction">
        {step === 'select'
          ? 'The highlight moves by itself. When your choice is highlighted, close your eyes for about a second, then open.'
          : 'The highlight starts on Cancel. Wait until Confirm is highlighted, then make a new deliberate blink.'}
      </p>
      {!armed && <p className="warning">Waiting for one face to be tracked. The highlight pauses until then.</p>}
      <div className="practice-targets" role="group" aria-label="Practice choices (blink only)">
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

function Done({ mode, onComplete }: { mode: FaceMode; onComplete: () => void }) {
  // Enter the session automatically so the person does not need a hand to start.
  const done = useRef(onComplete);
  useEffect(() => { done.current = onComplete; });
  useEffect(() => {
    const id = window.setTimeout(() => done.current(), 2000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="cal-body">
      <h2>{mode === 'brow-blink' ? 'Eyebrow + blink control is ready' : 'Blink control is ready'}</h2>
      <p className="cal-instruction">Practice complete. Starting the conversation…</p>
      <button type="button" className="btn btn-primary btn-large" onClick={onComplete}>Start now</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visual pieces

function Preview({ blink, large = false }: { blink: BlinkRuntime; large?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const { attachPreview } = blink;
  useEffect(() => {
    attachPreview(ref.current);
    return () => attachPreview(null);
  }, [attachPreview]);
  return (
    <div className={`preview-frame ${large ? css.previewLarge : ''}`}>
      <video ref={ref} className="preview-video" muted playsInline autoPlay aria-label="Camera framing preview (mirrored, stays on this device, not recorded)" />
      <span className="preview-guide" aria-hidden="true" />
    </div>
  );
}

/** 0.5 s hold progress bar (progress only; a NEXT is shown separately once accepted). */
function HoldBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={`${css.hold} ${v >= 1 ? css.holdFull : ''}`} aria-hidden="true">
      <span className={css.holdLabel}><span>Hold</span><span>0.5 s</span></span>
      <span className={css.holdTrack}><span className={css.holdFill} style={{ width: `${Math.round(v * 100)}%` }} /></span>
    </div>
  );
}

function TargetHold({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className={css.targetHold} aria-hidden="true">
      <span className={css.targetHoldFill} style={{ width: `${Math.round(v * 100)}%` }} />
    </span>
  );
}

/** Live brow-raise meter with rest / relax / raise marks. Decorative; text is in diagnostics. */
function BrowMeter({ blink, labelled = false }: { blink: BlinkRuntime; labelled?: boolean }) {
  const b: BrowCalibration | null = blink.calibrator.proposedBrow ?? blink.browCalibration;
  const score = blink.browScore;
  return (
    <div className="eye-meter" aria-hidden="true">
      <span className="eye-meter-end">{labelled ? 'relaxed' : 'brows'}</span>
      <span className="eye-meter-track">
        <span className="eye-meter-fill" style={{ width: `${Math.round((score ?? 0) * 100)}%`, opacity: score === null ? 0.25 : 1 }} />
        {b && <span className={`eye-meter-mark ${css.markNeutral}`} style={{ left: `${b.neutral * 100}%` }} title="resting level" />}
        {b && <span className={`eye-meter-mark ${css.markRelease}`} style={{ left: `${b.releaseThreshold * 100}%` }} title="relaxed level" />}
        {b && <span className={`eye-meter-mark ${css.markRaised}`} style={{ left: `${b.raisedThreshold * 100}%` }} title="raised level" />}
      </span>
      <span className="eye-meter-end">raised</span>
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

export function describeBrowCalibration(c: BrowCalibration): string {
  return `eyebrow hold ${Math.round(c.holdMs)} ms`;
}
