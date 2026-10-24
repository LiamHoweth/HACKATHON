// Gesture acceptance-trial recorder (brief §24 "Actual iPad acceptance trial").
// Pure TypeScript: no DOM, no React, no timers. The /trial page feeds it the face engine's
// command events (the same FaceCommandEvent stream useStillHere consumes), the raw detector
// events, brow status changes and facilitator taps, each with a performance.now() timestamp.
//
// It never dispatches app actions. Accepted commands only move a local dummy highlight and are
// counted per protocol prompt. No camera image, video, landmark or blendshape stream is kept:
// only counts, durations (ms) and the event types listed below.
import type { BlinkGestureEvent, BrowStatus, GestureCommand } from '@/runtime/contract';
import type { FaceCommandEvent, FaceCommandResult } from '@/runtime/useBlink';

export const TRIAL_LABEL = 'Engineering trial — not clinical validation';
export const TRIAL_SCHEMA = 'still-here.gesture-trial/1';

/** Dummy targets on the trial board. NAV_NEXT moves the highlight; SELECT commits the target frozen at closure onset. */
export const TRIAL_TARGETS = ['Target 1', 'Target 2', 'Target 3', 'Target 4'] as const;
export const RESUME_TARGET = 'Resume';
const MAX_EVENTS = 5000;

export type StepId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
/** What a prompt asks for. 'none' = no command should be accepted; 'resume' = pause, then a deliberate blink resumes. */
export type Expect = 'NAV_NEXT' | 'SELECT' | 'none' | 'resume';

export type PromptSpec = {
  title: string;
  detail: string;
  expect: Expect;
  /** Fixed prompt window (ms) for 'none' prompts; null = ends on the expected command or a facilitator mark. */
  windowMs: number | null;
  /** After the expected command, the prompt stays open this long so extra commands are attributed to it. */
  settleMs: number;
  /** Sub-group for step F. */
  group?: 'brow-flick' | 'quick-blink' | 'combined';
};

export type StepSpec = {
  id: StepId;
  title: string;
  /** Exact facilitator instructions shown on screen. */
  facilitator: string;
  prompts: PromptSpec[];
};

const rep = (n: number, p: PromptSpec): PromptSpec[] => Array.from({ length: n }, () => ({ ...p }));

