# Still Here

**Your words. Your choice.**

Context-aware AAC that helps people choose, shape, and speak their own messages through accessible controls.

> **AI offers possible words. The person decides what to say.**

Still Here is a hackathon prototype built at SASEHacks for Good (University of Oklahoma, Saturday, October 24, 2026). It explores whether choosing a complete, reviewable message can reduce the physical effort of taking part in a fast-moving conversation for some people with ALS or other conditions that affect speech and movement. **It is not clinically validated and has not been tested with AAC users.** That design hypothesis has not been measured.

## How it works

```text
Partner types (or records) a question
  → visible, reviewable partner text
  → bounded conversation context + approved personalization
  → three different possible responses
  → choose one, reject all ("None of these"), guide the response, or write your own
  → exact-message review
  → separate, deliberate confirmation
  → the exact reviewed text is spoken
  → attributed history with delivery status
```

The user can also start a conversation without a partner question. The AI cannot pick an answer, decide what the person means, save memories, or speak.

## Feature status

Build, verification, and measurement are separate. "Implemented" means the logic exists in source; it does not mean tested. **Verification "not run" means no test or browser result has been recorded in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) yet.** This table reflects the repository as of 2026-10-24, about 11:00 CT. Several modules had just landed and were still being integrated; see [docs/PROGRESS.md](docs/PROGRESS.md) for the latest status.

| Feature | Build | Verification | Notes |
| --- | --- | --- | --- |
| Central typed reducer, surfaces, request identities | Implemented (`src/core/`) | Not run (unit tests written) | One reducer owns all decisions; effects are queued as data |
| Exact review + separate fresh confirmation before speech | Implemented in reducer | Not run (unit tests written) | Confirmation rejects the selection's own event/cycle, stale surfaces, and confirms that arrive within 600 ms of the review opening |
| Three suggestions, "None of these" regeneration | Implemented in reducer + server adapter | Not run (unit tests written) | Rejected texts and meaning labels are sent for the same question only |
| Guide my response (direction, wording, topic seed) | Implemented in reducer/targets | Not run (unit tests written) | Applies to the current question only |
| Change wording (shorter / different tone) | Implemented in reducer | Not run (unit tests written) | Keeps the selected meaning; a new review and confirmation are still required |
| Quick phrases (10 built-in) and saved custom phrases | Implemented in reducer/targets | Not run (unit tests written) | Same review/confirm path; no AI needed |
| My words: grouped-letter scanning keyboard | Implemented in reducer/targets | Not run (unit tests written) | 500-character limit with a notice; nothing is silently truncated |
| Start a conversation (9 categories) | Implemented in reducer | Not run (unit tests written) | Has its own initiation anchor; no fake partner question |
| Staged partner turns, parked questions, history | Implemented in reducer | Not run (unit tests written) | Queue is capped at 10 with an explicit notice |
| Session length adaptation (opt-in) | Implemented (`src/adaptation/`) | Not run (unit tests written) | Deterministic and length-only; off by default |
| Approved, scoped style preferences and memory review | Implemented in reducer/policy; versioned local store present (`src/adaptation/preference-store.ts`) | Not run (unit tests written) | Saved only after explicit confirmation. Corrupt storage is ignored. No cross-tab sync |
| Live AI replies (OpenAI `gpt-6-astra`; Anthropic adapter also present) | Adapters + `/api/replies` route | **Verified live** 2026-10-24 (local + Railway): valid 3-candidate batches in ~4 s; 14 synthetic scenarios in [`docs/evidence/live-scenarios.json`](docs/evidence/live-scenarios.json). Anthropic path: mocked tests only (no key) | Deployed server requires the access code; local dev server does not |
| Fixture demo mode | Implemented (`src/server/fixtures.ts`, `/api/replies`) | Not run (unit test written) | Default demo path; labeled `demo-fixture`; refused if `FIXTURES_ENABLED=false` |
| Browser runtime, scanning timer, input controller | Present, being integrated | Not run; not browser-verified | `src/runtime/`, `src/access/`. One chained timer; scanning pauses when the tab is hidden or the switch is held |
| Speech synthesis controller | Present, being integrated | Not run; audible output not hardware-verified | `src/audio/speech-controller.ts`. Start/end watchdogs mark speech `uncertain` and never replay it |
| Interface components and app shell | Present, being integrated | Not browser-verified | `src/components/`, `src/app/` |
| Partner recording + transcription | `src/audio/`, `src/server/transcription.ts`, `/api/transcribe` (`gpt-transcribe`) | **Server path verified** with a synthetic clip (exact transcript, ~1.2 s). Browser microphone capture not yet exercised with a real room recording | 20 s cap; typed input is the fallback |
| Opt-in measurement mode | Reducer events + content-minimal export (`src/metrics/export.ts`) present | Not run | Nothing has been measured |
| Blink / camera input (P2) | Deferred | Not applicable | Not implemented |

