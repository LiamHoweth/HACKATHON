# Presentation log

This is a living journal of features, claims, and evidence. Build, verification, and measurement are separate dimensions. "Implemented" does not mean tested. A mocked or synthetic test is not browser, camera, or hardware verification. Update each entry when its status changes. Never backfill evidence that does not exist.

Started 2026-10-24 ~11:00 CT. **Reframed for the blink-first brief at 11:30 CT; blink entries refreshed at 11:35 from the uncommitted blink modules.** Blink entries come first because blink is the flagship input and the judging demo. Test results come from [TEST_RESULTS.md](TEST_RESULTS.md). The 82/82 unit run at 11:25 was done by the docs workstream on the working tree.

---

## Feature: Blink detection (local MediaPipe face landmarker + eye-closure scoring)
Build status: in progress (uncommitted at 11:30)
Verification: not run
Measurement: not measured

Human problem: Some people who cannot type or press a switch reliably can still close their eyes on purpose.
Practical or emotional significance: Hands-free participation, with a laptop webcam and no special hardware.
Implemented behavior (uncommitted): MediaPipe Face Landmarker in `VIDEO` mode with `numFaces: 2`, running in the browser from local, pinned assets, GPU with CPU fallback. Score = min(`eyeBlinkLeft`, `eyeBlinkRight`) from 0 open to 1 closed, so winks don't count. Face count is reported. No images are kept.
Code/commit references: `src/access/blink-detector.ts`, `public/models/`, `public/wasm/`, `scripts/copy-mediapipe-assets.mjs`, `src/runtime/contract.ts`. All uncommitted at 11:35.
Tests actually run and outcomes: none
Evidence files or recordings: none
Observed measurements and conditions: none
Useful live-demo moment: The status line changes from "Position your face" to "Ready". There is no giant camera feed.
Technical difficulty or decision: Serving the WASM and model locally so there is no runtime CDN dependency (D20). Keeping inference from disturbing scan timing.
Known limitations: Lighting, glasses, angle, and fatigue are untested. Not gaze tracking or a clinical switch.
Potential judge question: "Is the camera recording me?"
Claim we can support now: We are building local, in-browser eye-closure detection with pinned MediaPipe 1.1.1 assets.
Claim we must not make yet: That frames never leave the device (until the network log is checked), or any accuracy.
Next verification step: Real webcam on the demo laptop. Network log during use (SYS-13).

## Feature: Blink gesture state machine (select at closure onset)
Build status: implemented as a pure module (uncommitted); runtime wiring in progress
Verification: unit/synthetic (ACCESS-10/11 pass, 11:32). Not camera-verified
Measurement: not measured

Human problem: Natural blinks must not select anything, and the highlight must not move under a deliberate closure.
Implemented behavior: closure onset emits `closure-start` (the integration snapshots the target). A closure under the minimum (default 600 ms) is an ordinary blink and is ignored. Over the maximum (default 2,500 ms) it is discarded. A valid reopening emits one `select`, then an 800 ms cooldown that re-arms only with eyes open. Face missing for more than 500 ms → discard and face lost. Reacquisition alone selects nothing. Multiple faces → discard and hold. Stale or out-of-order frames → discard.
Code/commit references: `src/access/blink-gesture.ts` (uncommitted)
Tests actually run and outcomes: `blink-gesture.test.ts` passed in the 106/106 run at 11:32 (synthetic frames, simulated integration)
Useful live-demo moment: Close eyes on a card while the highlight would have moved on. The card selected is the one highlighted at closure onset.
Technical difficulty or decision: One gesture equals one input cycle, so the existing fresh-confirmation guard (D16) applies. Multiple faces = hold (D22, confirmed in code).
Known limitations: Thresholds are prototype defaults, not clinical values. Synthetic sequences are not real eyes.
Potential judge question: "Could a normal blink speak something?"
Claim we can support now: The design requires a deliberate closure to select and a separate later closure to confirm.
Claim we must not make yet: That it never misfires. Not measured.
Next verification step: Runtime wiring, then the real-webcam reliability gate.

## Feature: Guided blink calibration
Build status: logic implemented (`src/access/blink-calibration.ts`); UI in progress (`src/components/BlinkCalibration.tsx`); uncommitted
Verification: synthetic (calibration tests pass, 11:32). Not camera-verified
Measurement: not measured

