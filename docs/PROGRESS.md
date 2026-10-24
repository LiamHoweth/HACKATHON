# Progress

**Last updated:** 2026-10-24 ~11:00 CT, by the documentation workstream (Claude Code). The integrator should update this file after each gate.

## Current status

- **Present in source:** `src/core/` (types, state, reducer, targets, context builder, schemas, limits, phrases), `src/adaptation/` (observations, preference policy), `src/server/` (config, request guards, reply prompt, Anthropic provider, validation, fixtures), `src/runtime/contract.ts`, and unit tests in `src/tests/` (reducer, adaptation, schemas, helpers).
- **Landed at ~10:58 CT, integration ongoing (not verified):** `src/runtime/useStillHere.ts` + `effects-runner.ts`, `src/access/{scan,input}-controller.ts`, `src/audio/*` (speech, recording, transcript client, voices), `src/adaptation/preference-store.ts`, `src/metrics/export.ts`, `src/server/transcription.ts`, `src/components/*`, `src/app/{layout,page}.tsx`, `src/app/api/{replies,status,transcribe}/route.ts`, and `src/tests/api.test.ts`.
- **Not run by this workstream:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Results belong in [TEST_RESULTS.md](TEST_RESULTS.md).
- **Docs:** README, `.env.example`, and all `docs/*` presentation files were drafted. Claims are marked planned / in progress / not verified.

## Blockers

| Blocker | Effect | Smallest human action |
| --- | --- | --- |
| No `ANTHROPIC_API_KEY` / `REPLY_MODEL` on the dev machine (as of 10:50 CT) | Live AI is unverified. The demo uses Fixture mode | Liam adds a key and model to `.env.local` if a paid key is authorized, then runs one synthetic request |
| No transcription key | Microphone path is unverified | Same, for `TRANSCRIPTION_*`, or demo with typed input only |
| Event AI/pre-event rules not recorded in the repo | Disclosure accuracy | Liam confirms the rules with organizers and records them in [PROJECT_BRIEF.md](PROJECT_BRIEF.md) |

## Next actions

1. Integrator: wire runtime + routes + UI. Run `npm run check` and record the results.
2. Browser pass on the demo laptop: full fixture demo loop, switch scanning, audible speech, cancel/stop/pause.
3. Update the README feature table and [PRESENTATION_LOG.md](PRESENTATION_LOG.md) with the verified status.
4. Optional: if a key is authorized, run a small live smoke test with synthetic prompts and record the model id and outcome.
5. Feature freeze at 15:30 CT. Rehearse [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Finalize [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md) by 17:00.
