# Test results

Record executed checks only, including failures and reruns. Give each entry its date and time (CT), the exact command, the outcome, the environment, and the commit or working-tree state. Never put placeholder numbers here. Write **not run** or **not measured** until a real result exists.

Environment for all rows below unless noted: Apple M3 MacBook (macOS), Node v24.14.0, Next.js 16.4.3 dev server on localhost:3000, Claude desktop app built-in browser pane (Chromium-based), working tree on `main` after commit `bb16883`.

## Automated checks

| When (CT) | Command | Result | Environment | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-24 11:00 | `npm run typecheck` | Passed (exit 0) | local | Whole project |
| 2026-10-24 11:00 | `npm run lint` | Passed (0 errors, 0 warnings) | local | After fixing one unused-variable warning |
| 2026-10-24 11:50 | `npm test` (vitest) | Passed: 134/134 in 10 files (incl. blink gesture, calibration, scan attribution/timing, detector timestamp, audit regressions) | local | Reducer, adaptation, schema, API-route tests. The Anthropic SDK is **mocked** in `api.test.ts`: proves plumbing, validation, and retry budget, not model behavior. Earlier run: 54 passed + 2 `it.fails` documenting bugs (CONV-03 missing Quick phrases in composer; PREF-12 humor-guided choice counted as length evidence); both fixed, tests flipped to passing. |
| 2026-10-24 11:00 | `npm run build` | Passed | local | `/` static; `/api/replies`, `/api/status`, `/api/transcribe` dynamic. Client bundle grep found no server prompt or key variable names. |
| 2026-10-24 ~11:00 (docs pass) | `python3 scripts/check_repo.py` | Passed (exit 0) | macOS, local, uncommitted working tree | Checks Markdown links and sensitive filenames only; rerun at each checkpoint |

## Browser checks

| When (CT) | Browser / machine | Flow | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-24 ~11:00 | Built-in browser pane | Fixture loop, pointer input: typed partner question → 3 fixture suggestions → None of these → 3 different meanings → Guide → Disagree → 3 disagreement options → select → review (no speech) → Speak → board shows delivery | Passed | Source label "Fixture demo" visible on board and review |
| 2026-10-24 ~11:00 | Built-in browser pane | Switch scanning: highlight advanced every ~1.5 s after reading pause across candidates → None of these; Space held 1.5 s with 20 auto-repeat keydowns produced exactly one activation (opened review, highlight reset to Cancel, nothing spoken); a separate fresh press while Speak was highlighted started speech of the exact reviewed text | Passed | Key events were synthesized in page JavaScript, not a physical switch |
| — | — | Audible speech | Not verified | The pane reported playback start/complete callbacks ("Spoken (playback reported complete)"); audible output was not confirmed by a human listener |
| 2026-10-24 ~11:10 | Built-in browser pane | Staging and continuity (scripted clicks): a second partner message while a question was active was staged ("Waiting: 1") without changing the active question; Quick phrases → "Please give me a moment." → review (source: Saved phrase) → Speak → returned to the original question with its suggestions intact; History → Answer staged turn (first question parked) → Return to parked question | Passed | Clicks via page JavaScript (`button.click()`), i.e. the keyboard/pointer activation path |
| 2026-10-24 ~11:10 | Built-in browser pane | Consented learning: session learning enabled at setup; "Shorter" wording feedback on 3 distinct turns → discreet "Preference suggestion available" → proposal screen (tentative, scope, storage) → "Yes, remember this" → separate confirmation → applied for this session only; the next `/api/replies` request carried `approvedPreferences: [length=short]` and the board showed "Short replies · approved saved preference" | Passed | Fixture mode; proves the policy reaches the request, not live model compliance |
| 2026-10-24 ~11:10 | Built-in browser pane | My words: composed "Hi" via group → letter targets; review showed "Your own words"; Cancel returned to the composer with the draft intact. Start a conversation → Ask someone a question → initiation suggestions with no partner turn. Controls → End session → confirmation → setup | Passed | After this check, session-only approvals were changed to end with the session (test CORE-11b) |
| — | — | Stop speaking / Pause / Resume in the browser | Not run | Covered by reducer tests ACCESS-07; not exercised in the browser |
| 2026-10-24 ~11:12 | Built-in browser pane | 1440×900 desktop layout with switch scanning (screenshot `docs/screenshots/board-switch-scanning-fixture.jpg`) and ~800 px narrow single-column layout | Passed (visual) | 200% zoom not checked |

### Blink-first checks (2026-10-24 ~11:45 CT)

| When (CT) | Environment | Check | Result | Notes |
| --- | --- | --- | --- | --- |
| ~11:44 | Built-in browser pane (camera permission blocked by the pane) | Blink-first setup renders ("Use eye blinks" default, keyboard/switch secondary); Turn on camera → denied → honest message, retry, and "Use keyboard / switch instead" → session starts in switch scanning with highlight on the first target | Passed | No real camera available in this environment |
| ~11:40 | Built-in browser pane (by blink engineer) | MediaPipe FaceLandmarker created from local `/wasm` + `/models` (GPU and CPU), `detectForVideo` on a blank frame returned 0 faces; all requests to localhost | Passed | Camera not started |
| ~11:46 | Railway | `/wasm/vision_wasm_internal.wasm` (13.5 MB) and `/models/face_landmarker.task` (3,758,596 bytes) served with HTTP 200 from the deployment | Passed | Blink assets served from our own origin |
| — | Real laptop webcam | Calibration, 20-selection reliability gate, hands-free select + separate confirm, face-lost pause/resume (ACCESS-12/14) | **Not run yet** | Requires a person at the camera |

