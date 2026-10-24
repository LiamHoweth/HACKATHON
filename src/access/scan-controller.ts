// Single-switch scanning schedule. Exactly ONE timer. Highlight is separate from DOM focus.
// Chained setTimeout (never setInterval) so missed ticks are never replayed.

export type ScanConfig = {
  active: boolean; // switch mode && phase === 'active'
  ids: string[]; // enabled target ids, in registry order (safe start target first)
  surfaceRevision: number;
  intervalMs: number;
  readingPauseMs: number;
  held: boolean; // switch held: freeze
  hidden: boolean; // document.hidden: pause
};

type Clock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
};

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
  /** Diagnostic count of ticks that fired more than 3x late (each advanced only one step). */
  lateTicks = 0;

  constructor(private onChange: (highlightedId: string | null) => void, private clock: Clock = defaultClock) {}

  get current(): string | null {
    return this.highlighted;
  }

  update(next: ScanConfig): void {
    const prev = this.cfg;
    this.cfg = next;
    if (!next.active || next.ids.length === 0) {
      this.clear();
      if (!next.active) this.cfg = null; // re-activation resets like a new surface
      this.set(null);
      return;
    }
    const surfaceChanged = !prev || prev.surfaceRevision !== next.surfaceRevision || !prev.active;
    if (surfaceChanged) {
      // New surface: cancel schedule, safe start target, reading pause before the first advance.
      this.clear();
      this.index = 0;
      this.set(next.ids[0]);
      this.schedule(next.readingPauseMs);
      return;
    }
    // Same surface: keep the highlighted target if it still exists, else clamp.
    const keep = this.highlighted ? next.ids.indexOf(this.highlighted) : -1;
    this.index = keep >= 0 ? keep : Math.min(this.index, next.ids.length - 1);
    this.set(next.ids[this.index]);

    if (next.held || next.hidden) {
      this.clear();
      return;
    }
    const resumed = (prev.held && !next.held) || (prev.hidden && !next.hidden);
    const intervalChanged = prev.intervalMs !== next.intervalMs;
    if (resumed || intervalChanged || this.timer === null) {
      // Fresh full interval; selects nothing.
      this.clear();
      this.schedule(next.intervalMs);
    }
  }

  dispose(): void {
    this.clear();
    this.cfg = null;
    this.highlighted = null;
  }

  private schedule(ms: number) {
    const cfg = this.cfg;
    if (!cfg || cfg.held || cfg.hidden) return;
    this.dueDelay = ms;
    this.due = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => this.tick(), ms);
  }

  private tick() {
    this.timer = null;
    const cfg = this.cfg;
    if (!cfg || !cfg.active || cfg.held || cfg.hidden || cfg.ids.length === 0) return;
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

  private set(id: string | null) {
    if (id === this.highlighted) return;
    this.highlighted = id;
    this.onChange(id);
  }
}
