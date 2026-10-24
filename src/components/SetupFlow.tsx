'use client';

import { useId, useState } from 'react';
import type { StillHereRuntime } from '@/runtime/contract';
import { VOICE_TEST_TEXT } from '@/runtime/contract';
import { DEFAULT_SETTINGS } from '@/core/state';
import type { Settings } from '@/core/state';
import { RELATIONSHIPS, SETTINGS } from '@/core/types';
import type { AccessMode, AiMode, ProfileDraft, Relationship, SettingPlace, SpeechProvider } from '@/core/types';
import { SCAN_DEFAULTS } from '@/core/limits';
import { BUILT_IN_PHRASES } from '@/core/phrases';
import { BlinkCalibration, describeBrowCalibration, describeCalibration, type FaceMode } from './BlinkCalibration';
import { SPEECH_PROVIDER_LABELS, audioStatusLabel, formatTime } from './labels';
import type { PreviewOutcome } from '@/runtime/useAudio';
import css from './setup.module.css';

/** Setup groups keyboard and switch under one alternative; this is the choice inside it. */
type KeySwitchMode = Extract<AccessMode, 'switch' | 'keyboard'>;
type AccessChoice = 'brow-blink' | 'blink' | 'key-switch' | 'pointer';

const isFaceMode = (m: AccessMode): m is FaceMode => m === 'brow-blink' || m === 'blink';
const choiceOf = (m: AccessMode): AccessChoice => (m === 'switch' || m === 'keyboard' ? 'key-switch' : m);

const DEMO_NAME = 'Sam (fictional)';
const DEMO_INTERESTS = 'jazz, basketball, cooking';

