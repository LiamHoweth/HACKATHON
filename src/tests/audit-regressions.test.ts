// Regression tests for findings from the 2026-10-24 edge-case audit.
import { describe, expect, it } from 'vitest';
import { Driver, ALT_CANDIDATES } from './helpers';

describe('Audit regressions', () => {
  it('AUD-2 an own-words reply answers the active question so later partner input is not stuck in the queue', () => {
    const d = new Driver();
    d.partner('Are you coming to dinner tonight?');
    d.resolve();
    d.act('my-words');
    d.act('grp-1'); d.act('key-H'); d.act('grp-1'); d.act('key-I');
    d.act('c-done');
    d.act('rv-speak');
    d.speech('start'); d.speech('end');
    expect(d.s.activeWorkspaceId).toBeNull();
    const reply = d.userTurns()[0].value;
    expect(reply.anchorTurnId).toBe(d.partnerTurns()[0].value.id);
    d.partner('What time works?');
    expect(d.s.staged).toEqual([]);
    expect(d.ws()?.anchor.mode).toBe('reply');
  });

  it('AUD-2 local-only mode: an own-words reply closes the question too', () => {
    const d = new Driver({ aiMode: 'local-only' });
    d.partner('First question?');
    d.act('my-words');
    d.act('grp-0'); d.act('key-A');
    d.act('c-done');
    d.act('rv-speak');
    d.speech('end');
    d.partner('Second question?');
    expect(d.s.staged).toEqual([]);
  });

  it('AUD-2 a quick phrase does not close the active question', () => {
    const d = new Driver();
    d.partner('Are you coming to dinner tonight?');
    d.resolve();
    const wsId = d.s.activeWorkspaceId;
    d.act('quick');
    d.act('qp-qp-moment');
    d.act('rv-speak');
    d.speech('end');
    expect(d.s.activeWorkspaceId).toBe(wsId);
  });

  it('AUD-5 a discarded late result never brings back the batch the user rejected', () => {
    const d = new Driver();
    d.partner('Are you coming to dinner tonight?');
    d.resolve(ALT_CANDIDATES);
    d.act('none');
    const pending = d.lastGenerate().request;
    // Something bumps the context revision while the regeneration is in flight.
    d.act('quick'); d.act('qp-qp-moment'); d.act('rv-speak'); d.speech('end');
    d.resolve(undefined, pending);
    const ws = d.ws()!;
    expect(ws.status).not.toBe('choosing');
    expect(d.s.workspaces[ws.id].status).toBe('stale');
  });
});
