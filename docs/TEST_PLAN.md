# Test plan

This maps the blink-first master prompt §29 acceptance IDs to tests. **"Written" means a test with that ID exists in `src/tests/`.** At 11:25 CT every written test passed (`npx vitest run`: 82/82 in 6 files, working tree after commit `5fd9d2d`). Official results are recorded by the integrator in [TEST_RESULTS.md](TEST_RESULTS.md).

Evidence types are kept separate. **Unit** tests run against the reducer or pure functions with injected IDs and clocks, with the provider mocked or not involved. **Synthetic** blink tests feed numeric eye-closure sequences with fake timestamps, and no camera is involved. **Browser** means the real rendered app. **Camera** means a real webcam and a real person. **Hardware** means real audio or switch hardware. **Live** means a real provider call with synthetic content. A mocked or synthetic test proves logic, not detection reliability, model compliance, or audible output.

Test files at 11:25 CT: `reducer.test.ts`, `adaptation.test.ts`, `schemas.test.ts`, `api.test.ts` (mocked Anthropic SDK), `openai-provider.test.ts` (mocked fetch: strict schema, `store: false`, refusal, one repair, 429/401 mapping), and `audit-regressions.test.ts` (AUD-2, AUD-5). At 11:32 CT the blink engineers had added `blink-gesture.test.ts` and `blink-calibration.test.ts` (uncommitted). With them, 106/106 tests passed in 8 files.

## A. Core communication and exact speech

| ID | Planned test | Type | Status |
| --- | --- | --- | --- |
| CORE-01 | Fixture mode never calls the live adapter; live mode calls it only when configured | Unit (route, mocked provider) | Written (`api.test.ts`) |
| CORE-02 | Installed batch has exactly 3 candidates with app-assigned IDs | Unit | Written (`reducer.test.ts`) |
| CORE-03 | Selecting a candidate opens review; no speak effect | Unit | Written |
| CORE-04 | Cancel restores the prior surface and draft | Unit | Written |
| CORE-05 | Speak payload equals the reviewed text | Unit | Written |
| CORE-06 | Same cycle/event, stale surface, early confirm, and wrong epoch are all rejected | Unit | Written |
| CORE-07 | Native click after a handled scan key cannot confirm | Unit (input controller) + browser | Planned |
| CORE-08 | Partner input, preference toggle, and late results do not change the review | Unit | Written |
| CORE-09 | One speak per confirmation; interrupted/failed never become completed | Unit | Written |
| CORE-10 | Speech watchdog never replays | Unit (speech controller) | Planned |
| CORE-11 | End session ignores old-epoch results/speech and keeps approved prefs | Unit | Written |

## B. Semantic regeneration and intent

| ID | Planned test | Type | Status |
| --- | --- | --- | --- |
| GEN-01 | None of these records a rejection, queues generation, adds no user turn | Unit | Written |
| GEN-02 | Next request carries rejected texts and meanings for the same anchor | Unit | Written |
| GEN-03 | New turn and new session do not inherit rejections | Unit | Written |
| GEN-04 | Parked workspace keeps its own rejections only | Unit | Planned |
| GEN-05 | Editing the anchored turn clears rejections and invalidates pending results | Unit | Written |
| GEN-06 | Shorter refinement keeps the meaning and is not a rejection | Unit | Written |
| GEN-07 | Disagree persists across regeneration | Unit | Written |
| GEN-08 | Be direct maps to a wording style, not an intent; humor text forbids invented biography | Unit (prompt payload) + live | Planned |
| GEN-09 | Negation contrasts are not treated as duplicates | Unit | Written (`schemas.test.ts`) |
| GEN-10 | After 2 rejected batches, Write it myself appears and None stays enabled | Unit | Written |
| GEN-11 | Invalid/duplicate output gets one repair, then `INVALID_MODEL_OUTPUT` | Unit (provider with mocked SDK) | Written (`api.test.ts`, with SYS-03) |

## C. Preference learning and memory

