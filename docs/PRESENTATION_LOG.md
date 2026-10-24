# Presentation log

This is a living journal of features, claims, and evidence. Build, verification, and measurement are separate dimensions. "Implemented" does not mean tested. A mocked or synthetic test is not browser, iPad, or hardware verification. A desktop browser pass is not an iPad pass. Update each entry when its status changes. Never backfill evidence that does not exist.

Started 2026-10-24 ~11:00 CT. Reframed for the blink-first brief at 11:30. **Reframed for the iPad eyebrow + blink + ElevenLabs brief at 12:05 CT; refreshed at 12:10 from the uncommitted working tree.** The iPad gesture and voice entries come first because they are the flagship interaction and the judging demo. Test results come from [TEST_RESULTS.md](TEST_RESULTS.md).

---

## Feature: Eyebrow NEXT (500 ms both-brow raise)
Build status: in progress (`src/access/brow-gesture.ts`, uncommitted at 12:05)
Verification: not run
Measurement: not measured

Human problem: Waiting for an auto-scan highlight to come around costs time and attention. Some people can move when they are ready with a simple facial gesture.
Practical or emotional significance: The person sets the pace of navigation, with no special hardware beyond an iPad.
Implemented behavior (in progress): score = max(`browInnerUp`, mean of `browOuterUpLeft`/`browOuterUpRight`). NEUTRAL → RISING when the calibrated raised threshold is crossed → after a continuous 500 ms hold (monotonic timestamps), one proposed NEXT → LATCHED, so a long hold never repeats → stable release plus cooldown → rearmed. A raise shorter than 500 ms shows progress and does nothing. A neutral frame is required after any reset, so a raise held across a screen change, face loss, or blink never carries over.
Code/commit references: `src/access/brow-gesture.ts`, `BrowCalibration` in `src/runtime/contract.ts` (uncommitted)
Tests actually run and outcomes: none recorded. `brow-gesture.test.ts` (GEST-01 to 04, 07) written, uncommitted, not yet run by the integrator
Evidence files or recordings: none
Observed measurements and conditions: none
Useful live-demo moment: The progress ring fills while the brows are up, then "Eyebrow raise detected — Next" and the highlight moves exactly one card.
Technical difficulty or decision: Telling a deliberate raise from brows moving during speech; hysteresis and a release requirement (D27).
Known limitations: Defaults are prototype values. Glasses, lighting, and speech movement are untested. Not everyone can raise their eyebrows.
Potential judge question: "Why half a second? How reliable is it?"
Claim we can support now: We are building a calibrated 500 ms eyebrow hold that moves exactly one step.
Claim we must not make yet: Any reliability, or that it works on an iPad.
Next verification step: Fake-clock tests GEST-01 to GEST-04, then iPad trial part A.

## Feature: Gesture arbiter (one command per physical gesture)
Build status: in progress (`src/access/gesture-arbiter.ts`, uncommitted at 12:05)
Verification: not run
Measurement: not measured

Human problem: A raised brow and a closing eyelid must never count as two actions, or move the highlight just before a selection.
Implemented behavior (in progress): the only emitter of accepted gesture commands. Blink closure onset freezes the highlight and cancels an unfinished raise. No NEXT is accepted during a closure. A raise and a closure that start within a short window are ambiguous: both are dropped, with calm feedback. Accepted feedback ("Eyebrow raise detected — Next", "Blink detected — Selected") is shown only after acceptance. Reset on a new surface or session invalidates both (D33).
Tests actually run and outcomes: none recorded. `gesture-arbiter.test.ts` (GEST-05 to 07) written, uncommitted, not yet run by the integrator
Claim we must not make yet: That a misfire can't happen.
Next verification step: Arbiter unit tests, then iPad trial parts C and D.

## Feature: Long-blink SELECT (gesture state machine)
Build status: implemented (`src/access/blink-gesture.ts`, commits `2230926`, `08c6abc`)
Verification: synthetic (ACCESS-10/11 pass in the 134/134 run at 11:50). Not camera-verified. Not iPad-verified
Measurement: not measured

