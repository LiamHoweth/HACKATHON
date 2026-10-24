// Hands-free pipeline integration test.
//
// SYNTHETIC FRAMES ONLY. This is NOT hardware verification: no camera, no MediaPipe, no browser.
// Every frame is a hand-written {faces, blinkScore, browScore} sample on a fake monotonic clock at
// ~15 fps. It proves that the real pure pieces compose correctly (plumbing and guards), not that a
// real face produces these scores. Generation results are labeled fixture output ('demo-fixture').
//
// Composed for real (no mocks): BlinkGesture, BrowGesture, GestureArbiter, ScanController (manual
// stepping + highlight log), attributeClosure, the reducer, and targetsFor. The glue between them
// is a small harness that mirrors, step for step:
//   - BlinkEngine.onFrame / routeBlink / routeBrow / apply / resetGestures (src/runtime/useBlink.ts):
//     score smoothing, blink first then brow, cancel-brow → brow.cancel, face-lost → handler.
//   - useStillHere's command handler, scan config, and surface reset (src/runtime/useStillHere.ts):
//     closure snapshot via attributeClosure ('discard' on recent change in manual mode), the
//     freeze/pin, the surfaceRevision check, ACTIVATE with source 'blink', NAV_NEXT → scan.next(),
//     and the gesture reset on every surfaceRevision/sessionEpoch/accessMode change.
// React batching is modeled by a `committed` state (stateRef) that only catches up with the
// reducer's latest state at the end of each frame ("render"), when the effects run.
import { describe, expect, it } from 'vitest';
import { BlinkGesture, DEFAULT_GESTURE_CONFIG, smoothScore } from '@/access/blink-gesture';
import { BrowGesture, DEFAULT_BROW_CALIBRATION, type BrowEvent } from '@/access/brow-gesture';
import { GestureArbiter, type ArbiterOutput } from '@/access/gesture-arbiter';
import { hasHighlight, isFaceMode, isManualNavMode } from '@/access/input-controller';
import {
  ATTRIBUTION_TIMING, attributeClosure, ScanController, type HighlightLogEntry, type ScanConfig,
} from '@/access/scan-controller';
import { newId, reducer } from '@/core/reducer';
import { targetsFor } from '@/core/targets';
import { currentSurface, initialState, type Action, type Effect, type State } from '@/core/state';
import type { BlinkGestureEvent, GestureCommand } from '@/runtime/contract';
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

type FaceCommandEvent =
  | { type: 'freeze'; at: number }
  | { type: 'unfreeze'; at: number }
  | { type: 'accept'; command: GestureCommand; at: number; cycleId: string }
  | { type: 'face-lost'; at: number };
type FaceCommandResult = { applied: boolean; targetId: string | null };
type SynthFrame = { faces?: number; blink?: number | null; brow?: number | null };

class HandsFreeHarness {
  t: number;
  private pending: State; // the reducer's latest state
  committed: State; // stateRef.current (what the handler reads)
  readonly blink = new BlinkGesture(DEFAULT_GESTURE_CONFIG);
  readonly brow = new BrowGesture(DEFAULT_BROW_CALIBRATION);
  readonly arbiter: GestureArbiter;
  readonly scan: ScanController;
  /** Manual stepping must never schedule a scan timer. */
  timersScheduled = 0;
  private highlighted: string | null = null;
  readonly highlightLog: HighlightLogEntry[] = [];
  private arming = new Map<string, boolean>();
  private blinkHeld = false;
  private blinkPin: string | null = null;
  private blinkSnap: { targetId: string; surfaceRevision: number; cycleId: string; at: number } | null = null;
  private lastScanCfg: ScanConfig | null = null;
  private heldSurfaceKey: string;
  private lastResetKey: string | null = null;
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