| ID | Planned test | Type | Status |
| --- | --- | --- | --- |
| PREF-01 | Observations, proposals, preferences, and profile are separate types/arrays | Unit | Planned (enforced by types) |
| PREF-02 | Rejections/suggestions never create profile or preference entries | Unit | Planned |
| PREF-03 | Unapproved proposals never reach `approvedPreferences`; confirm requires arming | Unit | Written (`adaptation.test.ts`) |
| PREF-04 | Approved preference changes the next request policy | Unit | Written |
| PREF-05 | Explicit wording overrides saved preference and session hint | Unit | Written |
| PREF-06 | Scope precedence and latest-approval tie-break | Unit | Written |
| PREF-07 | Pause personalization removes influence without deleting data | Unit | Written |
| PREF-08 | Not now defers; no repeat proposal in the session | Unit | Written |
| PREF-09 | Approval needs explicit confirmation and the correct storage consent | Unit | Partially covered by PREF-03 |
| PREF-10 | Storage write failure shows "could not save", not success | Unit | Planned |
| PREF-11 | Reload restores only valid approved data | Unit (storage) + browser | Planned |
| PREF-12 | Explicit length or humor guidance yields no length observation | Unit | Written |
| PREF-13 | Similar-length batch yields zero opportunity/evidence | Unit | Written |
| PREF-14 | Partner edits/AI text cannot write profile | Unit | Planned |
| PREF-15 | Preference change invalidates the pending result and never mutates review | Unit | Written |
| PREF-16 | Another tab cannot overwrite active review/session | Browser (manual) | Planned |

## D. Conversational control

| ID | Planned test | Type | Status |
| --- | --- | --- | --- |
| CONV-01 | Partner input while busy is staged | Unit | Written |
| CONV-02 | Returning to a parked question keeps chronology | Unit | Written |
| CONV-03 / 04 | Quick phrase uses review/confirm and restores the composer draft | Unit | Written |
| CONV-05 | Speaking a quick phrase invalidates a pending result | Unit | Written |
| CONV-06 | Initiation creates no partner turn | Unit | Written |
| CONV-07 | Initiation without approved interests uses generic starters | Unit (fixtures) + live | Planned |
| CONV-08 | Composing by scanning only | Unit | Written |
| CONV-09 | Phrases/composition work when generation errors | Unit + browser | Planned |
| CONV-10 | 11th staged message refused with a notice | Unit | Written |

## E. Accessibility and timing

| ID | Planned test | Type | Status |
| --- | --- | --- | --- |
| ACCESS-01 | Keyboard and single-key scanning work without mic/camera | Browser | Browser pass with synthesized keys (see TEST_RESULTS) |
| ACCESS-02 | Target IDs stable during selection and reading | Unit (targets) | Planned |
| ACCESS-03 | Scan-speed change creates no duplicate timers | Unit (scan controller, fake clock) | Planned |
| ACCESS-04 | Group selection inserts no letter | Unit | Written |
| ACCESS-05 | Typing in text fields is not intercepted | Browser | Planned |
| ACCESS-06 | Disabled targets skipped; Back/Cancel/Resume reachable | Unit (targets) | Planned |
| ACCESS-07 | Speaking → only Stop; paused → only Resume | Unit | Written |
| ACCESS-08 | Hidden tab does not replay missed ticks | Unit (scan controller) | Planned |
| ACCESS-09 | All flows reachable via the same access method | Browser | Partial (switch/pointer browser passes) |
| ACCESS-10 | **Blink adapter:** ordinary (short), long, and qualifying closures, plus stale, missing, out-of-order, and multiple-face sequences, behave safely. Calibration fails openly on overlap or a weak signal | Synthetic | Written (`blink-gesture.test.ts`, `blink-calibration.test.ts`; uncommitted) |
| ACCESS-11 | **Blink adapter:** the target captured at closure onset is selected exactly once, even if the highlight would have moved. Reacquisition after face loss selects nothing by itself | Synthetic | Written (`blink-gesture.test.ts`, with a simulated integration). The real runtime wiring and the explicit Resume on the paused surface are not yet tested |
| ACCESS-12 | Practice calibration on the real laptop camera. The operator chooses and confirms with two separate deliberate blinks, hands off all input devices | Camera | Not run |
| ACCESS-13 | Blink reaches regenerate, guide, quick phrase, review, Cancel, Speak, My words, initiation, and recovery with no mouse-only menus | Camera + browser | Not run |
| ACCESS-14 | Reading pause, active highlight, closure freeze, selection acknowledgment, cooldown, and face-lost status are visible and stable on the real UI | Camera + browser | Not run |
| ACCESS-15 | Failing calibration switches openly to a usable alternate input. No fake blink selection. The prepared message is kept | Camera + browser (a forced failure is acceptable) | Not run |

## Blink reliability gate

This is the small demonstration gate from §24. It is a real-camera test, kept separate from synthetic tests. **Passing it does not validate use by people with ALS.** Record every trial, including misses, in [TEST_RESULTS.md](TEST_RESULTS.md). Until then every measure is **not measured**.

