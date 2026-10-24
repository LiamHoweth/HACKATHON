// Single-switch scanning schedule. Exactly ONE timer. Highlight is separate from DOM focus.
// Chained setTimeout (never setInterval) so missed ticks are never replayed.
//
// Manual mode (eyebrow NEXT, 'brow-blink'): NO timer at all. The highlight starts on the
// surface's first (safe) target and moves exactly one step, wrapping, per accepted NAV_NEXT via
// next(). The same onChange/highlight log feeds blink-closure attribution in both modes.

export type ScanConfig = {
  active: boolean; // scanning mode (switch or blink) && phase === 'active'
  ids: string[]; // enabled target ids, in registry order (safe start target first)
  surfaceRevision: number;
  intervalMs: number;
  readingPauseMs: number;
  held: boolean; // switch held or blink closure in progress: freeze
  /** While held, keep the highlight on this target (the blink closure-onset snapshot). */
  pin?: string | null;
  hidden: boolean; // document.hidden: pause
  /** Manual stepping (eyebrow NEXT): never auto-advance; only next() moves the highlight. */
  manual?: boolean;
};

/** One manual step: next index, wrapping. -1 (no targets) stays -1. */
export function stepIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  if (!Number.isInteger(index) || index < 0 || index >= length) return 0;
  return (index + 1) % length;
}

type Clock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
};

/** Shortest delay before the next advance after a hold (blink closure / switch) is released. */
export const MIN_RESUME_MS = 200;