export function SetupFlow({ runtime }: { runtime: StillHereRuntime }) {
  const { state, serverStatus, voices } = runtime;
  const uid = useId();

  const [choice, setChoice] = useState<AccessChoice>(choiceOf(DEFAULT_SETTINGS.accessMode));
  const [keySwitchMode, setKeySwitchMode] = useState<KeySwitchMode>(
    DEFAULT_SETTINGS.accessMode === 'keyboard' ? 'keyboard' : 'switch',
  );
  const [step, setStep] = useState<'form' | 'calibrate'>('form');
  const [voiceChoiceId, setVoiceChoiceId] = useState<string>('');
  const [preferBasicVoice, setPreferBasicVoice] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioResult, setAudioResult] = useState<string | null>(null);
  const [scanSeconds, setScanSeconds] = useState<number>(DEFAULT_SETTINGS.scanIntervalMs / 1000);
  const [voiceURI, setVoiceURI] = useState<string>('');
  const [rate, setRate] = useState<number>(DEFAULT_SETTINGS.rate);
  const [chosenAiMode, setChosenAiMode] = useState<AiMode>(DEFAULT_SETTINGS.aiMode);
  const [consent, setConsent] = useState(false);
  const [sessionLearning, setSessionLearning] = useState(false);
  const [persistChoice, setPersistChoice] = useState<boolean | null>(null);
  const [measurement, setMeasurement] = useState(false);
  const [relationship, setRelationship] = useState<Relationship | ''>('');
  const [place, setPlace] = useState<SettingPlace | ''>('');
  const [name, setName] = useState('');
  const [interests, setInterests] = useState('');
  const [demoUsed, setDemoUsed] = useState(false);

  const liveAvailable = !!serverStatus?.replies.configured;
  const fixtureAvailable = serverStatus ? serverStatus.fixturesEnabled : true;
  const modeAvailable = (m: AiMode) => (m === 'live' ? liveAvailable : m === 'fixture' ? fixtureAvailable : true);
  const aiMode: AiMode = modeAvailable(chosenAiMode) ? chosenAiMode : fixtureAvailable ? 'fixture' : 'local-only';

  // Pre-check "remember" when approved data was found on this device, until the person changes it.
  const persist = persistChoice ?? state.storageStatus === 'loaded';
  const customPhrases = state.savedPhrases.filter((p) => !p.builtIn).length;
  const isDemoProfile = demoUsed && name === DEMO_NAME && interests === DEMO_INTERESTS;

  const accessMode: AccessMode = choice === 'key-switch' ? keySwitchMode : choice;
  // Scan speed only matters for modes where the highlight moves by itself.
  const usesScan = accessMode === 'blink' || accessMode === 'switch';
  const scanValid = !usesScan || (Number.isFinite(scanSeconds)
    && scanSeconds >= SCAN_DEFAULTS.minIntervalMs / 1000 && scanSeconds <= SCAN_DEFAULTS.maxIntervalMs / 1000);
  const needsConsent = aiMode === 'live' && !consent;
  const codeRelevant = !!serverStatus?.accessRequired && aiMode === 'live';
  const needsCode = codeRelevant && runtime.accessCode.trim() === '';
  // The runtime refetches /api/status whenever the access code changes, so this updates by itself.
  const codeRejected = codeRelevant && !needsCode && serverStatus?.accessCodeValid === false;
  const canStart = scanValid && !needsConsent && !needsCode && !codeRejected;
  const savedCalibration = runtime.blink.calibration;
  const savedBrow = runtime.blink.browCalibration;
  // Brow-blink needs both saved calibrations; auto-scan + blink needs only the blink one.
  const savedReady = accessMode === 'brow-blink' ? !!(savedCalibration && savedBrow) : !!savedCalibration;

  // Speech output: ElevenLabs when the server reports it configured, else the labeled basic voice.
  const audio = runtime.audio as StillHereRuntime['audio'] | undefined;
  const elevenConfigured = !!(audio?.elevenLabsConfigured || serverStatus?.speech?.configured);
  const speechProvider: SpeechProvider = elevenConfigured && !preferBasicVoice ? 'elevenlabs' : 'browser';
  const naturalVoices = audio?.voices ?? [];
  const audioLabel = audioStatusLabel(audio);

  const enableAndTest = async () => {
    // Runs directly inside the click/touch handler: iPad Safari only unlocks audio for a
    // genuine user gesture (a helper may tap it). Camera gestures do not count.
    if (!audio) {
      setAudioResult('Audio setup is not available in this build yet. The basic device voice test is below.');
      return;
    }
    setAudioBusy(true);
    setAudioResult(null);
    try {
      const ok = await audio.enableAudio();
      if (!ok) {
        setAudioResult('The browser did not allow audio. Tap Enable audio again; check the mute switch and volume.');
        return;
      }
      // The runtime returns the real preview outcome (contract.ts still types it as void).
      const outcome = await audio.testNaturalVoice(voiceChoiceId || null);
      setAudioResult(audioTestResult(outcome, speechProvider));
    } catch {
      setAudioResult('The voice test failed. Confirmed messages will still be shown as text.');
    } finally {
      setAudioBusy(false);
    }
  };

  const audioTestResult = (outcome: PreviewOutcome | undefined, provider: SpeechProvider): string => {
    switch (outcome) {
      case 'played':
        return provider === 'elevenlabs'
          ? 'Audio enabled and the natural voice test started. Did you hear it? If not, check volume and the silent switch, then tap again.'
          : 'Audio enabled and the natural voice test started. Confirmed messages will use the basic device voice, as chosen.';
      case 'blocked':
        return 'The browser blocked audio. Tap Enable audio again; check the mute switch and volume.';
      case 'not-configured':
        return 'Audio enabled. Natural voice is not configured, so the basic device voice will be used.';
      case 'busy':
        return 'The voice test did not play because a message is being spoken. Try again when it finishes.';
      case 'failed':
        return 'Audio enabled, but the natural voice test did not play. Check the access code and connection; confirmed messages will still be shown as text and the basic device voice is available.';
      default:
        return provider === 'elevenlabs'
          ? 'Audio enabled. Did you hear the natural voice test? If not, check volume and the silent switch, then tap again.'
          : 'Audio enabled. The basic device voice will be used.';
    }
  };

  const useDemo = () => {
    setName(DEMO_NAME);
    setInterests(DEMO_INTERESTS);
    setDemoUsed(true);
  };

  const buildSettings = (mode: AccessMode): Settings => ({
    ...DEFAULT_SETTINGS,
    accessMode: mode,
    scanIntervalMs: Math.round(scanSeconds * 1000),
    voiceURI: voiceURI || null,
    rate,
    speechProvider,
    voiceChoiceId: speechProvider === 'elevenlabs' && voiceChoiceId ? voiceChoiceId : null,
    aiMode,
    cloudConsent: consent,
    sessionAdaptation: sessionLearning,
    persistOnDevice: persist,
    measurement,
    language: voices.find((v) => v.voiceURI === voiceURI)?.lang ?? DEFAULT_SETTINGS.language,
    scope: { relationship: relationship || null, setting: place || null },
    demoProfile: isDemoProfile,
  });

  const enterSession = (mode: AccessMode) => {
    const interestList = interests.split(',').map((s) => s.trim()).filter(Boolean);
    const draft: ProfileDraft | null = name.trim() || interestList.length
      ? { preferredName: name.trim(), interests: interestList }
      : null;
    runtime.startSession(buildSettings(mode), draft);
  };

  const openCalibration = () => {
    // Recalibrating from a finished or failed run starts a fresh pass.
    if (runtime.blink.calibrator.stage !== 'consent') runtime.blink.calibrator.restart(isFaceMode(accessMode) ? accessMode : 'brow-blink');
    setStep('calibrate');
  };

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canStart) return;
    if (!isFaceMode(accessMode)) return enterSession(accessMode);
    if (savedReady) {
      // Start the camera from this click so the browser permission prompt has a user gesture.
      void runtime.blink.startCamera();
      return enterSession(accessMode);
    }
    openCalibration();
  };

  /** From calibration: switch to another method without blaming the person. */
  const fallbackTo = (mode: AccessMode) => {
    if (mode === 'blink') {
      setChoice('blink');
      // Auto-scan + blink needs only the blink calibration; use a saved one if present.
      if (savedCalibration) return enterSession('blink');
      runtime.blink.calibrator.restart('blink');
      return;
    }
    runtime.blink.stopCamera();
    if (mode === 'switch' || mode === 'keyboard') {
      setChoice('key-switch');
      setKeySwitchMode(mode);
    } else {
      setChoice(choiceOf(mode));
    }
    enterSession(mode);
  };

  if (step === 'calibrate' && isFaceMode(accessMode)) {
    return (
      <BlinkCalibration
        runtime={runtime}
        mode={accessMode}
        scanIntervalMs={Math.round((Number.isFinite(scanSeconds) && scanValid ? scanSeconds : DEFAULT_SETTINGS.scanIntervalMs / 1000) * 1000)}
        onComplete={() => enterSession(accessMode)}
        onFallback={fallbackTo}
        onBack={() => setStep('form')}
      />
    );
  }

  return (
    <main className={`setup ${css.setupPage}`} aria-labelledby={`${uid}-title`}>
      <header className="setup-head">
        <p className="wordmark" aria-hidden="true">STILL HERE</p>
        <h1 id={`${uid}-title`}>Set up this session</h1>
        <p className="tagline">Your words. Your choice.</p>
        <p className="principle">AI offers possible words. The person decides what to say. Nothing is spoken without review and a separate confirmation.</p>
        <p className="muted">A helper can complete this form by touch. The microphone and camera are off. The camera turns on only after you choose face control and press “Turn on camera”.</p>
      </header>

      <form className={`setup-form ${css.setupForm}`} onSubmit={start} noValidate>
        <fieldset className={`access-fieldset ${css.accessArea}`}>
          <legend>How will you choose?</legend>
          <label className={`choice choice-hero${choice === 'brow-blink' ? ' is-chosen' : ''}`}>
            <input type="radio" name="access" value="brow-blink" checked={choice === 'brow-blink'} onChange={() => setChoice('brow-blink')} />
            <span>
              <strong className="choice-hero-title">Use eyebrows + blinks <span className="tag">Recommended</span></strong>
              <span className="hint-strong">Raise both eyebrows and hold for half a second to move to the next option. Close your eyes in a long, deliberate blink to select.</span>
              <span className="hint">Ordinary blinks are ignored. Holding your eyebrows up longer still moves only one step.</span>
              <span className="hint">The camera image stays on this device. It detects eyebrow and eye movement only — not who you are, where you look, or emotions. Nothing is recorded.</span>
              <span className="hint">The browser will ask for camera permission; a helper may need to tap Allow. Next comes a short guided calibration and practice.</span>
            </span>
          </label>
          {isFaceMode(accessMode) && savedReady && savedCalibration && (
            <div className="saved-cal info">
              <p>
                Saved calibration from {formatTime(savedCalibration.calibratedAt)} ({describeCalibration(savedCalibration)}
                {accessMode === 'brow-blink' && savedBrow ? `, ${describeBrowCalibration(savedBrow)}` : ''}). You can use it or recalibrate.
              </p>
            </div>
          )}

          <p className={css.altLead}>Other ways to choose — use whichever works best today:</p>
          <div className={css.altGrid}>
            <label className={`choice${choice === 'blink' ? ` ${css.altChosen}` : ''}`}>
              <input type="radio" name="access" value="blink" checked={choice === 'blink'} onChange={() => setChoice('blink')} />
              <span>
                <strong>Auto-scan with blink</strong>
                <span className="hint">The highlight moves by itself; a long, deliberate blink selects. Uses the camera, no eyebrow movement needed.</span>
              </span>
            </label>
            <label className={`choice${choice === 'key-switch' ? ` ${css.altChosen}` : ''}`}>
              <input type="radio" name="access" value="key-switch" checked={choice === 'key-switch'} onChange={() => setChoice('key-switch')} />
              <span>
                <strong>Keyboard / switch</strong>
                <span className="hint">No camera. Switch scanning, or Tab and Enter on a keyboard.</span>
              </span>
            </label>
            <label className={`choice${choice === 'pointer' ? ` ${css.altChosen}` : ''}`}>
              <input type="radio" name="access" value="pointer" checked={choice === 'pointer'} onChange={() => setChoice('pointer')} />
              <span>
                <strong>Touch</strong>
                <span className="hint">Tap choices directly (also mouse, trackpad, or head pointer). No camera.</span>
              </span>
            </label>
          </div>
          {choice === 'key-switch' && (
            <div className={css.subRow} role="radiogroup" aria-label="Keyboard or switch">
              {([
                ['switch', 'Switch scanning — targets highlight in turn; press Space/Enter or a mapped switch'],
                ['keyboard', 'Keyboard — Tab to a control, then Enter or Space'],
              ] as const).map(([value, label]) => (
                <label key={value}>
                  <input type="radio" name="access-keyswitch" value={value} checked={keySwitchMode === value} onChange={() => setKeySwitchMode(value)} />
                  {label}
                </label>
              ))}
            </div>
          )}
          <p className="hint">Every method uses the same full-text review and a separate confirmation before anything is spoken.</p>
          {usesScan && (
            <div className="field">
              <label htmlFor={`${uid}-scan`}>Scan speed (seconds per item)</label>
              <input
                id={`${uid}-scan`} type="number" inputMode="decimal"
                min={SCAN_DEFAULTS.minIntervalMs / 1000} max={SCAN_DEFAULTS.maxIntervalMs / 1000} step={0.25}
                value={Number.isFinite(scanSeconds) ? scanSeconds : ''}
                onChange={(e) => setScanSeconds(e.target.valueAsNumber)}
                aria-describedby={`${uid}-scan-hint`} aria-invalid={!scanValid}
              />
              <p id={`${uid}-scan-hint`} className="hint">
                How long the highlight stays on each item. Between {SCAN_DEFAULTS.minIntervalMs / 1000} and {SCAN_DEFAULTS.maxIntervalMs / 1000} seconds. New screens add a short reading pause. You can change this later in Controls.
              </p>
            </div>
          )}
        </fieldset>

        {/* Wide landscape: this group forms the right column. DOM (reading) order is unchanged. */}
        <div className={css.optionsArea}>
          <fieldset>
            <legend>Voice</legend>
            <div className={css.audioPanel}>
              <h3>{SPEECH_PROVIDER_LABELS.elevenlabs}</h3>
              <p className={css.providerLine} role="status">
                {elevenConfigured
                  ? 'Configured on this server.'
                  : serverStatus || audio
                    ? 'Not configured on this server — the basic device voice will be used, and it will be labeled.'
                    : 'Checking the server…'}
              </p>
              <p className="hint">
                The exact sentence you confirm is sent to ElevenLabs to create the audio; it is AI-generated speech.
                Nothing is sent before you confirm. Camera images never leave this device.
              </p>
              {elevenConfigured && (
                <label className="choice">
                  <input type="checkbox" checked={preferBasicVoice} onChange={(e) => setPreferBasicVoice(e.target.checked)} />
                  <span>
                    <strong>Use the basic device voice instead</strong>
                    <span className="hint">Keeps message text on this device’s speech engine. It sounds more robotic.</span>
                  </span>
                </label>
              )}
              {speechProvider === 'elevenlabs' && naturalVoices.length > 0 && (
                <div className="field">
                  <label htmlFor={`${uid}-nvoice`}>Natural voice</label>
                  <select id={`${uid}-nvoice`} value={voiceChoiceId} onChange={(e) => setVoiceChoiceId(e.target.value)}>
                    <option value="">Server default voice</option>
                    {naturalVoices.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}{v.description ? ` — ${v.description}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button" className={`btn btn-primary ${css.enableAudio}`}
                onClick={() => { void enableAndTest(); }} disabled={audioBusy}
              >
                {audioBusy ? 'Enabling audio…' : 'Enable audio & test voice'}
              </button>
              <p className="hint">On iPad, sound needs one real tap first — a helper may tap this. Camera gestures cannot unlock audio.</p>
              <p className={`${css.audioStatus} ${css[`tone-${audioLabel.tone}`] ?? ''}`} role="status" aria-live="polite">
                {audioLabel.text}
              </p>
              {audio?.message && <p className="hint">{audio.message}</p>}
              {audioResult && <p className="info">{audioResult}</p>}
            </div>

            <div className={css.basicVoice}>
              <h3>{SPEECH_PROVIDER_LABELS.browser}</h3>
              {!runtime.speechAvailable && (
                <p className="warning">The basic device voice is not available in this browser. Confirmed messages will still be shown as text.</p>
              )}
              <div className="field">
                <label htmlFor={`${uid}-voice`}>Device voice</label>
                <select id={`${uid}-voice`} value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}>
                  <option value="">Browser default voice</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang}) · {v.localService ? 'local' : 'network'}{v.default ? ' · default' : ''}
                    </option>
                  ))}
                </select>
                <p className="hint">“Local” voices are processed on this device. “Network” voices may send text to the browser vendor’s speech service.</p>
              </div>
              <div className="field">
                <label htmlFor={`${uid}-rate`}>Speaking rate: {rate.toFixed(1)}×</label>
                <input id={`${uid}-rate`} type="range" min={0.6} max={1.4} step={0.1} value={rate} onChange={(e) => setRate(e.target.valueAsNumber)} />
              </div>
              <button type="button" className="btn" onClick={() => runtime.testVoice(voiceURI || null, rate)} disabled={!runtime.speechAvailable}>
                Test basic voice
              </button>
              <p className="hint">The test says: “{VOICE_TEST_TEXT}” It is not part of the conversation.</p>
            </div>
          </fieldset>

          <fieldset>
            <legend>Where suggestions come from</legend>
            <label className="choice">
              <input type="radio" name="ai" value="live" checked={aiMode === 'live'} disabled={!liveAvailable} onChange={() => setChosenAiMode('live')} />
              <span>
                <strong>Live AI</strong>
                <span className="hint">
                  {liveAvailable
                    ? `Sends conversation text to ${serverStatus?.replies.provider ?? 'the configured service'}${serverStatus?.replies.model ? ` (model: ${serverStatus.replies.model})` : ''}.`
                    : serverStatus ? 'Not configured on this server.' : 'Checking the server…'}
                </span>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="ai" value="fixture" checked={aiMode === 'fixture'} disabled={!fixtureAvailable} onChange={() => setChosenAiMode('fixture')} />
              <span>
                <strong>Fixture demo (labeled scripted suggestions)</strong>
                <span className="hint">{fixtureAvailable ? 'Pre-written examples, always labeled “Fixture demo”. Nothing is sent to an AI service.' : 'Fixtures are turned off on this server.'}</span>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="ai" value="local-only" checked={aiMode === 'local-only'} onChange={() => setChosenAiMode('local-only')} />
              <span>
                <strong>Local only (phrases and my own words)</strong>
                <span className="hint">No suggestions. Saved phrases and the keyboard always work.</span>
              </span>
            </label>
            {serverStatus?.accessRequired && aiMode === 'live' && (
              <div className="field">
                <label htmlFor={`${uid}-code`}>Access code for this deployment</label>
                <input id={`${uid}-code`} type="password" autoComplete="off" value={runtime.accessCode} onChange={(e) => runtime.setAccessCode(e.target.value)} />
                <p className="hint" role="status">
                  {needsCode ? 'Kept for this browser tab only.'
                    : serverStatus?.accessCodeValid === true ? '✓ Access code accepted.'
                      : serverStatus?.accessCodeValid === false ? 'This access code was not accepted. Check it, or choose Fixture demo or Local only.'
                        : 'Checking the code… (we also check it when you start).'}
                </p>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend>Privacy and learning</legend>
            <label className="choice">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                <strong>I consent to sending conversation text (and recorded partner audio, if used) to the configured cloud AI service</strong>
                <span className="hint">Required for Live AI and for recording partner speech. The microphone stays off until a partner presses Talk.</span>
              </span>
            </label>
            {needsConsent && <p className="warning" role="status">Live AI needs this consent. Choose another source or give consent.</p>}
            <label className="choice">
              <input type="checkbox" checked={sessionLearning} onChange={(e) => setSessionLearning(e.target.checked)} />
              <span>
                <strong>Learn wording tendencies during this session (temporary)</strong>
                <span className="hint">Notices patterns such as choosing shorter replies. Nothing is saved without your approval. Cleared when the session ends.</span>
              </span>
            </label>
            <label className="choice">
              <input type="checkbox" checked={persist} onChange={(e) => setPersistChoice(e.target.checked)} />
              <span>
                <strong>Remember approved preferences on this device</strong>
                <span className="hint">Stores only what you approve, in this browser. You can review or delete it any time in Preferences → Memory.</span>
              </span>
            </label>
            {state.storageStatus === 'loaded' && (
              <p className="info">
                Found on this device: {state.approvedPreferences.length} approved preference{state.approvedPreferences.length === 1 ? '' : 's'},{' '}
                {state.approvedProfile.length} profile entr{state.approvedProfile.length === 1 ? 'y' : 'ies'},{' '}
                {customPhrases} custom phrase{customPhrases === 1 ? '' : 's'} (plus {BUILT_IN_PHRASES.length} built-in).
              </p>
            )}
            {state.storageStatus === 'corrupt' && (
              <p className="warning">Saved data on this device could not be read and was not used. Starting with nothing saved; you can delete it from Memory.</p>
            )}
            {state.storageStatus === 'unavailable' && (
              <p className="warning">This browser is not allowing device storage. Everything will last for this session only.</p>
            )}
            <label className="choice">
              <input type="checkbox" checked={measurement} onChange={(e) => setMeasurement(e.target.checked)} />
              <span>
                <strong>Measurement mode</strong>
                <span className="hint">Records timings and counts for evaluation. No message text is included.</span>
              </span>
            </label>
          </fieldset>

          <fieldset>
            <legend>Conversation context (optional)</legend>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`${uid}-rel`}>Talking with</label>
                <select id={`${uid}-rel`} value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship | '')}>
                  <option value="">Anyone</option>
                  {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${uid}-place`}>Setting</label>
                <select id={`${uid}-place`} value={place} onChange={(e) => setPlace(e.target.value as SettingPlace | '')}>
                  <option value="">Anywhere</option>
                  {SETTINGS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Profile draft (optional, helper-entered)</legend>
            <p className="draft-note">Draft — the user approves it later in Preferences → Memory. It is not used for suggestions until approved.</p>
            <div className="field">
              <label htmlFor={`${uid}-name`}>Preferred name</label>
              <input id={`${uid}-name`} type="text" autoComplete="off" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`${uid}-int`}>Interests (comma-separated)</label>
              <input id={`${uid}-int`} type="text" autoComplete="off" value={interests} maxLength={400} onChange={(e) => setInterests(e.target.value)} />
            </div>
            <button type="button" className="btn btn-quiet" onClick={useDemo}>Use fictional demo profile</button>
            {isDemoProfile && (
              <p className="hint">Fictional demo profile filled in. It does not turn on learning or saving.</p>
            )}
          </fieldset>
        </div>

        <div className={`setup-actions ${css.actionsArea}`}>
          <button type="submit" className="btn btn-primary btn-large" disabled={!canStart} aria-describedby={`${uid}-start-hint`}>
            {!isFaceMode(accessMode) ? 'Start session'
              : savedReady ? 'Start with saved calibration'
                : accessMode === 'brow-blink' ? 'Next: set up eyebrow + blink control' : 'Next: set up blink control'}
          </button>
          {isFaceMode(accessMode) && savedReady && (
            <button type="button" className="btn" disabled={!canStart} onClick={openCalibration}>Recalibrate</button>
          )}
          <p id={`${uid}-start-hint`} className="hint">
            {!scanValid ? 'Enter a scan speed in the allowed range. '
              : needsConsent ? 'Live AI needs cloud consent. '
                : needsCode ? 'Enter the access code. '
                  : codeRejected ? 'The access code was not accepted. ' : ''}
            Suggestions: {aiMode === 'live' ? 'Live AI' : aiMode === 'fixture' ? 'Fixture demo' : 'Local only'}.
            {' '}Voice: {SPEECH_PROVIDER_LABELS[speechProvider]}.
            {audio && !audio.unlocked ? ' Audio is not enabled yet — on iPad, tap “Enable audio & test voice” first or confirmed messages may stay silent.' : ''}
          </p>
        </div>
      </form>
    </main>
  );
}
