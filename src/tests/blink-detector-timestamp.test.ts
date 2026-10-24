import { describe, expect, it } from 'vitest';
import { frameTimestamp, MAX_CAPTURE_AGE_MS } from '@/access/blink-detector';

describe('Blink detector frame timestamps (audit finding 1, capture time)', () => {
  it('uses a recent camera capture time instead of the later processing time', () => {
    expect(frameTimestamp(1000, 940, 900)).toBe(940);
  });

  it('falls back to the processing time when capture time is missing, stale, in the future or reused', () => {
    expect(frameTimestamp(1000, null, 900)).toBe(1000);
    expect(frameTimestamp(1000, 1000 - MAX_CAPTURE_AGE_MS - 1, 0)).toBe(1000);
    expect(frameTimestamp(1000, 1010, 900)).toBe(1000);
    expect(frameTimestamp(1000, 900, 900)).toBe(1000); // same capture as the previous frame
  });

  it('stays strictly increasing', () => {
    expect(frameTimestamp(1000, null, 1000)).toBeGreaterThan(1000);
    let last = 0;
    for (const [p, c] of [[100, 60], [166, 160], [170, null], [240, 165], [300, 290]] as const) {
      const t = frameTimestamp(p, c, last);
      expect(t).toBeGreaterThan(last);
      last = t;
    }
  });
});