  constructor(t0 = 1000) {
    this.t = t0;
    this.pending = new Driver({ accessMode: 'brow-blink', aiMode: 'fixture' }, initialState(), 'e-handsfree', t0).s;
    this.committed = this.pending;
    this.collect();
    this.arbiter = new GestureArbiter({ newId, browEnabled: () => this.mode() === 'brow-blink' });
    this.scan = new ScanController(
      (id, rev) => {
        const log = this.highlightLog;
        log.push({ id, at: this.t, rev });
        if (log.length > 16) log.splice(0, log.length - 16);
        this.highlighted = id;
      },
      { now: () => this.t, setTimeout: () => { this.timersScheduled += 1; return 1; }, clearTimeout: () => {} },
    );
    this.heldSurfaceKey = this.surfaceKey(this.committed);
    this.render();
  }

  // ---------- observation ----------
  get state(): State { return this.committed; }
  surface(): string { return currentSurface(this.committed).kind; }
  highlight(): string | null { return this.scanning(this.committed) ? this.highlighted : null; }
  targetLabel(id: string): string | undefined { return targetsFor(this.committed).find((t) => t.id === id)?.label; }
  speaks(): SpeakEffect[] { return this.effects.filter((e): e is SpeakEffect => e.kind === 'speak'); }
  generates(): GenEffect[] { return this.effects.filter((e): e is GenEffect => e.kind === 'generate'); }
  accepted(command: GestureCommand): number {
    return this.commands.filter((c) => c.event.type === 'accept' && c.event.command === command && c.result.applied).length;
  }

  // ---------- non-gesture inputs (between frames) ----------
  /** Direct reducer dispatch (used only to replay/forge actions in guard checks). */
  dispatchRaw(a: Action) {
    this.dispatch(a);
    this.render();
  }

  partner(text: string) {
    this.t += 5;
    this.dispatch({ type: 'PARTNER_SUBMIT', text, source: 'partner-typed', at: this.t });
    this.render();
  }

  /** Installs a labeled FIXTURE result for the latest generate request. */
  resolve(candidates: FixtureCandidate[]) {
    const g = this.generates();
    expect(g.length, 'a generate effect is queued').toBeGreaterThan(0);
    this.t += 5;
    this.dispatch({ ...okResult(g[g.length - 1].request.identity, candidates), at: this.t });
    this.render();
  }

  editPartnerTurn(text: string) {
    const turn = this.committed.conversation.find((c) => c.role === 'partner');
    expect(turn).toBeDefined();
    this.t += 5;
    this.dispatch({ type: 'PARTNER_EDIT_TURN', turnId: turn!.value.id, text, at: this.t });
    this.render();
  }

  finishSpeech() {
    const id = this.committed.speech?.utterance.id;
    expect(id, 'an utterance is playing').toBeDefined();
    for (const kind of ['start', 'end'] as const) {
      this.t += 5;
      this.dispatch({ type: 'SPEECH_EVENT', utteranceId: id!, sessionEpoch: this.committed.sessionEpoch, kind, at: this.t });
      this.render();
    }
  }