## Supported inputs

- **Pointer** (mouse or touch) and **keyboard** (normal button activation).
- **Single switch** emulated by a configured keyboard key, with automatic scanning (default 1.5 s per target, 2 s reading pause on new content, adjustable from 0.7 s to 5 s). Compatibility with specific external switch hardware has not been tested.
- **Partner input:** typed text, or microphone recording with an editable transcript draft (requires consent and a configured transcription service).
- **Not supported:** blink, gaze, or camera input (deferred).

## Setup

Requirements: Node.js and npm (the project uses Next.js 16.4.3, React 19.3, TypeScript 5, zod 4, `@anthropic-ai/sdk` 1.3.0, and vitest 5) and Python 3.10+ for the repository check.

```sh
npm install
cp .env.example .env.local   # optional; leave values empty for Fixture / Local-only mode
npm run dev                  # http://localhost:3000
```

### Commands

| Command | What it runs |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | vitest unit tests (`src/tests/**/*.test.ts`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check` | typecheck + lint + tests + `python3 scripts/check_repo.py` |

### Environment variables

Names only; see [.env.example](.env.example). Keep values in `.env.local`, which is gitignored. All are read server-side; none are exposed to the browser.

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `anthropic` enables the live reply adapter |
| `AI_PROVIDER` | `openai` or `anthropic` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Server-side key for live replies (OpenAI key also used for transcription when `TRANSCRIPTION_PROVIDER=openai`) |
| `REPLY_REASONING_EFFORT` | Optional OpenAI reasoning effort |
| `REPLY_MODEL` | Model id (suggested `claude-opus-5-5`; verify on your account) |
| `REPLY_FALLBACKS` | `default` enables the server-side refusal fallback beta; `off` disables it |
| `TRANSCRIPTION_PROVIDER` | `openai` enables the OpenAI-compatible transcription adapter |
| `TRANSCRIPTION_API_KEY` / `TRANSCRIPTION_MODEL` / `TRANSCRIPTION_BASE_URL` | Transcription credentials, model, and optional base URL |
| `FIXTURES_ENABLED` | `true` (default) allows the explicit fixture demo mode |
| `GENERATION_TIMEOUT_MS` / `TRANSCRIPTION_TIMEOUT_MS` | Total request budgets (defaults 15000 / 20000) |
| `MAX_AUDIO_BYTES` | Upload cap for recordings (default 4000000) |
| `APP_ACCESS_TOKEN` | Access code for paid endpoints, sent as the `x-still-here-access` header |

## Live AI, fixture, and local-only modes

The interface always shows which source produced a suggestion.

| Mode | When | What it does |
| --- | --- | --- |
| **Live AI** | `AI_PROVIDER=openai` with `OPENAI_API_KEY` (or `anthropic` with `ANTHROPIC_API_KEY`) and `REPLY_MODEL` set, and the user consents to cloud transmission | Sends a bounded structured request to the configured provider (OpenAI Responses API with `store: false`, or Anthropic Messages API). Verified with OpenAI on 2026-10-24. |
| **Fixture demo** | Default; `FIXTURES_ENABLED=true` | Returns deterministic, synthetic demo suggestions labeled `demo-fixture`. Fixtures are never substituted for a failed live request. |
| **Local only** | Selected in setup | No generation requests. Quick phrases, saved phrases, and My words still work. |

Live adapter details (from `src/server/provider.ts`): the Messages API beta endpoint with structured JSON output (`output_config.format` json_schema), `effort: 'low'`, the server-side refusal fallback (`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`), SDK retries set to 0, and at most one application-level repair attempt within `GENERATION_TIMEOUT_MS`. The model is tool-free. Its output is validated (exactly three candidates, enumerated meaning acts, length policy, no markup, no exact duplicates or repeats of rejected text). Application code, not the model, assigns all IDs.

## Privacy and data flow

See [docs/PRIVACY_AND_LIMITATIONS.md](docs/PRIVACY_AND_LIMITATIONS.md) for full details.

| Data | Handling in this build |
| --- | --- |
| Camera frames | None. There is no camera feature. |
| Recorded partner audio | Sent to the configured transcription service (OpenAI) only after consent and an explicit Record action. Not stored by the app. |
| Conversation text and approved context | In Live AI mode, sent to the configured provider (OpenAI by default, with `store: false`): up to 10 recent turns, the active question, approved profile entries, guidance, and approved preferences. Fixture and Local-only modes stay on your machine and the Still Here server. Provider retention policies still apply. |
| Speech text | Spoken through the browser's `speechSynthesis` voice. Whether a voice is local or remote depends on the browser and voice (`localService`), which has not been verified on the demo machine. |
| Approved preferences, profile, saved phrases | Kept in memory for the session. Written to browser local storage only if "Remember on this device" is turned on. Conversation transcripts, suggestions, recordings, and session observations are never written to storage. |

Server logs record only the request ID, route, outcome code, and duration. They do not include conversation content. Local cleanup does not delete anything already held by a provider.

## What it remembers, and when

- **Current question:** guidance and rejected suggestions belong to that one question. They are cleared when the question is answered, dismissed, or edited.
- **Session tendencies:** only when *Session adaptation* is turned on. Length choices are recorded only from batches that offered a real length difference and were not under an explicit length request. These are temporary, expire after 30 minutes, keep at most the last 20, and are cleared at End session.
- **Proposals:** after evidence across 3 different turns, a discreet "Preference suggestion available" notice appears. Nothing is saved unless the user opens it and confirms **Yes, remember this**. **Not now** defers it; **No, don't learn that** suppresses that dimension.
- **Approved preferences:** visible, editable, disableable, and deletable in Preferences/Memory. Precedence is: explicit choice for this response > saved preference (most specific scope, then latest approval) > session hint > default. **Pause personalization** stops saved and session influences without disabling explicit guidance.
- Rejections are never treated as opinions, and suggestions are never treated as facts about the user.

## Known limitations

- Not tested with AAC users, people with ALS, clinicians, or specialists. Team testing is not clinical validation.
- Live AI and server-side transcription were verified with OpenAI using synthetic inputs only. No AAC users have tested the app.
- The UI, browser runtime, speech, and recording had just landed and were being integrated at the time of writing. Browser, audio, and hardware behavior has not been verified.
- Session learning covers sentence length only. Other style dimensions can be set manually.
- English only. Word-count length rules are not a multilingual implementation.
- Local storage is not encrypted. Do not use it on a shared computer for anything sensitive.
- The in-memory rate limiter protects one local process only. It is not a spending guarantee.
- There is no offline guarantee. A cold reload requires the dev server.
- Blink/camera input is deferred.

More detail: [docs/PRIVACY_AND_LIMITATIONS.md](docs/PRIVACY_AND_LIMITATIONS.md).

## Provenance

- All application code in `src/` was written on 2026-10-24 after hacking began at 09:00 CT. Claude Code (Opus 5.5) implemented it, with Liam Howeth directing and reviewing. See [docs/AI_USAGE.md](docs/AI_USAGE.md).
- The generic repository foundation (collaboration docs, AI rules, the hygiene script, GitHub templates, and Claude Code settings/skills) was committed between 08:49 and 09:08 CT the same day. It contains no application code. Liam should confirm it fits the event's pre-event-work rule.
- Dependencies are standard npm packages pinned in `package-lock.json`. No third-party code, models, images, or datasets are copied into the repository. Fixtures are synthetic.
- No license has been chosen yet.
- Prior art and research leads: [docs/REFERENCES.md](docs/REFERENCES.md). We do not claim to have invented AAC, scanning, or AI-assisted communication.

## Demo walkthrough

The full script, with fallbacks, is in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

1. `npm run dev`, then open `http://localhost:3000`.
2. Setup: choose an input mode (switch scanning or keyboard), test the voice, and choose **Live AI** (with cloud consent; on the deployed server, enter the access code) or **Fixture demo** as a labeled fallback. Microphone and camera stay off until used.
3. The partner types *"Are you coming to dinner tonight?"*. Three suggestions appear, labeled with their source.
4. Choose **None of these — new suggestions**. Three different meanings appear.
5. **Guide my response → Choose a direction → Suggest an alternative**. New alternatives appear.
6. Select one. The exact text appears for review. Confirm separately with **Speak**.
7. **Quick phrases → "Please give me a moment."**, then review and Speak. The earlier work is preserved.
8. **Start a conversation → Ask someone a question**, or use **My words** to spell a message.

## Repository docs

| File | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Shared rules for AI coding assistants |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branches, reviews, and definition of done |
| [CLAUDE.md](CLAUDE.md) / [AGENT_NOTES.md](AGENT_NOTES.md) | Claude Code entry file and technical handoff notes |
| [Project brief](docs/PROJECT_BRIEF.md) | Event, product, stack, and decisions table |
| [Product spec](docs/PRODUCT_SPEC.md) | Reconciled requirements |
| [Architecture](docs/ARCHITECTURE.md) | Modules, data flow, identities, and trust boundaries |
| [Build plan](docs/BUILD_PLAN.md) / [Progress](docs/PROGRESS.md) | Gates and current status |
| [Decisions](docs/DECISIONS.md) | Choices and deviations |
| [Test plan](docs/TEST_PLAN.md) / [Test results](docs/TEST_RESULTS.md) | Planned coverage and recorded results |
| [Privacy and limitations](docs/PRIVACY_AND_LIMITATIONS.md) | Data paths and known limits |
| [References](docs/REFERENCES.md) | Prior art and documentation, with verification status |
| [Presentation log](docs/PRESENTATION_LOG.md), [Slide outline](docs/SLIDE_OUTLINE.md), [Demo script](docs/DEMO_SCRIPT.md), [Judge Q&A](docs/JUDGE_QA.md), [Submission draft](docs/SUBMISSION_DRAFT.md) | Presentation materials |
| [Demo checklist](docs/DEMO.md), [Setup checklist](docs/SETUP.md), [AI usage](docs/AI_USAGE.md) | Team process |

## Deployment (Railway)

The backend and web app are deployed as one Next.js service on Railway (project `still-here`, service `api`): `https://api-production-18038.up.railway.app`.

- Deploy from a clean checkout with `railway up --service api`. `.railwayignore` keeps `.env*` files, `node_modules`, `.next`, and `ios/` out of the upload. Railway runs `npm run build` and `npm start`.
- Configure variables on Railway, never in Git: `AI_PROVIDER`, `OPENAI_API_KEY`, `REPLY_MODEL`, `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_MODEL`, `APP_ACCESS_TOKEN`, `FIXTURES_ENABLED`.
- On the deployed server, `/api/replies` (live) and `/api/transcribe` require the `x-still-here-access` header. Production builds never trust the `Host` header as local. `GET /api/status` reports `accessCodeValid` when a code is sent.
- Limits: per-instance in-memory rate limits keyed on Railway's `X-Real-IP` (30 live requests/min, 12 transcriptions/min, 120 fixture requests/min per client). These are not a distributed spending cap. Keep one instance, or add a shared store before scaling out.