export const PROTOCOL: readonly StepSpec[] = [
  {
    id: 'A',
    title: 'Deliberate eyebrow raises ×20',
    facilitator:
      'Ask the participant to raise both eyebrows and hold until the bar fills, then relax. One prompt per raise. '
      + 'The prompt advances by itself 2 s after an accepted Next. If nothing is accepted after a real attempt, tap Mark miss.',
    prompts: rep(20, {
      title: 'Raise both eyebrows', detail: 'Hold until the bar fills, then relax.', expect: 'NAV_NEXT', windowMs: null, settleMs: 2000,
    }),
  },
  {
    id: 'B',
    title: 'Long-blink selections ×20',
    facilitator:
      'Ask the participant to select the highlighted target with one long blink (eyes closed about one second). '
      + 'Do not use eyebrows. The prompt advances 2 s after an accepted Select. Tap Mark miss if a real attempt was not accepted; '
      + 'tap Mark wrong target if the participant says the selection was not what they intended.',
    prompts: rep(20, {
      title: 'Long blink to select the highlighted target', detail: 'Close your eyes for about one second, then open them.',
      expect: 'SELECT', windowMs: null, settleMs: 2000,
    }),
  },
  {
    id: 'C',
    title: 'Normal facial movement, 2 minutes',
    facilitator:
      'Ask the participant NOT to control anything for 2 minutes: talk with you, look around the room, blink normally, smile, nod. '
      + 'Every accepted Next or Select in this window is counted as inadvertent. The step ends by itself after 2 minutes.',
    prompts: [{
      title: 'Normal facial movement — do not control anything',
      detail: 'Talk, look around, blink normally for 2 minutes.', expect: 'none', windowMs: 120_000, settleMs: 0,
    }],
  },
  {
    id: 'D',
    title: 'Face-loss recovery ×3',
    facilitator:
      'Ask the participant to turn fully away from the iPad for about 3 seconds, then look back and make ONE long blink to resume. '
      + 'The trial must show Paused while they are away and must not resume until the deliberate blink. '
      + 'If Paused never appears or resume does not work, tap Mark miss.',
    prompts: rep(3, {
      title: 'Look away for 3 seconds, then come back',
      detail: 'Turn your head fully away. When you are back, long-blink once to resume.', expect: 'resume', windowMs: null, settleMs: 1500,
    }),
  },
  {
    id: 'E',
    title: 'Hold-2-seconds raises ×5',
    facilitator:
      'Ask the participant to raise both eyebrows and KEEP them up for a slow count of two after the bar fills, then relax. '
      + 'Each raise must give exactly one Next. Extra Nexts are counted automatically. Tap Mark miss if a real raise gave no Next.',
    prompts: rep(5, {
      title: 'Raise eyebrows and keep holding for 2 seconds',
      detail: 'Keep them up after the bar fills, count "one, two", then relax.', expect: 'NAV_NEXT', windowMs: null, settleMs: 4000,
    }),
  },
  {
    id: 'F',
    title: 'Interrupted / ambiguous gestures ×15',
    facilitator:
      'Each 5-second prompt asks for a gesture that must NOT be accepted: a quick eyebrow flick dropped before the bar fills, '
      + 'ordinary quick blinks, and eyebrows plus eyes together. Any accepted command is recorded. Prompts advance by themselves.',
    prompts: [
      ...rep(5, {
        title: 'Quick eyebrow flick', detail: 'Raise your eyebrows briefly and drop them before the bar fills.',
        expect: 'none', windowMs: 5000, settleMs: 0, group: 'brow-flick',
      }),
      ...rep(5, {
        title: 'Ordinary quick blinks', detail: 'Blink normally two or three times. Do not hold your eyes closed.',
        expect: 'none', windowMs: 5000, settleMs: 0, group: 'quick-blink',
      }),
      ...rep(5, {
        title: 'Eyebrows and eyes together', detail: 'Raise your eyebrows and close your eyes at the same moment, then relax.',
        expect: 'none', windowMs: 5000, settleMs: 0, group: 'combined',
      }),
    ],
  },
];

export function stepSpec(id: StepId): StepSpec {
  return PROTOCOL.find((s) => s.id === id) as StepSpec;
}

export type Selection = {
  /** ms since trial start */
  at: number;
  target: string;
  closureMs: number | null;
  /** The committed target differed from the target the prompt highlighted (a Next moved it). */
  wrongAuto: boolean;
  /** Facilitator tapped Mark wrong target for this selection. */
  wrongMarked: boolean;
};

export type PromptOutcome = 'hit' | 'wrong-target' | 'miss' | 'clean' | 'command-accepted' | 'not-run';

export type PromptRecord = {
  index: number;
  title: string;
  expect: Expect;
  group: PromptSpec['group'] | null;
  /** Prompted target (step B only). */
  target: string | null;
  startedAt: number;
  endedAt: number | null;
  phase: 'open' | 'settling' | 'done';
  settleUntil: number | null;
  outcome: PromptOutcome | null;
  /** First expected command (ms since prompt start). */
  latencyMs: number | null;
  acceptedNext: number;
  acceptedSelect: number;
  /** NAV_NEXT after the first one in a NEXT prompt (e.g. during a hold). */
  extraNext: number;
  extraSelect: number;
  /** Command of the wrong kind, or any command in a 'none' prompt / before the pause in D. */
  inadvertentNext: number;
  inadvertentSelect: number;
  facilitatorMiss: boolean;
  selections: Selection[];
  /** Accepted brow NEXT: raised time at commit (ms, from the detector). */
  browNextHeldMs: number[];
  /** Approximate total raise duration (ms, from 10 Hz status snapshots). */
  browHoldMs: number[];
  blinkDiscards: Record<'too-short' | 'too-long' | 'face-lost' | 'multiple-faces' | 'stale', number>;
  browCancels: Record<'too-short' | 'blink-preempted' | 'face-lost' | 'ambiguous' | 'stale', number>;
  faceLost: number;
  faceFound: number;
  /** NAV_NEXT accepted by the detector while paused, refused by the trial (as the app refuses it). */
  blockedWhilePaused: number;
  /** SELECT refused because the closure began before the pause or had no onset snapshot. */
  refusedSelect: number;
  resumes: number;
  /** Step D timing (ms since prompt start). */
  pausedAtMs: number | null;
  faceFoundAtMs: number | null;
  resumedAtMs: number | null;
};