const defaultClock: Clock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class ScanController {
  private timer: unknown = null;
  private due = 0;
  private dueDelay = 0;
  private cfg: ScanConfig | null = null;
  private index = 0;
  private highlighted: string | null = null;
  /** Time left on the advance timer when it was frozen by a hold (or the delay a hold deferred). */
  private remaining: number | null = null;
  /** Diagnostic count of ticks that fired more than 3x late (each advanced only one step). */
  lateTicks = 0;

  /**
   * onChange receives the highlighted id and the surface revision of the config that produced it
   * (null when scanning is inactive). It also fires on a surface change that keeps the same id.
   * `at` is the gesture's own (camera-frame) time for a manual step made by next(at); otherwise
   * undefined and the listener stamps the change with its own clock.
   */
  constructor(
    private onChange: (highlightedId: string | null, surfaceRevision: number | null, at?: number) => void,
    private clock: Clock = defaultClock,
  ) {}

  get current(): string | null {
    return this.highlighted;
  }

  /** Surface revision of the active scan config, or null when not scanning. */
  get surfaceRevision(): number | null {
    return this.cfg ? this.cfg.surfaceRevision : null;
  }

  update(next: ScanConfig): void {
    const prev = this.cfg;
    this.cfg = next;
    if (!next.active || next.ids.length === 0) {
      this.clear();
      this.remaining = null;
      if (!next.active) this.cfg = null; // re-activation resets like a new surface
      this.set(null);
      return;
    }
    const surfaceChanged = !prev || prev.surfaceRevision !== next.surfaceRevision || !prev.active || !!prev.manual !== !!next.manual;
    if (next.manual) {
      // Manual: never schedule. New surface → safe first target; same surface → keep or clamp.
      this.clear();
      this.remaining = null;
      if (surfaceChanged) {
        this.index = 0;
        this.set(next.ids[0], true);
        return;
      }
      const pinnedM = next.held && next.pin ? next.ids.indexOf(next.pin) : -1;
      const keepM = pinnedM >= 0 ? pinnedM : this.highlighted ? next.ids.indexOf(this.highlighted) : -1;
      this.index = keepM >= 0 ? keepM : Math.min(this.index, next.ids.length - 1);
      this.set(next.ids[this.index]);
      return;
    }
    if (surfaceChanged) {
      // New surface: cancel schedule, safe start target, reading pause before the first advance.
      this.clear();
      this.remaining = null;
      this.index = 0;
      this.set(next.ids[0], true); // always log the new revision, even for the same first id
      this.schedule(next.readingPauseMs);
      return;
    }
    // Same surface: keep the pinned (held) or highlighted target if it still exists, else clamp.
    const pinned = next.held && next.pin ? next.ids.indexOf(next.pin) : -1;
    const keep = pinned >= 0 ? pinned : this.highlighted ? next.ids.indexOf(this.highlighted) : -1;
    this.index = keep >= 0 ? keep : Math.min(this.index, next.ids.length - 1);
    this.set(next.ids[this.index]);

    if (next.held || next.hidden) {
      // Freeze, remembering how much of the current dwell was left.
      if (this.timer !== null) this.remaining = Math.max(0, this.due - this.clock.now());
      this.clear();
      return;
    }
    const unhidden = prev.hidden && !next.hidden;
    const released = prev.held && !next.held;
    const intervalChanged = prev.intervalMs !== next.intervalMs;
    if (unhidden || intervalChanged) {
      // Back from a hidden tab or a new speed: fresh full interval; selects nothing.
      this.clear();
      this.remaining = null;
      this.schedule(next.intervalMs);
    } else if (released || this.timer === null) {
      // A hold (blink closure, switch press) only pauses the dwell: resume with what was left,
      // so frequent natural blinks do not keep restarting the interval.
      const ms = this.remaining === null ? next.intervalMs : Math.max(this.remaining, MIN_RESUME_MS);
      this.clear();
      this.remaining = null;
      this.schedule(ms);
    }
  }

  /**
   * Manual mode only: move the highlight exactly one step (wrapping). Refused (returns null)
   * when not in manual mode, inactive, held (blink closure / switch press) or hidden.
   * `at` is the time of the gesture that caused the step (the eyebrow NEXT frame time), so the
   * highlight log is on the same clock as blink-closure onsets.
   */
  next(at?: number): string | null {
    const cfg = this.cfg;
    if (!cfg || !cfg.active || !cfg.manual || cfg.held || cfg.hidden || cfg.ids.length === 0) return null;
    const cur = this.highlighted ? cfg.ids.indexOf(this.highlighted) : -1;
    this.index = stepIndex(cur >= 0 ? cur : this.index, cfg.ids.length);
    this.set(cfg.ids[this.index], false, at); // a one-target surface logs nothing new (same id)
    return cfg.ids[this.index];
  }

  dispose(): void {
    this.clear();
    this.cfg = null;
    this.highlighted = null;
    this.remaining = null;
  }

  private schedule(ms: number) {
    const cfg = this.cfg;
    if (cfg?.manual) return;
    if (!cfg || cfg.held || cfg.hidden) {
      if (cfg) this.remaining = ms; // deferred (e.g. the reading pause of a surface opened while held)
      return;
    }
    this.dueDelay = ms;
    this.due = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => this.tick(), ms);
  }

  private tick() {
    this.timer = null;
    const cfg = this.cfg;
    if (!cfg || !cfg.active || cfg.manual || cfg.held || cfg.hidden || cfg.ids.length === 0) return;
    // A very late tick (sleep, throttling: > 3x the expected delay) advances exactly one step and
    // restarts with a fresh full interval. Missed ticks are never replayed.
    this.lateTicks += this.clock.now() - this.due > 3 * this.dueDelay ? 1 : 0;
    this.index = (this.index + 1) % cfg.ids.length;
    this.set(cfg.ids[this.index]);
    this.schedule(cfg.intervalMs);
  }

  private clear() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private set(id: string | null, force = false, at?: number) {
    if (id === this.highlighted && !force) return;
    this.highlighted = id;
    this.onChange(id, this.cfg ? this.cfg.surfaceRevision : null, at);
  }
}

// ---------------------------------------------------------------------------
// Blink face-acquisition hold (pure). While blink is the input but no single face is tracked yet
// the scanner holds still; that hold is released after ACQUIRE_HOLD_MAX_MS or by any keyboard
// switch press, so the keyboard/switch fallback can always scan. Blink itself still cannot select
// without one stable face (the gesture machine only emits closures from 'ready').

export const ACQUIRE_HOLD_MAX_MS = 5000;

export type AcquireHold = { acquiring: boolean; released: boolean };

export type AcquireHoldEvent = { type: 'acquiring'; value: boolean } | { type: 'timeout' } | { type: 'switch-press' };

export function nextAcquireHold(h: AcquireHold, e: AcquireHoldEvent): AcquireHold {
  switch (e.type) {
    case 'acquiring':
      // Each acquisition episode starts held again; leaving it clears the release.
      return e.value === h.acquiring ? h : { acquiring: e.value, released: false };
    case 'timeout':
    case 'switch-press':
      return h.acquiring && !h.released ? { ...h, released: true } : h;
  }
}

export const acquireHoldActive = (h: AcquireHold): boolean => h.acquiring && !h.released;

// ---------------------------------------------------------------------------
// Blink closure → highlighted target attribution (pure).
// Gesture events are stamped when a frame is processed, and the closure score crosses the
// threshold some 100–250 ms after the eyelids actually start to close. So a closure detected just
// after the highlight moved most likely began on the PREVIOUS target, and a guarded target
// (requiresArming) must have been visibly highlighted long enough before it can be credited.

