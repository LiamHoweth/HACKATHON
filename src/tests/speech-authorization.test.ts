// Reducer-level speech authorization tests: exact-text confirmation, arming/cycle freshness,
// replay rejection, stop semantics, and the labeled basic-voice fallback after a provider failure.
import { describe, expect, it } from 'vitest';
import { Driver, SIMILAR_CANDIDATES, SPREAD_CANDIDATES, ids } from './helpers';
import type { SpeakEffect } from './helpers';
import { LIMITS } from '@/core/limits';

// Board with a ready batch for a partner turn.
function choosing(settings = {}) {
  const d = new Driver(settings);
  d.partner('Do you want to go to the park?');
  d.resolve();
  expect(d.ws()?.status).toBe('choosing');
  return d;
}

const speechEffectKinds = (d: Driver) =>
  d.s.effects.filter((e) => (e.kind as string) === 'speak' || (e.kind as string) === 'generate-speech');

function lastSpeak(d: Driver): SpeakEffect {
  const s = d.speaks();
  expect(s.length, 'a speak effect is queued').toBeGreaterThan(0);
  return s[s.length - 1];
}

function userTurnFor(d: Driver, utteranceId: string) {
  const e = d.userTurns().find((t) => t.value.utteranceId === utteranceId);
  expect(e, `user turn for utterance ${utteranceId}`).toBeDefined();
  return e!.value;
}

// Selects candidate 0, confirms, and fails the ElevenLabs playback with `kind`.
function failedElevenLabsTurn(kind: 'error' | 'uncertain' = 'error', settings = {}) {
  const d = choosing(settings);
  d.act('cand-0');
  d.act('rv-speak');
  const failed = lastSpeak(d).utterance;
  expect(failed.provider).toBe('elevenlabs');
  d.speech('start');
  d.speech(kind);
  return { d, failed };
}

describe('TTS-03 exact reviewed text and provider on the speak effect', () => {
  it('TTS-03 speak effect carries the exact reviewed text, provider elevenlabs, and settings.voiceChoiceId', () => {
    const d = choosing({ voiceChoiceId: 'voice-calm' });
    expect(d.s.settings.speechProvider).toBe('elevenlabs');
    d.act('cand-2');
    const reviewed = d.s.review!.snapshot.exactText;
    expect(reviewed).toBe(SPREAD_CANDIDATES[2].text);
    d.act('rv-speak');
    const speaks = d.speaks();
    expect(speaks).toHaveLength(1);
    const u = speaks[0].utterance;
    expect(u.exactText).toBe(reviewed);
    expect(u.exactText).toBe(SPREAD_CANDIDATES[2].text);
    expect(u.provider).toBe('elevenlabs');
    expect(u.voiceChoiceId).toBe('voice-calm');
    expect(u.voiceChoiceId).toBe(d.s.settings.voiceChoiceId);
    expect(userTurnFor(d, u.id).text).toBe(reviewed);
  });

  it('TTS-03 default settings produce voiceChoiceId null (server default) and provider elevenlabs', () => {
    const d = choosing();
    d.act('cand-0');
    d.act('rv-speak');
    const u = lastSpeak(d).utterance;
    expect(u.provider).toBe('elevenlabs');
    expect(u.voiceChoiceId).toBeNull();
  });

  it('TTS-03 board candidates and a selected (unconfirmed) candidate yield no speak/generate-speech effect', () => {
    const d = choosing();
    expect(ids(d.s)).toEqual(expect.arrayContaining(['cand-0', 'cand-1', 'cand-2']));
    expect(speechEffectKinds(d)).toHaveLength(0);
    d.act('cand-1');
    expect(d.surface().kind).toBe('review');
    expect(d.s.speech).toBeNull();
    expect(speechEffectKinds(d)).toHaveLength(0);
    // Cancelling the review returns without speaking.
    d.act('rv-cancel');
    expect(d.surface().kind).toBe('board');
    expect(speechEffectKinds(d)).toHaveLength(0);
    expect(d.userTurns()).toHaveLength(0);
  });
});

describe('IPAD-03 review ordering, arming, and fresh-cycle confirmation', () => {
  it('IPAD-03 review lists rv-cancel first; same-cycle and pre-arming confirms are rejected; a fresh cycle after arming speaks', () => {
    const d = choosing();
    const sel = d.act('cand-0');
    expect(d.surface().kind).toBe('review');
    expect(ids(d.s)[0]).toBe('rv-cancel');
    expect(d.target('rv-speak')?.requiresArming).toBe(true);

    // Same cycle as the selection, well after arming: rejected.
    const rev = d.s.surfaceRevision;
    d.tryAct('rv-speak', { cycleId: sel.cycleId, at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs + 500 });
    expect(d.s.surfaceRevision).toBe(rev);
    expect(d.surface().kind).toBe('review');
    expect(d.speaks()).toHaveLength(0);

    // Same event id as the selection (fresh cycle): rejected.
    d.tryAct('rv-speak', { eventId: sel.eventId, at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs + 600 });
    expect(d.s.surfaceRevision).toBe(rev);
    expect(d.speaks()).toHaveLength(0);

    // Fresh cycle but before the arming delay: rejected.
    d.tryAct('rv-speak', { at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs - 1 });
    expect(d.s.surfaceRevision).toBe(rev);
    expect(d.speaks()).toHaveLength(0);

    // Fresh cycle at/after arming: speaks.
    d.act('rv-speak', { at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs });
    expect(d.speaks()).toHaveLength(1);
    const u = d.speaks()[0].utterance;
    expect(u.selectionCycleId).toBe(sel.cycleId);
    expect(u.confirmationCycleId).not.toBe(sel.cycleId);
    expect(u.selectionEventId).toBe(sel.eventId);
    expect(u.confirmationEventId).not.toBe(sel.eventId);
    expect(d.surface().kind).toBe('speaking');
  });
});