export type StepRun = {
  id: StepId;
  run: number;
  startedAt: number;
  endedAt: number | null;
  status: 'running' | 'complete' | 'ended-early';
  current: number;
  prompts: PromptRecord[];
};

export type TrialEvent = { t: number; step: StepId | null; prompt: number | null; type: string } & Record<string, string | number | boolean | null>;

export type TrialView = {
  version: number;
  activeStep: StepId | null;
  runs: Partial<Record<StepId, StepRun>>;
  highlight: number;
  paused: boolean;
  /** Last accepted command for a brief on-screen acknowledgement. */
  lastAck: { command: GestureCommand | 'RESUME' | 'BLOCKED'; at: number; target: string | null } | null;
  eventCount: number;
};

const REFUSED: FaceCommandResult = { applied: false, targetId: null };

function newPrompt(spec: PromptSpec, index: number, step: StepId, startedAt: number): PromptRecord {
  return {
    index, title: spec.title, expect: spec.expect, group: spec.group ?? null,
    target: step === 'B' ? TRIAL_TARGETS[index % TRIAL_TARGETS.length] : null,
    startedAt, endedAt: null, phase: 'open', settleUntil: null, outcome: null, latencyMs: null,
    acceptedNext: 0, acceptedSelect: 0, extraNext: 0, extraSelect: 0, inadvertentNext: 0, inadvertentSelect: 0,
    facilitatorMiss: false, selections: [], browNextHeldMs: [], browHoldMs: [],
    blinkDiscards: { 'too-short': 0, 'too-long': 0, 'face-lost': 0, 'multiple-faces': 0, stale: 0 },
    browCancels: { 'too-short': 0, 'blink-preempted': 0, 'face-lost': 0, ambiguous: 0, stale: 0 },
    faceLost: 0, faceFound: 0, blockedWhilePaused: 0, refusedSelect: 0, resumes: 0,
    pausedAtMs: null, faceFoundAtMs: null, resumedAtMs: null,
  };
}

function clonePrompt(p: PromptRecord): PromptRecord {
  return {
    ...p, selections: p.selections.map((s) => ({ ...s })), browNextHeldMs: [...p.browNextHeldMs], browHoldMs: [...p.browHoldMs],
    blinkDiscards: { ...p.blinkDiscards }, browCancels: { ...p.browCancels },
  };
}

const r = (x: number) => Math.round(x);

export class TrialSession {
  readonly t0: number;
  readonly startedAtIso: string;
  private runs: Partial<Record<StepId, StepRun>> = {};
  private runCounter: Partial<Record<StepId, number>> = {};
  private active: StepId | null = null;
  private highlight = 0;
  private paused = false;
  private frozen: string | null = null;
  private pendingClosureMs: number | null = null;
  private pendingBrowHeldMs: number | null = null;
  private browRise: { at: number; prompt: PromptRecord | null } | null = null;
  private lastBrowStatus: BrowStatus = 'disabled';
  private lastAck: TrialView['lastAck'] = null;
  private events: TrialEvent[] = [];
  private eventsDropped = 0;
  private fps: number[] = [];
  private listeners = new Set<() => void>();
  private view: TrialView;
  private version = 0;

  constructor(now: number, iso: string) {
    this.t0 = now;
    this.startedAtIso = iso;
    this.view = this.buildView();
  }

  // ---- store ----
  readonly subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  readonly getView = (): TrialView => this.view;

  private emit() {
    this.version += 1;
    this.view = this.buildView();
    this.listeners.forEach((fn) => fn());
  }

  private buildView(): TrialView {
    const runs: Partial<Record<StepId, StepRun>> = {};
    for (const [k, run] of Object.entries(this.runs) as [StepId, StepRun][]) {
      runs[k] = { ...run, prompts: run.prompts.map(clonePrompt) };
    }
    return {
      version: this.version, activeStep: this.active, runs, highlight: this.highlight, paused: this.paused,
      lastAck: this.lastAck ? { ...this.lastAck } : null, eventCount: this.events.length,
    };
  }

