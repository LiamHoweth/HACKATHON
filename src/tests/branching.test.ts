// "Other ways to answer" (branching flow): request flags, board/paths targets, background
// prefetch of each path, instant install of prefetched replies, staleness, and fast mode.
import { describe, expect, it, vi } from 'vitest';
import { ALT_CANDIDATES, BRANCH_CANDIDATES, Driver, PATHS, SIMILAR_CANDIDATES, SPREAD_CANDIDATES, ids, okResult } from './helpers';
import { EffectsRunner } from '@/runtime/effects-runner';
import type { Action, Effect, State } from '@/core/state';
import type { ReplyRequest } from '@/core/types';

function branching(settings: ConstructorParameters<typeof Driver>[0] = {}) {
  const d = new Driver({ branching: true, ...settings });
  d.partner('How was your day?');
  d.resolveBranching();
  return d;
}

describe('branching flow: requests', () => {
  it('plain suggestions ask for branching; Guide directions and refinements do not', () => {
    const d = new Driver({ branching: true });
    d.partner('How was your day?');
    const first = d.lastGenerate().request;
    expect(first.branching).toBe(true);
    expect(first.pathHint).toBeUndefined();
    d.resolveBranching();
    // "None of these" regenerates with branching again.
    d.act('none');
    expect(d.lastGenerate().request.branching).toBe(true);
    d.resolveBranching();
    // An explicit Guide direction is not branching.
    d.actAll('guide', 'g-direction', 'i-agree');
    expect(d.lastGenerate().request.branching).toBeUndefined();
    d.resolve();
    // Refining a selected reply is not branching.
    d.actAll('cand-0', 'rv-change', 'cw-shorter');
    expect(d.lastGenerate().request.refineTarget).not.toBeNull();
    expect(d.lastGenerate().request.branching).toBeUndefined();
  });

  it('branching off leaves the request and board exactly as before', () => {
    const d = new Driver();
    d.partner('How was your day?');
    const req = d.lastGenerate().request;
    expect('branching' in req).toBe(false);
    expect('pathHint' in req).toBe(false);
    d.resolve();
    expect(ids(d.s).slice(0, 4)).toEqual(['cand-0', 'cand-1', 'cand-2', 'none']);
    expect(d.ws()!.batch!.paths).toBeUndefined();
    expect(d.target('other-ways')).toBeUndefined();
  });
});

describe('branching flow: targets', () => {
  it('board order is cand-0, cand-1, other-ways, none; highlight starts on cand-0', () => {
    const d = branching();
    expect(d.ws()!.batch!.candidates).toHaveLength(2);
    expect(d.ws()!.batch!.paths).toEqual(PATHS);
    expect(ids(d.s).slice(0, 4)).toEqual(['cand-0', 'cand-1', 'other-ways', 'none']);
    const ow = d.target('other-ways')!;
    expect(ow.label).toBe('Other ways to answer…');
    expect(ow.detail).toBe('Rough day · Ask back · Change topic');
    expect(ow.command).toEqual({ type: 'open', surface: { kind: 'paths' } });
  });

  it('a batch with no paths shows no other-ways target', () => {
    const d = new Driver({ branching: true });
    d.partner('How was your day?');
    d.resolve(SPREAD_CANDIDATES);
    expect(ids(d.s).slice(0, 4)).toEqual(['cand-0', 'cand-1', 'cand-2', 'none']);
  });

  it('the paths surface lists each path, then Something else, then Back', () => {
    const d = branching();
    d.act('other-ways');
    expect(d.surface().kind).toBe('paths');
    expect(ids(d.s)).toEqual(['path-0', 'path-1', 'path-2', 'path-new', 'path-back']);
    const p0 = d.target('path-0')!;
    expect(p0.label).toBe('Rough day');
    expect(p0.detail).toBe('Say the day was hard');
    expect(p0.command).toEqual({ type: 'choose-path', index: 0 });
    expect(d.target('path-new')!.label).toBe('Something else. New ideas');
    expect(d.target('path-back')!.label).toBe('Back');
    d.act('path-back');
    expect(d.surface().kind).toBe('board');
  });

  it('at most five paths are offered', () => {
    const d = new Driver({ branching: true });
    d.partner('How was your day?');
    const many = Array.from({ length: 7 }, (_, i) => ({ label: `P${i}`, summary: `Path ${i}` }));
    d.resolveBranching(many);
    d.act('other-ways');
    expect(ids(d.s)).toEqual(['path-0', 'path-1', 'path-2', 'path-3', 'path-4', 'path-new', 'path-back']);
    expect(d.pathGenerates()).toHaveLength(5);
  });
});