Human problem: Natural blinks must not select anything, and the target must not change under a deliberate closure.
Implemented behavior: closure onset marks the target. A closure under the minimum is an ordinary blink and is ignored. An overlong closure is discarded. A valid reopening emits one `select`, then a cooldown that re-arms only with eyes open. Face missing → discard and face lost. Reacquisition alone selects nothing. Multiple faces → hold. Stale or out-of-order frames → discard. Defaults in D21.
Useful live-demo moment: On review, an eyebrow raise reaches Speak, and only a new long blink speaks.
Known limitations: Defaults are prototype values. Synthetic sequences are not real eyes.
Potential judge question: "Could a normal blink speak something?"
Claim we can support now: The design requires a deliberate closure to select and a separate later closure to confirm.
Claim we must not make yet: That it never misfires.
Next verification step: iPad trial part B.

## Feature: Guided calibration (blink, plus brow in progress)
Build status: blink logic and UI implemented (`src/access/blink-calibration.ts`, `src/components/BlinkCalibration.tsx`). Brow calibration in progress (`src/access/brow-calibration.ts`, uncommitted)
Verification: blink: synthetic (calibration tests pass). Brow: not run. Not iPad-verified
Measurement: not measured

Human problem: Timing and range differ from person to person. One fixed threshold would fail many people.
Implemented behavior: consent → position face → neutral → natural blinks → deliberate closures → review → practice select → separate practice confirm. Brow stages (neutral samples, comfortable raises, 500 ms practice) are being added. Calibration fails openly when signals overlap (D23).
Known limitations: A helper may be needed for the camera prompt. One team tester is not a population.
Claim we must not make yet: That it works for people with ALS, or for every team member.
Next verification step: ACCESS-12/15 and brow calibration on the iPad.

## Feature: Live camera preview (top right) and gesture feedback
Build status: in progress (`src/components/CameraPreview.tsx`, `GestureFeedback.tsx`, uncommitted)
Verification: not run
Measurement: not measured

Human problem: People need to see that tracking works without a giant camera feed covering the conversation.
Implemented behavior (planned): a small mirrored, muted, inline live view at the top right, hideable, with states: camera off, position your face, face detected / ready, brow progress, "Eyebrow raise detected — Next", "Blink detected — Selected", tracking lost — paused, and audio states. No REC label because nothing is recorded.
Claim we must not make yet: That it doesn't cover content on every iPad size, or that frames never leave the device (until SYS-13).
Next verification step: IPAD-01/02 on the iPad. Screenshots only of the real UI.

## Feature: ElevenLabs natural voice
Build status: in progress (`src/app/api/speech/`, `src/app/api/voices/`, `src/server/elevenlabs/`, `src/audio/eleven-player.ts`; uncommitted at 12:10)
Verification: **not configured** (no key). Live voice **not verified**. Mock tests written (`speech-api.test.ts`, `eleven-player.test.ts`), not yet run by the integrator
Measurement: not measured

Human problem: A robotic voice makes it harder to be heard as yourself in a conversation.
Practical or emotional significance: Humor, warmth, and disagreement come through better in a natural voice, as long as the words are exactly the person's.
Implemented behavior (planned): after the second confirmation, the client sends the confirmed utterance to `POST /api/speech`. The server checks the access code, the text bounds, an allowed voice, and the character budget, then calls ElevenLabs (`eleven_v4_turbo` over the Text-to-Dialogue WebSocket; `ELEVENLABS_TRANSPORT=http` switches to another, labeled ElevenLabs model, because v4 Turbo has no documented HTTP route) with exactly that text, waits for the final marker, checks the MP3, and returns one `audio/mpeg` response (D30). One audio controller plays it once. Stop invalidates late results.
Tests actually run and outcomes: none
Evidence files or recordings: none
Useful live-demo moment: The exact confirmed sentence spoken in a natural adult voice.
Technical difficulty or decision: Text-to-Dialogue WebSocket vs the standard TTS WebSocket; Node's built-in WebSocket can't set headers, so the key goes in the first message, never the URL; the ElevenLabs docs disagree on whether this socket accepts v4 ids (only the live check settles it); iPad Safari playback (D28, D30).
Known limitations: Needs the network. Generated speech can mispronounce or drop words. ElevenLabs' retention depends on the plan (D35).
Potential judge question: "Is the voice natural? Is it cloned? What goes to ElevenLabs?"
Claim we can support now: ElevenLabs is the chosen voice, and only the confirmed sentence is meant to be sent.
Claim we must not make yet: That it sounds natural, plays on the iPad, or is low-latency.
Next verification step: Key → one live line → TTS-08/09/10 on the iPad.