  // ---- helpers ----
  private rel(now: number) {
    return r(now - this.t0);
  }

  private currentPrompt(): PromptRecord | null {
    if (!this.active) return null;
    const run = this.runs[this.active];
    if (!run || run.status !== 'running') return null;
    const p = run.prompts[run.current];
    return p && p.phase !== 'done' ? p : null;
  }

  private log(now: number, type: string, extra: Record<string, string | number | boolean | null> = {}) {
    if (this.events.length >= MAX_EVENTS) {
      this.eventsDropped += 1;
      return;
    }
    const p = this.currentPrompt();
    this.events.push({ t: this.rel(now), step: this.active, prompt: p ? p.index + 1 : null, type, ...extra });
  }

  // ---- facilitator ----
  startStep(id: StepId, now: number): void {
    if (this.active && this.active !== id) this.endStepEarly(now);
    const spec = stepSpec(id);
    const run = (this.runCounter[id] ?? 0) + 1;
    this.runCounter[id] = run;
    this.active = id;
    this.frozen = null;
    this.browRise = null;
    const first = newPrompt(spec.prompts[0], 0, id, this.rel(now));
    this.runs[id] = { id, run, startedAt: this.rel(now), endedAt: null, status: 'running', current: 0, prompts: [first] };
    if (first.target) this.highlight = TRIAL_TARGETS.indexOf(first.target as (typeof TRIAL_TARGETS)[number]);
    this.log(now, 'step-start', { run });
    this.log(now, 'prompt-start');
    this.emit();
  }

  endStepEarly(now: number): void {
    if (!this.active) return;
    const run = this.runs[this.active];
    if (run && run.status === 'running') {
      const p = run.prompts[run.current];
      if (p && p.phase !== 'done') {
        // An unfinished prompt that already got its command counts; an open one is not run.
        if (p.phase === 'settling') this.closePrompt(p, now);
        else {
          p.phase = 'done';
          p.outcome = 'not-run';
          p.endedAt = this.rel(now);
        }
      }
      run.status = 'ended-early';
      run.endedAt = this.rel(now);
      this.log(now, 'step-ended-early');
    }
    this.active = null;
    this.frozen = null;
    this.emit();
  }

  /** The participant made a real attempt and nothing was accepted. Ends the current prompt as a miss. */
  markMiss(now: number): boolean {
    const p = this.currentPrompt();
    if (!p || p.phase !== 'open' || p.expect === 'none') return false;
    p.facilitatorMiss = true;
    this.log(now, 'facilitator-miss');
    this.closePrompt(p, now);
    this.advance(now);
    this.emit();
    return true;
  }

  /** Flags the most recent accepted selection in the active (or last) step as the wrong target. */
  markWrongTarget(now: number): boolean {
    const id = this.active ?? this.lastStepWithSelection();
    const run = id ? this.runs[id] : undefined;
    if (!run) return false;
    for (let i = run.prompts.length - 1; i >= 0; i--) {
      const sel = run.prompts[i].selections;
      for (let j = sel.length - 1; j >= 0; j--) {
        if (!sel[j].wrongMarked) {
          sel[j].wrongMarked = true;
          if (run.prompts[i].phase === 'done' && run.prompts[i].outcome === 'hit') run.prompts[i].outcome = 'wrong-target';
          this.events.push({ t: this.rel(now), step: run.id, prompt: i + 1, type: 'facilitator-wrong-target', selectionAt: sel[j].at });
          this.emit();
          return true;
        }
        return false; // the latest selection is already marked: do not walk back to older ones
      }
    }
    return false;
  }

  private lastStepWithSelection(): StepId | null {
    let best: { id: StepId; at: number } | null = null;
    for (const run of Object.values(this.runs) as StepRun[]) {
      for (const p of run.prompts) for (const s of p.selections) if (!best || s.at > best.at) best = { id: run.id, at: s.at };
    }
    return best?.id ?? null;
  }

  /** Facilitator touch resume (the app also allows a touch/keyboard resume). Logged separately from a blink resume. */
  touchResume(now: number): void {
    if (!this.paused) return;
    this.paused = false;
    this.frozen = null;
    this.log(now, 'touch-resume');
    this.emit();
  }

  canMarkMiss(): boolean {
    const p = this.currentPrompt();
    return !!p && p.phase === 'open' && p.expect !== 'none';
  }

