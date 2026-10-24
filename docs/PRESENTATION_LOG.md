# Presentation log

This is a living journal of features, claims, and evidence. Build, verification, and measurement are separate dimensions. "Implemented" means the logic exists in source. It does not mean tested. A mocked unit test is not browser or hardware verification. Update each entry when its status changes. Never backfill evidence that does not exist.

Started 2026-10-24 ~11:00 CT by the documentation workstream. Code references point to files present at that time. Runtime, access, audio, UI, and route modules landed at ~10:58 CT and had not been integration-tested when this was written.

---

## Feature: Exact review and separate confirmation
Build status: implemented (reducer); UI landed, not browser-verified
Verification: not run (unit tests written: CORE-03 to CORE-09)
Measurement: not measured

Human problem: An AI suggestion must never become someone's spoken words without their deliberate say-so.
Practical or emotional significance: Authorship. The person, not the software, decides what is said.
Implemented behavior: Selection opens a frozen review snapshot. **Speak** requires a different input cycle and event, a current surface revision, the same session epoch, and a 600 ms arming delay. One `speak` effect is created per confirmation.
Code/commit references: `src/core/reducer.ts` (`openReview`, `confirmSpeak`, `activate`); `src/core/targets.ts` (`rv-speak`). Uncommitted at time of writing.
Tests actually run and outcomes: none recorded yet. See [TEST_RESULTS.md](TEST_RESULTS.md).
Evidence files or recordings: none yet
Observed measurements and conditions: none
Useful live-demo moment: Select a card, pause on the review screen, point out that nothing has been spoken yet, then confirm.
Technical difficulty or decision: Keeping a held switch from selecting and confirming in one gesture (cycle/event IDs plus surface revision plus arming).
Known limitations: The 600 ms arming delay is an untested default.
Potential judge question: "Could it accidentally speak?"
Claim we can support now: The reducer enforces two-step authorization by design, and unit tests for it exist.
Claim we must not make yet: That it is proven safe in the browser or with real switches.
Next verification step: Run `npm test`, then try held-key and double-click scenarios in the browser.

## Feature: Semantic regeneration ("None of these")
Build status: implemented (reducer, fixtures, prompt payload)
Verification: not run (unit tests written: GEN-01/02/03/05/10)
Measurement: not measured

Human problem: When none of the suggestions fits, rewordings of the same idea do not help.
Practical or emotional significance: Saying "no" to the AI is quick and costs nothing.
Implemented behavior: Records a turn-scoped rejected batch (texts plus meaning labels). The next request asks for different meanings for the same question. After 2 failed batches, **Write it myself** appears. Rejections clear when the turn is answered, dismissed, or edited.
Code/commit references: `src/core/reducer.ts` (`none-of-these`), `src/core/context-builder.ts`, `src/server/reply-prompt.ts`, `src/server/validation.ts`
Tests actually run and outcomes: none recorded yet
Evidence files or recordings: none yet
Observed measurements and conditions: none
Useful live-demo moment: Reject the first three, and show that the new three mean different things.
Technical difficulty or decision: Rejection is treated as ambiguous. It is never a stance or a preference.
Known limitations: Fixture mode rotates through a fixed pool. Real semantic diversity depends on the live model, which is unverified.
Potential judge question: "Does rejecting teach it my opinions?"
Claim we can support now: Rejections are scoped to one question and are sent as context, not stored as preferences.
Claim we must not make yet: That live suggestions are semantically diverse.
Next verification step: If a key becomes available, run live scenario 13 (intended meaning absent from every batch).

## Feature: Guide my response
Build status: implemented (reducer/targets); UI landed, not browser-verified
Verification: not run (unit test written: GEN-07)
Measurement: not measured

Human problem: The person knows the direction (disagree, suggest an alternative) but not the exact words.
Practical or emotional significance: Supports disagreement, humor, and boundaries, not only agreeable answers.
Implemented behavior: 8 directions, 8 wording options, and a topic/keyword seed. All apply to the current question and persist across its regenerations. **Clear guidance** is available.
Code/commit references: `src/core/targets.ts` (`guideTargets`), `src/core/reducer.ts` (`set-intent`, `add-wording`, `compose-done` seed)
Tests actually run and outcomes: none recorded yet
Evidence files or recordings: none yet
Observed measurements and conditions: none
Useful live-demo moment: Guide → Suggest an alternative, and show that the new cards are alternatives.
Technical difficulty or decision: "Be direct" is a wording style, not disagreement.
Known limitations: Compliance depends on the model (live is unverified) or on the fixture pools.
Potential judge question: "What happens when the AI is wrong?"
Claim we can support now: Explicit direction is sent and persists across regeneration.
Claim we must not make yet: That the live model always follows it.
Next verification step: Browser demo pass; live scenarios 3 and 4 if a key is available.

