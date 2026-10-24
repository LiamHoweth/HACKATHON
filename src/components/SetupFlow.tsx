'use client';

import { useId, useState } from 'react';
import type { StillHereRuntime } from '@/runtime/contract';
import { VOICE_TEST_TEXT } from '@/runtime/contract';
import { DEFAULT_SETTINGS } from '@/core/state';
import type { Settings } from '@/core/state';
import { RELATIONSHIPS, SETTINGS } from '@/core/types';
import type { AccessMode, AiMode, ProfileDraft, Relationship, SettingPlace } from '@/core/types';
import { SCAN_DEFAULTS } from '@/core/limits';
import { BUILT_IN_PHRASES } from '@/core/phrases';

const DEMO_NAME = 'Sam (fictional)';
const DEMO_INTERESTS = 'jazz, basketball, cooking';

export function SetupFlow({ runtime }: { runtime: StillHereRuntime }) {
  const { state, serverStatus, voices } = runtime;
  const uid = useId();

  const [accessMode, setAccessMode] = useState<AccessMode>(DEFAULT_SETTINGS.accessMode);
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

  const scanValid = Number.isFinite(scanSeconds)
    && scanSeconds >= SCAN_DEFAULTS.minIntervalMs / 1000 && scanSeconds <= SCAN_DEFAULTS.maxIntervalMs / 1000;
  const needsConsent = aiMode === 'live' && !consent;
  const needsCode = !!serverStatus?.accessRequired && aiMode === 'live' && runtime.accessCode.trim() === '';
  const canStart = scanValid && !needsConsent && !needsCode;

  const useDemo = () => {
    setName(DEMO_NAME);
    setInterests(DEMO_INTERESTS);
    setDemoUsed(true);
  };

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canStart) return;
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      accessMode,
      scanIntervalMs: Math.round(scanSeconds * 1000),
      voiceURI: voiceURI || null,
      rate,
      aiMode,
      cloudConsent: consent,
      sessionAdaptation: sessionLearning,
      persistOnDevice: persist,
      measurement,
      language: voices.find((v) => v.voiceURI === voiceURI)?.lang ?? DEFAULT_SETTINGS.language,
      scope: { relationship: relationship || null, setting: place || null },
      demoProfile: isDemoProfile,
    };
    const interestList = interests.split(',').map((s) => s.trim()).filter(Boolean);
    const draft: ProfileDraft | null = name.trim() || interestList.length
      ? { preferredName: name.trim(), interests: interestList }
      : null;
    runtime.startSession(settings, draft);
  };

  return (
    <main className="setup" aria-labelledby={`${uid}-title`}>
      <header className="setup-head">
        <p className="wordmark" aria-hidden="true">STILL HERE</p>
        <h1 id={`${uid}-title`}>Set up this session</h1>
        <p className="tagline">Your words. Your choice.</p>
        <p className="principle">AI offers possible words. The person decides what to say. Nothing is spoken without review and a separate confirmation.</p>
        <p className="muted">A helper can complete this form. Microphone and camera are off; nothing here asks for either permission.</p>
      </header>

      <form className="setup-form" onSubmit={start} noValidate>
        <fieldset>
          <legend>How will you make selections?</legend>
          {([
            ['switch', 'Switch scanning', 'Targets are highlighted in turn. Press Space or Enter (or a switch mapped to them) to choose.'],
            ['keyboard', 'Keyboard', 'Tab to a control and press Enter or Space.'],
            ['pointer', 'Pointer', 'Mouse, touch, trackpad, or head pointer.'],
          ] as const).map(([value, label, hint]) => (
            <label key={value} className="choice">
              <input type="radio" name="access" value={value} checked={accessMode === value} onChange={() => setAccessMode(value)} />
              <span><strong>{label}</strong><span className="hint">{hint}</span></span>
            </label>
          ))}
          <div className="field">
            <label htmlFor={`${uid}-scan`}>Scan speed (seconds per target)</label>
            <input
              id={`${uid}-scan`} type="number" inputMode="decimal"
              min={SCAN_DEFAULTS.minIntervalMs / 1000} max={SCAN_DEFAULTS.maxIntervalMs / 1000} step={0.25}
              value={Number.isFinite(scanSeconds) ? scanSeconds : ''}
              onChange={(e) => setScanSeconds(e.target.valueAsNumber)}
              aria-describedby={`${uid}-scan-hint`} aria-invalid={!scanValid}
            />
            <p id={`${uid}-scan-hint`} className="hint">
              Between {SCAN_DEFAULTS.minIntervalMs / 1000} and {SCAN_DEFAULTS.maxIntervalMs / 1000} seconds. New screens add a short reading pause. You can change this later in Controls.
            </p>
          </div>
        </fieldset>

        <fieldset>
          <legend>Voice</legend>
          {!runtime.speechAvailable && (
            <p className="warning">Speech output is not available in this browser. Confirmed messages will be shown as text.</p>
          )}
          <div className="field">
            <label htmlFor={`${uid}-voice`}>Voice</label>
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
            Test voice
          </button>
          <p className="hint">The test says: “{VOICE_TEST_TEXT}”</p>
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
              <p className="hint">Kept for this browser tab only.</p>
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

        <div className="setup-actions">
          <button type="submit" className="btn btn-primary btn-large" disabled={!canStart} aria-describedby={`${uid}-start-hint`}>
            Start session
          </button>
          <p id={`${uid}-start-hint`} className="hint">
            {!scanValid ? 'Enter a scan speed in the allowed range. '
              : needsConsent ? 'Live AI needs cloud consent. '
                : needsCode ? 'Enter the access code. ' : ''}
            Suggestions: {aiMode === 'live' ? 'Live AI' : aiMode === 'fixture' ? 'Fixture demo' : 'Local only'}.
          </p>
        </div>
      </form>
    </main>
  );
}