  // ---------- synthetic camera frames ----------
  frames(ms: number, f: SynthFrame = {}) {
    const n = Math.max(1, Math.round(ms / FRAME_MS));
    for (let i = 0; i < n; i++) this.frame(f);
  }
  frame(f: SynthFrame = {}) {
    this.t += FRAME_MS;
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
  /** One deliberate long blink, then open eyes long enough to re-arm and read the new surface. */
  longBlink(ms = 900) { this.closeEyes(ms); this.idle(1000); }
  /** One accepted eyebrow NEXT (600 ms raise), then relax long enough to re-arm. */
  next(ms = 600) { this.raise(ms); this.idle(1000); }

  // ---------- mirror of BlinkEngine.onFrame (useBlink.ts) ----------
  private onFrame(raw: { t: number; faces: number; blinkScore: number | null; browScore: number | null }) {
    this.lastT = raw.t;
    const single = raw.faces === 1 && raw.blinkScore !== null;
    this.smoothed = single ? smoothScore(this.smoothed, raw.blinkScore as number) : null;
    const browSingle = raw.faces === 1 && raw.browScore !== null;
    this.browSmoothed = browSingle ? smoothScore(this.browSmoothed, raw.browScore as number, BROW_SMOOTHING_ALPHA) : null;
    // Blink first: a closure starting on this frame pre-empts a brow NEXT on the same frame.
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

  /** Commit pending state and run the effects useStillHere runs after a render, until stable. */
  private render() {
    for (let pass = 0; pass < 5; pass++) {
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
      const cfg: ScanConfig = {
        active: scanning,
        ids: targets.filter((t) => t.enabled).map((t) => t.id),
        surfaceRevision: s.surfaceRevision,
        intervalMs: s.settings.scanIntervalMs,
        readingPauseMs: s.settings.readingPauseMs,
        held: scanning && this.blinkHeld,
        pin: this.blinkHeld ? this.blinkPin : null,
        hidden: false,
        manual: isManualNavMode(s.settings.accessMode) && s.phase === 'active',
      };
      this.lastScanCfg = cfg;
      this.scan.update(cfg);
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

/** Face acquired, partner question asked, fixture result installed, highlight on cand-0. */
function toCandidates(h: HandsFreeHarness, candidates: FixtureCandidate[] = SPREAD_CANDIDATES) {
  h.idle(1000);
  expect(h.blink.snapshot().status).toBe('ready');
  h.partner(QUESTION);
  expect(h.generates()).toHaveLength(1);
  h.idle(300);
  h.resolve(candidates);
  const ws = h.state.activeWorkspaceId ? h.state.workspaces[h.state.activeWorkspaceId] : null;
  expect(ws?.batch?.source, 'result is labeled fixture output').toBe('demo-fixture');
  h.idle(500);
  expect(h.surface()).toBe('board');
  expect(h.highlight()).toBe('cand-0');
}

describe('hands-free pipeline (SYNTHETIC frames, NOT hardware verification)', () => {
  it.each([600, 2000])('GEST-08 acceptance: %i ms brow raise steps once, long blink selects, fresh long blink confirms, exactly one speak', (holdMs) => {
    const h = new HandsFreeHarness();
    toCandidates(h);

    // Brow raise moves cand-0 → cand-1 exactly once, even when held for 2 s.
    h.raise(holdMs);
    h.idle(1000);
    expect(h.accepted('NAV_NEXT')).toBe(1);
    expect(h.highlight()).toBe('cand-1');
    expect(h.activations).toHaveLength(0);

    // Long blink (900 ms) selects cand-1; review opens with Cancel highlighted, nothing spoken.
    h.longBlink(900);
    expect(h.activations).toHaveLength(1);
    expect(h.activations[0]).toMatchObject({ targetId: 'cand-1', source: 'blink' });
    expect(h.surface()).toBe('review');
    expect(h.state.review?.snapshot.exactText).toBe(SPREAD_CANDIDATES[1].text);
    expect(h.highlight()).toBe('rv-cancel');
    expect(h.speaks()).toHaveLength(0);

    // Brow raise moves to Speak; wait past arming; a NEW long blink confirms.
    h.next();
    expect(h.highlight()).toBe('rv-speak');
    expect(h.speaks()).toHaveLength(0);
    h.longBlink(900);
    expect(h.activations).toHaveLength(2);
    expect(h.activations[1]).toMatchObject({ targetId: 'rv-speak', source: 'blink' });
    const speaks = h.speaks();
    expect(speaks).toHaveLength(1);
    expect(speaks[0].utterance.exactText).toBe(SPREAD_CANDIDATES[1].text);
    expect(speaks[0].utterance.confirmationCycleId).not.toBe(speaks[0].utterance.selectionCycleId);
    expect(h.surface()).toBe('speaking');
    expect(h.accepted('SELECT')).toBe(2);
    expect(h.timersScheduled, 'manual stepping never schedules a scan timer').toBe(0);

    // Playback ends: back on the board, still exactly one speak.
    h.finishSpeech();
    h.idle(1500);
    expect(h.surface()).toBe('board');
    expect(h.speaks()).toHaveLength(1);
  });

  it('a 300 ms brow twitch never moves the highlight', () => {
    const h = new HandsFreeHarness();
    toCandidates(h);
    h.raise(300);
    h.idle(1000);
    expect(h.accepted('NAV_NEXT')).toBe(0);
    expect(h.highlight()).toBe('cand-0');
    expect(h.gestureEvents.some((e) => e.type === 'brow-cancel' && e.reason === 'too-short')).toBe(true);
  });

  it('None of these via gestures regenerates (rejected batch sent with the new request)', () => {
    const h = new HandsFreeHarness();
    toCandidates(h);
    h.next(); h.next(); h.next();
    expect(h.highlight()).toBe('none');
    h.longBlink();
    expect(h.activations.map((a) => a.targetId)).toEqual(['none']);
    const gens = h.generates();
    expect(gens).toHaveLength(2);
    expect(gens[1].request.rejected.flatMap((r) => r.candidates.map((c) => c.text))).toEqual(SPREAD_CANDIDATES.map((c) => c.text));
    h.resolve(ALT_CANDIDATES);
    h.idle(500);
    expect(h.highlight()).toBe('cand-0');
    expect(h.targetLabel('cand-0')).toBe(ALT_CANDIDATES[0].text);
    expect(h.speaks()).toHaveLength(0);
  });

  it('Quick phrases → first phrase → review → speak', () => {
    const h = new HandsFreeHarness();
    h.idle(1000);
    expect(h.highlight()).toBe('start');
    h.next();
    expect(h.highlight()).toBe('quick');
    h.longBlink();
    expect(h.surface()).toBe('quick');
    expect(h.highlight()).toBe('qp-qp-something-to-say');
    h.longBlink();
    expect(h.surface()).toBe('review');
    expect(h.highlight()).toBe('rv-cancel');
    expect(h.state.review?.snapshot.exactText).toBe('I have something to say.');
    expect(h.speaks()).toHaveLength(0);
    h.next();
    expect(h.highlight()).toBe('rv-speak');
    h.longBlink();
    expect(h.speaks().map((e) => e.utterance.exactText)).toEqual(['I have something to say.']);
    expect(h.activations.every((a) => a.source === 'blink')).toBe(true);
  });

  it('My words: composes one letter through key groups, then reviews and speaks it', () => {
    const h = new HandsFreeHarness();
    h.idle(1000);
    h.next(); h.next();
    expect(h.highlight()).toBe('my-words');
    h.longBlink();
    expect(h.surface()).toBe('compose');
    expect(h.highlight()).toBe('c-space'); // c-done is disabled while the draft is empty
    h.next(); h.next();
    expect(h.highlight()).toBe('grp-1'); // G H I J K L
    h.longBlink();
    expect(h.highlight()).toBe('key-G');
    h.next();
    expect(h.highlight()).toBe('key-H');
    h.longBlink();
    expect(h.state.drafts.message).toBe('H');
    expect(h.highlight()).toBe('c-done'); // back on the groups page, Review now enabled first
    h.longBlink();
    expect(h.surface()).toBe('review');
    expect(h.state.review?.snapshot.exactText).toBe('H');
    h.next();
    h.longBlink();
    expect(h.speaks().map((e) => e.utterance.exactText)).toEqual(['H']);
  });

  it('natural 200 ms blinks never select, even with Speak highlighted on review', () => {
    const h = new HandsFreeHarness();
    toCandidates(h);
    for (let i = 0; i < 8; i++) { h.closeEyes(200); h.idle(600); }
    expect(h.activations).toHaveLength(0);
    expect(h.highlight()).toBe('cand-0');

    h.longBlink();
    h.next();
    expect(h.highlight()).toBe('rv-speak');
    for (let i = 0; i < 8; i++) { h.closeEyes(200); h.idle(600); }
    expect(h.activations).toHaveLength(1);
    expect(h.speaks()).toHaveLength(0);
    const discards = h.gestureEvents.filter((e) => e.type === 'discard' && e.reason === 'too-short');
    expect(discards).toHaveLength(16);
  });

  it('a closure starting within 300 ms after an accepted NEXT is discarded (manual mode), never credited to either target', () => {
    const h = new HandsFreeHarness();
    toCandidates(h);
    // Raise until the NEXT is accepted, then start closing the eyes on the very next frame.
    for (let i = 0; i < 30 && h.accepted('NAV_NEXT') === 0; i++) h.frame({ brow: BROW_UP });
    expect(h.highlight()).toBe('cand-1');
    const nextAt = h.t;
    h.frames(900, { blink: EYES_CLOSED, brow: BROW_UP });
    h.idle(1000);
    const onset = h.gestureEvents.find((e) => e.type === 'closure-start' && e.at > nextAt)!;
    expect(onset.at - nextAt).toBeLessThan(ATTRIBUTION_TIMING.recentChangeMs);
    const freeze = h.commands.find((c) => c.event.type === 'freeze' && c.event.at === onset.at)!;
    expect(freeze.result.applied).toBe(false);
    // The arbiter still accepted SELECT for this closure, but the handler had no snapshot.
    expect(h.commands.filter((c) => c.event.type === 'accept' && c.event.command === 'SELECT')).toHaveLength(1);
    expect(h.accepted('SELECT')).toBe(0);
    expect(h.activations).toHaveLength(0);
    expect(h.surface()).toBe('board');
    expect(h.highlight()).toBe('cand-1');

    // After a settled dwell, a fresh long blink selects the target the user actually moved to.
    h.longBlink();
    expect(h.activations.map((a) => a.targetId)).toEqual(['cand-1']);
  });

  it('face lost mid-closure: no select, SAFETY_PAUSE, and Resume needs a new blink after reacquisition', () => {
    const h = new HandsFreeHarness();
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

    // A new deliberate long blink resumes.
    h.longBlink();
    expect(h.activations.map((a) => a.targetId)).toEqual(['pa-resume']);
    expect(h.surface()).toBe('board');
    expect(h.speaks()).toHaveLength(0);
  });

  it('one blink cannot select on the board AND confirm on review', () => {
    const h = new HandsFreeHarness();
    toCandidates(h);
    h.closeEyes(900);
    for (let i = 0; i < 10 && h.activations.length === 0; i++) h.frame(); // open until the select lands
    expect(h.activations.map((a) => a.targetId)).toEqual(['cand-0']);
    const selection = h.activations[0];
    const closuresBefore = h.gestureEvents.filter((e) => e.type === 'closure-start').length;

    // Eyes bounce shut again right away (inside the select cooldown) and stay shut while the
    // brows move the highlight to Speak; then they open. That closure never began a cycle.
    h.frames(200, { blink: EYES_CLOSED });
    h.frames(700, { blink: EYES_CLOSED, brow: BROW_UP });
    h.frames(700, { blink: EYES_CLOSED });
    h.idle(1000);
    expect(h.highlight()).toBe('rv-speak');
    expect(h.gestureEvents.filter((e) => e.type === 'closure-start').length).toBe(closuresBefore);
    expect(h.activations).toHaveLength(1);
    expect(h.speaks()).toHaveLength(0);

    // Reducer backstop: replaying the selection's physical cycle against Speak is refused.
    h.dispatchRaw({ ...selection, targetId: 'rv-speak', eventId: newId(), surfaceRevision: h.state.surfaceRevision, at: h.t });
    expect(h.speaks()).toHaveLength(0);

    // A fresh deliberate blink confirms exactly once.
    h.longBlink();
    expect(h.speaks().map((e) => e.utterance.exactText)).toEqual([SPREAD_CANDIDATES[0].text]);
  });

  it('surface change mid-gesture: an in-progress raise or closure never carries over', () => {
    const h = new HandsFreeHarness();
    h.idle(1000);
    h.partner(QUESTION);
    h.idle(500);
    // Raise begins while suggestions are loading; the fixture result installs mid-raise.
    h.raise(300);
    expect(h.brow.status).toBe('rising');
    h.resolve(SPREAD_CANDIDATES);
    h.raise(900);
    h.idle(1000);
    expect(h.accepted('NAV_NEXT')).toBe(0);
    expect(h.highlight()).toBe('cand-0');

    // Closure begins on cand-0; the partner edits their turn (new surface revision) mid-closure.
    h.closeEyes(400);
    expect(h.blink.snapshot().status).toBe('closing');
    h.editPartnerTurn('Do you want to go for a run later?');
    h.closeEyes(500);
    h.idle(1000);
    expect(h.gestureEvents.some((e) => e.type === 'discard' && e.reason === 'stale')).toBe(true);
    expect(h.activations).toHaveLength(0);
    expect(h.speaks()).toHaveLength(0);
  });
});
