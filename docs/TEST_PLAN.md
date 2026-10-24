> **Historical working document** from earlier in the hackathon (October 24, 2026). Some details are superseded; see [README.md](../README.md) for the current state.

# Test plan

This maps the acceptance IDs in the governing brief (the one-file iPad gestures + ElevenLabs prompt, §29) to tests. **"Written" means a test with that ID exists in `src/tests/`.** At 11:50 CT every written test passed (`npm test`: 134/134 in 10 files, recorded in [TEST_RESULTS.md](TEST_RESULTS.md)). Official results are recorded by the integrator in TEST_RESULTS.

Evidence types are kept separate. **Unit** tests run against the reducer or pure functions with injected IDs and clocks, with the provider mocked or not involved. **Synthetic** gesture tests feed numeric eye-closure or brow-raise sequences with fake timestamps, and no camera is involved. **Browser** means the real rendered app on a desktop browser. **iPad** means the physical iPad in Safari with a real person at the front camera. **Hardware** means real audio or switch hardware. **Live** means a real provider call with synthetic content. A mocked or synthetic test proves logic, not detection reliability, model compliance, or audible output. A desktop browser pass is not an iPad pass.

Test files at 11:50 CT: `reducer.test.ts`, `adaptation.test.ts`, `schemas.test.ts`, `api.test.ts` (mocked Anthropic SDK), `openai-provider.test.ts` (mocked fetch), `audit-regressions.test.ts`, `blink-gesture.test.ts`, `blink-calibration.test.ts`, `blink-detector-timestamp.test.ts`, and `scan-attribution.test.ts`. By 12:10 the other workstreams had added uncommitted `brow-gesture.test.ts`, `brow-calibration.test.ts`, `gesture-arbiter.test.ts`, `speech-api.test.ts`, `speech-authorization.test.ts`, and `eleven-player.test.ts`. **No run of them is recorded yet**, so "Written" below does not mean passing.

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
| ACCESS-10 | **Blink adapter:** ordinary (short), long, and qualifying closures, plus stale, missing, out-of-order, and multiple-face sequences, behave safely. Calibration fails openly on overlap or a weak signal | Synthetic | Written (`blink-gesture.test.ts`, `blink-calibration.test.ts`; committed `2230926`, `08c6abc`) |
| ACCESS-11 | **Blink adapter:** the target captured at closure onset is selected exactly once, even if the highlight would have moved. Reacquisition after face loss selects nothing by itself | Synthetic | Written (`blink-gesture.test.ts`, with a simulated integration). The real runtime wiring and the explicit Resume on the paused surface are not yet tested |
| ACCESS-12 | Practice calibration on the real camera (now the iPad front camera). The operator chooses and confirms with two separate deliberate blinks, hands off all input devices | iPad | Not run |
| ACCESS-13 | Auto-scan + blink fallback reaches regenerate, guide, quick phrase, review, Cancel, Speak, My words, initiation, and recovery with no mouse-only menus (eyebrow mode: GEST-08) | iPad | Not run |
| ACCESS-14 | Active highlight, closure freeze, selection acknowledgment, cooldown, and face-lost status are visible and stable on the real UI | iPad | Not run |
| ACCESS-15 | Failing calibration (brow or blink) switches openly to a usable alternate input. No fake gesture. The prepared message is kept | iPad (a forced failure is acceptable) | Not run |

## G. iPad eyebrow and ElevenLabs

Mandatory tests from brief §29 G. Use fake clocks and numeric frame sequences for GEST rows; physical iPad results are a separate evidence category.