  /** Clears every run and the event log. */
  resetAll(now: number): void {
    this.runs = {};
    this.runCounter = {};
    this.active = null;
    this.frozen = null;
    this.lastAck = null;
    this.events = [];
    this.eventsDropped = 0;
    this.fps = [];
    this.log(now, 'reset');
    this.emit();
  }

  // ---- time ----
  tick(now: number): void {
    const p = this.currentPrompt();
    if (!p) return;
    const t = this.rel(now);
    const spec = stepSpec(this.active as StepId).prompts[p.index];
    if (p.phase === 'settling' && p.settleUntil !== null && t >= p.settleUntil) {
      this.closePrompt(p, now);
      this.advance(now);
      this.emit();
    } else if (p.phase === 'open' && spec.windowMs !== null && t - p.startedAt >= spec.windowMs) {
      this.closePrompt(p, now);
      this.advance(now);
      this.emit();
    }
  }

  /** ms left in a fixed-window prompt, or null. */
  remainingMs(now: number): number | null {
    const p = this.currentPrompt();
    if (!p || !this.active) return null;
    const spec = stepSpec(this.active).prompts[p.index];
    if (spec.windowMs === null) return null;
    return Math.max(0, spec.windowMs - (this.rel(now) - p.startedAt));
  }

  sampleFps(fps: number): void {
    if (this.active && Number.isFinite(fps) && fps > 0 && this.fps.length < 10_000) this.fps.push(fps);
  }

  /** Environment events (orientation change, tab hidden/visible). */
  logEnv(now: number, type: string, detail: string | null = null): void {
    this.log(now, type, detail === null ? {} : { detail });
    this.emit();
  }

  private closePrompt(p: PromptRecord, now: number) {
    p.phase = 'done';
    p.endedAt = this.rel(now);
    p.settleUntil = null;
    if (p.expect === 'none') {
      p.outcome = p.inadvertentNext + p.inadvertentSelect + p.extraNext + p.extraSelect === 0 ? 'clean' : 'command-accepted';
    } else if (p.latencyMs === null) {
      p.outcome = 'miss';
    } else if (p.expect === 'SELECT' && p.selections[0] && (p.selections[0].wrongAuto || p.selections[0].wrongMarked)) {
      p.outcome = 'wrong-target';
    } else {
      p.outcome = 'hit';
    }
    this.log(now, 'prompt-end', { outcome: p.outcome });
  }

  private advance(now: number) {
    if (!this.active) return;
    const run = this.runs[this.active] as StepRun;
    const spec = stepSpec(this.active);
    const nextIndex = run.current + 1;
    if (nextIndex >= spec.prompts.length) {
      run.status = 'complete';
      run.endedAt = this.rel(now);
      this.log(now, 'step-complete');
      this.active = null;
      this.frozen = null;
      return;
    }
    run.current = nextIndex;
    const p = newPrompt(spec.prompts[nextIndex], nextIndex, this.active, this.rel(now));
    run.prompts.push(p);
    if (p.target) this.highlight = TRIAL_TARGETS.indexOf(p.target as (typeof TRIAL_TARGETS)[number]);
    this.log(now, 'prompt-start');
  }

  private hit(p: PromptRecord, now: number) {
    p.latencyMs = this.rel(now) - p.startedAt;
    const spec = stepSpec(this.active as StepId).prompts[p.index];
    p.phase = 'settling';
    p.settleUntil = this.rel(now) + spec.settleMs;
  }

  // ---- engine command stream (same events useStillHere receives) ----
  handleCommand(e: FaceCommandEvent, now: number): FaceCommandResult {
    switch (e.type) {
      case 'freeze': {
        this.frozen = this.paused ? RESUME_TARGET : TRIAL_TARGETS[this.highlight];
        this.log(now, 'freeze', { target: this.frozen });
        return { applied: true, targetId: this.frozen };
      }
      case 'unfreeze':
        this.frozen = null;
        return REFUSED;
      case 'face-lost': {
        this.frozen = null;
        const p = this.currentPrompt();
        if (p) {
          p.faceLost += 1;
          if (p.expect === 'resume' && p.pausedAtMs === null) p.pausedAtMs = this.rel(now) - p.startedAt;
        }
        const wasPaused = this.paused;
        this.paused = true;
        this.log(now, 'face-lost-pause', { alreadyPaused: wasPaused });
        this.emit();
        return REFUSED;
      }
      case 'accept':
        return e.command === 'NAV_NEXT' ? this.onNext(now) : this.onSelect(now);
    }
  }

