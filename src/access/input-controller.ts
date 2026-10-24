// Global keyboard handling (capture phase). In switch mode, Space/Enter is a press/release
// switch: snapshot at press, ignore repeats, commit once on release, then cool down.
import type { AccessMode } from '@/core/types';
import { SCAN_DEFAULTS } from '@/core/limits';

export type SwitchSnapshot = { targetId: string | null; surfaceRevision: number; cycleId: string };

export type InputDeps = {
  getMode: () => AccessMode;
  getHighlighted: () => string | null;
  getSurfaceRevision: () => number;
  newId: () => string;
  /** One activation per press/release cycle. */
  onSwitchActivate: (snap: { targetId: string; surfaceRevision: number; cycleId: string }) => void;
  onHeldChange: (held: boolean) => void;
  onSafetyPause: () => void;
  now?: () => number;
  cooldownMs?: number;
};

const SWITCH_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);

function switchKey(e: KeyboardEvent): string | null {
  if (SWITCH_KEYS.has(e.code)) return e.code === 'NumpadEnter' ? 'Enter' : e.code;
  if (e.key === ' ' || e.key === 'Spacebar') return 'Space';
  if (e.key === 'Enter') return 'Enter';
  return null;
}

export function isEditable(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  // The partner panel and pointer safety controls keep native keyboard behavior: they are
  // not part of the scanned surface.
  return !!el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .partner, .safety');
}

export class InputController {
  private snapshot: (SwitchSnapshot & { key: string }) | null = null;
  private armedAt = 0;
  private attached: Window | null = null;
  private now: () => number;
  private cooldownMs: number;

  constructor(private deps: InputDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.cooldownMs = deps.cooldownMs ?? SCAN_DEFAULTS.switchCooldownMs;
  }

  attach(win: Window): () => void {
    this.detach();
    this.attached = win;
    win.addEventListener('keydown', this.onKeyDown, true);
    win.addEventListener('keyup', this.onKeyUp, true);
    win.addEventListener('blur', this.onBlur);
    return () => this.detach();
  }

  detach(): void {
    const win = this.attached;
    if (!win) return;
    win.removeEventListener('keydown', this.onKeyDown, true);
    win.removeEventListener('keyup', this.onKeyUp, true);
    win.removeEventListener('blur', this.onBlur);
    this.attached = null;
    this.cancelPress();
  }

  /** Drop any pending press without activating (focus loss, mode change, unmount). */
  cancelPress(): void {
    if (!this.snapshot) return;
    this.snapshot = null;
    this.deps.onHeldChange(false);
  }

  readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.code === 'Escape') {
      const inPartner = typeof (e.target as Element | null)?.closest === 'function' && !!(e.target as Element).closest('.partner');
      if (!e.repeat && !inPartner) this.deps.onSafetyPause();
      return;
    }
    const key = switchKey(e);
    if (!key || isEditable(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (this.deps.getMode() !== 'switch') {
      // Any mode: a held key must not trigger repeated native clicks.
      if (e.repeat) e.preventDefault();
      return;
    }
    // Switch mode: we own Space/Enter outside editable fields; prevent native click synthesis.
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || this.snapshot) return;
    if (this.now() < this.armedAt) return; // cooldown after the previous release
    this.snapshot = {
      key,
      targetId: this.deps.getHighlighted(),
      surfaceRevision: this.deps.getSurfaceRevision(),
      cycleId: this.deps.newId(),
    };
    this.deps.onHeldChange(true);
  };

  readonly onKeyUp = (e: KeyboardEvent): void => {
    const key = switchKey(e);
    if (!key) return;
    const snap = this.snapshot;
    const ours = !!snap && snap.key === key;
    if (!ours && (isEditable(e.target) || this.deps.getMode() !== 'switch')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!snap || !ours) return;
    this.snapshot = null;
    this.armedAt = this.now() + this.cooldownMs;
    this.deps.onHeldChange(false);
    if (snap.targetId && snap.surfaceRevision === this.deps.getSurfaceRevision() && this.deps.getMode() === 'switch') {
      this.deps.onSwitchActivate({ targetId: snap.targetId, surfaceRevision: snap.surfaceRevision, cycleId: snap.cycleId });
    }
  };

  private readonly onBlur = (): void => {
    this.cancelPress();
  };
}
