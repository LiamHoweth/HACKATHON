# Test results

Record executed checks only, including failures and reruns. Give each entry its date and time (CT), the exact command, the outcome, the environment, and the commit or working-tree state. Never put placeholder numbers here. Write **not run** or **not measured** until a real result exists.

Environment for all rows below unless noted: Apple M3 MacBook (macOS), Node v24.14.0, Next.js 16.4.3 dev server on localhost:3000, Claude desktop app built-in browser pane (Chromium-based), working tree on `main` after commit `bb16883`.

## Automated checks

| When (CT) | Command | Result | Environment | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-24 11:00 | `npm run typecheck` | Passed (exit 0) | local | Whole project |
| 2026-10-24 11:00 | `npm run lint` | Passed (0 errors, 0 warnings) | local | After fixing one unused-variable warning |
| 2026-10-24 11:00 | `npm test` (vitest) | Passed: 71/71 in 4 files | local | Reducer, adaptation, schema, API-route tests. The Anthropic SDK is **mocked** in `api.test.ts`: proves plumbing, validation, and retry budget, not model behavior. Earlier run: 54 passed + 2 `it.fails` documenting bugs (CONV-03 missing Quick phrases in composer; PREF-12 humor-guided choice counted as length evidence); both fixed, tests flipped to passing. |
| 2026-10-24 11:00 | `npm run build` | Passed | local | `/` static; `/api/replies`, `/api/status`, `/api/transcribe` dynamic. Client bundle grep found no server prompt or key variable names. |
| 2026-10-24 ~11:00 (docs pass) | `python3 scripts/check_repo.py` | Passed (exit 0) | macOS, local, uncommitted working tree | Checks Markdown links and sensitive filenames only; rerun at each checkpoint |

## Browser checks

| When (CT) | Browser / machine | Flow | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-24 ~11:00 | Built-in browser pane | Fixture loop, pointer input: typed partner question → 3 fixture suggestions → None of these → 3 different meanings → Guide → Disagree → 3 disagreement options → select → review (no speech) → Speak → board shows delivery | Passed | Source label "Fixture demo" visible on board and review |
| 2026-10-24 ~11:00 | Built-in browser pane | Switch scanning: highlight advanced every ~1.5 s after reading pause across candidates → None of these; Space held 1.5 s with 20 auto-repeat keydowns produced exactly one activation (opened review, highlight reset to Cancel, nothing spoken); a separate fresh press while Speak was highlighted started speech of the exact reviewed text | Passed | Key events were synthesized in page JavaScript, not a physical switch |
| — | — | Audible speech | Not verified | The pane reported playback start/complete callbacks ("Spoken (playback reported complete)"); audible output was not confirmed by a human listener |
| — | — | Cancel / Stop / Pause / End session | Not run yet | — |
| — | — | 200% zoom and narrow viewport | Not run yet | — |

## Live provider checks

| When (CT) | Provider / model | Scenario | Result | Notes |
| --- | --- | --- | --- | --- |
| — | Anthropic / not configured | Synthetic reply | Not run: no API key configured | — |
| — | Transcription / not configured | Synthetic recording | Not run: no key configured | — |

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
