// Blink auto-scan ('blink' fallback mode) pipeline integration test.
//
// SYNTHETIC FRAMES ONLY. This is NOT hardware verification: no camera, no MediaPipe, no browser.
// Every frame is a hand-written {faces, blinkScore, browScore} sample at ~15 fps on vitest fake
// timers (Date + setTimeout), so the ScanController's real chained timer fires at exact fake times.
// It proves that the real pure pieces compose correctly (plumbing and guards), not that a real
// face produces these scores. Generation results are labeled fixture output ('demo-fixture').
//
// Composed for real (no mocks): BlinkGesture, BrowGesture (never fed in this mode), GestureArbiter
// (browEnabled → false), ScanController in TIMER mode (reading pause, interval, wrap, hold with
// remaining time), the acquisition hold (nextAcquireHold), attributeClosure with
// onRecentChange 'previous', the reducer, and targetsFor. The glue mirrors, step for step:
//   - BlinkEngine.onFrame / routeBlink / routeBrow / apply / resetGestures (src/runtime/useBlink.ts):
//     score smoothing, blink first, brow cancelled/never pushed outside 'brow-blink', face-lost → handler.
//   - useStillHere (src/runtime/useStillHere.ts): blinkAcquiring / acquire-hold timeout, the scan
//     effect (re-run only when one of its deps changes), the onCommand handler (closure snapshot via
//     attributeClosure, immediate freeze/pin, surfaceRevision check, ACTIVATE source 'blink'), the
//     render-phase blinkHeld reset and the gesture reset on every surfaceRevision/sessionEpoch/mode change.
// React batching is modeled by a `committed` state (stateRef) that only catches up with the
// reducer's latest state at the end of each frame ("render"), when the effects run.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlinkGesture, DEFAULT_GESTURE_CONFIG, smoothScore } from '@/access/blink-gesture';
import { BrowGesture, DEFAULT_BROW_CALIBRATION, type BrowEvent } from '@/access/brow-gesture';
import { GestureArbiter, type ArbiterOutput } from '@/access/gesture-arbiter';
import { hasHighlight, isFaceMode, isManualNavMode } from '@/access/input-controller';
import {
  ACQUIRE_HOLD_MAX_MS, acquireHoldActive as isAcquireHoldActive, ATTRIBUTION_TIMING, attributeClosure, MIN_RESUME_MS,
  nextAcquireHold, ScanController,
  type AcquireHold, type ClosureAttribution, type HighlightLogEntry, type ScanConfig,
} from '@/access/scan-controller';
import { SCAN_DEFAULTS } from '@/core/limits';
import { newId, reducer } from '@/core/reducer';
import { targetsFor } from '@/core/targets';
import { currentSurface, initialState, type Action, type Effect, type Settings, type State } from '@/core/state';
import type { BlinkGestureEvent, GestureCommand } from '@/runtime/contract';
import type { FaceCommand } from '@/access/gesture-arbiter';
import {
  ALT_CANDIDATES, Driver, okResult, SPREAD_CANDIDATES,
  type ActivateAction, type FixtureCandidate, type GenEffect, type SpeakEffect,
} from './helpers';

// ---- Synthetic frame constants (not measured values) ----
const FRAME_MS = 67; // ~15 fps
const EYES_OPEN = 0.05;
const EYES_CLOSED = 0.9;
const BROW_REST = 0.05;
const BROW_UP = 0.8;
/** Mirrors BROW_SMOOTHING_ALPHA in src/runtime/useBlink.ts (not imported: that module imports React). */
const BROW_SMOOTHING_ALPHA = 0.5;
const T0 = 1000;
const INTERVAL = SCAN_DEFAULTS.intervalMs; // 1500
const READING = SCAN_DEFAULTS.readingPauseMs; // 2000

type FaceCommandEvent =
  | { type: 'freeze'; at: number }
  | { type: 'unfreeze'; at: number }
  | { type: 'accept'; command: FaceCommand; at: number; cycleId: string }
  | { type: 'face-lost'; at: number };
type FaceCommandResult = { applied: boolean; targetId: string | null };
type SynthFrame = { faces?: number; blink?: number | null; brow?: number | null };