## Feature: Change wording (shorter / different tone)
Build status: implemented (reducer)
Verification: not run (unit test written: GEN-06)
Measurement: not measured
Human problem: The meaning is right but the wording is too long or the tone is off.
Implemented behavior: From review, produces a refinement batch that keeps the selected meaning. Leaving it is not a rejection. A new review and confirmation are still required.
Code/commit references: `src/core/reducer.ts` (`refine-candidate`), `src/server/fixtures.ts` (`refinePool`)
Tests actually run and outcomes: none recorded yet
Claim we can support now: Refinement keeps the meaning and still needs fresh confirmation.
Claim we must not make yet: Anything about live wording quality.
Next verification step: Browser pass.

## Feature: Quick phrases and saved phrases
Build status: implemented (reducer/targets); UI landed, not browser-verified
Verification: not run (unit tests written: CONV-03/04)
Measurement: not measured

Human problem: Conversations move on. People need "Give me a moment" or "I'm not finished" immediately.
Practical or emotional significance: Holding the floor and repairing misunderstandings.
Implemented behavior: 10 built-in phrases with interruptions first, 6 per page, and custom phrases added with confirmation. All go through the same review/confirm path. Any draft in progress is preserved.
Code/commit references: `src/core/phrases.ts`, `src/core/targets.ts` (`quickTargets`), `src/core/reducer.ts` (`quick-phrase`)
Tests actually run and outcomes: none recorded yet
Evidence files or recordings: none yet
Useful live-demo moment: Mid-composition, speak "Please give me a moment.", then return to the draft intact.
Known limitations: Custom phrase add/delete UI not browser-verified.
Potential judge question: "What happens without internet?"
Claim we can support now: Phrases need no AI and use the same safety flow.
Claim we must not make yet: That they work offline after a reload.
Next verification step: Browser pass with the network disabled after load.

## Feature: My words (scanning keyboard)
Build status: implemented (reducer/targets); UI landed, not browser-verified
Verification: not run (unit tests written: CONV-08, ACCESS-04)
Measurement: not measured
Human problem: AI cannot cover everything. Independent composition must always work.
Implemented behavior: Grouped-letter scanning (7 groups), space, delete, clear with confirmation, and a 500-character limit with a notice. A group selection never inserts a letter.
Code/commit references: `src/core/phrases.ts` (`KEY_GROUPS`), `src/core/reducer.ts` (`compose-*`)
Tests actually run and outcomes: none recorded yet
Claim we can support now: A complete message can be composed through scanning commands alone (reducer level).
Claim we must not make yet: Typing speed or effort numbers.
Next verification step: Browser pass with the single-key switch.

## Feature: Start a conversation
Build status: implemented (reducer, fixtures); UI landed, not browser-verified
Verification: not run (unit test written: CONV-06)
Measurement: not measured
Human problem: AAC users are often limited to responding. Initiating matters.
Implemented behavior: 9 categories with a separate initiation anchor. No fake partner question is created. Generic starters are used without approved interests.
Code/commit references: `src/core/reducer.ts` (`initiate`), `src/server/fixtures.ts`
Tests actually run and outcomes: none recorded yet
Useful live-demo moment: End the demo by starting a new topic unprompted.
Claim we can support now: Initiation works without a partner turn (reducer level).
Claim we must not make yet: That live starters never invent memories (unverified).
Next verification step: Browser pass; live scenario 9.

## Feature: Conversation continuity (staging, parking, history)
Build status: implemented (reducer); UI landed, not browser-verified
Verification: not run (unit tests written: CONV-01/02/05/10)
Measurement: not measured
Human problem: A partner keeps talking while the user is still composing, and the earlier question gets lost.
Implemented behavior: New partner input is staged when the user is busy (cap 10, explicit notice when full). Questions can be parked and returned to without reordering history.
Code/commit references: `src/core/reducer.ts` (`PARTNER_SUBMIT`, `history-*`, `parkActive`)
Tests actually run and outcomes: none recorded yet
Claim we can support now: Active work is never silently replaced (reducer level).
Claim we must not make yet: Anything about real conversation pace.
Next verification step: Browser pass; live scenario 14.

## Feature: Session length adaptation (opt-in)
Build status: implemented (`src/adaptation/observations.ts`)
Verification: not run (unit tests written: PREF-12/13)
Measurement: not measured
Human problem: Suggestions could fit how the person tends to talk, without the app profiling them.
Implemented behavior: Off by default. Length evidence is recorded only from batches with a real length spread and no explicit length request. Explicit Shorter/More detail counts double. The hint needs 2 turns and a proposal needs 3. Evidence expires after 30 minutes or at End session.
Tests actually run and outcomes: none recorded yet
Known limitations: Length only. Position bias is a confounder.
Potential judge question: "How does it learn?"
Claim we can support now: Learning is deterministic, opt-in, temporary, and explainable.
Claim we must not make yet: That it improves anything (not measured), or any confidence level.
Next verification step: Unit test run; scripted browser session with adaptation on.