  private onNext(now: number): FaceCommandResult {
    const heldMs = this.pendingBrowHeldMs;
    this.pendingBrowHeldMs = null;
    const p = this.currentPrompt();
    if (this.paused) {
      if (p) p.blockedWhilePaused += 1;
      this.lastAck = { command: 'BLOCKED', at: this.rel(now), target: null };
      this.log(now, 'next-blocked-paused');
      this.emit();
      return REFUSED;
    }
    this.highlight = (this.highlight + 1) % TRIAL_TARGETS.length;
    const target = TRIAL_TARGETS[this.highlight];
    this.lastAck = { command: 'NAV_NEXT', at: this.rel(now), target };
    let cls = 'idle';
    if (p) {
      p.acceptedNext += 1;
      if (heldMs !== null) p.browNextHeldMs.push(r(heldMs));
      if (p.expect === 'NAV_NEXT') {
        if (p.phase === 'open' && p.latencyMs === null) {
          cls = 'expected';
          this.hit(p, now);
        } else {
          cls = 'extra';
          p.extraNext += 1;
        }
      } else {
        cls = 'inadvertent';
        p.inadvertentNext += 1;
      }
    }
    this.log(now, 'accepted-next', { class: cls, target, heldMs: heldMs === null ? null : r(heldMs) });
    this.emit();
    return { applied: true, targetId: target };
  }

  private onSelect(now: number): FaceCommandResult {
    const closureMs = this.pendingClosureMs;
    this.pendingClosureMs = null;
    const snap = this.frozen;
    this.frozen = null;
    const p = this.currentPrompt();
    const cms = closureMs === null ? null : r(closureMs);
    if (!snap || (this.paused && snap !== RESUME_TARGET) || (!this.paused && snap === RESUME_TARGET)) {
      // The app refuses these too: no onset snapshot, or the surface changed (pause) mid-closure.
      if (p) p.refusedSelect += 1;
      this.log(now, 'select-refused', { reason: snap ? 'surface-changed' : 'no-onset-snapshot', closureMs: cms });
      this.emit();
      return REFUSED;
    }
    if (snap === RESUME_TARGET) {
      this.paused = false;
      this.lastAck = { command: 'RESUME', at: this.rel(now), target: RESUME_TARGET };
      let cls = 'resume';
      if (p) {
        p.resumes += 1;
        if (p.expect === 'resume' && p.phase === 'open' && p.latencyMs === null && p.pausedAtMs !== null) {
          p.resumedAtMs = this.rel(now) - p.startedAt;
          cls = 'expected';
          this.hit(p, now);
        }
      }
      this.log(now, 'resume', { class: cls, closureMs: cms });
      this.emit();
      return { applied: true, targetId: RESUME_TARGET };
    }
    this.lastAck = { command: 'SELECT', at: this.rel(now), target: snap };
    let cls = 'idle';
    if (p) {
      p.acceptedSelect += 1;
      const sel: Selection = { at: this.rel(now), target: snap, closureMs: cms, wrongAuto: false, wrongMarked: false };
      if (p.expect === 'SELECT') {
        if (p.phase === 'open' && p.latencyMs === null) {
          cls = 'expected';
          sel.wrongAuto = p.target !== null && snap !== p.target;
          if (sel.wrongAuto) cls = 'wrong-target';
          this.hit(p, now);
        } else {
          cls = 'extra';
          p.extraSelect += 1;
        }
      } else {
        cls = 'inadvertent';
        p.inadvertentSelect += 1;
      }
      p.selections.push(sel);
    }
    this.log(now, 'accepted-select', { class: cls, target: snap, closureMs: cms });
    this.emit();
    return { applied: true, targetId: snap };
  }