## Feature: iPad audio setup (Enable Audio / Test Voice)
Build status: in progress (`src/runtime/useAudio.ts`, `AudioRuntime.enableAudio` in the contract; uncommitted)
Verification: **not iPad-verified**
Measurement: not measured

Human problem: iPad Safari may block audio that a real touch did not start, and a camera gesture may not count.
Implemented behavior (planned): one genuine touch during setup initializes the audio element and plays a test line. If Safari later blocks playback, the app shows "Audio blocked" instead of claiming it spoke.
Claim we must not make yet: That the demo is audible and fully hands-free after setup.
Next verification step: TTS-08 on the iPad, including after background/resume and rotation.

## Feature: Basic device voice fallback
Build status: speech controller implemented (browser `speechSynthesis`). Labeled fallback after a natural-voice failure, with a fresh review and confirmation, in progress (`src/core/reducer.ts`, uncommitted)
Verification: browser callbacks only. **Audible output not confirmed**. Not iPad-verified
Measurement: not measured
Implemented behavior: always labeled "basic device voice". Never replaces ElevenLabs silently. After a failure that may have partly played, it needs its own review and confirmation (TTS-07).
Claim we must not make yet: That speech is audible or local on the iPad.
Next verification step: TTS-07 unit test, then listen on the iPad.

## Feature: iPad acceptance trial (§24)
Build status: not started
Verification: not run
Measurement: **not measured**

