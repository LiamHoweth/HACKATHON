# Progress

**Last updated:** 2026-10-24, 12:10 CT, by the documentation workstream (Claude Code). The integrator updates this file after each gate.

## Direction change (~12:00 CT)

The governing brief is now the one-file **iPad gestures + ElevenLabs** prompt. Primary device: iPad Safari in landscape. A 500 ms both-eyebrow raise is NEXT (one step, no auto-scan). A calibrated long blink is SELECT. Review starts on Cancel; an eyebrow raise moves to Speak; a new long blink confirms. ElevenLabs is the required primary voice, with an explicitly labeled basic device voice fallback that needs a fresh review and confirmation. A small mirrored live camera preview sits at the top right. Auto-scan + blink, keyboard/switch, and touch are fallbacks. Decisions D27–D35 in [DECISIONS.md](DECISIONS.md). Gate status in [BUILD_PLAN.md](BUILD_PLAN.md).

## Timeline

| Time (CT) | Event | Evidence |
| --- | --- | --- |
| 09:00 | Hacking began | Event briefing |
| ~11:00 | Kernel, UI, and runtime integrated. Typecheck, lint, tests, and build pass. Browser fixture loop and switch scanning pass | [TEST_RESULTS.md](TEST_RESULTS.md), commits `2e49ff5`, `433d8ca` |
| 11:15 | Railway deployment `bd020b7e` (SUCCESS) | `railway deployment list` |
| ~11:18–11:35 | Live OpenAI `gpt-6-astra`, `gpt-transcribe`, and Railway smoke test verified. 14 live synthetic scenarios recorded | Commit `ea6f576`, [evidence/live-scenarios.json](evidence/live-scenarios.json) |
| 11:23 | Audit fixes committed | Commit `6ea84db` |
| 11:25 | Experimental native SwiftUI client committed (outside the demo path) | Commit `5fd9d2d` |
| 11:37 | Blink-first build committed: local MediaPipe, blink gesture machine, calibration, setup | Commit `2230926` |
| ~11:46 | Railway serves the blink model and WASM from our origin | [TEST_RESULTS.md](TEST_RESULTS.md) |
| 11:50 | Blink attribution, scan timing, calibration margin fixes. `npm test`: 134/134 in 10 files | Commits `08c6abc`, `fb98464` |
| ~12:00 | Brief changed to iPad eyebrow NEXT + blink SELECT + ElevenLabs | This file |
| 12:10 | Uncommitted, in progress: brow gesture, brow calibration, gesture arbiter (`src/access/`); camera preview and gesture feedback (`src/components/`); `POST /api/speech`, `GET /api/voices`, `src/server/elevenlabs/`; audio player (`src/audio/eleven-player.ts`, `src/runtime/useAudio.ts`); labeled basic-voice path (`src/core/`). New test files for GEST, IPAD-03, and TTS IDs. No run of them recorded. No ElevenLabs key | `git status` |

## Current status

- **Verified:** shared kernel (unit and desktop browser), switch/keyboard scanning (synthesized keys), live OpenAI replies and transcription with synthetic inputs, Railway access-code enforcement, and blink SELECT and calibration logic (synthetic tests only).
- **In progress:** eyebrow NEXT machine, gesture arbiter, brow calibration, top-right live preview, iPad landscape UI, Enable Audio / Test Voice, `POST /api/speech` with ElevenLabs, labeled basic-voice fallback.
- **Not configured:** ElevenLabs (no key). Live natural voice **not verified**.
- **Not iPad-verified:** everything. **No real camera test has been done.**
- **Not measured:** everything, including eyebrow and blink reliability and confirmation-to-sound latency.
- **Not verified:** audible speech, browser microphone capture, reload persistence, 200% zoom, and camera network behavior.

## Next exact actions

Times are targets in CT, not deadlines.

| By | Owner | Action |
| --- | --- | --- |
| 12:30 | Gesture + UI engineers | Get the GEST tests passing, then commit brow machine, arbiter, brow calibration, preview, and feedback ([TEST_PLAN.md](TEST_PLAN.md#g-ipad-eyebrow-and-elevenlabs)) |
| 12:30 | Voice engineer | Get the TTS mock tests passing and commit the speech route, adapter, and player |
| 12:40 | Integrator | Run `npm run check` and record the result, with the new test count, in TEST_RESULTS |
| As soon as Liam has it | **Liam** | Put the ElevenLabs key in `.env.local` and Railway variables (never in chat), plus an available `ELEVENLABS_VOICE_ID`. Set a credit limit on the key in the ElevenLabs dashboard |
| Key + 10 min | Integrator | One live ElevenLabs line (for example "Hey, how was your day?"). Record the model, transport, voice name, and result in TEST_RESULTS, without the key or voice id in logs |
| 13:30 | Integrator | Redeploy Railway (`railway up --service api`). Re-run the smoke test, including `/api/speech` with and without the access code |
| 14:00 | Integrator + operator, on the iPad | **iPad trial (§24):** 20 distinct eyebrow raises, 20 long-blink selections, 2 minutes of normal facial movement, face-loss recovery, and a hands-free 3-turn conversation (one regeneration, one independent message) with ElevenLabs audio after one setup touch. Record missed commands, inadvertent NEXTs, wrong-target selections, false confirmations, and unintended speech separately. Record lighting, glasses, angle, and orientation |
| 14:30 | Integrator + listeners | **TTS-09:** the five naturalness lines on the iPad, with listener notes on negation, names, numbers, questions, and humor. State the listener count |
| 14:45 | Integrator | Network log on the iPad (or desktop Safari) during gesture use: no frames uploaded, model/WASM from our origin only (SYS-13). Then update [PRIVACY_AND_LIMITATIONS.md](PRIVACY_AND_LIMITATIONS.md) |
| 15:30 | Team | **Freeze.** Rehearse [DEMO_SCRIPT.md](DEMO_SCRIPT.md) twice on the iPad and once with the fallbacks. Update the README table, [PRESENTATION_LOG.md](PRESENTATION_LOG.md), and [JUDGE_QA.md](JUDGE_QA.md) with real numbers only |
| 17:00 | **Liam** | Review and submit [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md) |

## Blockers and risks

| Item | Effect | Smallest human action |
| --- | --- | --- |
| No ElevenLabs key | The required primary voice can't be verified | Liam adds the key and a voice id privately |
| iPad Safari audio policy | Blink-confirmed speech may be blocked without a new touch | Test on the iPad after one Enable Audio touch. If blocked, show "Audio blocked" and say so in the demo |
| Eyebrow and blink reliability unknown | The flagship demo could fail live | Run the iPad trial early, in the presentation room if possible. Decide on the fallback by 15:30 |
| Camera permission may need a helper | Setup is not fully hands-free | Say so in the demo. A helper taps Allow and Enable Audio |
| Railway is behind the working tree | The deployed site lacks the eyebrow, iPad UI, and ElevenLabs work | Redeploy after they land |
| Event AI and pre-event rules not recorded | Disclosure accuracy | Liam confirms with organizers and records it in [PROJECT_BRIEF.md](PROJECT_BRIEF.md) |