class AutoScanHarness {
  private pending: State; // the reducer's latest state
  committed: State; // stateRef.current (what the handler reads)
  readonly blink = new BlinkGesture(DEFAULT_GESTURE_CONFIG);
  readonly brow = new BrowGesture(DEFAULT_BROW_CALIBRATION);
  readonly arbiter: GestureArbiter;
  readonly scan: ScanController;
  scanTimersScheduled = 0;
  private highlighted: string | null = null;
  /** Bounded log exactly like highlightLogRef (16 entries). */
  readonly highlightLog: HighlightLogEntry[] = [];
  /** Unbounded copy for assertions. */
  readonly history: HighlightLogEntry[] = [];
  readonly attributions: { at: number; result: ClosureAttribution }[] = [];
  private arming = new Map<string, boolean>();
  private blinkHeld = false;
  private blinkPin: string | null = null;
  private blinkSnap: { targetId: string; surfaceRevision: number; cycleId: string; at: number } | null = null;
  private lastScanCfg: ScanConfig | null = null;
  private lastScanDeps: string | null = null;
  private heldSurfaceKey: string;
  private lastResetKey: string | null = null;
  private acquireHold: AcquireHold = { acquiring: false, released: false };
  private acquireTimer: ReturnType<typeof setTimeout> | null = null;
  private acquireTimerActive = false;
  private smoothed: number | null = null;
  private browSmoothed: number | null = null;
  private browRunning = false;
  private lastT = 0;
  private readonly lastSwitchActivate = -Infinity;
  readonly activations: ActivateAction[] = [];
  readonly commands: { event: FaceCommandEvent; result: FaceCommandResult }[] = [];
  readonly gestureEvents: BlinkGestureEvent[] = [];
  private readonly seenEffects = new Set<string>();
  readonly effects: Effect[] = [];

  constructor(settings: Partial<Settings> = {}) {
    this.pending = new Driver({ accessMode: 'blink', aiMode: 'fixture', ...settings }, initialState(), 'e-autoscan', Date.now()).s;
    this.committed = this.pending;
    this.collect();
    this.arbiter = new GestureArbiter({ newId, browEnabled: () => this.mode() === 'brow-blink' });
    this.scan = new ScanController(
      (id, rev) => {
        const entry = { id, at: Date.now(), rev };
        const log = this.highlightLog;
        log.push(entry);
        if (log.length > 16) log.splice(0, log.length - 16);
        this.history.push(entry);
        this.highlighted = id;
      },
      {
        now: () => Date.now(),
        setTimeout: (fn, ms) => { this.scanTimersScheduled += 1; return setTimeout(fn, ms); },
        clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      },
    );
    this.heldSurfaceKey = this.surfaceKey(this.committed);
    this.render();
  }

  // ---------- observation ----------
  get t(): number { return Date.now(); }
  get state(): State { return this.committed; }
  surface(): string { return currentSurface(this.committed).kind; }
  highlight(): string | null { return this.scanning(this.committed) ? this.highlighted : null; }
  /** When the current highlight was (last) logged. */
  highlightedSince(): number { return this.history[this.history.length - 1].at; }
  /** Highlight log entries at or after `from` (for schedule assertions). */
  historySince(from: number): HighlightLogEntry[] { return this.history.filter((e) => e.at >= from); }
  enabledIds(): string[] { return targetsFor(this.committed).filter((t) => t.enabled).map((t) => t.id); }
  targetLabel(id: string): string | undefined { return targetsFor(this.committed).find((t) => t.id === id)?.label; }
  speaks(): SpeakEffect[] { return this.effects.filter((e): e is SpeakEffect => e.kind === 'speak'); }
  generates(): GenEffect[] { return this.effects.filter((e): e is GenEffect => e.kind === 'generate'); }
  accepted(command: GestureCommand): number {
    return this.commands.filter((c) => c.event.type === 'accept' && c.event.command === command && c.result.applied).length;
  }
  eventsAfter(type: BlinkGestureEvent['type'], after: number) { return this.gestureEvents.filter((e) => e.type === type && e.at > after); }
  freezeAt(at: number) { return this.commands.find((c) => c.event.type === 'freeze' && c.event.at === at); }

  // ---------- non-gesture inputs (between frames) ----------
  dispatchRaw(a: Action) {
    this.dispatch(a);
    this.render();
  }

  partner(text: string) {
    vi.advanceTimersByTime(5);
    this.dispatch({ type: 'PARTNER_SUBMIT', text, source: 'partner-typed', at: this.t });
    this.render();
  }

  /** Installs a labeled FIXTURE result for the latest generate request. */
  resolve(candidates: FixtureCandidate[]) {
    const g = this.generates();
    expect(g.length, 'a generate effect is queued').toBeGreaterThan(0);
    vi.advanceTimersByTime(5);
    this.dispatch({ ...okResult(g[g.length - 1].request.identity, candidates), at: this.t });
    this.render();
  }

  finishSpeech() {
    const id = this.committed.speech?.utterance.id;
    expect(id, 'an utterance is playing').toBeDefined();
    for (const kind of ['start', 'end'] as const) {
      vi.advanceTimersByTime(5);
      this.dispatch({ type: 'SPEECH_EVENT', utteranceId: id!, sessionEpoch: this.committed.sessionEpoch, kind, at: this.t });
      this.render();
    }
  }

