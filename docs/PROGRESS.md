> **Historical working document** from earlier in the hackathon (October 24, 2026). Some details are superseded; see [README.md](../README.md) for the current state.

# Progress

**Last updated:** 2026-10-24, 12:23 CDT, by the presentation-evidence workstream (Claude Code), against commit `5de1a57`. The integrator updates this file after each gate.

## Direction (since ~12:00 CT)

The governing brief is the one-file **iPad gestures + ElevenLabs** prompt. Primary device: iPad Safari in landscape. A 500 ms both-eyebrow raise is NEXT (one step, no auto-scan). A calibrated long blink is SELECT. Review starts on Cancel; an eyebrow raise moves to Speak; a new long blink confirms. ElevenLabs is the required primary voice, with an explicitly labeled basic device voice fallback that needs a fresh review and confirmation. A small mirrored live preview sits at the top right. Auto-scan + blink, keyboard/switch, and touch are fallbacks. Decisions D27–D35 in [DECISIONS.md](DECISIONS.md). Gate status in [BUILD_PLAN.md](BUILD_PLAN.md).

## Timeline

| Time (CT) | Event | Evidence |
| --- | --- | --- |
| 09:00 | Hacking began | Event briefing |
| ~11:00 | Kernel, UI, and runtime integrated. Typecheck, lint, tests, and build pass. Browser fixture loop and switch scanning pass | [TEST_RESULTS.md](TEST_RESULTS.md), commits `2e49ff5`, `433d8ca` |
| 11:15 | Railway deployment `bd020b7e` | `railway deployment list` |
| ~11:18–11:35 | Live OpenAI `gpt-6-astra`, `gpt-transcribe`, and Railway smoke test verified with synthetic inputs. 14 live synthetic scenarios recorded | Commit `ea6f576`, [evidence/live-scenarios.json](evidence/live-scenarios.json) |
| 11:37 | Blink-first build: local MediaPipe, blink gesture machine, calibration | Commit `2230926` |
| 11:50 | Blink attribution, scan timing, calibration fixes. 134/134 tests | Commits `08c6abc`, `fb98464` |
| 12:13 | **Eyebrow NEXT + blink SELECT, gesture arbiter, brow calibration, iPad landscape UI and live preview, `/api/speech` + `/api/voices` (ElevenLabs), audio player with "Enable audio", labeled basic-voice fallback** committed | Commit `5de1a57` |
| 12:13 | Railway deployment `f65385bb` (SUCCESS) | `railway deployment list` |
| 12:15–12:19 | iPad **Simulator** Safari screenshots (touch, fixture, no camera): setup, audio enabled, board, review, portrait | `docs/screenshots/ipad-sim-*.png` (untracked) |
| 12:18 | `npx vitest run`: **285/285 passed in 17 files** (synthetic frames, mocked providers) | Not yet in TEST_RESULTS |
| 12:20 | Railway probe without access code: `/api/status` 200 with `speech.configured: false`; `/api/voices` NOT_CONFIGURED; malformed `/api/speech` → INVALID_INPUT | Not yet in TEST_RESULTS |
| 12:23 | Presentation log, demo script, judge Q&A, slide outline, submission draft refreshed to this state | [PRESENTATION_LOG.md](PRESENTATION_LOG.md) |

## Done

- **Implemented + unit/synthetic-tested:** eyebrow NEXT (500 ms hold, latch, neutral rearm), long-blink SELECT, the single gesture arbiter, brow and blink calibration, face-loss pause, review-on-Cancel with fresh-cycle confirmation, no speech for unconfirmed text.
- **Implemented + mocked-provider-tested:** ElevenLabs `/api/speech` (Text-to-Dialogue WebSocket, HTTP option, server-only key, access gate, rate limit, daily character budget), `/api/voices`, one-shot audio player with Stop and "Audio blocked" state, labeled basic-voice fallback (TTS-01 to TTS-07).
- **Rendered in iPad Simulator:** landscape and portrait layouts in touch mode with fixtures.
- **Live with synthetic inputs (before the 12:13 redeploy):** OpenAI suggestions and transcription.
- **Deployed:** Railway `f65385bb`, HTTPS, reporting speech not configured.
- Prior art checked and recorded in `docs/REFERENCES.md` (12:26 CT). VisioALS is the closest overlap; JUDGE_QA updated.

## Not done / not verified

