import { describe, expect, it } from 'vitest';
import { FaceSelector, type SelectorFace } from '@/access/face-selector';
import { selectedFaceFrame } from '@/access/blink-detector';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { BlinkEngine } from '@/runtime/useBlink';

/** A square-ish face of width `w` centred at (cx, cy), as 4 corner landmarks. */
function face(cx: number, cy: number, w = 0.25): SelectorFace {
  const h = w / 2;
  return { landmarks: [{ x: cx - h, y: cy - h }, { x: cx + h, y: cy - h }, { x: cx - h, y: cy + h }, { x: cx + h, y: cy + h }] };
}

const C = face(0.5, 0.5);

describe('FaceSelector', () => {
  it('reports no face for an empty frame', () => {
    const s = new FaceSelector();
    expect(s.select([], 0)).toEqual({ index: null, switched: false, count: 0 });
  });

  it('locks a single face without reporting a switch', () => {
    const s = new FaceSelector();
    for (let t = 0; t < 2000; t += 66) {
      expect(s.select([face(0.5 + 0.0001 * t, 0.5)], t)).toEqual({ index: 0, switched: false, count: 1 });
    }
  });

  it('keeps following the locked face across small movement and index reordering', () => {
    const s = new FaceSelector();
    s.select([face(0.3, 0.5)], 0);
    const r = s.select([face(0.8, 0.5), face(0.31, 0.5)], 66);
    expect(r.index).toBe(1);
    expect(r.switched).toBe(false);
    expect(r.count).toBe(2);
  });

  it('a second face appearing at the edge does not steal the lock', () => {
    const s = new FaceSelector();
    for (let t = 0; t < 1000; t += 66) s.select([face(0.55, 0.5)], t);
    for (let t = 1000; t < 4000; t += 66) {
      const r = s.select([face(0.9, 0.5), face(0.55, 0.5)], t);
      expect(r).toEqual({ index: 1, switched: false, count: 2 });
    }
  });

  it('a more central newcomer does not steal the lock either', () => {
    const s = new FaceSelector();
    for (let t = 0; t < 500; t += 66) s.select([face(0.8, 0.6)], t);
    for (let t = 500; t < 3000; t += 66) {
      expect(s.select([face(0.8, 0.6), face(0.5, 0.5)], t).index).toBe(0);
    }
  });

  it('picks the remaining face when the locked one leaves for more than 500 ms', () => {
    const s = new FaceSelector();
    s.select([face(0.5, 0.5), face(0.85, 0.5)], 0);
    for (let t = 66; t < 2000; t += 66) s.select([face(0.5, 0.5), face(0.85, 0.5)], t);
    // Locked (central) face leaves; the other stays.
    let last = s.select([face(0.85, 0.5)], 2000);
    expect(last.index).toBeNull(); // grace period: dropout, no re-lock yet
    for (let t = 2066; t <= 2500; t += 66) {
      last = s.select([face(0.85, 0.5)], t);
      expect(last.index).toBeNull();
      expect(last.switched).toBe(false);
    }
    last = s.select([face(0.85, 0.5)], 2566);
    expect(last).toEqual({ index: 0, switched: true, count: 1 });
  });

  it('with two new faces the central one wins', () => {
    const s = new FaceSelector();
    const r = s.select([face(0.85, 0.4), face(0.52, 0.5)], 0);
    expect(r.index).toBe(1);
    expect(r.switched).toBe(false); // first lock
  });

  it('a face present much longer beats a slightly more central newcomer when choosing', () => {
    const s = new FaceSelector();
    // Two faces in frame; both appear, lock goes to the central one first.
    for (let t = 0; t < 6000; t += 100) s.select([face(0.62, 0.5), face(0.2, 0.5)], t);
    // Central lock vanishes beyond grace, a newcomer arrives slightly more central than the veteran.
    // (Veteran = the left face, 6 s in frame.)
    let r = s.select([face(0.2, 0.5)], 6000); // locked (0.62) face gone... lock held in grace
    expect(r.index).toBeNull();
    for (let t = 6100; t < 6500; t += 100) s.select([face(0.2, 0.5)], t);
    // Lock expires on this frame, newcomer at the centre appears at the same time.
    r = s.select([face(0.2, 0.5), face(0.5, 0.5)], 6700);
    expect(r.index).toBe(0);
    expect(r.switched).toBe(true);
  });

  it('a brief dropout (< 500 ms) keeps the lock and the same face is returned', () => {
    const s = new FaceSelector();
    for (let t = 0; t < 1000; t += 66) s.select([face(0.4, 0.5), face(0.8, 0.5)], t);
    expect(s.select([face(0.8, 0.5)], 1066).index).toBeNull();
    expect(s.select([face(0.8, 0.5)], 1300).index).toBeNull();
    const back = s.select([face(0.4, 0.5), face(0.8, 0.5)], 1450);
    expect(back).toEqual({ index: 0, switched: false, count: 2 });
  });

  it('a total dropout shorter than the grace keeps the lock and reports a dropout', () => {
    const s = new FaceSelector();
    for (let t = 0; t < 500; t += 66) s.select([C], t);
    expect(s.select([], 600)).toEqual({ index: null, switched: false, count: 0 });
    expect(s.select([C], 800)).toEqual({ index: 0, switched: false, count: 1 });
  });

  it('switched is false on first lock, true when a different person is locked, false when the same person returns', () => {
    const s = new FaceSelector();
    expect(s.select([face(0.3, 0.5)], 0).switched).toBe(false);
    // Same person leaves for > grace and returns within prune time: re-locks the same track.
    s.select([], 100);
    s.select([], 700);
    const same = s.select([face(0.31, 0.5)], 800);
    expect(same.index).toBe(0);
    expect(same.switched).toBe(false);
    // Different person elsewhere after everything is pruned.
    s.select([], 900);
    s.select([], 2500);
    const other = s.select([face(0.8, 0.8)], 2600);
    expect(other.index).toBe(0);
    expect(other.switched).toBe(true);
    // And it does not flip-flop afterwards.
    expect(s.select([face(0.8, 0.8), face(0.5, 0.5)], 2700).switched).toBe(false);
  });

  it('forgets tracks unseen for more than 1.5 s (time in frame restarts)', () => {
    const s = new FaceSelector();
    for (let t = 0; t < 6000; t += 100) s.select([face(0.2, 0.5)], t);
    s.select([], 6100);
    s.select([], 7800);
    // New faces: the old veteran is gone, so the central one wins on equal (zero) longevity.
    const r = s.select([face(0.2, 0.5), face(0.5, 0.5)], 7900);
    expect(r.index).toBe(1);
  });

  it('ignores faces with unusable landmarks without crashing', () => {
    const s = new FaceSelector();
    const r = s.select([{ landmarks: [] }, C], 0);
    expect(r).toEqual({ index: 1, switched: false, count: 2 });
  });
});