| ID | Required behavior | Type | Status |
| --- | --- | --- | --- |
| GEST-01 | Brow continuously raised for 499 ms or less causes no navigation; progress only | Synthetic (fake clock) | Written (`brow-gesture.test.ts`, uncommitted; no run recorded) |
| GEST-02 | Brow held ≥ 500 ms (allowing for frame sampling) causes exactly one `NAV_NEXT` | Synthetic | Written (`brow-gesture.test.ts`) |
| GEST-03 | A 2-second sustained raise still moves one option in total | Synthetic | Written (`brow-gesture.test.ts`) |
| GEST-04 | The next raise needs a neutral reset and cooldown; no carryover across a surface change | Synthetic + unit (reset on new surface) | Written (`brow-gesture.test.ts`) |
| GEST-05 | Blink closure freezes the original target; accepted after calibrated reopening, as a distinct input cycle | Synthetic + unit | Written (`gesture-arbiter.test.ts`; blink alone also ACCESS-11) |
| GEST-06 | Overlapping brow + blink never moves the target after closure onset and never produces two actions | Synthetic (arbiter) | Written (`gesture-arbiter.test.ts`) |
| GEST-07 | Face loss, stale frame, backgrounded tab, orientation change, and multiple-face ambiguity cancel pending actions | Synthetic + iPad | Synthetic part written (`brow-gesture.test.ts`, `gesture-arbiter.test.ts`; blink side ACCESS-10). Background and orientation on the iPad not run |
| GEST-08 | Every menu, initiation, memory, keyboard, and recovery surface is reachable with eyebrow NEXT and blink SELECT | Unit (target registry) + iPad | Planned |
| IPAD-01 | Small mirrored live preview at the top right is real, not recorded or uploaded, and can be hidden | iPad + network log (SYS-13) | Not run |
| IPAD-02 | "Eyebrow raise detected — Next" appears only after a committed NEXT, never while progress is under 500 ms | Unit (arbiter feedback) + iPad | Planned |
| IPAD-03 | Review defaults to Cancel; eyebrow NEXT moves to Speak; a **second** deliberate blink authorizes playback | Unit + iPad | Unit written (`speech-authorization.test.ts`; also CORE-03/06). iPad not run |
| TTS-01 | ElevenLabs requires the server-held key; browser bundles and network traffic never contain it | Unit (route) + build grep + network log | Unit written (`speech-api.test.ts`). Build grep and network log not run |
| TTS-02 | `eleven_v4_turbo` uses the Text-to-Dialogue WebSocket, never the standard TTS stream-input WebSocket | Unit (adapter URL/schema, mocked) | Written (`speech-api.test.ts`). Live: not run (the docs disagree on v4 ids for this socket) |
| TTS-03 | No unconfirmed suggestion triggers an ElevenLabs request; exactly the reviewed text is sent | Unit (reducer + route, mocked) | Written (`speech-api.test.ts`, `speech-authorization.test.ts`, `eleven-player.test.ts`) |
| TTS-04 | One utterance ID plays at most once across rerenders, races, and callbacks | Unit (speech controller) | Written (`eleven-player.test.ts`, `speech-authorization.test.ts`) |
| TTS-05 | Stop interrupts playback, invalidates late provider results, and never auto-replays | Unit + iPad | Unit written (`eleven-player.test.ts`, `speech-authorization.test.ts`). iPad not run |
| TTS-06 | Provider 401/403, 429 quota, timeout, malformed audio, and unavailable voice return safe errors | Unit (mocked) | Written (`speech-api.test.ts`) |
| TTS-07 | Basic device voice fallback is explicitly labeled and needs a new review and confirmation when speech may have partly played | Unit (reducer) | Written (`speech-authorization.test.ts`, `eleven-player.test.ts`) |
| TTS-08 | iPad Safari: one Enable Audio touch, then blink-confirmed audible playback without another touch, or flagged unverified | iPad | Not run |
| TTS-09 | Five naturalness lines (below), with real listener notes | iPad + listeners | Not run |
| TTS-10 | Confirmation-to-sound latency, completion/errors, and character usage are observed, not taken from vendor figures | iPad | Not measured |

**TTS-09 lines** (chosen before testing, from the brief): "Hey, how was your day?" · "I don't agree with that." · "Please don't change my medication." · "Only if I get to pick the movie." · "I'll be there at 3:15, Dr. Lee." For each, note the negation, name, number, question rise, and humor, and whether any word was dropped or changed. Record the listener count and device. No naturalness score unless listeners gave one.