  // ---- raw detector events (arrive just before the matching command) ----
  handleRaw(e: BlinkGestureEvent, now: number): void {
    const p = this.currentPrompt();
    switch (e.type) {
      case 'select':
        this.pendingClosureMs = e.durationMs;
        this.log(now, 'raw-select', { durationMs: r(e.durationMs) });
        return;
      case 'discard':
        if (p) p.blinkDiscards[e.reason] += 1;
        this.log(now, 'raw-blink-discard', { reason: e.reason, durationMs: r(e.durationMs) });
        this.emit();
        return;
      case 'brow-next':
        this.pendingBrowHeldMs = e.heldMs;
        this.log(now, 'raw-brow-next', { heldMs: r(e.heldMs) });
        return;
      case 'brow-cancel':
        if (p) p.browCancels[e.reason] += 1;
        this.log(now, 'raw-brow-cancel', { reason: e.reason, heldMs: r(e.heldMs) });
        this.emit();
        return;
      case 'face-found':
        if (p) {
          p.faceFound += 1;
          if (p.expect === 'resume' && p.pausedAtMs !== null && p.faceFoundAtMs === null) p.faceFoundAtMs = this.rel(now) - p.startedAt;
        }
        this.log(now, 'face-found');
        this.emit();
        return;
      case 'closure-start':
      case 'brow-start':
      case 'face-lost':
        this.log(now, `raw-${e.type}`);
    }
  }

  /** Brow status from the engine snapshot (~10 Hz): approximate total raise duration. */
  onBrowStatus(status: BrowStatus, now: number): void {
    const prev = this.lastBrowStatus;
    this.lastBrowStatus = status;
    if (status === 'rising' && prev !== 'rising') {
      this.browRise = { at: now, prompt: this.currentPrompt() };
    } else if (prev === 'latched' && status !== 'latched' && this.browRise) {
      const ms = r(now - this.browRise.at);
      this.browRise.prompt?.browHoldMs.push(ms);
      this.log(now, 'brow-hold-approx', { ms });
      this.browRise = null;
      this.emit();
    } else if (status === 'neutral' || status === 'disabled') {
      this.browRise = null;
    }
  }

  // ---- export ----
  exportData(extra: { device: Record<string, unknown>; conditions: Record<string, string>; calibration: Record<string, unknown> }, nowIso: string) {
    const runs = this.buildView().runs;
    return {
      schema: TRIAL_SCHEMA,
      label: TRIAL_LABEL,
      privacy: 'Counts, timings and event types only. No camera images, video, landmarks or blendshape streams are included.',
      generatedAt: nowIso,
      trialStartedAt: this.startedAtIso,
      device: extra.device,
      conditions: extra.conditions,
      calibration: extra.calibration,
      detector: { processedFps: stats(this.fps), note: 'Engine-reported processed frames per second, sampled once per second during steps.' },
      summary: summarize(runs),
      steps: PROTOCOL.map((s) => {
        const run = runs[s.id];
        return {
          id: s.id, title: s.title, facilitatorInstructions: s.facilitator,
          run: run ? { run: run.run, status: run.status, startedAtMs: run.startedAt, endedAtMs: run.endedAt, prompts: run.prompts.map(exportPrompt) } : null,
        };
      }),
      events: { timeBase: 'ms since trial page load (performance clock)', dropped: this.eventsDropped, list: this.events.map((e) => ({ ...e })) },
    };
  }
}

function exportPrompt(p: PromptRecord) {
  const { phase: _phase, settleUntil: _settle, ...rest } = p;
  void _phase;
  void _settle;
  return { ...rest, prompt: p.index + 1 };
}

export type Stats = { n: number; min: number | null; median: number | null; max: number | null; mean: number | null };

export function stats(values: readonly number[]): Stats {
  if (values.length === 0) return { n: 0, min: null, median: null, max: null, mean: null };
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { n: v.length, min: v[0], median: r(median), max: v[v.length - 1], mean: r(v.reduce((a, b) => a + b, 0) / v.length) };
}