describe('TTS-04 replayed activation cannot speak twice', () => {
  it('TTS-04 re-dispatching the identical confirm ACTIVATE creates no second speak effect', () => {
    const d = choosing();
    d.act('cand-0');
    const confirm = d.act('rv-speak');
    expect(d.speaks()).toHaveLength(1);
    d.dispatch(confirm);
    d.dispatch({ ...confirm, at: confirm.at + 5000 });
    expect(d.speaks()).toHaveLength(1);
    expect(d.userTurns()).toHaveLength(1);
  });

  it('TTS-04 replaying old cycle/event ids against a fresh review (current surfaceRevision) is rejected', () => {
    const d = choosing();
    d.act('cand-0');
    const confirm = d.act('rv-speak');
    d.speech('start');
    d.speech('end');
    expect(d.surface().kind).toBe('board');

    // A new turn opens a new review with rv-speak available and armed.
    d.partner('What should we eat?');
    d.resolve(SIMILAR_CANDIDATES);
    d.act('cand-1');
    expect(d.surface().kind).toBe('review');
    const rev = d.s.surfaceRevision;
    d.dispatch({ ...confirm, surfaceRevision: d.s.surfaceRevision, at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs + 1000 });
    expect(d.s.surfaceRevision).toBe(rev);
    expect(d.surface().kind).toBe('review');
    expect(d.speaks()).toHaveLength(1);

    // Same cycle id with a fresh event id, and vice versa: both rejected.
    d.tryAct('rv-speak', { cycleId: confirm.cycleId, at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs + 1100 });
    d.tryAct('rv-speak', { eventId: confirm.eventId, at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs + 1200 });
    expect(d.s.surfaceRevision).toBe(rev);
    expect(d.speaks()).toHaveLength(1);

    // A genuinely fresh confirmation still works.
    d.act('rv-speak');
    expect(d.speaks()).toHaveLength(2);
    expect(d.speaks()[1].utterance.exactText).toBe(SIMILAR_CANDIDATES[1].text);
  });
});

describe('TTS-05 stop marks interrupted and late events cannot complete or replay', () => {
  it('TTS-05 stop-speech interrupts; a later SPEECH_EVENT end for that utterance is ignored', () => {
    const d = choosing();
    d.act('cand-0');
    d.act('rv-speak');
    const u = lastSpeak(d).utterance;
    d.speech('start', u.id);
    expect(userTurnFor(d, u.id).delivery).toBe('speaking');
    expect(d.surface().kind).toBe('speaking');
    d.act('sp-stop');
    expect(d.s.speech).toBeNull();
    expect(userTurnFor(d, u.id).delivery).toBe('interrupted');
    expect(d.s.effects.some((e) => e.kind === 'stop-speech' && e.utteranceId === u.id)).toBe(true);
    expect(d.surface().kind).toBe('board');

    d.speech('end', u.id);
    d.speech('start', u.id);
    d.speech('error', u.id);
    expect(userTurnFor(d, u.id).delivery).toBe('interrupted');
    expect(d.speaks()).toHaveLength(1);
    expect(d.s.speech).toBeNull();
    // A user-initiated stop is not a provider failure: no basic-voice offer.
    expect(d.s.lastFailedSpeech).toBeNull();
    expect(ids(d.s)).not.toContain('speak-basic');
  });
});

