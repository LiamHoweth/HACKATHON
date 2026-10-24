# Presentation log

This is a living journal of features, claims, and evidence. Build, verification, and measurement are separate dimensions. "Implemented" does not mean tested. A synthetic or mocked test is not camera, iPad, or hardware verification. An iPad **Simulator** capture is not a physical iPad pass. A desktop browser pass is not an iPad pass. Never backfill evidence that does not exist.

Started 2026-10-24 ~11:00 CT. Reframed for the iPad eyebrow + blink + ElevenLabs brief at 12:05 CT. **Refreshed 12:20 CT against commit `5de1a57`**, a fresh `npx vitest run` (12:18 CT: **285/285 passed in 17 files**, synthetic frames and mocked providers), Railway deployment `f65385bb`, and the untracked iPad Simulator screenshots in `docs/screenshots/ipad-sim-*.png`. Executed checks belong in [TEST_RESULTS.md](TEST_RESULTS.md); the 12:18 vitest run and the 12:20 Railway probe below are not yet recorded there.

Verification levels used here: **unit** (pure logic, fake clock), **synthetic** (scripted landmark/blendshape frames through the real detectors and arbiter), **mocked provider** (fetch/WebSocket stubbed), **live (synthetic input)** (real provider, scripted text or audio), **browser** (desktop pane), **iPad Simulator** (Safari in Xcode's simulator: no camera, simulated audio), **iPad** (physical device). Only the last one is an iPad verification.

## Summary at 12:20 CT

| Feature | Build | Verification | Measurement |
| --- | --- | --- | --- |
| Eyebrow NEXT (500 ms) | implemented (`5de1a57`) | unit + synthetic | not measured |
| Long-blink SELECT | implemented (`2230926`, `08c6abc`, `5de1a57`) | unit + synthetic | not measured |
| Gesture arbiter | implemented (`5de1a57`) | unit + synthetic pipeline | not measured |
| Calibration (brow + blink) | implemented | unit + synthetic; UI rendered in iPad Simulator without camera | not measured |
| iPad layout + live preview | implemented | iPad Simulator screenshots (touch, fixture, no camera) | not measured |
| ElevenLabs speech | implemented | mocked provider only. **Live verification blocked: `ELEVENLABS_API_KEY` not configured** | not measured |
| Basic device voice fallback | implemented | unit (TTS-07) + mocked routing; iPad Simulator showed "Audio enabled. The basic device voice will be used." | not measured; audible output not confirmed |
| Railway deployment | deployed `f65385bb` (12:13 CT) | live HTTP probe 12:20 (status, voices, speech validation) | not measured |
| Live OpenAI suggestions + transcription | implemented | live (synthetic input), 11:18–11:35 CT, before the 12:13 redeploy | single observations only |
| Physical iPad trial (§24) | not started | not run | **not measured** |

---

## Feature: Eyebrow NEXT (500 ms both-brow raise)
Build status: implemented
Verification: unit + synthetic (285/285 at 12:18 CT). Not camera-verified. Not iPad-verified
Measurement: not measured

Human problem: Waiting for an auto-scan highlight to come around costs time and attention. Some people can move when they are ready with a simple facial gesture.
Practical or emotional significance: The person sets the pace of navigation with no hardware beyond an iPad.
Implemented behavior: score = max(`browInnerUp`, mean of `browOuterUpLeft`/`browOuterUpRight`). NEUTRAL → RISING when the calibrated raised threshold is crossed → after a continuous 500 ms hold on frame timestamps, one proposed NEXT → LATCHED, so a long hold never repeats → stable release (250 ms default) plus cooldown (500 ms default) → rearmed. A raise shorter than 500 ms shows progress only. A neutral frame is required after any reset, so a raise held across a screen change, face loss, or blink never carries over. Frame gaps over 700 ms cancel a raise. In brow-blink mode nothing moves on a timer; the highlight starts on the first (safe) target and wraps.
Code/commit references: `src/access/brow-gesture.ts`, manual stepping in `src/runtime/useBlink.ts`, `BrowCalibration` in `src/runtime/contract.ts`; commit `5de1a57`
Tests actually run and outcomes: `src/tests/brow-gesture.test.ts` (25 tests: GEST-01 499 ms gives no NEXT at 30 and 15 fps; GEST-02 commits at exactly 500 ms; GEST-03 a 2 s hold gives one NEXT; GEST-04 neutral + cooldown rearm, reset drops carryover; GEST-07 face loss, two faces, stale and out-of-order frames). `src/tests/face-runtime.test.ts` engine tests (a 500 ms raise held 2 s yields exactly one NAV_NEXT; a short raise gives progress only). All passed in the 12:18 CT run
Evidence files or recordings: none from a camera. No screenshot of the brow progress state exists
Observed measurements and conditions: none
Useful live-demo moment: The progress bar fills while the brows are up, then "Eyebrow raise detected — Next" and the highlight moves exactly one card. Keep holding: nothing else moves.
Technical difficulty or decision: Telling a deliberate raise from brows moving during speech: hysteresis, a continuous-hold requirement, and a latch that needs a neutral release (D27).
Known limitations: Thresholds are prototype defaults until calibrated. Glasses, lighting, head tilt, and speech-related brow movement are untested. Not everyone can raise their eyebrows.
Potential judge question: "Why half a second? How reliable is it?"
Claim we can support now: A 500 ms continuous raise produces exactly one NEXT and a held raise never repeats, in unit and synthetic-frame tests.
Claim we must not make yet: Any reliability figure, or that it works on an iPad or with a real face.
Next verification step: iPad trial part A (20 distinct raises, 2 minutes of normal movement) recorded in TEST_RESULTS.

## Feature: Long-blink SELECT
Build status: implemented
Verification: unit + synthetic. Not camera-verified. Not iPad-verified
Measurement: not measured

Human problem: Natural blinks must not select anything, and the target must not change under a deliberate closure.
Practical or emotional significance: Selection is deliberate, so the person is not penalized for blinking normally.
Implemented behavior: closure onset freezes the highlighted target. Eye-closure score = min(`eyeBlinkLeft`, `eyeBlinkRight`), so winks don't count. A closure under the minimum (600 ms default, calibrated per person) is an ordinary blink and is ignored. A closure over the maximum (2500 ms) is discarded. A valid reopening emits one `select` for the frozen target, then an 800 ms cooldown that re-arms only with eyes open. Face missing → discard and pause. Reacquisition alone selects nothing. Two faces → hold. Stale or out-of-order frames → discard. In manual (eyebrow) mode, a closure that starts right after a deliberate move is discarded as ambiguous.
Code/commit references: `src/access/blink-gesture.ts`, `src/access/blink-detector.ts`; commits `2230926`, `08c6abc`, `5de1a57`
Tests actually run and outcomes: blink gesture and calibration suites, `face-runtime.test.ts` closure attribution and engine tests ("a long blink: freeze at onset, then SELECT accept before unfreeze"). All passed at 12:18 CT
Evidence files or recordings: none from a camera
Observed measurements and conditions: none
Useful live-demo moment: On review, an eyebrow raise reaches Speak, and only a new long blink speaks.
Technical difficulty or decision: Freezing the target at closure onset so the person gets what they were looking at, not what the highlight moved to.
Known limitations: Defaults are prototype values. Synthetic sequences are not real eyes. Dry eyes, ptosis, or fatigue may change closure timing.
Potential judge question: "Could a normal blink speak something?"
Claim we can support now: Selection needs a deliberate closure longer than the calibrated minimum, and speaking needs a separate later closure, in tested logic.
Claim we must not make yet: That it never misfires, or any accuracy number.
Next verification step: iPad trial part B (20 long-blink selections, wrong-target count).

## Feature: Gesture arbiter (one command per physical gesture)
Build status: implemented
Verification: unit + synthetic pipeline (real detectors → arbiter). Not iPad-verified
Measurement: not measured

Human problem: A raised brow and a closing eyelid must never count as two actions, or move the highlight just before a selection.
Practical or emotional significance: Trust: the person needs to know a gesture does one thing.
Implemented behavior: the only emitter of accepted gesture commands. Blink closure onset freezes the highlight and pre-empts an unfinished raise; a late brow NEXT is ignored. A raise and a closure that start within 120 ms of each other (either order) are ambiguous: both are dropped with calm feedback ("Not sure which gesture — nothing happened. Try again."). Select and confirm need two distinct closures with different cycle ids. Accepted feedback ("Eyebrow raise detected — Next", "Blink detected — Selected") appears only after acceptance, for 900 ms. Reset on a new surface invalidates both (D33).
Code/commit references: `src/access/gesture-arbiter.ts`, `src/components/GestureFeedback.tsx`; commit `5de1a57`
Tests actually run and outcomes: `src/tests/gesture-arbiter.test.ts` (21 tests, including GEST-05/06 cross-gesture conflicts and a real-detector pipeline: eyes closing while brows rise → no NAV_NEXT ever, the blink selects; brows and eyes together → no command). Passed at 12:18 CT
Evidence files or recordings: none
Observed measurements and conditions: none
Useful live-demo moment: Raise brows and blink together on purpose: "Not sure which gesture — nothing happened."
Technical difficulty or decision: Precedence (blink wins after the window) versus discard (ambiguous inside it).
Known limitations: The 120 ms window is a prototype value. Real faces may couple brow and lid movement more than the synthetic frames do.
Potential judge question: "What if I raise my eyebrows and blink at the same time?"
Claim we can support now: In tests, one physical gesture yields at most one accepted command, and ambiguity yields none.
Claim we must not make yet: That a misfire can't happen on a real face.
Next verification step: iPad trial parts C and D (simultaneous gestures, face loss mid-raise).

## Feature: Guided calibration (eyebrow + blink)
Build status: implemented (`src/access/brow-calibration.ts`, `src/access/blink-calibration.ts`, `src/components/BlinkCalibration.tsx`)
Verification: unit + synthetic. Setup screens rendered in the iPad Simulator (no camera, so calibration itself could not run). Not iPad-verified
Measurement: not measured

Human problem: Timing and range differ from person to person. One fixed threshold would fail many people.
Practical or emotional significance: The system adapts to the person, not the other way round.
Implemented behavior: steps shown as Camera → Framing → Relax brows → Raise brows (5 raises) → Practice Next → Look normally → Natural blinks → Deliberate blinks → Check settings → Practice select → Practice confirm. Brow thresholds come from neutral p90 and raise p75; calibration rejects too few neutral frames, fewer than two distinct raises, separation under 0.15, or raises never held for half a second, and says so ("Eyebrow settings were not measured. Redo calibration, or choose another method."). Only scalar thresholds are stored, never images.
Code/commit references: as above; commit `5de1a57`
Tests actually run and outcomes: `src/tests/brow-calibration.test.ts` (11), `face-runtime.test.ts` calibration windows and stages (flat brows fail honestly with fallback advice). Passed at 12:18 CT
Evidence files or recordings: `docs/screenshots/ipad-sim-landscape-blink-setup.png`, `ipad-sim-landscape-camera-unavailable.png` (iPad Simulator, untracked at 12:20)
Observed measurements and conditions: none
Useful live-demo moment: Show "Eyebrow + blink control is ready" after a real calibration.
Technical difficulty or decision: Failing openly instead of accepting overlapping signals (D23).
Known limitations: A helper may be needed for the camera prompt. One team tester is not a population.
Potential judge question: "How is half a second calibrated for each person?"
Claim we can support now: Per-person thresholds from guided samples, with honest failure, in tested logic.
Claim we must not make yet: That it works for people with ALS, or for every team member.
Next verification step: Run full calibration on the physical iPad and record the pass/fail and conditions.

## Feature: iPad landscape layout, live preview (top right), and gesture feedback
Build status: implemented
Verification: iPad Simulator screenshots (Safari, localhost, touch/pointer mode, fixture source, no camera), captured 12:15–12:19 CT. Not physical-iPad verified. Live camera preview never exercised
Measurement: not measured

Human problem: People need to see that tracking works without a large camera feed covering the conversation.
Practical or emotional significance: Confidence that the system sees you, without the feeling of being recorded.
Implemented behavior: small mirrored, muted, inline live view captioned "Live preview — not recorded", with a "Hide preview" / "Show preview" touch button that is never a gesture target. Feedback line states include "Position your face", "Ready — raise eyebrows to move", "Eyebrows up — keep holding" (with progress), "Eyebrow raise detected — Next", "Long blink — keep eyes closed", "Blink detected — Selected", "Tracking lost — Paused", and audio states. Status bar shows "Eye gestures", "Mic", and "Voice". Hint line: "Eyebrows up 0.5 s → Next • Long blink → Select"; on review: "Raise eyebrows to move to Speak • New long blink speaks it". Wake-lock tip: "For hands-free use, set Auto-Lock to Never".
Code/commit references: `src/components/CameraPreview.tsx`, `GestureFeedback.tsx`, `StatusBar.tsx`, `BlinkStatus.tsx`, `src/app/globals.css`; commit `5de1a57`
Tests actually run and outcomes: `face-runtime.test.ts` feedback composition tests (passed). Visual check: iPad Simulator screenshots only
Evidence files or recordings: `docs/screenshots/ipad-sim-landscape-{setup-top,blink-setup,camera-unavailable,audio-enabled,board-empty,board-candidates,review}.png` and `ipad-sim-portrait-{setup-railway,board-candidates,review,after-speak}.png` (untracked at 12:20; captured in touch mode, so they show no preview video or gesture feedback)
Observed measurements and conditions: none
Useful live-demo moment: The self-view in the corner turning to "Ready — raise eyebrows to move".
Technical difficulty or decision: Keeping one `<video>` element mounted (hide collapses it with CSS) because remounting during camera use was tied to WebKit instability.
Known limitations: No real camera in the Simulator. Overlap on smaller iPads, 200% zoom, and rotation mid-gesture are unchecked on hardware.
Potential judge question: "Is the camera recording?"
Claim we can support now: The landscape layout renders in iPad Simulator Safari; the preview is a live view with no recording code path.
Claim we must not make yet: That the preview and feedback work on a physical iPad, or that frames never leave the device (until SYS-13).
Next verification step: IPAD-01/02 on the physical iPad, with a screenshot in brow-blink mode.

## Feature: ElevenLabs natural voice
Build status: implemented
Verification: mocked provider only. **Live verification blocked: `ELEVENLABS_API_KEY` not configured** (local and Railway). Not iPad-verified
Measurement: not measured

Human problem: A robotic voice makes it harder to be heard as yourself.
Practical or emotional significance: Humor, warmth, and disagreement come through better in a natural voice, as long as the words are exactly the person's.
Implemented behavior: after the second confirmation, the client sends only the confirmed utterance to `POST /api/speech`. The server validates the body, returns NOT_CONFIGURED without a key or voice id, checks the access code in production, allows only server-approved voices, applies a per-client rate limit and a per-process daily character budget (20,000 default), then calls ElevenLabs `eleven_v4_turbo` over the Text-to-Dialogue WebSocket (key in the first message, never in the URL) with exactly that text, waits for the final marker, and returns one `audio/mpeg` response with `no-store`. `ELEVENLABS_TRANSPORT=http` switches to a labeled HTTP route. One reused audio element plays it once; a duplicate request for the same utterance is refused; Stop invalidates late results; a watchdog marks playback "uncertain" instead of replaying. `GET /api/voices` lists approved voices without exposing the key.
Code/commit references: `src/app/api/speech/route.ts`, `src/app/api/voices/route.ts`, `src/server/elevenlabs/*`, `src/audio/eleven-player.ts`, `src/runtime/useAudio.ts`; commit `5de1a57`
Tests actually run and outcomes: `speech-api.test.ts` (19: TTS-01 key never in responses, headers, URL, or logs; TTS-02 v4 uses the TTD socket; TTS-03 exact text; TTS-06 error mapping; abort on client cancel), `eleven-player.test.ts` (18: TTS-04 one request per utterance, TTS-05 Stop before/during playback, NotAllowedError → blocked with no silent fallback), `speech-authorization.test.ts` (14: no speech for unconfirmed candidates, replayed activation cannot speak twice). All mocked; passed at 12:18 CT
Evidence files or recordings: `docs/screenshots/ipad-sim-landscape-audio-enabled.png` shows "Not configured on this server — the basic device voice will be used, and it will be labeled." Railway probe 12:20 CT: `/api/status` → `speech.configured: false`; `/api/voices` → `NOT_CONFIGURED`
Observed measurements and conditions: none. No ElevenLabs audio has been generated or heard
Useful live-demo moment: The exact confirmed sentence spoken in a natural adult voice (only if heard on the iPad first).
Technical difficulty or decision: Text-to-Dialogue WebSocket vs the standard TTS WebSocket; Node's built-in WebSocket cannot set headers; the ElevenLabs docs disagree on whether this socket accepts v4 ids, which only a live call settles; whole-MP3 response for reliable iPad Safari playback (D28, D30).
Known limitations: Needs the network. Generated speech can mispronounce or drop words. Retention depends on the ElevenLabs plan (D35). The model/socket combination is unproven live.
Potential judge question: "Is the voice natural? Is it cloned? What goes to ElevenLabs?"
Claim we can support now: ElevenLabs is implemented as the primary voice; only the confirmed sentence is sent, and only from the server, in tested code.
Claim we must not make yet: That it works, sounds natural, plays on the iPad, or has any latency. Say "implemented, live verification blocked".
Next verification step: Liam adds a newly rotated key and a voice id to `.env.local` and Railway (never in chat) → one live line → TTS-08/09/10 on the iPad.

## Feature: iPad audio setup ("Enable audio & test voice")
Build status: implemented
Verification: iPad Simulator only (tap → "Audio enabled. The basic device voice will be used."; status "Audio ready"). Not physical-iPad verified
Measurement: not measured

Human problem: iPad Safari may block audio that a real touch did not start, and a camera gesture does not count.
Implemented behavior: one genuine touch plays a silent clip on the same reused audio element and marks it unlocked; the setup copy says "On iPad, sound needs one real tap first — a helper may tap this. Camera gestures cannot unlock audio." If Safari later blocks playback, the app shows "Audio blocked — tap Enable audio" instead of claiming it spoke.
Tests actually run and outcomes: `eleven-player.test.ts` enableAudio tests (mocked element). Passed
Evidence files or recordings: `docs/screenshots/ipad-sim-landscape-audio-enabled.png`
Claim we must not make yet: That blink-confirmed speech plays on a physical iPad without another touch.
Next verification step: TTS-08 on the iPad, including after background/resume and rotation.

## Feature: Basic device voice fallback
Build status: implemented
Verification: unit (TTS-07) + mocked routing. iPad Simulator showed the labeled state. **Audible output not confirmed** on any device
Measurement: not measured

Human problem: The person must still be heard when the natural voice fails, without a silent swap.
Practical or emotional significance: Honesty about which voice spoke.
Implemented behavior: always labeled "Basic device voice". After a natural-voice failure, the board offers "Say it with the basic device voice" ("The natural voice did not play. You will review it again first.") and "Dismiss voice problem". Choosing it opens a new review; a fresh confirmation speaks through `speechSynthesis`. More tools → Controls → "Voice: natural (ElevenLabs)" toggles the provider. When ElevenLabs is not configured, setup says the basic voice will be used and labeled.
Code/commit references: `src/core/reducer.ts`, `src/core/targets.ts`, `src/runtime/effects-runner.ts`; commit `5de1a57`
Tests actually run and outcomes: `speech-authorization.test.ts` TTS-07 (6 tests: new review without speaking, cancel speaks nothing, dismiss, no offer after a browser-voice failure); `eleven-player.test.ts` routing ("never silently uses the browser voice"). Passed at 12:18 CT
Evidence files or recordings: `docs/screenshots/ipad-sim-landscape-audio-enabled.png`, `ipad-sim-portrait-after-speak.png` (Simulator)
Observed measurements and conditions: earlier desktop-pane run reported playback callbacks; no human listener confirmed sound
Useful live-demo moment: If ElevenLabs fails, "Say it with the basic device voice" → review again → confirm.
Known limitations: Robotic. Some iPad voices may be network voices.
Potential judge question: "What happens if the natural voice fails?"
Claim we can support now: The fallback is labeled and needs a fresh review and confirmation, in tested logic.
Claim we must not make yet: That it is audible on the iPad, or that it is local-only.
Next verification step: Listen on the physical iPad.

## Feature: Railway deployment (HTTPS for the iPad camera)
Build status: deployed. Deployment `f65385bb` SUCCESS at 12:13:42 CT, 10 s after commit `5de1a57` (byte-identity with the commit not verified)
Verification: live HTTP probe at 12:20 CT without an access code: `GET /api/status` → 200 with `speech.configured: false`, `replies.configured: true`, `transcription.configured: true`, `accessRequired: true`; `GET /api/voices` → `NOT_CONFIGURED`; `POST /api/speech` with a malformed body → `INVALID_INPUT`. Earlier smoke test (11:18, previous deployment): 401 without code including spoofed Host, 200 with code; blink assets HTTP 200 (11:46)
Measurement: not measured

Human problem: iPad Safari only grants the camera on a secure origin.
Implemented behavior: access code required for paid routes; keys only in Railway variables; content-free logs.
Code/commit references: `src/server/request-guards.ts`, `src/app/api/*`
Tests actually run and outcomes: as above. **The access-code check on `/api/speech` is unreachable on Railway until ElevenLabs is configured** (validation and NOT_CONFIGURED come first); it is covered by a unit test only
Evidence files or recordings: none saved; `railway deployment list` output
Useful live-demo moment: none; it is infrastructure.
Known limitations: Live replies and transcription have not been re-smoke-tested on deployment `f65385bb`.
Potential judge question: "Can anyone use your API key?"
Claim we can support now: The deployed site is HTTPS, reports speech as not configured, and enforced the access code on live AI in the 11:18 smoke test.
Claim we must not make yet: That `/api/speech` is protected in production, or that the deployed build passed a full smoke test.
Next verification step: After the key is added: rerun the smoke test including `/api/speech` with and without the code, and record it in TEST_RESULTS.

## Feature: Live AI suggestions and transcription (OpenAI)
Build status: implemented (`src/server/provider.ts`, `src/server/transcription.ts`)
Verification: **live with synthetic inputs** (local and Railway, 11:18–11:35 CT, before the 12:13 redeploy); unit with mocked fetch
Measurement: single observations (~4.2 s per batch, ~1.2 s per transcription). Not a latency measurement

Human problem: Contextual whole-message candidates could reduce gestures per message (hypothesis, not measured).
Implemented behavior: Responses API, `gpt-6-astra`, `store: false`, strict `json_schema`, no tools, one repair, strict validation, app-assigned ids. Transcription via `gpt-transcribe`; the partner reviews the transcript before it is used.
Tests actually run and outcomes: 14/14 synthetic scenarios returned valid batches; one synthetic `say` clip transcribed exactly ([TEST_RESULTS.md](TEST_RESULTS.md))
Evidence files or recordings: [evidence/live-scenarios.json](evidence/live-scenarios.json) (human judgments "not reviewed")
Observed measurements and conditions: single calls, synthetic text and audio, M3 Mac and Railway
Useful live-demo moment: "None of these" returning different meanings, not rewordings.
Known limitations: Browser microphone capture is unexercised. Real room audio untested. Quality not human-rated.
Potential judge question: "What goes to OpenAI?"
Claim we can support now: Live suggestions and transcription worked with synthetic inputs today.
Claim we must not make yet: Quality ratings, latency figures, or retention beyond "`store: false` is set".
Next verification step: One live reply on the iPad through Railway; record it.

## Feature: iPad acceptance trial (§24)
Build status: not started
Verification: not run
Measurement: **not measured**

Procedure: 20 eyebrow raises, 20 long-blink selections, 2 minutes of normal movement, face-loss recovery, and a hands-free 3-turn conversation with ElevenLabs audio ([TEST_PLAN.md](TEST_PLAN.md#ipad-acceptance-trial-24)). Record missed commands, inadvertent NEXTs, wrong-target selections, false confirmations, and unintended speech separately, with lighting, glasses, angle, and orientation.
Claim we must not make yet: Any reliability number until it is in TEST_RESULTS. Passing does not validate use by people with ALS.

---

## Feature: Local face landmarker (MediaPipe)
Build status: implemented (`src/access/blink-detector.ts`; brow score in `5de1a57`)
Verification: model created in a desktop browser pane; one blank frame returned 0 faces; assets served from Railway (11:46). Brow-score unit tests pass. No real camera frames processed
Measurement: not measured
Implemented behavior: Face Landmarker in `VIDEO` mode, `numFaces: 2`, local pinned assets, GPU with CPU fallback. Blendshape scores and a face count only. No images kept.
Claim we must not make yet: That frames never leave the device (until SYS-13). Note: the setup copy already says "Camera images never leave this device." That is a design statement until SYS-13 is recorded.
Next verification step: Real frames on the iPad. Network log (SYS-13).

## Feature: Auto-scan + blink (fallback)
Build status: implemented. Off in eyebrow mode (D31)
Verification: unit + synthetic (scan attribution and timing). Not camera-verified
Claim we can support now: A tested timer-driven alternative for people who find eyebrow raises hard; same targets and guarded path.
Next verification step: Run it once on the iPad as the rehearsed fallback.

## Feature: Exact review and separate confirmation
Build status: implemented
Verification: unit (CORE-03 to CORE-09; IPAD-03 review ordering and fresh-cycle confirmation), desktop browser (pointer and synthesized switch keys), iPad Simulator (touch; review screen shows Cancel, Speak, Change wording)
Measurement: not measured
Implemented behavior: selection opens a frozen review starting on Cancel. **Speak** needs a different input cycle, the current surface revision, the same session epoch, and 600 ms of arming. One `speak` per confirmation.
Useful live-demo moment: Long-blink a card, point out that nothing has been spoken, raise eyebrows to Speak, then blink again.
Claim we can support now: Two-step authorization is enforced in one reducer; unit and browser checks pass.
Claim we must not make yet: That it is proven with real eyebrow/blink gestures or physical switches.

## Feature: Semantic regeneration ("None of these"), guidance, change wording
Build status: implemented
Verification: unit (GEN-01/02/03/05/06/07/10), browser (fixture), live scenarios 3, 4, and 13
Measurement: not measured
Claim we can support now: Rejections are scoped to one question. Explicit direction persists across regeneration. In 14 synthetic live scenarios, Disagree stayed disagreement and the rejected batch got new meanings (Claude's observations, not human judgment).
Claim we must not make yet: That live suggestions are always diverse or always follow guidance.

## Feature: Quick phrases, saved phrases, My words
Build status: implemented. Verification: unit (CONV-03/04/08, ACCESS-04), browser (pointer/scripted). Measurement: not measured
Claim we can support now: No AI needed. Drafts survive interruptions. The same review and confirmation apply.
Claim we must not make yet: Offline after reload, or typing speed.

## Feature: Start a conversation, staging, parking, history
Build status: implemented. Verification: unit (CONV-01/02/05/06/10, AUD-2), browser (pointer/scripted). Measurement: not measured
Claim we can support now: Initiation creates no fake partner turn. Active work is never silently replaced.

## Feature: Consented adaptation and approved preferences
Build status: implemented. Verification: unit (PREF-03 to 08, 12, 13, 15), browser (fixture: 3 "Shorter" turns → proposal → approval → request carried `length=short`). Measurement: not measured
Claim we can support now: Nothing persists without explicit approval. Approved policy reaches the request.
Claim we must not make yet: Persistence across reload, or live model compliance.

## Feature: Fixture demo mode
Build status: implemented. Verification: browser and iPad Simulator (badge "Fixture demo", review "Source: Fixture demo suggestion"). Claim: canned, clearly labeled suggestions, never substituted for live failures.

## Feature: Switch/keyboard and touch (fallback inputs)
Build status: implemented. Verification: browser (synthesized key events), unit (ACCESS-04/07; brow-blink keyboard fallbacks: Tab/ArrowRight step once, Space selects once), iPad Simulator (touch)
Claim we must not make yet: Compatibility with external switch hardware.

## Feature: Measurement mode
Build status: reducer events and export present. Verification: not run. Measurement: **not measured.**

## Feature: Native iOS client (experimental, not in demo)
Build status: SwiftUI client in `ios/` (commit `5fd9d2d`)
Verification: builds; 9 Swift Testing tests passed on the iPhone 17 Pro simulator. Not connected end to end
Claim we must not make: That there is a working native app. Not in the demo (D26, D32).
