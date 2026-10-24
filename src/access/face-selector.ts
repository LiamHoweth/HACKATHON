/**
 * Picks ONE face to follow when several are in the camera frame (a helper or judge leans in).
 *
 * Pure and deterministic: no DOM, no MediaPipe types. Faces are matched frame to frame by
 * nearest centre, the locked face keeps the lock while it stays matched, and a brief dropout
 * (<= LOCK_GRACE_MS) keeps the lock but reports `index: null` so the gesture machines see an
 * ordinary short dropout. Only when there is no lock does it choose, preferring the face that
 * has been in frame longest and the one nearest the middle of the image.
 */

export type SelectorFace = { landmarks: ReadonlyArray<{ x: number; y: number }> };

export type FaceSelection = {
  /** Index into this frame's faces of the followed face, or null (no face / locked face briefly missing). */
  index: number | null;
  /** True on the frame the lock moves to a different person (never on the first lock). */
  switched: boolean;
  /** Number of faces actually visible this frame. */
  count: number;
};

export const FACE_SELECTOR_TIMING = {
  /** The locked face may be unmatched this long before the lock is dropped. */
  lockGraceMs: 500,
  /** Tracks unseen this long are forgotten. */
  pruneMs: 1500,
  /** Time in frame that earns full longevity credit. */
  fullLongevityMs: 5000,
} as const;

/** Match radius as a fraction of face width, with a floor in normalized image units. */
const MATCH_WIDTH_FRACTION = 0.6;
const MATCH_MIN_DISTANCE = 0.06;
const CENTRE_WEIGHT = 0.5;
const LONGEVITY_WEIGHT = 0.5;
const MAX_CENTRE_DISTANCE = Math.SQRT1_2; // corner to centre of the unit square

type Track = {
  id: number;
  firstSeen: number;
  lastSeen: number;
  cx: number;
  cy: number;
  width: number;
};

type Measured = { cx: number; cy: number; width: number };

function measure(face: SelectorFace): Measured | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of face.landmarks) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return null;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, width: maxX - minX };
}

export function centrality(cx: number, cy: number): number {
  const d = Math.hypot(cx - 0.5, cy - 0.5) / MAX_CENTRE_DISTANCE;
  return 1 - Math.min(1, Math.max(0, d));
}

export class FaceSelector {
  private tracks: Track[] = [];
  private nextId = 1;
  private lockId: number | null = null;
  /** Identity of the most recent lock, to tell a first lock from a change of person. */
  private lastLockId: number | null = null;
  private lastT = -Infinity;

  reset(): void {
    this.tracks = [];
    this.lockId = null;
    this.lastLockId = null;
    this.lastT = -Infinity;
  }

  select(faces: ReadonlyArray<SelectorFace>, t: number): FaceSelection {
    const timing = FACE_SELECTOR_TIMING;
    if (!Number.isFinite(t)) return { index: null, switched: false, count: faces.length };
    if (t < this.lastT) t = this.lastT; // never run time backwards
    this.lastT = t;

    // A lock whose face has been unseen longer than the grace period is lost, even if something
    // later shows up near where it was: that face then competes like any newcomer.
    if (this.lockId !== null) {
      const lock = this.tracks.find((tr) => tr.id === this.lockId);
      if (!lock || t - lock.lastSeen > timing.lockGraceMs) this.lockId = null;
    }

    // Measure; faces with unusable landmarks are ignored for tracking but still counted.
    const measured: Array<{ index: number; m: Measured }> = [];
    faces.forEach((f, index) => {
      const m = measure(f);
      if (m) measured.push({ index, m });
    });

    // Greedy one-to-one nearest-centre matching, closest pairs first.
    const pairs: Array<{ mi: number; ti: number; d: number }> = [];
    measured.forEach(({ m }, mi) => {
      this.tracks.forEach((tr, ti) => {
        const d = Math.hypot(m.cx - tr.cx, m.cy - tr.cy);
        const limit = Math.max(MATCH_MIN_DISTANCE, MATCH_WIDTH_FRACTION * Math.max(m.width, tr.width));
        if (d <= limit) pairs.push({ mi, ti, d });
      });
    });
    pairs.sort((a, b) => a.d - b.d);
    const faceTrack = new Map<number, Track>(); // measured index -> track
    const usedTracks = new Set<number>();
    for (const p of pairs) {
      if (faceTrack.has(p.mi) || usedTracks.has(p.ti)) continue;
      faceTrack.set(p.mi, this.tracks[p.ti]);
      usedTracks.add(p.ti);
    }
    measured.forEach(({ m }, mi) => {
      let tr = faceTrack.get(mi);
      if (!tr) {
        tr = { id: this.nextId++, firstSeen: t, lastSeen: t, cx: m.cx, cy: m.cy, width: m.width };
        this.tracks.push(tr);
        faceTrack.set(mi, tr);
      } else {
        // A face that returns after a real gap starts its time-in-frame again.
        if (t - tr.lastSeen > timing.lockGraceMs) tr.firstSeen = t;
        tr.lastSeen = t;
        tr.cx = m.cx;
        tr.cy = m.cy;
        tr.width = m.width;
      }
    });
    this.tracks = this.tracks.filter((tr) => t - tr.lastSeen <= timing.pruneMs);
    if (this.lockId !== null && !this.tracks.some((tr) => tr.id === this.lockId)) this.lockId = null;

    const visible = (id: number): number | null => {
      for (const [mi, tr] of faceTrack) if (tr.id === id) return measured[mi].index;
      return null;
    };

    const count = faces.length;
    if (this.lockId !== null) {
      const idx = visible(this.lockId);
      if (idx !== null) return { index: idx, switched: false, count };
      const lock = this.tracks.find((tr) => tr.id === this.lockId) as Track;
      if (t - lock.lastSeen <= timing.lockGraceMs) return { index: null, switched: false, count }; // brief dropout
      this.lockId = null;
    }

    // No lock: choose among faces visible now.
    let best: { id: number; index: number; score: number } | null = null;
    for (const [mi, tr] of faceTrack) {
      const score = CENTRE_WEIGHT * centrality(tr.cx, tr.cy)
        + LONGEVITY_WEIGHT * Math.min((t - tr.firstSeen) / timing.fullLongevityMs, 1);
      // Ties go to the lower index so the choice is deterministic.
      const index = measured[mi].index;
      if (best === null || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && index < best.index)) {
        best = { id: tr.id, index, score };
      }
    }
    if (best === null) return { index: null, switched: false, count };
    this.lockId = best.id;
    const switched = this.lastLockId !== null && this.lastLockId !== best.id;
    this.lastLockId = best.id;
    return { index: best.index, switched, count };
  }
}