describe('TTS-07 basic-voice fallback after an ElevenLabs failure', () => {
  for (const kind of ['error', 'uncertain'] as const) {
    it(`TTS-07 SPEECH_EVENT ${kind} sets lastFailedSpeech and the board offers speak-basic + dismiss-failed`, () => {
      const { d, failed } = failedElevenLabsTurn(kind);
      expect(userTurnFor(d, failed.id).delivery).toBe(kind === 'error' ? 'failed' : 'uncertain');
      expect(d.s.lastFailedSpeech).toEqual({ utteranceId: failed.id, text: failed.exactText, source: 'demo-fixture', delivery: kind === 'error' ? 'failed' : 'uncertain' });
      expect(d.surface().kind).toBe('board');
      expect(ids(d.s)).toEqual(expect.arrayContaining(['speak-basic', 'dismiss-failed']));
      // No automatic replay.
      expect(d.speaks()).toHaveLength(1);
    });
  }

  it('TTS-07 speak-basic opens a NEW review without speaking; a fresh confirm speaks via browser and clears lastFailedSpeech', () => {
    const { d, failed } = failedElevenLabsTurn('error', { voiceChoiceId: 'voice-calm' });
    const basic = d.act('speak-basic');
    expect(d.surface().kind).toBe('review');
    expect(d.s.review?.origin).toEqual({ kind: 'basic-voice', originalUtteranceId: failed.id });
    expect(d.s.review?.snapshot.exactText).toBe(failed.exactText);
    expect(d.s.review?.snapshot.id).not.toBe(failed.reviewId);
    expect(ids(d.s)[0]).toBe('rv-cancel');
    expect(d.speaks()).toHaveLength(1);
    expect(d.s.lastFailedSpeech).not.toBeNull();

    // Confirming with the same cycle that opened the fallback review is rejected.
    const rev = d.s.surfaceRevision;
    d.tryAct('rv-speak', { cycleId: basic.cycleId, at: d.s.surfaceOpenedAt + LIMITS.confirmArmMs + 100 });
    expect(d.s.surfaceRevision).toBe(rev);
    expect(d.speaks()).toHaveLength(1);

    d.act('rv-speak');
    expect(d.speaks()).toHaveLength(2);
    const u = lastSpeak(d).utterance;
    expect(u.provider).toBe('browser');
    expect(u.exactText).toBe(failed.exactText);
    expect(u.id).not.toBe(failed.id);
    expect(u.selectionCycleId).toBe(basic.cycleId);
    expect(d.s.lastFailedSpeech).toBeNull();
    d.speech('start');
    d.speech('end');
    expect(ids(d.s)).not.toContain('speak-basic');
  });

  it('TTS-07 cancelling the fallback review speaks nothing and keeps the offer', () => {
    const { d } = failedElevenLabsTurn('error');
    d.act('speak-basic');
    d.act('rv-cancel');
    expect(d.surface().kind).toBe('board');
    expect(d.speaks()).toHaveLength(1);
    expect(ids(d.s)).toContain('speak-basic');
  });

  it('TTS-07 dismiss-failed clears lastFailedSpeech without speaking', () => {
    const { d } = failedElevenLabsTurn('error');
    d.act('dismiss-failed');
    expect(d.s.lastFailedSpeech).toBeNull();
    expect(d.speaks()).toHaveLength(1);
    expect(d.s.speech).toBeNull();
    expect(ids(d.s)).not.toContain('speak-basic');
    expect(ids(d.s)).not.toContain('dismiss-failed');
  });

  it('TTS-07 a browser-provider failure (including the basic-voice retry itself) does not offer speak-basic', () => {
    const { d } = failedElevenLabsTurn('error');
    d.act('speak-basic');
    d.act('rv-speak');
    expect(lastSpeak(d).utterance.provider).toBe('browser');
    d.speech('start');
    d.speech('error');
    expect(d.s.lastFailedSpeech).toBeNull();
    expect(ids(d.s)).not.toContain('speak-basic');
    expect(d.speaks()).toHaveLength(2);
  });

  it('TTS-07 browser provider selected in settings: error/uncertain do not offer speak-basic', () => {
    for (const kind of ['error', 'uncertain'] as const) {
      const d = choosing({ speechProvider: 'browser' });
      d.act('cand-0');
      d.act('rv-speak');
      expect(lastSpeak(d).utterance.provider).toBe('browser');
      d.speech('start');
      d.speech(kind);
      expect(d.s.lastFailedSpeech).toBeNull();
      expect(ids(d.s)).not.toContain('speak-basic');
    }
  });

  it('TTS-07 ct-voice toggles settings.speechProvider and the next confirmed message uses the new provider', () => {
    const d = new Driver();
    expect(d.s.settings.speechProvider).toBe('elevenlabs');
    d.act('more');
    d.act('t-controls');
    expect(d.target('ct-voice')?.command).toEqual({ type: 'set-speech-provider', provider: 'browser' });
    d.act('ct-voice');
    expect(d.s.settings.speechProvider).toBe('browser');
    expect(d.target('ct-voice')?.command).toEqual({ type: 'set-speech-provider', provider: 'elevenlabs' });
    expect(d.speaks()).toHaveLength(0);
    d.act('back');
    d.act('back');
    expect(d.surface().kind).toBe('board');

    d.partner('Want some tea?');
    d.resolve();
    d.act('cand-0');
    d.act('rv-speak');
    expect(lastSpeak(d).utterance.provider).toBe('browser');
    d.speech('start');
    d.speech('end');

    // Toggle back to natural voice; the following message uses elevenlabs.
    d.act('more');
    d.act('t-controls');
    d.act('ct-voice');
    expect(d.s.settings.speechProvider).toBe('elevenlabs');
    d.act('back');
    d.act('back');
    d.partner('And a biscuit?');
    d.resolve();
    d.act('cand-1');
    d.act('rv-speak');
    expect(lastSpeak(d).utterance.provider).toBe('elevenlabs');
    expect(d.speaks()).toHaveLength(2);
  });
});
