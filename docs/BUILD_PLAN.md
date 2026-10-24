# Build plan

The gates are listed in dependency order (master prompt §34). Each gate should leave a runnable app. Status values are **done**, **partial**, **in progress**, **not started**, and **deferred**. A gate is done only when its checks are recorded in [TEST_RESULTS.md](TEST_RESULTS.md).

Timeline (America/Chicago, Saturday 2026-10-24): hacking began 09:00. Planning targets are feature freeze at 15:30 and submission verification at 17:00. These are our own targets, not official deadlines. Official submission and judging are at 17:15.

Last updated: 2026-10-24 ~11:00 CT.

| Gate | Required working result | Status | Notes |
| --- | --- | --- | --- |
| 0 — Repository | Inspection; personalized identity/docs; concise CLAUDE.md; presentation log; real commands | Partial | Package metadata, scripts, and docs are in place. CLAUDE.md/AGENT_NOTES.md updates are owned by the integrator |
| 1 — Baseline loop | Typed input → validated suggestions → selection → exact review → fresh confirmation → speech + delivery status | In progress | Reducer, schemas, fixtures, adapter, routes, runtime, speech controller, and UI are all present as of ~10:58 CT. Integration is unverified. Live AI is blocked by the missing key |
| 2 — Agency and access | Scanning; semantic regeneration; composition; local phrases; cancel/stop/pause/recovery; race tests | In progress | Reducer logic and unit tests exist. Scan and input controllers have landed; not browser-verified |
| 3 — Conversation-first | Intent guidance; quick interruptions; parked questions/history; initiation; preserved drafts | In progress | Reducer logic and unit tests exist. UI components have landed; not browser-verified |
| 4 — Consented adaptation | Session length feedback; editable approved preferences; scope/clear/disable/persistence; policy tests | In progress | Policy, observations, versioned store, and unit tests exist. Preferences/Memory UI is part of the landing components; not verified |
| 5 — Partner audio | Explicit recording; reviewed transcript; typed fallback; staged turns; echo prevention | In progress | Recorder, transcript client, and route have landed. Live transcription is blocked by the missing key |
| 6 — Optional camera | Local calibrated blink adapter with repeatability evidence | Deferred | P2; not started by decision |
| 7 — Final readiness | Executed checks; browser review; measurements; synced presentation docs; demo + backup | Not started | Must start no later than the 15:30 feature freeze |

## Cut order if time runs short

1. Blink (already deferred).
2. Measurement export, keeping reducer metric events.
3. Partner audio, keeping typed input as the documented path.
4. Simplify Preferences/Memory UI to a list with toggle and delete.

Never cut: independent composition, review plus separate confirmation, accurate source labels, or truthful docs.

## Per-gate routine

Run `npm run check` and record the result in [TEST_RESULTS.md](TEST_RESULTS.md). Update [PROGRESS.md](PROGRESS.md) and [PRESENTATION_LOG.md](PRESENTATION_LOG.md). Keep a working state.