describe('selectedFaceFrame', () => {
  const cat = (categoryName: string, score: number) => ({ categoryName, score, index: 0, displayName: '' });
  const result = {
    faceLandmarks: [[], []],
    faceBlendshapes: [
      { categories: [cat('eyeBlinkLeft', 0.1), cat('eyeBlinkRight', 0.1), cat('browInnerUp', 0.1), cat('browOuterUpLeft', 0.1), cat('browOuterUpRight', 0.1)] },
      { categories: [cat('eyeBlinkLeft', 0.9), cat('eyeBlinkRight', 0.9), cat('browInnerUp', 0.8), cat('browOuterUpLeft', 0.8), cat('browOuterUpRight', 0.8)] },
    ],
  } as unknown as FaceLandmarkerResult;

  it('reads the selected face and reports one face while keeping the real count', () => {
    const f = selectedFaceFrame(result, { index: 1, switched: false, count: 2 });
    expect(f.faces).toBe(1);
    expect(f.faceCount).toBe(2);
    expect(f.score).toBeGreaterThan(0.8);
    expect(f.brow).toBeGreaterThan(0.7);
    const g = selectedFaceFrame(result, { index: 0, switched: true, count: 2 });
    expect(g.score).toBeLessThan(0.2);
    expect(g.switched).toBe(true);
  });

  it('reports no face when nothing is followed', () => {
    expect(selectedFaceFrame(result, { index: null, switched: false, count: 2 })).toMatchObject({ faces: 0, score: null, brow: null, faceCount: 2 });
  });
});

describe('BlinkEngine with a followed face among several', () => {
  function setup() {
    const engine = new BlinkEngine('brow-blink');
    (engine as unknown as { hardStatus: unknown }).hardStatus = null;
    let t = 1000;
    const run = (ms: number, f: { eye: number; brow: number; faceCount?: number; switched?: boolean }) => {
      const end = t + ms;
      for (; t < end; t += 50) engine.onFrame({ t, faces: 1, score: f.eye, brow: f.brow, faceCount: f.faceCount, switched: f.switched });
    };
    return { engine, run };
  }

  it('never enters multiple-faces and shows the real count and a short message', () => {
    const { engine, run } = setup();
    run(1500, { eye: 0.05, brow: 0.05, faceCount: 2 });
    const snap = engine.getSnapshot();
    expect(snap.status).not.toBe('multiple-faces');
    expect(snap.faceCount).toBe(2);
    expect(snap.message).toBe('2 faces — following the centre one');
  });

  it('a switch discards a raise in progress and requires a fresh neutral', () => {
    const { engine, run } = setup();
    run(1500, { eye: 0.05, brow: 0.05, faceCount: 2 });
    run(150, { eye: 0.05, brow: 0.9, faceCount: 2 });
    expect(engine.getSnapshot().browStatus).toBe('rising');
    run(50, { eye: 0.05, brow: 0.9, faceCount: 2, switched: true });
    expect(engine.getSnapshot().browStatus).not.toBe('rising');
  });
});