Procedure: 20 eyebrow raises, 20 long-blink selections, 2 minutes of normal movement, face-loss recovery, and a hands-free 3-turn conversation with ElevenLabs audio ([TEST_PLAN.md](TEST_PLAN.md#ipad-acceptance-trial-24)). Missed commands, inadvertent NEXTs, wrong-target selections, false confirmations, and unintended speech are recorded separately.
Claim we must not make yet: Any reliability number until it is in TEST_RESULTS. Passing does not validate use by people with ALS.

## Feature: Local face landmarker (MediaPipe)
Build status: implemented (`src/access/blink-detector.ts`, commit `2230926`; brow score added in the working tree)
Verification: model created in a desktop browser pane; one blank frame returned 0 faces; assets served from Railway (11:46). No real camera frames processed
Measurement: not measured
Implemented behavior: Face Landmarker in `VIDEO` mode with `numFaces: 2`, from local, pinned assets, GPU with CPU fallback. Eye-closure score = min(`eyeBlinkLeft`, `eyeBlinkRight`), so winks don't count. Brow score as above. Face count reported. No images kept.
Claim we must not make yet: That frames never leave the device (until SYS-13), or any accuracy.
Next verification step: Real frames on the iPad. Network log (SYS-13).

## Feature: Auto-scan + blink (fallback)
Build status: implemented (blink-first build). Off in eyebrow mode (D31)
Verification: synthetic (scan attribution and timing tests). Not camera-verified
Claim we can support now: A tested timer-driven alternative for people who find eyebrow raises hard.
Next verification step: Run it once on the iPad as the rehearsed fallback.

---

## Feature: Exact review and separate confirmation
Build status: implemented
Verification: unit (CORE-03 to CORE-09 passing) and browser (pointer and synthesized switch keys)
Measurement: not measured
Implemented behavior: Selection opens a frozen review starting on Cancel. **Speak** needs a different input cycle/event, the current surface revision, the same session epoch, and 600 ms of arming. One `speak` per confirmation.
Browser evidence: a held key with 20 repeats produced one activation. A separate press on Speak spoke the exact text.
Useful live-demo moment: Long-blink a card, point out that nothing has been spoken, raise eyebrows to Speak, then blink again.
Claim we can support now: Two-step authorization is enforced in one reducer, and unit and browser checks pass.
Claim we must not make yet: That it is proven with eyebrow/blink gestures or physical switches.

## Feature: Semantic regeneration ("None of these"), guidance, change wording
Build status: implemented
Verification: unit (GEN-01/02/03/05/06/07/10 passing), browser (fixture), live scenarios 3, 4, and 13
Measurement: not measured
Claim we can support now: Rejections are scoped to one question. Explicit direction persists across regeneration. In 14 synthetic live scenarios, Disagree stayed disagreement and the rejected batch got new meanings (Claude's observations, not human judgment).
Claim we must not make yet: That live suggestions are always semantically diverse or always follow guidance.

## Feature: Quick phrases, saved phrases, My words
Build status: implemented
Verification: unit (CONV-03/04/08, ACCESS-04 passing), browser (pointer/scripted)
Measurement: not measured
Claim we can support now: No AI needed. Drafts survive interruptions. The same review/confirm path applies.
Claim we must not make yet: Offline after reload, or typing speed.

## Feature: Start a conversation, staging, parking, history
Build status: implemented
Verification: unit (CONV-01/02/05/06/10, AUD-2 passing), browser (pointer/scripted)
Measurement: not measured
Claim we can support now: Initiation creates no fake partner turn. Active work is never silently replaced.

## Feature: Consented adaptation and approved preferences
Build status: implemented
Verification: unit (PREF-03 to 08, 12, 13, 15 passing), browser (fixture: 3 "Shorter" turns → proposal → explicit approval → request carried `length=short`)
Measurement: not measured
Claim we can support now: Nothing persists without explicit approval. Approved policy reaches the request.
Claim we must not make yet: Persistence across reload, or that the live model complies.

## Feature: Live AI suggestions (OpenAI)
Build status: implemented (`src/server/provider.ts`)
Verification: **live** (local and Railway, synthetic inputs), unit (mocked fetch)
Measurement: single observations of ~4 s per batch. These are not a latency measurement
Implemented behavior: Responses API, `gpt-6-astra`, `store: false`, strict `json_schema`, no tools, one repair, strict validation, app-assigned IDs.
Evidence: [evidence/live-scenarios.json](evidence/live-scenarios.json) (14/14 valid. Human judgments not recorded).
Claim we must not make yet: Quality ratings, or retention guarantees beyond "`store: false` is set".

## Feature: Fixture demo mode
Build status: implemented. Verification: browser (label visible). Claim: canned, clearly labeled suggestions, never substituted for live failures.

## Feature: Switch/keyboard scanning (fallback inputs)
Build status: implemented
Verification: browser (synthesized key events), unit (ACCESS-04/07)
Claim we can support now: One scan timer. A held key activates once.
Claim we must not make yet: Compatibility with external switch hardware.

## Feature: Partner recording and transcription
Build status: implemented
Verification: live server path (synthetic clip, exact transcript). Browser microphone not exercised
Claim we can support now: Typed partner input works. Server transcription works with synthetic audio.

## Feature: Privacy controls, access gate, Railway (HTTPS for the iPad)
Build status: implemented. Deployed; blink assets served by 11:46 CT. **Redeploy pending** for the eyebrow, iPad UI, and ElevenLabs work
Verification: Railway smoke test 11:18 (401 without code, including with a spoofed Host; 200 with code). Blink assets HTTP 200 at 11:46
Claim we can support now: Keys stay on the server, logs are content-free, and the access code is enforced. Railway's HTTPS origin is what lets iPad Safari use the camera (D29).
Claim we must not make yet: That `/api/speech` is protected, until it is deployed and smoke-tested.

## Feature: Measurement mode
Build status: reducer events and export present. Verification: not run. Measurement: **not measured.**

## Feature: Native iOS client (experimental, not in demo)
Build status: SwiftUI client in `ios/` (commit `5fd9d2d`), built earlier at Liam's request
Verification: builds. 9 Swift Testing tests pass on the iPhone 17 Pro simulator. Never run on screen. Not connected end to end
Claim we must not make: That there is a working native app. Do not show it in the demo (D26, D32). The iPad demo is the web app in Safari.