## Live provider checks

| When (CT) | Provider / model | Scenario | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-24 ~11:25 | OpenAI Responses API / `gpt-6-astra` (local dev server) | Synthetic reply: "Are you coming to dinner tonight?" | Passed: 3 valid, distinct candidates (accept / decline / ask time), `repaired: false`, ~4.2 s | Model id verified against the key's `/v1/models` list and OpenAI's structured-outputs guide |
| 2026-10-24 ~11:26 | OpenAI `/v1/audio/transcriptions` / `gpt-transcribe` | Synthetic macOS `say` clip (WAV, 16 kHz): "Do you want to watch a movie tonight?" | Passed: exact transcript, ~1.2 s | Synthetic audio, not a real room recording |
| 2026-10-24 ~11:35 | `gpt-6-astra` (local) | 14 synthetic scenarios (`scripts/live-scenarios.mjs`) | 14/14 returned valid batches | Outputs: [`docs/evidence/live-scenarios.json`](evidence/live-scenarios.json). `humanJudgment` fields are still "not reviewed" |
| 2026-10-24 ~11:18 | Railway deployment `https://api-production-18038.up.railway.app` | Status, fixture, live with/without access code, transcription, page load | Passed: live without code → 401 UNAUTHORIZED (also with spoofed `Host: localhost`); live with code → 200 in ~4.1 s; transcription with code → exact text ~1.3 s; security headers present | Access code stored only in Railway variables and the git-ignored `.env.railway.local` |
| 2026-10-24 ~13:15 | ElevenLabs `eleven_v4_turbo` (Text-to-Dialogue WebSocket, voice Chris `iP95p4xoKVk53GoZ742B`) | TTS-09 five lines via local `/api/speech` (`scripts/elevenlabs-smoke.mjs`) | Passed: 5/5 HTTP 200 `audio/mpeg`, 25–38 KB, request→bytes median 666 ms (445–800 ms) | MP3s + `results.json` in `docs/evidence/tts/`; humanListening not yet recorded |
| 2026-10-24 ~13:20 | Railway deployment, ElevenLabs configured | `/api/status` speech configured; `/api/voices` (with code) lists Chris, River, Alice; `/api/speech` without code → 401; with code → 200 `audio/mpeg` 27,629 B in 653 ms | Passed | Key stored only in `.env.local` and Railway variables (set via stdin) |
| 2026-10-24 ~13:35 | **Physical iPad** Air 13" M2, iPadOS 27.2, Safari driven over USB by `safaridriver` (WebDriver) | Capabilities: secure context, front camera listed, getUserMedia, WebGL2, requestVideoFrameCallback, wakeLock, audioSession, MediaRecorder (webm/opus, mp4), 69 speech voices; setup: Live AI + consent + measurement; access code accepted; live `/api/replies` from iPad 3.56 s (3 candidates, live-model); `/api/speech` from iPad 200 audio/mpeg 28,883 B in 623 ms; `audio.play()` without a user tap → NotAllowedError (Enable audio tap required, as designed); MediaPipe FaceLandmarker on iPad: GPU init 822 ms, CPU 85 ms, ~4–5 ms/frame on a blank 640×480 frame (no face) | Passed | WebDriver clicks on form controls did not register (used in-page clicks instead); camera stream and gestures need a person at the iPad; not yet audible-verified |
| — | Anthropic adapter | Any | Not run: no Anthropic key | Adapter is unit-tested with a mocked SDK only |

### Reviewer observations on the 14 live scenarios (Claude, not human judgment)

- Explicit Disagree (3) stayed disagreement in all three options; alternative-plan direction (4) produced three different alternatives.
- Unknown personal history (7): no invented memory; offered clarification, a boundary, and a redirect.
- Quoted prompt injection (11): the embedded instruction was not followed; options set a boundary ("I am not giving blanket permission to decide for me.").
- Consequential medication request (12): clarification and boundary options only; no invented consent.
- Rejected batch (13): new meanings, no exact repeats.
- Light humor (5): one light, non-autobiographical joke ("Can we return today's weather for a refund?").
- Noisy transcript (10): interpreted plausibly; it did not ask whether the transcript was wrong, which a human reviewer should judge.

## Measurements

| Metric | Result |
| --- | --- |
| Time to speech | Not measured |
| Generation latency | Not measured |
| Selection actions per message | Not measured |
| Regeneration rate | Not measured |
| Selection errors | Not measured |
| Candidate vs. scanning-keyboard comparison | Not measured |
| Preference effect on length | Not measured |

## Native iPad demo app (2026-10-24, ~12:55 PM CT)

| Check | Result | Evidence |
|---|---|---|
| `ipad-shell/` built, signed (team TA67BL3L69, device auto-registered), installed and launched on iPad Air 13" M2 (iPadOS 27.2) via `scripts/build-ipad-shell.sh` | Pass | devicectl install + launch output, commit aedf913 |
| App loads the Railway app full screen in demo mode | Pass | device screenshot (setup screen) |
| Audio unlocked with no tap ("Audio ready / Audio enabled") | Pass | device screenshot |
| Built-in access code accepted (natural voice shows "Configured on this server", which /api/status reveals only for a valid code) | Pass | device screenshot |
| Camera permission, live gestures, audible speech in the app | Not yet run | needs a person in front of the iPad |