describe('branching flow: prefetch and choosing a path', () => {
  it('opening the paths surface prefetches every path once, with pathHint and no branching', () => {
    const d = branching();
    const gensBefore = d.generates().length;
    d.act('other-ways');
    const pg = d.pathGenerates();
    expect(pg).toHaveLength(3);
    expect(pg.map((e) => e.request.pathHint)).toEqual(PATHS);
    expect(pg.map((e) => e.pathIndex)).toEqual([0, 1, 2]);
    for (const e of pg) {
      expect(e.request.branching).toBeUndefined();
      expect(e.batchId).toBe(d.ws()!.batch!.id);
      expect(e.request.identity.workspaceId).toBe(d.ws()!.id);
    }
    expect(new Set(pg.map((e) => e.request.identity.requestId)).size).toBe(3);
    expect(d.generates()).toHaveLength(gensBefore); // no foreground generation
    // Back and open again: never prefetched twice for the same batch.
    d.act('path-back');
    d.act('other-ways');
    expect(d.pathGenerates()).toHaveLength(3);
  });

  it('choosing a prefetched path installs its replies at once, with a breadcrumb and highlight reset', () => {
    const d = branching();
    const oldBatch = d.ws()!.batch!.id;
    d.act('other-ways');
    const pg = d.pathGenerates();
    pg.forEach((e) => d.resolvePath(e, e.pathIndex === 1 ? ALT_CANDIDATES : SIMILAR_CANDIDATES));
    const gens = d.generates().length;
    const rev = d.s.surfaceRevision;
    d.act('path-1');
    expect(d.surface().kind).toBe('board');
    expect(d.s.stack).toEqual([{ kind: 'board' }]);
    expect(d.s.surfaceRevision).toBeGreaterThan(rev);
    const ws = d.ws()!;
    expect(ws.status).toBe('choosing');
    expect(ws.batch!.id).not.toBe(oldBatch);
    expect(ws.batch!.pathLabel).toBe('Ask back');
    expect(ws.batch!.paths).toBeUndefined();
    expect(ws.batch!.candidates.map((c) => c.text)).toEqual(ALT_CANDIDATES.map((c) => c.text));
    expect(d.generates()).toHaveLength(gens); // no new request
    expect(ids(d.s).slice(0, 4)).toEqual(['cand-0', 'cand-1', 'cand-2', 'none']);
    expect(d.targets()[0].id).toBe('cand-0');
    expect(ws.pathPrefetch ?? null).toBeNull();
  });

  it('choosing a path whose prefetch is still in flight adopts it, aborting the others', () => {
    const d = branching();
    d.act('other-ways');
    const pg = d.pathGenerates();
    const gens = d.generates().length;
    d.act('path-2');
    expect(d.surface().kind).toBe('board');
    expect(d.ws()!.status).toBe('generating');
    expect(d.ws()!.pending!.requestId).toBe(pg[2].request.identity.requestId);
    expect(d.generates()).toHaveLength(gens);
    const aborted = d.s.effects.filter((e) => e.kind === 'abort-generation').map((e) => (e as { requestId: string }).requestId);
    expect(aborted).toEqual(expect.arrayContaining([pg[0].request.identity.requestId, pg[1].request.identity.requestId]));
    expect(aborted).not.toContain(pg[2].request.identity.requestId);
    d.resolvePath(pg[2], ALT_CANDIDATES);
    expect(d.ws()!.status).toBe('choosing');
    expect(d.ws()!.batch!.pathLabel).toBe('Change topic');
    expect(d.ws()!.batch!.candidates[0].text).toBe(ALT_CANDIDATES[0].text);
    // A late result for an aborted sibling changes nothing.
    const before = d.s;
    d.resolvePath(pg[0], SIMILAR_CANDIDATES);
    expect(d.s.workspaces).toEqual(before.workspaces);
  });

  it('choosing a path without a usable prefetch starts a generation with that pathHint', () => {
    const d = branching();
    d.act('other-ways');
    const pg = d.pathGenerates();
    const fail = okResult(pg[0].request.identity);
    d.dispatch({
      type: 'PATH_RESULT', identity: fail.identity, batchId: pg[0].batchId, pathIndex: 0, at: d.tick(),
      result: { ok: false, requestId: fail.identity.requestId, error: { code: 'TIMEOUT', message: 'slow', recoverable: true } },
    });
    expect(d.ws()!.pathPrefetch!.entries[0].status).toBe('error');
    d.act('path-0');
    expect(d.surface().kind).toBe('board');
    const req = d.lastGenerate().request;
    expect(req.pathHint).toEqual(PATHS[0]);
    expect(req.branching).toBeUndefined();
    expect(d.ws()!.status).toBe('generating');
    d.resolve(ALT_CANDIDATES);
    expect(d.ws()!.batch!.pathLabel).toBe('Rough day');
    expect(d.ws()!.batch!.paths).toBeUndefined();
    expect(d.targets()[0].id).toBe('cand-0');
  });

  it('a prefetch result is ignored once the batch has changed', () => {
    const d = branching();
    d.act('other-ways');
    const pg = d.pathGenerates();
    d.act('path-new'); // "Something else": fresh branching suggestions
    expect(d.surface().kind).toBe('board');
    expect(d.lastGenerate().request.branching).toBe(true);
    const aborted = d.s.effects.filter((e) => e.kind === 'abort-generation').map((e) => (e as { requestId: string }).requestId);
    expect(aborted).toEqual(expect.arrayContaining(pg.map((e) => e.request.identity.requestId)));
    d.resolveBranching([{ label: 'New one', summary: 'Something new' }, ...PATHS.slice(1)]);
    const batch = d.ws()!.batch!;
    d.resolvePath(pg[0]);
    expect(d.ws()!.batch).toBe(batch);
    expect(d.ws()!.pathPrefetch ?? null).toBeNull();
    // The new batch prefetches its own paths.
    d.act('other-ways');
    expect(d.pathGenerates().filter((e) => e.batchId === batch.id)).toHaveLength(3);
  });

  it('local-only mode never prefetches', () => {
    const d = branching();
    d.s = { ...d.s, settings: { ...d.s.settings, aiMode: 'local-only' } };
    d.act('other-ways');
    expect(d.pathGenerates()).toHaveLength(0);
    expect(d.target('path-new')!.enabled).toBe(false);
  });
});

