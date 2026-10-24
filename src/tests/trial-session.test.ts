import { describe, expect, it } from 'vitest';

import { TrialSession, summarize } from '@/components/trial/trial-session';

const mk = () => new TrialSession(0, '2026-10-24T00:00:00Z');

describe('TrialSession', () => {
  it('A: one hit per prompt, extra NEXT during settle flagged, miss marks', () => {
    const s = mk();
    s.startStep('A', 100);
    s.handleRaw({ type: 'brow-next', at: 1, heldMs: 510 }, 600);
    expect(s.handleCommand({ type: 'accept', command: 'NAV_NEXT', at: 1, cycleId: 'x' }, 600).applied).toBe(true);
    s.handleCommand({ type: 'accept', command: 'NAV_NEXT', at: 2, cycleId: 'y' }, 1200); // extra
    s.tick(2700); // settle done -> prompt 2
    expect(s.markMiss(3000)).toBe(true); // prompt 2 miss
    const v = s.getView();
    expect(v.runs.A!.prompts[0].outcome).toBe('hit');
    expect(v.runs.A!.prompts[0].extraNext).toBe(1);
    expect(v.runs.A!.prompts[0].browNextHeldMs).toEqual([510]);
    expect(v.runs.A!.prompts[1].outcome).toBe('miss');
    const sum = summarize(v.runs).steps[0];
    expect(sum.hits).toBe(1); expect(sum.missed).toBe(1); expect(sum.extraNextDuringHold).toBe(1);
  });
  it('B: select commits frozen target; NEXT before closure => wrong target auto', () => {
    const s = mk();
    s.startStep('B', 0);
    expect(s.getView().highlight).toBe(0);
    s.handleCommand({ type: 'accept', command: 'NAV_NEXT', at: 1, cycleId: 'a' }, 100); // inadvertent, moves to T2
    expect(s.handleCommand({ type: 'freeze', at: 2 }, 200).targetId).toBe('Target 2');
    s.handleRaw({ type: 'select', at: 3, durationMs: 812.4 }, 1000);
    expect(s.handleCommand({ type: 'accept', command: 'SELECT', at: 3, cycleId: 'b' }, 1000)).toEqual({ applied: true, targetId: 'Target 2' });
    s.handleCommand({ type: 'unfreeze', at: 3 }, 1000);
    s.tick(3100);
    const p = s.getView().runs.B!.prompts;
    expect(p[0].outcome).toBe('wrong-target');
    expect(p[0].selections[0].closureMs).toBe(812);
    expect(p[1].target).toBe('Target 2');
    expect(s.getView().highlight).toBe(1);
    const sum = summarize(s.getView().runs);
    expect(sum.steps[1].inadvertentNext).toBe(1);
    expect(sum.totals.wrongTargetSelections).toBe(1);
    // facilitator wrong-target mark on the latest selection once only
    expect(s.markWrongTarget(3200)).toBe(true);
    expect(s.markWrongTarget(3300)).toBe(false);
  });
  it('SELECT without freeze is refused', () => {
    const s = mk();
    s.startStep('B', 0);
    expect(s.handleCommand({ type: 'accept', command: 'SELECT', at: 3, cycleId: 'b' }, 1000).applied).toBe(false);
    expect(s.getView().runs.B!.prompts[0].refusedSelect).toBe(1);
  });
  it('C: fixed 120 s window counts inadvertent commands then completes', () => {
    const s = mk();
    s.startStep('C', 0);
    s.handleCommand({ type: 'accept', command: 'NAV_NEXT', at: 1, cycleId: 'a' }, 5000);
    s.handleCommand({ type: 'freeze', at: 2 }, 6000);
    s.handleCommand({ type: 'accept', command: 'SELECT', at: 3, cycleId: 'b' }, 7000);
    expect(s.remainingMs(60_000)).toBe(60_000);
    s.tick(120_001);
    const v = s.getView();
    expect(v.activeStep).toBe(null);
    expect(v.runs.C!.status).toBe('complete');
    expect(v.runs.C!.prompts[0].outcome).toBe('command-accepted');
    const sum = summarize(v.runs).steps[2];
    expect(sum.inadvertentNext).toBe(1); expect(sum.inadvertentSelect).toBe(1);
  });
  it('D: face-lost pauses, NEXT blocked, blink resume = hit', () => {
    const s = mk();
    s.startStep('D', 0);
    s.handleCommand({ type: 'face-lost', at: 1 }, 1500);
    expect(s.getView().paused).toBe(true);
    s.handleRaw({ type: 'face-found', at: 2 }, 4000);
    expect(s.handleCommand({ type: 'accept', command: 'NAV_NEXT', at: 3, cycleId: 'n' }, 4200).applied).toBe(false);
    expect(s.handleCommand({ type: 'freeze', at: 4 }, 4500).targetId).toBe('Resume');
    expect(s.handleCommand({ type: 'accept', command: 'SELECT', at: 5, cycleId: 's' }, 5400).targetId).toBe('Resume');
    expect(s.getView().paused).toBe(false);
    s.tick(7000);
    const p = s.getView().runs.D!.prompts[0];
    expect(p.outcome).toBe('hit');
    expect(p.pausedAtMs).toBe(1500); expect(p.faceFoundAtMs).toBe(4000); expect(p.resumedAtMs).toBe(5400);
    expect(p.blockedWhilePaused).toBe(1);
    expect(summarize(s.getView().runs).steps[3].pausedAndResumed).toBe(1);
  });
  it('E: exactly-one-next counted; F groups; export has no image fields', () => {
    const s = mk();
    s.startStep('E', 0);
    s.handleCommand({ type: 'accept', command: 'NAV_NEXT', at: 1, cycleId: 'a' }, 600);
    s.onBrowStatus('rising', 100); s.onBrowStatus('latched', 600); s.onBrowStatus('rearming', 2200);
    s.tick(4700);
    s.endStepEarly(5000);
    const sumE = summarize(s.getView().runs).steps[4];
    expect(sumE.promptsRun).toBe(1); expect(sumE.exactlyOneNext).toBe(1); expect(sumE.browHoldApproxMs.median).toBe(2100);
    s.startStep('F', 6000);
    for (let i = 0; i < 15; i++) s.tick(6000 + (i + 1) * 5001);
    expect(s.getView().runs.F!.status).toBe('complete');
    const out = s.exportData({ device: { userAgent: 'x' }, conditions: {}, calibration: {} }, 'now');
    const str = JSON.stringify(out);
    expect(str).not.toMatch(/image|video|landmark"/i.source ? /"(image|frame|dataUrl)"/ : /x/);
    expect(out.summary.steps[5].groups).toEqual({ 'brow-flick': { prompts: 5, commandsAccepted: 0 }, 'quick-blink': { prompts: 5, commandsAccepted: 0 }, combined: { prompts: 5, commandsAccepted: 0 } });
    expect(out.events.list.length).toBeGreaterThan(10);
  });
});
