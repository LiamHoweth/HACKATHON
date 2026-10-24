# Build plan

The governing brief is now the one-file **iPad gestures + ElevenLabs** master prompt (`Still_Here_Claude_ONE_FILE_ElevenLabs_iPad_Implementation.md`, supplied locally and not committed). It supersedes the blink-first brief. Its gates (§34) are listed below in dependency order. A gate is **done** only when its checks are recorded in [TEST_RESULTS.md](TEST_RESULTS.md). Other status values are **partial**, **in progress**, and **not started**.

Timeline (America/Chicago, Saturday 2026-10-24): hacking began at 09:00. Our planning targets are feature freeze at 15:30 and submission verification at 17:00. Official submission and judging are at 17:15.

Last updated: 2026-10-24, 12:10 CT.

| Gate | Required working result | Status | Evidence / what is missing |
| --- | --- | --- | --- |
| 0 — Repo reality | Inspection, personalization, CLAUDE.md, setup/test scripts, presentation log | Done (docs reframed for iPad at 12:05) | The integrator owns CLAUDE.md and AGENT_NOTES.md. AGENT_NOTES still describes blink-first |
| 1 — Shared kernel | Contracts, typed input actions, three validated replies, review, fresh confirmation, speech authorization, backend proxy | Done (audible speech unconfirmed) | 134/134 tests at 11:50. Browser fixture loop and switch scanning pass with synthesized keys. Live OpenAI verified |
| **2 — Main iPad gesture path** | Local front camera, neutral/raised/closed calibration, **500 ms eyebrow NEXT** with release rearm, long-blink SELECT, arbiter, small mirrored self-view, progress and accepted-gesture feedback, hands-free review | **In progress** | Blink SELECT machine and calibration committed with synthetic tests. Brow machine, brow calibration, arbiter, preview, and gesture feedback present but uncommitted; their test files (GEST-01 to 07) exist but no run is recorded. **No real camera test. Not iPad-verified** |
| **3 — ElevenLabs natural voice** | Verified key/voice/model; secure Text-to-Dialogue WebSocket or a valid ElevenLabs alternative; audio on the iPad after setup; Stop; no duplicate or unconfirmed speech; labeled fallback | **In progress** | `POST /api/speech`, `GET /api/voices`, `src/server/elevenlabs/` (TTD WebSocket + HTTP), one audio player, and the labeled basic-voice path present but uncommitted. Mock test files (TTS-01 to 07, IPAD-03) exist, no run recorded. **No ElevenLabs key, so live voice is not configured and not verified** |
| 4 — Conversation agency | None of these, guidance, scanning keyboard, phrases, initiation, parked questions, stale-result protection across gesture surfaces | Partial | Unit tests and browser passes with pointer/switch. Not operated with eyebrow/blink |
| 5 — Consented context | Session observations, approved preferences, profiles, scoped memory UI, disable/clear | Partial | Unit tests and a fixture browser pass. Reload persistence and gesture reachability not tested |
| 6 — Partner audio | Recording, reviewed transcript, typed fallback, echo prevention | Partial | Server transcription verified with a synthetic clip. Browser/iPad microphone not exercised |
| 7 — Real verification | Type/lint/test/build, the iPad trial (§24), latency measurements, privacy/network check, evidence, rehearsed demo, transparent backup | Not started | Needs the ElevenLabs key, a redeploy, and the physical iPad. See [PROGRESS.md](PROGRESS.md#next-exact-actions) |

## Cut order if time runs short

1. P2 items: advanced ranking, shorthand, extra gesture variants, voice picker beyond one tested voice.
2. Progressive audio streaming. Keep the MP3 blob ([D30](DECISIONS.md)).
3. Measurement export UI. Keep the reducer metric events and record the iPad trial by hand.
4. Partner audio in the demo. Keep typed partner input.
5. Simplify the Preferences/Memory screen to a list with toggle and delete.

**Do not cut** the real iPad trial, the Enable Audio step, or the labeled basic-voice fallback because desktop tests pass. If eyebrow NEXT fails on the iPad, use auto-scan + blink (or keyboard/switch/touch) and say so. If ElevenLabs is unavailable, say "natural voice not configured" and use the labeled basic voice. Never cut independent composition, review plus a separate confirmation, accurate source and voice labels, or truthful docs.

## Per-gate routine

Run `npm run check`, and the integrator records the results in [TEST_RESULTS.md](TEST_RESULTS.md). Update [PROGRESS.md](PROGRESS.md) and [PRESENTATION_LOG.md](PRESENTATION_LOG.md). Keep a working state.
