# Progress

**Last updated:** 2026-10-24, 11:35 CT, by the documentation workstream (Claude Code). The integrator updates this file after each gate.

## Direction change (~11:20 CT)

The governing brief is now **blink-first**. Webcam-detected deliberate eye closure over automatic scanning is the primary input and the judging demo. Keyboard, switch, and pointer are fallbacks. Gate status is in [BUILD_PLAN.md](BUILD_PLAN.md).

## Timeline

| Time (CT) | Event | Evidence |
| --- | --- | --- |
| 09:00 | Hacking began | Event briefing |
| ~11:00 | Kernel, UI, and runtime integrated. Typecheck, lint, tests, and build pass. Browser fixture loop and switch scanning pass | [TEST_RESULTS.md](TEST_RESULTS.md), commits `2e49ff5`, `433d8ca` |
| 11:15 | Railway deployment `bd020b7e` (SUCCESS) | `railway deployment list` |
| ~11:18–11:35 | Live OpenAI `gpt-6-astra`, `gpt-transcribe`, and Railway smoke test verified. 14 live synthetic scenarios recorded | Commit `ea6f576`, [evidence/live-scenarios.json](evidence/live-scenarios.json) |
| 11:23 | Audit fixes committed (not yet deployed) | Commit `6ea84db` |
| 11:25 | Experimental native SwiftUI client committed (outside the demo path) | Commit `5fd9d2d` |
| 11:25 | `npx vitest run`: 82/82 passed in 6 files | Docs workstream run on the working tree; integrator to record |
| 11:30 | Blink work in progress (uncommitted): MediaPipe assets in `public/`, `scripts/copy-mediapipe-assets.mjs`, blink types in `src/runtime/contract.ts`, `accessMode: 'blink'` default | `git status` |
| 11:32 | Uncommitted `src/access/blink-{detector,gesture,calibration}.ts`, `src/components/Blink{Calibration,Status}.tsx`, and two blink test files present. `npx vitest run`: 106/106 in 8 files. Blink not yet wired into `useStillHere` | Docs workstream run; integrator to record |

## Current status

- **Verified:** shared kernel (unit and browser), switch/keyboard scanning (synthesized keys), live OpenAI replies and transcription with synthetic inputs, and Railway access-code enforcement.
- **In progress:** the gesture state machine and calibration logic pass synthetic tests (uncommitted). The detector, calibration UI, status UI, blink-first setup, and runtime wiring are not verified. **No camera test has been done.**
- **Not measured:** everything, including blink reliability.
- **Not verified:** audible speech, browser microphone capture, reload persistence, 200% zoom, and camera network behavior.

## Next exact actions

1. **Blink engineers:** wire the detector and gesture machine into the runtime (snapshot the target at `closure-start`, emit one guarded `ACTIVATE` on `select`, face lost → paused surface with an explicit Resume). Finish the calibration and status UI. Commit with `public/models` and `public/wasm` and their README.
2. **Integrator, real webcam:** run calibration on the demo laptop in the demo lighting. Then run the **blink reliability gate** ([TEST_PLAN.md](TEST_PLAN.md#blink-reliability-gate)): 20 intentional selections, a period of ordinary blinking, and tracking loss/recovery. Record missed gestures, false selections, false confirmations, gesture duration, and scan wait in [TEST_RESULTS.md](TEST_RESULTS.md).
3. **Integrator, privacy:** watch the browser network log during blink use. Confirm whether any request carries frames and whether the model/WASM load only from this origin. Then update the camera row in [PRIVACY_AND_LIMITATIONS.md](PRIVACY_AND_LIMITATIONS.md).
4. **Redeploy Railway** (`railway up --service api`) after the blink work lands. Re-run the smoke test, including blink on HTTPS.
5. **Listen** to speech on the demo laptop. Record the voice name and `localService`.
6. **Human review** of the 14 live scenario outputs (`humanJudgment` fields).
7. **15:30 freeze**, then rehearse [DEMO_SCRIPT.md](DEMO_SCRIPT.md) hands-free at least twice, plus once with the keyboard/switch fallback. Update the README table, [PRESENTATION_LOG.md](PRESENTATION_LOG.md), and [JUDGE_QA.md](JUDGE_QA.md) with real numbers.
8. **By 17:00:** Liam reviews and submits [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md).

## Blockers and risks

| Item | Effect | Smallest human action |
| --- | --- | --- |
| Blink reliability unknown | The flagship demo could fail live | Run the reliability gate early, in the presentation room if possible. Decide on the fallback by 15:30 |
| Camera permission may need a helper | Setup is not fully hands-free | Say so in the demo. A helper clicks Allow |
| Railway is behind `main` | The deployed site lacks the audit fixes and blink | Redeploy after the blink work lands |
| Event AI and pre-event rules not recorded | Disclosure accuracy | Liam confirms with organizers and records it in [PROJECT_BRIEF.md](PROJECT_BRIEF.md) |