- **ElevenLabs: implemented, live verification blocked.** `ELEVENLABS_API_KEY` is not configured locally or on Railway. No ElevenLabs audio has been generated or heard.
- **Physical iPad: nothing verified.** No real camera frames, eyebrow raises, blinks, preview, or audio on hardware. iPad trial (§24): **not run**.
- **Not measured:** everything, including eyebrow and blink reliability and confirmation-to-sound latency.
- Not verified: audible speech on any device, browser microphone capture, camera network behavior (SYS-13), 200% zoom, reload persistence, and live replies on deployment `f65385bb`.
- Uncommitted wave-3 work in the tree at 12:25 CT (reordered "More tools" with "Pause" first, a `/trial` page, hands-free pipeline and accessibility tests, smoke scripts). Its test count (about 296 per the integrator notes) is not reflected here until it is committed and run.
- [TEST_RESULTS.md](TEST_RESULTS.md) still shows 134/134 and lacks the 12:18 test run and the 12:20 Railway probe.

## Next exact actions

Times are targets in CT, not deadlines.

| By | Owner | Action |
| --- | --- | --- |
| 12:35 | Integrator | Record the 285/285 run (with `npm run check`), the iPad Simulator captures, and the 12:20 Railway probe in TEST_RESULTS. Decide whether to commit the `ipad-sim-*.png` screenshots |
| As soon as possible | **Liam** | Put a **newly rotated** ElevenLabs key in `.env.local` and Railway variables as `ELEVENLABS_API_KEY` (never in chat), plus `ELEVENLABS_VOICE_ID`. Set a credit limit in the ElevenLabs dashboard |
| As soon as possible | **Liam** | Rotate any key that was shared outside a secret channel (brief, top section), including `OPENAI_API_KEY` if it was exposed; update `.env.local` and Railway; revoke the old key |
| Key + 10 min | Integrator | Run `node scripts/elevenlabs-smoke.mjs --voices-only`, choose a voice, then the paid smoke run (procedure in `docs/evidence/tts/README.md`; both uncommitted at 12:25). Or one live line by hand (for example "Hey, how was your day?"). Record model, transport, voice name, and result in TEST_RESULTS, without the key or voice id in logs. If v4 fails on the socket, try `ELEVENLABS_TRANSPORT=http` and label it |
| Key + 20 min | Integrator | Redeploy if needed and smoke-test `/api/speech` with and without the access code; one live reply through Railway |
| 14:00 | Integrator + operator, on the **physical iPad** | **iPad trial (§24):** 20 eyebrow raises, 20 long-blink selections, 2 minutes of normal movement, face-loss recovery, and a hands-free 3-turn conversation with ElevenLabs audio after one setup touch. Record misses, inadvertent NEXTs, wrong targets, false confirmations, unintended speech, and conditions |
| 14:30 | Integrator + listeners | **TTS-09** listening lines on the iPad, with listener count |
| 14:45 | Integrator | SYS-13 network log during gesture use (no frames uploaded) |
| 15:30 | Team | **Freeze.** Rehearse [DEMO_SCRIPT.md](DEMO_SCRIPT.md) twice on the iPad and once with each fallback. Update PRESENTATION_LOG and JUDGE_QA with real numbers only |
| 17:00 | **Liam** | Review and submit [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md) |

## Blockers and risks

| Item | Effect | Smallest human action |
| --- | --- | --- |
| **No ElevenLabs key** | The required primary voice can't be verified or demoed | Liam adds a newly rotated key and a voice id privately |
| **Key rotation** | A key shared outside a secret channel must be treated as exposed (brief) | Liam rotates the ElevenLabs key and the OpenAI key if exposed, then updates `.env.local` and Railway |
| **No physical iPad trial** | The flagship hands-free demo is untested on hardware; it could fail live | Run the trial early, in the presentation room if possible. Pick the fallback by 15:30 |
| iPad Safari audio policy | Blink-confirmed speech may be blocked without a new touch | Test on the iPad after one "Enable audio & test voice" tap |
| Camera permission may need a helper | Setup is not fully hands-free | Say so in the demo |
| Setup copy claims "Camera images never leave this device." | Stated as fact before SYS-13 | Run SYS-13, or soften the copy (UI owner) |
| Event AI and pre-event rules not recorded | Disclosure accuracy | Liam confirms with organizers and records it in [PROJECT_BRIEF.md](PROJECT_BRIEF.md) |