export type StepSummary = {
  id: StepId;
  status: StepRun['status'] | 'not-run';
  promptsPlanned: number;
  promptsRun: number;
  hits: number;
  missed: number;
  facilitatorMarkedMisses: number;
  inadvertentNext: number;
  extraNextDuringHold: number;
  inadvertentSelect: number;
  extraSelect: number;
  wrongTargetSelections: number;
  wrongTargetAuto: number;
  wrongTargetMarked: number;
  blockedWhilePaused: number;
  faceLossPauses: number;
  resumes: number;
  latencyMs: Stats;
  closureMs: Stats;
  browHoldApproxMs: Stats;
  /** Step E: prompts with exactly one accepted NEXT. */
  exactlyOneNext: number | null;
  /** Step D: prompts where the pause appeared and a deliberate blink resumed. */
  pausedAndResumed: number | null;
  /** Step F: accepted commands per gesture group. */
  groups: Record<string, { prompts: number; commandsAccepted: number }> | null;
};

export function summarizeStep(spec: StepSpec, run: StepRun | undefined): StepSummary {
  const prompts = (run?.prompts ?? []).filter((p) => p.phase === 'done' && p.outcome !== 'not-run');
  const sum = (f: (p: PromptRecord) => number) => prompts.reduce((a, p) => a + f(p), 0);
  const sels = prompts.flatMap((p) => p.selections);
  const expectsCommand = spec.prompts[0].expect !== 'none';
  const groups = spec.id === 'F'
    ? prompts.reduce<Record<string, { prompts: number; commandsAccepted: number }>>((acc, p) => {
      const g = p.group ?? 'other';
      acc[g] ??= { prompts: 0, commandsAccepted: 0 };
      acc[g].prompts += 1;
      acc[g].commandsAccepted += p.acceptedNext + p.acceptedSelect;
      return acc;
    }, {})
    : null;
  return {
    id: spec.id,
    status: run?.status ?? 'not-run',
    promptsPlanned: spec.prompts.length,
    promptsRun: prompts.length,
    hits: expectsCommand ? prompts.filter((p) => p.outcome === 'hit' || p.outcome === 'wrong-target').length : 0,
    missed: expectsCommand ? prompts.filter((p) => p.outcome === 'miss').length : 0,
    facilitatorMarkedMisses: prompts.filter((p) => p.facilitatorMiss).length,
    inadvertentNext: sum((p) => p.inadvertentNext),
    extraNextDuringHold: sum((p) => p.extraNext),
    inadvertentSelect: sum((p) => p.inadvertentSelect),
    extraSelect: sum((p) => p.extraSelect),
    wrongTargetSelections: sels.filter((s) => s.wrongAuto || s.wrongMarked).length,
    wrongTargetAuto: sels.filter((s) => s.wrongAuto).length,
    wrongTargetMarked: sels.filter((s) => s.wrongMarked).length,
    blockedWhilePaused: sum((p) => p.blockedWhilePaused),
    faceLossPauses: sum((p) => p.faceLost),
    resumes: sum((p) => p.resumes),
    latencyMs: stats(prompts.flatMap((p) => (p.latencyMs === null ? [] : [p.latencyMs]))),
    closureMs: stats(sels.flatMap((s) => (s.closureMs === null ? [] : [s.closureMs]))),
    browHoldApproxMs: stats(prompts.flatMap((p) => p.browHoldMs)),
    exactlyOneNext: spec.id === 'E' ? prompts.filter((p) => p.acceptedNext === 1).length : null,
    pausedAndResumed: spec.id === 'D' ? prompts.filter((p) => p.outcome === 'hit' && p.pausedAtMs !== null).length : null,
    groups,
  };
}

export function summarize(runs: Partial<Record<StepId, StepRun>>) {
  const steps = PROTOCOL.map((s) => summarizeStep(s, runs[s.id]));
  const total = (f: (s: StepSummary) => number) => steps.reduce((a, s) => a + f(s), 0);
  return {
    steps,
    totals: {
      missedCommands: total((s) => s.missed),
      /** Every NEXT the participant did not ask for: wrong-kind, 'none' windows, and extra NEXTs during a hold. */
      inadvertentNext: total((s) => s.inadvertentNext + s.extraNextDuringHold),
      inadvertentNextWrongKindOrUnprompted: total((s) => s.inadvertentNext),
      extraNextDuringHold: total((s) => s.extraNextDuringHold),
      inadvertentSelect: total((s) => s.inadvertentSelect + s.extraSelect),
      wrongTargetSelections: total((s) => s.wrongTargetSelections),
      nextBlockedWhilePaused: total((s) => s.blockedWhilePaused),
      faceLossPauses: total((s) => s.faceLossPauses),
    },
  };
}