export type HighlightLogEntry = { id: string | null; at: number; rev: number | null };

/**
 * Appends a highlight change keeping the log ordered by time (a manual step is stamped with its
 * gesture's earlier frame time, so it may belong before entries logged at processing time).
 * Trims to the newest `max` entries.
 */
export function logHighlight(log: HighlightLogEntry[], entry: HighlightLogEntry, max = 16): void {
  let i = log.length;
  while (i > 0 && log[i - 1].at > entry.at) i--;
  log.splice(i, 0, entry);
  if (log.length > max) log.splice(0, log.length - max);
}

export const ATTRIBUTION_TIMING = {
  /** A highlight change this close before the detected onset is treated as "after the real onset". */
  recentChangeMs: 300,
  /** A requiresArming target must have been highlighted at least this long at closure onset. */
  armedDwellMs: 300,
} as const;

export type ClosureAttribution =
  | { ok: true; targetId: string; surfaceRevision: number; highlightedFor: number; credited: 'current' | 'previous' }
  | { ok: false; reason: 'no-target' | 'surface-changed' | 'not-armed' | 'ambiguous' };

export type AttributionOptions = {
  /**
   * What to do when the highlight moved within recentChangeMs before the detected onset.
   * 'previous' (auto-scan): credit the previous target (the timer moved it under the closure).
   * 'discard' (manual eyebrow stepping): the user deliberately moved it, so crediting either
   * target is a guess. Discard with reason 'ambiguous'. In this mode ANY same-surface highlight
   * change later than onsetAt − recentChangeMs (including one logged after the detected onset,
   * because the step was processed after the closure frame was captured) also discards.
   */
  onRecentChange: 'previous' | 'discard';
};

/**
 * Chooses the target a closure detected at `onsetAt` belongs to, from a highlight log ordered by
 * time. Returns ok:false (discard: no selection) when there is no target, when the surface
 * changed just before the onset, or when a requiresArming target had not been highlighted for
 * armedDwellMs at onset.
 */
export function attributeClosure(
  log: readonly HighlightLogEntry[],
  onsetAt: number,
  requiresArming: (targetId: string) => boolean,
  timing: { recentChangeMs: number; armedDwellMs: number } = ATTRIBUTION_TIMING,
  options: AttributionOptions = { onRecentChange: 'previous' },
): ClosureAttribution {
  let i = -1;
  for (let k = log.length - 1; k >= 0; k--) {
    if (log[k].at <= onsetAt) {
      i = k;
      break;
    }
  }
  if (i < 0) return { ok: false, reason: 'no-target' };
  const cur = log[i];
  if (cur.id === null || cur.rev === null) return { ok: false, reason: 'no-target' };
  if (options.onRecentChange === 'discard') {
    // Manual stepping: a same-surface move near or after the onset means the person may have seen
    // either target when they started closing. Never guess.
    const moved = log.some((e, k) => k !== i && e.rev === cur.rev && e.at > onsetAt - timing.recentChangeMs);
    if (moved) return { ok: false, reason: 'ambiguous' };
  }

  let pick = cur;
  let since = cur.at;
  let until = onsetAt;
  let credited: 'current' | 'previous' = 'current';
  if (onsetAt - cur.at < timing.recentChangeMs) {
    const prev = i > 0 ? log[i - 1] : null;
    if (prev && prev.rev === cur.rev && prev.id !== null && options.onRecentChange === 'discard') {
      return { ok: false, reason: 'ambiguous' };
    } else if (prev && prev.rev === cur.rev && prev.id !== null) {
      pick = prev;
      since = prev.at;
      until = cur.at; // the previous target stopped being highlighted when the highlight moved
      credited = 'previous';
    } else if (prev && prev.rev !== cur.rev) {
      // The surface itself changed just before the onset: the closure may have begun on the old
      // screen. Never credit either.
      return { ok: false, reason: 'surface-changed' };
    } else if (!prev && options.onRecentChange === 'discard') {
      return { ok: false, reason: 'ambiguous' }; // nothing earlier to compare with: never guess
    }
  }
  const highlightedFor = until - since;
  if (requiresArming(pick.id as string) && highlightedFor < timing.armedDwellMs) return { ok: false, reason: 'not-armed' };
  return { ok: true, targetId: pick.id as string, surfaceRevision: pick.rev as number, highlightedFor, credited };
}