  // ---------- synthetic camera frames (fake timers advance first, so scan ticks fire in between) ----------
  frames(ms: number, f: SynthFrame = {}) {
    const n = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 0; i < n; i++) this.frame(f);
  }
  frame(f: SynthFrame = {}) {
    vi.advanceTimersByTime(FRAME_MS);
    this.onFrame({
      t: this.t,
      faces: f.faces ?? 1,
      blinkScore: f.blink === undefined ? EYES_OPEN : f.blink,
      browScore: f.brow === undefined ? BROW_REST : f.brow,
    });
  }
  idle(ms: number) { this.frames(ms); }
  raise(ms: number) { this.frames(ms, { brow: BROW_UP }); }
  closeEyes(ms: number) { this.frames(ms, { blink: EYES_CLOSED }); }

  /** Frames (eyes open) until the timer highlights `id`; returns when it became highlighted. */
  waitFor(id: string, maxMs = 20000): number {
    for (let waited = 0; this.highlight() !== id; waited += FRAME_MS) {
      if (waited > maxMs) throw new Error(`highlight never reached ${id} (now ${this.highlight()} on ${this.surface()})`);
      this.frame();
    }
    return this.highlightedSince();
  }

  /**
   * One deliberate long blink on `id`: wait until the timer reaches it, it has been highlighted for
   * at least `dwellMs` and the blink machine is re-armed, then close for `closeMs` and open until the
   * select lands. Returns the new activation.
   */
  selectOn(id: string, { dwellMs = 450, closeMs = 900 } = {}): ActivateAction {
    const since = this.waitFor(id);
    for (let i = 0; this.t - since < dwellMs || this.blink.snapshot().status !== 'ready'; i++) {
      if (i > 60) throw new Error(`blink never re-armed on ${id}`);
      this.frame();
    }
    expect(this.highlight(), `still on ${id} before closing`).toBe(id);
    const before = this.activations.length;
    this.closeEyes(closeMs);
    for (let i = 0; i < 10 && this.activations.length === before; i++) this.frame();
    expect(this.activations.length, `long blink on ${id} activated once`).toBe(before + 1);
    return this.activations[before];
  }

  // ---------- mirror of BlinkEngine.onFrame (useBlink.ts) ----------
  private onFrame(raw: { t: number; faces: number; blinkScore: number | null; browScore: number | null }) {
    this.lastT = raw.t;
    const single = raw.faces === 1 && raw.blinkScore !== null;
    this.smoothed = single ? smoothScore(this.smoothed, raw.blinkScore as number) : null;
    const browSingle = raw.faces === 1 && raw.browScore !== null;
    this.browSmoothed = browSingle ? smoothScore(this.browSmoothed, raw.browScore as number, BROW_SMOOTHING_ALPHA) : null;
    this.routeBlink(this.blink.push({ t: raw.t, faces: raw.faces, score: single ? this.smoothed : null }));
    if (this.mode() === 'brow-blink') {
      if (!this.browRunning) {
        this.brow.reset();
        this.browRunning = true;
      }
      this.routeBrow(this.brow.push({ t: raw.t, faces: raw.faces, score: browSingle ? this.browSmoothed : null }));
    } else if (this.browRunning) {
      this.routeBrow(this.brow.cancel('stale', raw.t));
      this.browRunning = false;
    }
    this.render(); // React commits between camera frames
  }

  private routeBlink(events: BlinkGestureEvent[]) {
    for (const e of events) {
      this.gestureEvents.push(e);
      this.apply(this.arbiter.onBlink(e));
      if (e.type === 'face-lost') this.send({ type: 'face-lost', at: e.at });
    }
  }

  private routeBrow(events: BrowEvent[]) {
    for (const e of events) {
      this.gestureEvents.push(e);
      this.apply(this.arbiter.onBrow(e));
    }
  }

  private apply(outputs: ArbiterOutput[]) {
    for (const o of outputs) {
      switch (o.type) {
        case 'freeze':
        case 'unfreeze':
          this.send({ type: o.type, at: o.at });
          break;
        case 'cancel-brow':
          this.routeBrow(this.brow.cancel(o.reason, this.lastT));
          break;
        case 'accept':
          this.send({ type: 'accept', command: o.command, at: o.at, cycleId: o.cycleId });
          break;
        case 'feedback':
          break; // presentation only
      }
    }
  }

  private resetGestures() {
    if (this.blink.snapshot().status === 'closing') this.routeBlink(this.blink.interrupt());
    this.arbiter.reset();
    this.brow.reset();
  }

  // ---------- mirror of useStillHere's onCommand handler ----------
  private send(e: FaceCommandEvent): FaceCommandResult {
    const result = this.onCommand(e);
    this.commands.push({ event: e, result });
    return result;
  }

  private stepHighlight(): string | null {
    const s = this.committed;
    if (s.phase !== 'active' || !isManualNavMode(s.settings.accessMode)) return null;
    if (this.blinkPin !== null) return null;
    return this.scan.next();
  }

  private freeze(targetId: string) {
    this.blinkPin = targetId;
    this.blinkHeld = true;
    const cfg = this.lastScanCfg;
    if (cfg && cfg.active) this.scan.update({ ...cfg, held: true, pin: targetId });
  }

  private unfreeze() {
    this.blinkSnap = null;
    this.blinkPin = null;
    this.blinkHeld = false;
  }

  private onCommand(e: FaceCommandEvent): FaceCommandResult {
    const s = this.committed;
    const refused: FaceCommandResult = { applied: false, targetId: null };
    const usable = s.phase === 'active' && isFaceMode(s.settings.accessMode); // blink.active && calibrated assumed
    switch (e.type) {
      case 'freeze': {
        this.blinkSnap = null;
        if (!usable) return refused;
        if (!this.scan.current) return refused;
        const a = attributeClosure(
          this.highlightLog, e.at, (id) => this.arming.get(id) ?? true, ATTRIBUTION_TIMING,
          { onRecentChange: isManualNavMode(s.settings.accessMode) ? 'discard' : 'previous' },
        );
        this.attributions.push({ at: e.at, result: a });
        if (!a.ok) return refused;
        this.blinkSnap = { targetId: a.targetId, surfaceRevision: a.surfaceRevision, cycleId: newId(), at: e.at };
        this.freeze(a.targetId);
        return { applied: true, targetId: a.targetId };
      }
      case 'unfreeze':
        this.unfreeze();
        return refused;
      case 'accept': {
        if (e.command === 'NAV_NEXT') {
          if (!usable) return refused;
          const id = this.stepHighlight();
          return id ? { applied: true, targetId: id } : refused;
        }
        const snap = this.blinkSnap;
        this.unfreeze();
        if (!snap || !usable) return refused;
        if (snap.surfaceRevision !== s.surfaceRevision) return refused;
        if (this.lastSwitchActivate >= snap.at) return refused;
        this.dispatch({
          type: 'ACTIVATE', targetId: snap.targetId, eventId: newId(), cycleId: snap.cycleId,
          surfaceRevision: snap.surfaceRevision, sessionEpoch: s.sessionEpoch, source: 'blink', at: this.t,
        });
        return { applied: true, targetId: snap.targetId };
      }
      case 'face-lost':
        this.unfreeze();
        if (usable) this.dispatch({ type: 'SAFETY_PAUSE', at: this.t });
        return refused;
    }
  }

  // ---------- reducer + "render" ----------
  private dispatch(a: Action) {
    this.pending = reducer(this.pending, a);
    if (a.type === 'ACTIVATE') this.activations.push(a);
    this.collect();
  }

  private collect() {
    for (const e of this.pending.effects) {
      if (this.seenEffects.has(e.id)) continue;
      this.seenEffects.add(e.id);
      this.effects.push(e);
    }
  }

  private mode() { return this.committed.settings.accessMode; }
  private scanning(s: State) { return hasHighlight(s.settings.accessMode) && s.phase === 'active'; }
  private surfaceKey(s: State) { return `${s.surfaceRevision}:${s.sessionEpoch}:${s.settings.accessMode}`; }

  /** useStillHere's acquire-hold effect: one ACQUIRE_HOLD_MAX_MS timeout while the hold is active. */
  private syncAcquireTimer(active: boolean) {
    if (active === this.acquireTimerActive) return;
    this.acquireTimerActive = active;
    if (this.acquireTimer !== null) clearTimeout(this.acquireTimer);
    this.acquireTimer = null;
    if (!active) return;
    this.acquireTimer = setTimeout(() => {
      this.acquireTimer = null;
      this.acquireHold = nextAcquireHold(this.acquireHold, { type: 'timeout' });
      this.render();
    }, ACQUIRE_HOLD_MAX_MS);
  }

  /** Commit pending state and run the effects useStillHere runs after a render, until stable. */
  private render() {
    for (let pass = 0; pass < 6; pass++) {
      const s = this.pending;
      this.committed = s; // stateRef layout effect
      const targets = targetsFor(s);
      this.arming = new Map(targets.map((t) => [t.id, !!t.requiresArming])); // armingRef layout effect
      const key = this.surfaceKey(s);
      if (key !== this.heldSurfaceKey) {
        this.heldSurfaceKey = key; // render-phase adjust
        this.blinkHeld = false;
      }
      const scanning = this.scanning(s);
      const manual = isManualNavMode(s.settings.accessMode) && s.phase === 'active';
      // blinkAcquiring: camera on (assumed) and no stable single face yet (render-phase adjust).
      const status = this.blink.snapshot().status;
      const acquiring = !manual && isFaceMode(s.settings.accessMode) && (status === 'no-face' || status === 'multiple-faces');
      if (this.acquireHold.acquiring !== acquiring) this.acquireHold = nextAcquireHold(this.acquireHold, { type: 'acquiring', value: acquiring });
      const acquireHoldActive = acquiring && isAcquireHoldActive(this.acquireHold);
      this.syncAcquireTimer(acquireHoldActive);
      const ids = targets.filter((t) => t.enabled).map((t) => t.id);
      const cfg: ScanConfig = {
        active: scanning,
        ids,
        surfaceRevision: s.surfaceRevision,
        intervalMs: s.settings.scanIntervalMs,
        readingPauseMs: s.settings.readingPauseMs,
        held: scanning && (this.blinkHeld || acquireHoldActive),
        pin: this.blinkHeld ? this.blinkPin : null,
        hidden: false,
        manual,
      };
      // The scan effect only re-runs when one of its dependencies changed.
      const deps = [scanning, manual, ids.join('|'), s.surfaceRevision, cfg.intervalMs, cfg.readingPauseMs, this.blinkHeld, acquireHoldActive].join(',');
      if (deps !== this.lastScanDeps) {
        this.lastScanDeps = deps;
        this.lastScanCfg = cfg;
        this.scan.update(cfg);
      }
      const heldBefore = this.blinkHeld;
      if (this.lastResetKey !== key) {
        // New surface / revision / session / mode: no gesture carries over.
        this.lastResetKey = key;
        this.blinkSnap = null;
        this.blinkPin = null;
        this.resetGestures();
      }
      if (this.blinkHeld === heldBefore && this.pending === s) return;
    }
    throw new Error('harness render did not settle');
  }
}

