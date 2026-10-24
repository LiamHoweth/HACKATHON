// Access-code throttle: wrong codes are limited per client, but a correct code always
// passes and requests that send no code never count, so shared-IP clients cannot lock
// each other out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serverConfig } from '@/server/config';
import { ACCESS_HEADER, checkAccess, verifyAccessCode } from '@/server/request-guards';

const TOKEN = 'abcdefghijklmnopqrstuvwx'; // 24 chars, test value only
let saved: string | undefined;
beforeEach(() => { saved = process.env.APP_ACCESS_TOKEN; process.env.APP_ACCESS_TOKEN = TOKEN; });
afterEach(() => {
  if (saved === undefined) delete process.env.APP_ACCESS_TOKEN; else process.env.APP_ACCESS_TOKEN = saved;
  vi.useRealTimers();
});

const req = (ip: string, code?: string) => new Request('https://still-here.example.com/api/replies', {
  method: 'POST',
  headers: { host: 'still-here.example.com', 'x-real-ip': ip, ...(code === undefined ? {} : { [ACCESS_HEADER]: code }) },
});

describe('access-code throttle', () => {
  it('a correct code passes after 15 wrong attempts from the same client', () => {
    const cfg = serverConfig();
    const verdicts = Array.from({ length: 15 }, () => verifyAccessCode(req('10.0.0.1', 'wrong-code'), cfg));
    expect(verdicts.slice(0, 10).every((v) => v === 'denied')).toBe(true);
    expect(verdicts.slice(10).every((v) => v === 'throttled')).toBe(true);
    expect(verifyAccessCode(req('10.0.0.1', TOKEN), cfg)).toBe('ok');
    expect(checkAccess(req('10.0.0.1', TOKEN), cfg)).toBe('ok');
    // The correct code does not reset or count; further wrong codes stay throttled.
    expect(verifyAccessCode(req('10.0.0.1', 'wrong-code'), cfg)).toBe('throttled');
  });

  it('requests without the header never trip the throttle', () => {
    const cfg = serverConfig();
    for (let i = 0; i < 50; i++) expect(verifyAccessCode(req('10.0.0.2'), cfg)).toBe('denied');
    for (let i = 0; i < 50; i++) expect(verifyAccessCode(req('10.0.0.2', ''), cfg)).toBe('denied');
    expect(checkAccess(req('10.0.0.2'), cfg)).toBe('denied');
    // The first wrong code after all of that is still the first counted failure.
    expect(verifyAccessCode(req('10.0.0.2', 'wrong-code'), cfg)).toBe('denied');
    expect(verifyAccessCode(req('10.0.0.2', TOKEN), cfg)).toBe('ok');
  });

  it('wrong codes still throttle, per client, until the window expires', () => {
    vi.useFakeTimers();
    const cfg = serverConfig();
    for (let i = 0; i < 10; i++) expect(verifyAccessCode(req('10.0.0.3', `guess-${i}`), cfg)).toBe('denied');
    expect(verifyAccessCode(req('10.0.0.3', 'guess-x'), cfg)).toBe('throttled');
    expect(checkAccess(req('10.0.0.3', 'guess-y'), cfg)).toBe('throttled');
    expect(verifyAccessCode(req('10.0.0.4', 'guess-x'), cfg)).toBe('denied'); // other client unaffected
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(verifyAccessCode(req('10.0.0.3', 'guess-z'), cfg)).toBe('denied');
  });
});