Setup to record: date and time, laptop and camera, browser, room and lighting, glasses yes/no, tester (team member, not an AAC user), calibration values accepted (minimum/maximum closure, cooldown, scan interval), and fixture or live source.

| Part | Procedure | Measures |
| --- | --- | --- |
| A. Intentional selections | 20 trials. Before each, the operator states which target they intend. They blink deliberately when it is highlighted | Correct selections. **Missed gestures** (intended, nothing selected). **False selections** (wrong target, or a selection with no intent) |
| B. Ordinary blinking | 2 minutes of normal reading and conversation on the board and on review, without trying to select | **False selections** and **false confirmations** (Speak reached without a second deliberate closure). The target is 0, and any occurrence must be reported |
| C. Confirmation | Within part A, every selection that reaches review must need a separate blink on Speak | **False confirmations**. Confirm that one long closure never both selects and confirms |
| D. Tracking loss/recovery | Look away or leave the frame mid-closure, then return. Add a second face if practical | Gesture discarded? App paused? Explicit Resume needed? No selection transferred? |
| E. Timing | From the event timestamps or a screen recording | **Gesture duration** (closure start to reopen), **scan wait** (target becomes intended → highlighted), and time from highlight to committed selection. Report median and range with n |

Decision rule (for the team, not a clinical threshold): if parts B or C produce any false confirmation, or part A misses many intended selections, the live demo uses keyboard/switch and the presenter says blink is experimental. The team records the decision and the reason in [DECISIONS.md](DECISIONS.md).

## F. APIs, audio, privacy

| ID | Planned test | Type | Status |
| --- | --- | --- | --- |
| SYS-01 | `/api/status` with no keys reports not configured; local tools work | Unit (route) + browser | Unit written (`api.test.ts`); browser planned |
| SYS-02 | Malformed/oversized requests rejected before any provider call | Unit (route) | Written (`api.test.ts`) |
| SYS-03 | Timeout/refusal/rate limit respect the single retry budget | Unit (provider, mocked) | Written for repair and refusal (`api.test.ts`); timeout and rate limit planned |
| SYS-04 | Mismatched identities cannot install results | Unit | Covered by CORE-08/11, PREF-15 |
| SYS-05 | Model output cannot call tools or speak | Unit (schema strictness) | Partially written (`schemas.test.ts`) |
| SYS-06 | Logs/errors contain no content or keys | Unit (route) + review | Error-echo test written (`api.test.ts`); log review planned |
| SYS-07 | Fixture visibly distinct from live | Unit (route label) + browser | Unit written (`api.test.ts`); browser planned |
| SYS-08 | Mic denial keeps typed input | Unit (transcribe route) + browser | Unit for not-configured/oversized written (`api.test.ts`); browser planned |
| SYS-09 | Empty/edited transcript needs review; edits are `partner-edited` | Unit + browser | Planned |
| SYS-10 | Recording stops before speech; app speech never becomes a partner turn | Unit (reducer `discard-recording`) + hardware | Planned |
| SYS-11 | End session releases media and cancels work | Unit | Partially covered by CORE-11 |
| SYS-12 | Remote requests refused without `APP_ACCESS_TOKEN` | Unit (route) | Written (`api.test.ts`) |
| SYS-13 | Camera frames are not uploaded; model/WASM load only from this origin | Browser network log during blink use | Not run (required before any "local only" claim) |
| SYS-14 | Responses use `cache-control: no-store` | Unit (route) | Planned |

## Browser and live scenarios (§30)

- Browser sequence: three turns, one rejected batch, guidance, quick interruption, parked question, composed message, initiation, cancelled review, stop speech, mic denial, cloud failure, End session. Status: planned.
- Live synthetic scenarios 1–14 from §30: run 14/14 with valid batches (see [TEST_RESULTS.md](TEST_RESULTS.md)). Human judgments are not recorded yet.
- Hands-free sequence for the demo (camera): calibrate → partner question → None of these → Guide → select → review → separate blink on Speak → Quick phrases → Start a conversation → face-lost recovery. Status: not run.

## Audit regressions and provider tests

| ID | Test | Status |
| --- | --- | --- |
| AUD-2 | An own-words reply answers the active question (also in local-only mode). A quick phrase does not close it | Written |
| AUD-5 | A discarded late result never restores a rejected batch | Written |
| OpenAI adapter | Strict json_schema, `store: false`, no tools, refusal mapping, one repair, 429/401 mapping (mocked fetch) | Written (`openai-provider.test.ts`) |