Human problem: Blink timing differs from person to person. One fixed threshold would fail many people.
Implemented behavior (planned): consent → position face → open-eye baseline → natural blinks → comfortable deliberate closures → review (adjustable minimum closure) → practice select → separate practice confirm → start. If natural and deliberate closures overlap, calibration fails openly and offers keyboard/switch (D23).
Code/commit references: `src/access/blink-calibration.ts`, `CalibrationStage` in `src/runtime/contract.ts`
Tests actually run and outcomes: overlap, weak-signal, and too-few-samples cases fail openly. Scalar-only storage parsing (synthetic)
Useful live-demo moment: Show the practice select followed by a separate practice confirm.
Known limitations: A helper may be needed for the browser permission prompt. One team tester is not a population.
Potential judge question: "Can someone with ALS use it?"
Claim we can support now: Calibration is individual and can fail openly.
Claim we must not make yet: That it works for people with ALS, or for every team member.
Next verification step: ACCESS-12 and ACCESS-15 on the demo laptop.

## Feature: Blink status UI and blink-first setup
Build status: in progress (`accessMode` default `'blink'`, uncommitted)
Verification: not run
Measurement: not measured

Implemented behavior (planned): text states Ready / Closing / Selected / Cooldown / Face lost (paused) / Multiple faces, with no confidence percentages. **Use eye blinks** is the first setup choice and **Use keyboard/switch instead** is always visible. The camera starts only after consent.
Claim we must not make yet: That the states are readable at speaking distance (ACCESS-14 not run).
Next verification step: Browser plus camera pass. Screenshots only of the real UI.

## Feature: Blink reliability gate
Build status: not started
Verification: not run
Measurement: **not measured**

Procedure: 20 intentional selections, ordinary blinking, and tracking loss/recovery ([TEST_PLAN.md](TEST_PLAN.md#blink-reliability-gate)). Missed gestures, false selections, and false confirmations are recorded separately, plus gesture duration and scan wait.
Claim we must not make yet: Any reliability number until it is in TEST_RESULTS. Passing does not validate use by people with ALS.

---

## Feature: Exact review and separate confirmation
Build status: implemented
Verification: unit (CORE-03 to CORE-09 passing) and browser (pointer and synthesized switch keys)
Measurement: not measured
Implemented behavior: Selection opens a frozen review starting on Cancel. **Speak** needs a different input cycle/event, the current surface revision, the same session epoch, and 600 ms of arming. One `speak` per confirmation.
Browser evidence: a held key with 20 repeats produced one activation. A separate press on Speak spoke the exact text.
Useful live-demo moment: Blink on a card, point out that nothing has been spoken, then blink again on Speak.
Claim we can support now: Two-step authorization is enforced in one reducer, and unit and browser checks pass.
Claim we must not make yet: That it is proven with blinks or physical switches.

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

## Feature: Speech synthesis and delivery status
Build status: implemented
Verification: browser callbacks only. **Audible output not confirmed**
Claim we must not make yet: That speech is audible or local on the demo machine.
Next verification step: Listen on the demo laptop. Record the voice and `localService`.

## Feature: Partner recording and transcription
Build status: implemented
Verification: live server path (synthetic clip, exact transcript). Browser microphone not exercised
Claim we can support now: Typed partner input works. Server transcription works with synthetic audio.

## Feature: Privacy controls, access gate, Railway
Build status: implemented. Deployed 11:15 CT. **Redeploy pending** (audit fixes at 11:23 and blink work)
Verification: Railway smoke test (401 without code, including with a spoofed Host; 200 with code)
Claim we can support now: Keys stay on the server, logs are content-free, and the access code is enforced.

## Feature: Measurement mode
Build status: reducer events and export present. Verification: not run. Measurement: **not measured.**

## Feature: Native iOS client (experimental, not in demo)
Build status: SwiftUI client in `ios/` (commit `5fd9d2d`), built earlier at Liam's request
Verification: builds. 9 Swift Testing tests pass on the iPhone 17 Pro simulator. Never run on screen. Not connected end to end
Claim we must not make: That there is a working mobile app. Do not show it in the demo (D26).