## iPad acceptance trial (§24)

A real-device test, kept separate from synthetic tests. **Passing it does not validate use by people with ALS.** Record every trial, including misses, in [TEST_RESULTS.md](TEST_RESULTS.md). Until then every measure is **not measured**.

Setup to record: date and time, iPad model and iPadOS version, Safari, origin (Railway HTTPS), orientation, room and lighting, glasses yes/no, device angle and distance, tester (team member, not an AAC user), accepted calibration values (brow thresholds, hold 500 ms, release and cooldown; blink minimum/maximum closure and cooldown), AI source (live or fixture), and voice (ElevenLabs model and voice name, or basic device voice).

| Part | Procedure | Measures |
| --- | --- | --- |
| A. Eyebrow NEXT | 20 distinct deliberate raises, each announced beforehand. Include a few short (< 500 ms) attempts and a few 2-second holds | Committed NEXTs, **missed NEXTs**, **inadvertent NEXTs**, extra steps from long holds |
| B. Long-blink SELECT | 20 selections on an announced target | Correct selections, **missed selections**, **wrong-target selections** |
| C. Normal movement | 2 minutes of normal talking, reading, and blinking without trying to select | **Inadvertent NEXTs**, **false selections**, **false confirmations**, **unintended speech**. Target 0; report any |
| D. Face-loss recovery | Look away or leave the frame mid-raise and mid-closure, then return. Rotate the iPad once if practical | Gesture discarded? Paused? Explicit Resume needed? Nothing transferred? |
| E. Hands-free conversation | After one setup touch: 3 turns, including one None of these/guidance regeneration and one independent message, each confirmed by a separate blink on Speak | Turns completed, actions per turn, whether ElevenLabs audio was heard on each, any "Audio blocked" state |
| F. Timing | From event timestamps or a screen recording | Raise onset to committed NEXT; closure start to reopen; confirmation to first audible sound. Median and range with n |

Decision rule (for the team, not a clinical threshold): any false confirmation or unintended speech in parts C or E, or many missed commands in A or B, means the live demo uses the tested fallback (auto-scan + blink, keyboard/switch, or touch) and the presenter says the eyebrow path is experimental. Record the decision in [DECISIONS.md](DECISIONS.md).

### Earlier laptop blink gate (superseded)

The blink-first brief planned a 20-selection laptop-webcam gate. It was never run. Its blink parts are folded into parts B–D above.

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
| SYS-13 | Camera frames are not uploaded; model/WASM load only from this origin | Network log during gesture use (iPad via Web Inspector, or desktop Safari) | Not run (required before any "local only" claim) |
| SYS-14 | Responses use `cache-control: no-store` | Unit (route) | Planned |

## Browser and live scenarios (§30)

- Browser sequence: three turns, one rejected batch, guidance, quick interruption, parked question, composed message, initiation, cancelled review, stop speech, mic denial, cloud failure, End session. Status: planned.
- Live synthetic scenarios 1–14 from §30: run 14/14 with valid batches (see [TEST_RESULTS.md](TEST_RESULTS.md)). Human judgments are not recorded yet.
- Hands-free iPad sequence for the demo: calibrate → Enable Audio → partner question → eyebrow NEXT through options → blink None of these → Guide → select → review on Cancel → eyebrow to Speak → new blink → ElevenLabs audio → Start a conversation → face-lost recovery. Status: not run.

## Audit regressions and provider tests

| ID | Test | Status |
| --- | --- | --- |
| AUD-2 | An own-words reply answers the active question (also in local-only mode). A quick phrase does not close it | Written |
| AUD-5 | A discarded late result never restores a rejected batch | Written |
| OpenAI adapter | Strict json_schema, `store: false`, no tools, refusal mapping, one repair, 429/401 mapping (mocked fetch) | Written (`openai-provider.test.ts`) |
