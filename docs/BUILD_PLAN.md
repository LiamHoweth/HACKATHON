# Build plan

The governing brief is now the **blink-first** master prompt (`Still_Here_Claude_Master_Prompt_BLINK_FIRST.md`, supplied locally and not committed). It supersedes the earlier brief. Its gates (§34) are listed below in dependency order. A gate is **done** only when its checks are recorded in [TEST_RESULTS.md](TEST_RESULTS.md). Other status values are **partial**, **in progress**, and **not started**.

Timeline (America/Chicago, Saturday 2026-10-24): hacking began at 09:00. Our planning targets are feature freeze at 15:30 and submission verification at 17:00. Official submission and judging are at 17:15.

Last updated: 2026-10-24, 11:35 CT.

| Gate | Required working result | Status | Evidence / what is missing |
| --- | --- | --- | --- |
| 0 — Repository | Inspection, personalized identity and docs, concise CLAUDE.md, presentation log, real commands | Done | Docs reframed for blink-first at 11:30. The integrator owns CLAUDE.md and AGENT_NOTES.md (AGENT_NOTES still describes Anthropic as the live provider) |
| 1 — Shared communication kernel | Typed partner message → validated suggestions → unified scanner → immutable review → fresh confirmation → exact speech; keyboard smoke test | Done (audible speech unconfirmed) | 82/82 unit/API tests. Browser fixture loop and switch-scanning pass with synthesized keys. Live OpenAI verified. A human listener has not confirmed audible speech |
| 2 — **Primary blink access** | Real webcam tracking, calibration/tutorial, freeze at closure, deliberate-blink selection, cooldown, hands-free select plus a second-blink confirm on the actual UI | **In progress** | Uncommitted at 11:35: pinned MediaPipe assets, detector, pure gesture state machine, calibration logic with synthetic tests passing (ACCESS-10/11), and calibration/status components. **Not yet wired into the app runtime.** No real-webcam test yet |
| 3 — Blink-operable agency | Regeneration, scanning composition, phrases, cancel/stop/pause/error recovery, all reachable with blinks; reliable alternate inputs | Partial | All of these work through the shared target registry with keyboard/switch/pointer (unit plus browser). They have not been operated with blinks |
| 4 — Blink-operable conversation tools | Intent guidance, quick interruptions, parked questions/history, initiation, preserved drafts | Partial | Unit tests and a browser pass via pointer/scripted clicks. Blink operation not tested |
| 5 — Consented adaptation | Session length feedback, approved preferences, scope/clear/disable/persistence, approvals reachable by blink | Partial | Unit tests and a browser pass in fixture mode. Reload persistence and blink reachability not tested |
| 6 — Partner audio | Explicit recording, reviewed transcript, typed fallback, staged turns, echo prevention, blink-operable controls | Partial | Server transcription verified live with a synthetic clip. Browser microphone capture not exercised |
| 7 — Final readiness | Real webcam and voice verification, tests/build, blink reliability numbers, live hands-free demo, synced docs, backup, transparent fallback | Not started | Starts by the 15:30 freeze. Also needs a Railway redeploy (latest deploy is 11:15, before the audit fixes) |

## Cut order if time runs short

1. P2 items: advanced ranking, shorthand, alternate gestures (none started).
2. Measurement export UI. Keep the reducer metric events and record the blink gate by hand.
3. Partner audio in the demo. Keep typed partner input.
4. Simplify the Preferences/Memory screen to a list with toggle and delete.

**Do not cut** real-webcam calibration and the blink reliability gate merely because keyboard scanning works. If blink fails the gate, keep the keyboard/switch fallback and say openly that the webcam demo remains experimental. Never cut independent composition, review plus a separate confirmation, accurate source labels, or truthful docs.

## Per-gate routine

Run `npm run check`, and the integrator records the results in [TEST_RESULTS.md](TEST_RESULTS.md). Update [PROGRESS.md](PROGRESS.md) and [PRESENTATION_LOG.md](PRESENTATION_LOG.md). Keep a working state.