const QUESTION = 'Do you want to go for a walk later?';
const BOARD_WITH_CANDIDATES = ['cand-0', 'cand-1', 'cand-2', 'none', 'guide', 'quick', 'my-words', 'more'];

/** Face acquired, partner question asked, fixture result installed. Returns when cand-0 was highlighted. */
function toCandidates(h: AutoScanHarness, candidates: FixtureCandidate[] = SPREAD_CANDIDATES): number {
  h.idle(1000);
  expect(h.blink.snapshot().status).toBe('ready');
  h.partner(QUESTION);
  expect(h.generates()).toHaveLength(1);
  h.idle(300);
  h.resolve(candidates);
  const ws = h.state.activeWorkspaceId ? h.state.workspaces[h.state.activeWorkspaceId] : null;
  expect(ws?.batch?.source, 'result is labeled fixture output').toBe('demo-fixture');
  expect(h.surface()).toBe('board');
  expect(h.highlight()).toBe('cand-0');
  return h.highlightedSince();
}

describe('blink auto-scan pipeline (SYNTHETIC frames, NOT hardware verification)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('timed schedule: reading pause on a new surface, then one step per interval, wrapping; one timer; no manual steps', () => {
    const h = new AutoScanHarness();
    const opened = toCandidates(h);
    expect(h.enabledIds()).toEqual(BOARD_WITH_CANDIDATES);
    expect(h.scan.next(), 'manual stepping is refused in timer mode').toBeNull();
    expect(vi.getTimerCount(), 'exactly one scan timer pending').toBe(1);

    h.idle(READING + INTERVAL * BOARD_WITH_CANDIDATES.length + 200);
    const log = h.historySince(opened);
    const expectedIds = [...BOARD_WITH_CANDIDATES, 'cand-0', 'cand-1'];
    expect(log.map((e) => e.id)).toEqual(expectedIds);
    expect(log.every((e) => e.rev === h.state.surfaceRevision)).toBe(true);
    const gaps = log.slice(1).map((e, i) => e.at - log[i].at);
    expect(gaps).toEqual([READING, ...Array(expectedIds.length - 2).fill(INTERVAL)]);
    expect(vi.getTimerCount()).toBe(1);
    expect(h.activations).toHaveLength(0);
  });

  it('brow input is disabled: a 1.5 s raise is never fed, never accepted, and never moves or holds the scan', () => {
    const h = new AutoScanHarness();
    const opened = toCandidates(h);
    h.raise(1500);
    expect(h.highlight()).toBe('cand-0');
    expect(h.gestureEvents.some((e) => e.type.startsWith('brow-'))).toBe(false);
    expect(h.brow.status, 'the brow machine is never pushed in blink mode').not.toBe('rising');
    expect(h.accepted('NAV_NEXT')).toBe(0);
    expect(h.waitFor('cand-1')).toBe(opened + READING);
    // Even a forged brow event is ignored by the arbiter in this mode.
    expect(h.arbiter.onBrow({ type: 'brow-start', at: h.t })).toEqual([]);
    expect(h.arbiter.onBrow({ type: 'brow-next', at: h.t + 600, heldMs: 600 })).toEqual([]);
  });

  it('closure-onset freezing: the highlight stays on the onset target while the eyes are closed, and the select commits it', () => {
    const h = new AutoScanHarness();
    toCandidates(h);
    const since = h.waitFor('cand-1');
    while (h.t - since < 1200) h.frame(); // the interval would expire mid-closure
    const before = h.history.length;
    const seen = new Set<string | null>();
    for (let i = 0; i < 14; i++) { h.frame({ blink: EYES_CLOSED }); seen.add(h.highlight()); }
    expect(h.t - since).toBeGreaterThan(INTERVAL); // past the dwell, yet frozen
    expect([...seen]).toEqual(['cand-1']);
    expect(h.history.length, 'no highlight change while closed').toBe(before);
    expect(vi.getTimerCount(), 'scan timer cleared while held').toBe(0);
    for (let i = 0; i < 10 && h.activations.length === 0; i++) h.frame();
    expect(h.activations.map((a) => [a.targetId, a.source])).toEqual([['cand-1', 'blink']]);
    expect(h.surface()).toBe('review');
    expect(h.state.review?.snapshot.exactText).toBe(SPREAD_CANDIDATES[1].text);
    expect(h.highlight()).toBe('rv-cancel');
    expect(h.speaks()).toHaveLength(0);
  });

  it('300 ms rule (auto-scan): a closure detected just after the timer moved credits the PREVIOUS target', () => {
    const h = new AutoScanHarness();
    toCandidates(h);
    const movedAt = h.waitFor('cand-1');
    h.closeEyes(900); // the very next frame is closed
    const onset = h.eventsAfter('closure-start', movedAt)[0];
    expect(onset.at - movedAt).toBeLessThan(ATTRIBUTION_TIMING.recentChangeMs);
    expect(h.freezeAt(onset.at)?.result).toEqual({ applied: true, targetId: 'cand-0' });
    expect(h.attributions.at(-1)?.result).toMatchObject({ ok: true, targetId: 'cand-0', credited: 'previous' });
    expect(h.highlight(), 'pinned back on the credited target while closed').toBe('cand-0');
    for (let i = 0; i < 10 && h.activations.length === 0; i++) h.frame();
    expect(h.activations.map((a) => a.targetId)).toEqual(['cand-0']);
    expect(h.state.review?.snapshot.exactText).toBe(SPREAD_CANDIDATES[0].text);

    // A closure starting >= 300 ms into a dwell credits the CURRENT target.
    const h2 = new AutoScanHarness();
    toCandidates(h2);
    h2.selectOn('cand-1', { dwellMs: ATTRIBUTION_TIMING.recentChangeMs + FRAME_MS });
    expect(h2.attributions.at(-1)?.result).toMatchObject({ ok: true, targetId: 'cand-1', credited: 'current' });
    expect(h2.activations.map((a) => a.targetId)).toEqual(['cand-1']);
  });

  it('guarded Speak: a closure < 300 ms after Speak appears is never credited to Speak (goes to the previous, Cancel)', () => {
    const h = new AutoScanHarness();
    toCandidates(h);
    h.selectOn('cand-1');
    expect(h.surface()).toBe('review');
    const speakAt = h.waitFor('rv-speak');
    h.closeEyes(900);
    const onset = h.eventsAfter('closure-start', speakAt)[0];
    expect(onset.at - speakAt).toBeLessThan(ATTRIBUTION_TIMING.armedDwellMs);
    for (let i = 0; i < 10 && h.activations.length === 1; i++) h.frame();
    expect(h.activations.map((a) => a.targetId)).toEqual(['cand-1', 'rv-cancel']);
    expect(h.speaks()).toHaveLength(0);
    expect(h.surface()).not.toBe('speaking');
  });

  it('guarded Speak needs >= 300 ms dwell: with an out-of-range 250 ms interval (UI minimum is 700) Speak is never armed', () => {
    // Synthetic config: the only way the timer can move off Speak before 300 ms have passed.
    const h = new AutoScanHarness({ scanIntervalMs: 250 });
    toCandidates(h);
    h.selectOn('cand-0'); // inside the 2 s reading pause
    expect(h.surface()).toBe('review');
    const changeAt = h.waitFor('rv-change'); // Speak was highlighted for exactly 250 ms
    h.closeEyes(900);
    const onset = h.eventsAfter('closure-start', changeAt)[0];
    expect(onset.at - changeAt).toBeLessThan(ATTRIBUTION_TIMING.recentChangeMs);
    expect(h.attributions.at(-1)).toEqual({ at: onset.at, result: { ok: false, reason: 'not-armed' } });
    expect(h.freezeAt(onset.at)?.result.applied).toBe(false);
    h.idle(1000);
    expect(h.eventsAfter('select', onset.at), 'the gesture itself completed').toHaveLength(1);
    expect(h.activations).toHaveLength(1);
    expect(h.speaks()).toHaveLength(0);
    expect(h.surface()).toBe('review');
  });

  it('natural 200 ms blinks never select, on the board or with Speak highlighted', () => {
    const h = new AutoScanHarness();
    toCandidates(h);
    for (let i = 0; i < 6; i++) { h.closeEyes(200); h.idle(400); }
    expect(h.activations).toHaveLength(0);

    h.selectOn('cand-2');
    const speakAt = h.waitFor('rv-speak');
    while (h.t - speakAt < 350) h.frame();
    for (let i = 0; i < 2; i++) { h.closeEyes(200); h.idle(400); } // >= 150 ms re-arm with eyes open
    expect(h.activations).toHaveLength(1);
    expect(h.speaks()).toHaveLength(0);
    const discards = h.gestureEvents.filter((e) => e.type === 'discard');
    expect(discards).toHaveLength(8);
    expect(discards.every((e) => e.type === 'discard' && e.reason === 'too-short')).toBe(true);
    expect(h.eventsAfter('select', 0)).toHaveLength(1);
  });

  it('a hold keeps the remaining dwell: a natural blink delays the next step by exactly its held time (no restart)', () => {
    const h = new AutoScanHarness();
    const opened = toCandidates(h);
    while (h.t - opened < 800) h.frame();
    h.closeEyes(200);
    h.idle(200);
    const onset = h.eventsAfter('closure-start', opened)[0];
    const discard = h.eventsAfter('discard', onset.at)[0];
    expect(discard).toMatchObject({ reason: 'too-short' });
    expect(h.freezeAt(onset.at)?.result).toEqual({ applied: true, targetId: 'cand-0' });
    const heldMs = discard.at - onset.at;
    expect(READING - (onset.at - opened)).toBeGreaterThan(MIN_RESUME_MS);
    expect(h.waitFor('cand-1')).toBe(opened + READING + heldMs);
  });

  it('natural blinking at 30/min (every 2 s) keeps the scan moving', () => {
    const h = new AutoScanHarness();
    const opened = toCandidates(h);
    while (h.t - opened < 15000 && h.highlight() !== 'none') { h.closeEyes(200); h.idle(1800); }
    expect(h.highlight()).toBe('none');
    expect(h.activations).toHaveLength(0);
    expect(h.gestureEvents.filter((e) => e.type === 'discard').length).toBeGreaterThan(2);
  });

  // KNOWN BUG (kept failing on purpose). In auto-scan, a closure detected < 300 ms after a timer
  // step is credited to the PREVIOUS target (src/access/scan-controller.ts:275-283, onRecentChange
  // 'previous'), and the freeze pins the scan there (src/runtime/useStillHere.ts:300,
  // scanRef.current.update({ ...cfg, held: true, pin })). When that closure is then discarded as a
  // natural blink, nothing restores the step: the released scan keeps the pinned index
  // (src/access/scan-controller.ts:107-110) and spends the rest of the dwell on the previous
  // target. So a natural blink just after a step UNDOES the step.
  it.fails('BUG: a discarded natural blink right after a timer step does not undo the step', () => {
    const h = new AutoScanHarness();
    toCandidates(h);
    const movedAt = h.waitFor('cand-1');
    h.closeEyes(200);
    h.idle(200);
    const onset = h.eventsAfter('closure-start', movedAt)[0];
    expect(onset.at - movedAt).toBeLessThan(ATTRIBUTION_TIMING.recentChangeMs);
    expect(h.eventsAfter('discard', onset.at)[0]).toMatchObject({ reason: 'too-short' });
    expect(h.activations).toHaveLength(0);
    expect(h.highlight(), 'after a discarded natural blink the scan should be back where it was').toBe('cand-1');
  });

  // KNOWN BUG, same root cause as above. With frequent natural blinks (here every ~600 ms) nearly
  // every timer step lands < 300 ms before the next closure onset and is undone, so the scan
  // never gets past cand-1 in 12 s (observed: cand-1 → cand-0 bounce every ~3 s).
  it.fails('BUG: frequent natural blinking (every 600 ms) does not stall scanning', () => {
    const h = new AutoScanHarness();
    const opened = toCandidates(h);
    while (h.t - opened < 12000 && h.highlight() !== 'none') { h.closeEyes(200); h.idle(400); }
    expect(h.activations).toHaveLength(0);
    expect(h.highlight()).toBe('none');
  });

  it('face lost mid-closure: no select, SAFETY_PAUSE, and Resume needs a new blink after reacquisition', () => {
    const h = new AutoScanHarness();
    toCandidates(h);
    h.closeEyes(400);
    expect(h.blink.snapshot().status).toBe('closing');
    h.frames(800, { faces: 0, blink: null, brow: null });
    expect(h.gestureEvents.some((e) => e.type === 'discard' && e.reason === 'face-lost')).toBe(true);
    expect(h.gestureEvents.some((e) => e.type === 'face-lost')).toBe(true);
    expect(h.activations).toHaveLength(0);
    expect(h.surface()).toBe('paused');
    expect(h.highlight()).toBe('pa-resume');

    // Face returns with the eyes still closed, then they open: that closure never counts.
    h.frames(1500, { blink: EYES_CLOSED });
    h.idle(1000);
    expect(h.gestureEvents.some((e) => e.type === 'face-found')).toBe(true);
    expect(h.activations).toHaveLength(0);
    expect(h.surface()).toBe('paused');
    expect(h.highlight()).toBe('pa-resume');

    // A new deliberate long blink resumes; the board reopens with its reading pause.
    h.selectOn('pa-resume');
    expect(h.activations.map((a) => a.targetId)).toEqual(['pa-resume']);
    expect(h.surface()).toBe('board');
    expect(h.highlight()).toBe('cand-0');
    const reopened = h.highlightedSince();
    expect(h.waitFor('cand-1')).toBe(reopened + READING);
    expect(h.speaks()).toHaveLength(0);
  });

  it('no stable face at start: the scanner holds on the safe first target until the 5 s acquisition hold releases', () => {
    const h = new AutoScanHarness();
    h.frames(7500, { faces: 0, blink: null, brow: null });
    const log = h.historySince(T0);
    expect(log.map((e) => [e.id, e.at])).toEqual([['start', T0], ['quick', T0 + ACQUIRE_HOLD_MAX_MS + READING]]);
    expect(h.activations).toHaveLength(0);
  });

  it('full 2-turn conversation: candidate → review → wait for Speak → new blink → exactly one speak each, exact text', () => {
    const h = new AutoScanHarness();
    toCandidates(h);

    // Turn 1
    h.selectOn('cand-1');
    expect(h.surface()).toBe('review');
    expect(h.state.review?.snapshot.exactText).toBe(SPREAD_CANDIDATES[1].text);
    expect(h.highlight()).toBe('rv-cancel');
    const reviewOpened = h.highlightedSince();
    expect(h.speaks()).toHaveLength(0);
    expect(h.waitFor('rv-speak')).toBe(reviewOpened + READING);
    expect(h.speaks()).toHaveLength(0);
    h.selectOn('rv-speak');
    let speaks = h.speaks();
    expect(speaks).toHaveLength(1);
    expect(speaks[0].utterance.exactText).toBe(SPREAD_CANDIDATES[1].text);
    expect(speaks[0].utterance.confirmationCycleId).not.toBe(speaks[0].utterance.selectionCycleId);
    expect(h.surface()).toBe('speaking');
    h.finishSpeech();
    h.idle(1500);
    expect(h.surface()).toBe('board');
    expect(h.speaks()).toHaveLength(1);

    // Turn 2
    h.partner('What should we have for dinner?');
    expect(h.generates()).toHaveLength(2);
    h.idle(300);
    h.resolve(ALT_CANDIDATES);
    expect(h.highlight()).toBe('cand-0');
    expect(h.targetLabel('cand-2')).toBe(ALT_CANDIDATES[2].text);
    h.selectOn('cand-2');
    expect(h.state.review?.snapshot.exactText).toBe(ALT_CANDIDATES[2].text);
    h.selectOn('rv-speak');
    speaks = h.speaks();
    expect(speaks.map((e) => e.utterance.exactText)).toEqual([SPREAD_CANDIDATES[1].text, ALT_CANDIDATES[2].text]);
    h.finishSpeech();
    h.idle(1500);
    expect(h.surface()).toBe('board');

    expect(h.activations.map((a) => a.targetId)).toEqual(['cand-1', 'rv-speak', 'cand-2', 'rv-speak']);
    expect(h.activations.every((a) => a.source === 'blink')).toBe(true);
    expect(h.accepted('SELECT')).toBe(4);
    expect(h.accepted('NAV_NEXT')).toBe(0);
    expect(h.state.conversation.filter((c) => c.role === 'user')).toHaveLength(2);
    expect(h.state.conversation.filter((c) => c.role === 'partner')).toHaveLength(2);
    expect(h.speaks()).toHaveLength(2);
  });

  it('Quick phrases → first phrase → review → speak', () => {
    const h = new AutoScanHarness();
    h.idle(1000);
    expect(h.highlight()).toBe('start');
    h.selectOn('quick');
    expect(h.surface()).toBe('quick');
    expect(h.highlight()).toBe('qp-qp-something-to-say');
    h.selectOn('qp-qp-something-to-say');
    expect(h.surface()).toBe('review');
    expect(h.highlight()).toBe('rv-cancel');
    expect(h.state.review?.snapshot.exactText).toBe('I have something to say.');
    expect(h.speaks()).toHaveLength(0);
    h.selectOn('rv-speak');
    expect(h.speaks().map((e) => e.utterance.exactText)).toEqual(['I have something to say.']);
    expect(h.activations.map((a) => a.targetId)).toEqual(['quick', 'qp-qp-something-to-say', 'rv-speak']);
    expect(h.activations.every((a) => a.source === 'blink')).toBe(true);
  });

  it('None of these via auto-scan regenerates (rejected batch sent with the new request)', () => {
    const h = new AutoScanHarness();
    toCandidates(h);
    h.selectOn('none');
    expect(h.activations.map((a) => a.targetId)).toEqual(['none']);
    const gens = h.generates();
    expect(gens).toHaveLength(2);
    expect(gens[1].request.rejected.flatMap((r) => r.candidates.map((c) => c.text))).toEqual(SPREAD_CANDIDATES.map((c) => c.text));
    h.resolve(ALT_CANDIDATES);
    expect(h.highlight()).toBe('cand-0');
    expect(h.targetLabel('cand-0')).toBe(ALT_CANDIDATES[0].text);
    expect(h.speaks()).toHaveLength(0);
  });
});