## Feature: Approved preferences and memory review
Build status: implemented (reducer, policy, `src/adaptation/preference-store.ts`); Preferences/Memory UI landed, not verified
Verification: not run (unit tests written: PREF-03 to PREF-08, PREF-15)
Measurement: not measured
Human problem: Personalization without consent is surveillance.
Implemented behavior: Six style dimensions with relationship/setting scope. Saving requires a confirm step. Controls include toggle, delete, Pause personalization, remember on device, and delete everything. Resolution is deterministic.
Code/commit references: `src/adaptation/preference-policy.ts`, `src/core/reducer.ts` (`applyChange`)
Tests actually run and outcomes: none recorded yet
Useful live-demo moment: Show a proposal and choose "Not now", or show a manually approved "Short replies".
Potential judge question: "Does it remember things about me?"
Claim we can support now: Nothing is saved without explicit approval (reducer level).
Claim we must not make yet: That persistence works across reload (not tested).
Next verification step: Browser reload test with "Remember on this device".

## Feature: Live AI suggestions (Anthropic adapter)
Build status: adapter + `/api/replies` route present
Verification: **not run live: no API key configured** (as of 10:50 CT). Mocked-provider route tests written in `src/tests/api.test.ts` (CORE-01, SYS-03), not run
Measurement: not measured
Implemented behavior: Structured JSON output, effort low, refusal fallback beta, no SDK retries, one repair attempt, strict validation, app-assigned IDs.
Code/commit references: `src/server/provider.ts`, `src/server/reply-prompt.ts`, `src/server/validation.ts`
Claim we can support now: The adapter is written and validates output.
Claim we must not make yet: That live generation works, its latency, or its quality.
Next verification step: Liam adds a key if authorized, then runs one synthetic request.

## Feature: Fixture demo mode
Build status: implemented (`src/server/fixtures.ts`, `/api/replies`)
Verification: not run
Measurement: not applicable
Implemented behavior: Deterministic synthetic pools by intent, initiation, seed, and refinement. Avoids rejected texts. Always labeled `demo-fixture`. Never used as a fallback for live failures.
Claim we can support now: The demo uses canned, clearly labeled suggestions.
Claim we must not make yet: That fixture output reflects live model behavior.
Next verification step: Confirm the UI label is visible in the browser.

## Feature: Switch scanning and input controller
Build status: present (`src/access/scan-controller.ts`, `input-controller.ts`, runtime), being integrated
Verification: not run
Measurement: not measured
Implemented behavior: single target registry; surface-revision and cycle guards; Stop/Resume as the only targets while speaking/paused. One chained scan timer that never replays missed ticks and freezes while the switch is held or the tab is hidden.
Claim we can support now: The reducer guards exist (ACCESS-04/07 unit tests written).
Claim we must not make yet: That scanning timing works or that external switches are compatible.
Next verification step: Browser pass with the single-key switch.

## Feature: Speech synthesis and delivery status
Build status: present (`src/audio/speech-controller.ts`, `voices.ts`); reducer delivery states implemented
Verification: not run; audible output not hardware-verified
Measurement: not measured
Claim we can support now: Delivery states are tracked. Watchdogs mark playback `uncertain` and never replay it (source level).
Claim we must not make yet: That speech is audible, local, or offline on the demo machine.
Next verification step: Listen on the demo laptop; note the voice name and `localService`.

## Feature: Partner recording and transcript review
Build status: present (`src/audio/recording-controller.ts`, `transcript-client.ts`, `src/server/transcription.ts`, `/api/transcribe`)
Verification: **not run: no transcription key configured**
Measurement: not measured
Claim we can support now: Typed partner input is the supported path.
Claim we must not make yet: That microphone transcription works.
Next verification step: Only if a key is authorized.

## Feature: Measurement mode
Build status: reducer metric events + `src/metrics/export.ts` present
Verification: not run
Measurement: not measured
Claim we must not make yet: Any speed, effort, or accuracy number.
Next verification step: Run synthetic trials per master prompt §31 if time permits.

## Feature: Privacy controls and access gate
Build status: implemented (`src/server/request-guards.ts`, `config.ts`)
Verification: not run
Claim we can support now: Keys are server-side only, logs are content-free, and remote requests are refused without an access token.
Claim we must not make yet: Anything about provider retention.

## Feature: Blink / camera input
Build status: deferred
Verification: not applicable
Measurement: not measured
Claim we must not make yet: Any eye, blink, or camera capability.