describe('branching flow: fast mode and follow-ups', () => {
  it('fast mode speaks a path reply on one selection', () => {
    const d = branching({ speakOnSelect: true });
    d.act('other-ways');
    d.pathGenerates().forEach((e) => d.resolvePath(e));
    d.act('path-0');
    d.act('cand-1');
    expect(d.s.review).toBeNull();
    expect(d.surface().kind).toBe('speaking');
    const sp = d.speaks();
    expect(sp).toHaveLength(1);
    expect(sp[0].utterance.exactText).toBe(ALT_CANDIDATES[1].text);
  });

  it('fast mode: a top reply from a 2-reply batch speaks and observation does not crash', () => {
    const d = branching({ speakOnSelect: true, sessionAdaptation: true });
    d.act('cand-1');
    expect(d.speaks()[0].utterance.exactText).toBe(BRANCH_CANDIDATES[1].text);
  });

  it('a merged follow-up while on the paths surface leaves it and regenerates', () => {
    const d = branching({ speakOnSelect: true });
    d.act('other-ways');
    const pg = d.pathGenerates();
    d.partner('Anything fun happen?');
    expect(d.s.staged).toHaveLength(0);
    expect(d.surface().kind).toBe('board');
    expect(d.ws()!.status).toBe('generating');
    expect(d.lastGenerate().request.branching).toBe(true);
    expect(d.lastGenerate().request.activePartnerText).toBe('How was your day? Anything fun happen?');
    // Stale prefetches are aborted and ignored.
    const aborted = d.s.effects.filter((e) => e.kind === 'abort-generation').map((e) => (e as { requestId: string }).requestId);
    expect(aborted).toEqual(expect.arrayContaining(pg.map((e) => e.request.identity.requestId)));
    d.resolvePath(pg[0]);
    expect(d.ws()!.status).toBe('generating');
    d.resolveBranching();
    expect(ids(d.s).slice(0, 4)).toEqual(['cand-0', 'cand-1', 'other-ways', 'none']);
  });

  it('a partner edit while on the paths surface leaves it (batch is gone)', () => {
    const d = branching();
    d.act('other-ways');
    const turnId = (d.ws()!.anchor as { turnId: string }).turnId;
    d.dispatch({ type: 'PARTNER_EDIT_TURN', turnId, text: 'How was your week?', at: d.tick() });
    expect(d.surface().kind).toBe('board');
    expect(d.ws()!.status).toBe('stale');
  });
});

describe('branching flow: effects runner', () => {
  it('generate-path posts with the access header and reports PATH_RESULT', async () => {
    const d = branching();
    d.act('other-ways');
    const effect = d.pathGenerates()[0];
    const dispatched: Action[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as ReplyRequest;
      return new Response(JSON.stringify(okResult(body.identity, ALT_CANDIDATES).result), { status: 200 });
    });
    const runner = new EffectsRunner({
      dispatch: (a) => dispatched.push(a),
      getState: () => d.s as State,
      getAccessCode: () => 'code-1', transcriptionConfigured: () => false, setTranscript: () => {},
      speech: null, eleven: null, newId: () => 'x', now: () => 7,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    runner.run([effect as Effect]);
    await vi.waitFor(() => expect(dispatched.some((a) => a.type === 'PATH_RESULT')).toBe(true));
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/replies');
    expect((init.headers as Record<string, string>)['x-still-here-access']).toBe('code-1');
    expect(JSON.parse(init.body as string).pathHint).toEqual(PATHS[0]);
    const res = dispatched.find((a) => a.type === 'PATH_RESULT') as Extract<Action, { type: 'PATH_RESULT' }>;
    expect(res.batchId).toBe(effect.batchId);
    expect(res.pathIndex).toBe(0);
    expect(res.result.ok).toBe(true);
    d.dispatch(res);
    expect(d.ws()!.pathPrefetch!.entries[0].status).toBe('ready');
  });
});
