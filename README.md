# Still Here

**Your words. Your choice.**

Blink-first AAC. The person picks, shapes, and speaks their own messages with deliberate eye blinks over automatic scanning.

> **AI offers possible words. The person decides what to say.**

Still Here is a hackathon prototype built at SASEHacks for Good (University of Oklahoma, Saturday, October 24, 2026). A highlight moves through the reply options on its own. The person closes their eyes on purpose to select the highlighted option. A webcam and a face-landmark model running locally in the browser detect the closure. Keyboard, single switch, and pointer remain working fallback inputs.

The design hypothesis is that choosing a complete, reviewable message can reduce the physical effort of keeping up with a conversation for some people with ALS or other conditions affecting speech and movement. **That hypothesis has not been measured. The prototype is not clinically validated and has not been tested with AAC users.** Blink detection is facial-gesture detection. It does not identify faces and it does not estimate gaze.

## How it works

```text
Partner types (or records) a question
  → visible, reviewable partner text
  → bounded conversation context + approved personalization
  → three different possible replies
  → the highlight advances automatically; a deliberate blink selects
    (choose one, "None of these", guide the reply, quick phrase, or My words)
  → exact-message review, starting on Cancel
  → a separate, new deliberate blink selects Speak
  → the exact reviewed text is spoken
  → attributed history with delivery status
```

The person can also start a conversation without a partner question. The AI cannot pick an answer, decide what the person means, save memories, or speak.

## Feature status

Build, verification, and measurement are separate. "Implemented" means the code exists. It does not mean tested. Verification describes only results recorded in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) or the commit log. Status as of **2026-10-24, 11:35 CT**. Blink work was being built by two engineers at that time. Its source and synthetic tests existed but were uncommitted and not yet wired into the app runtime. See [docs/PROGRESS.md](docs/PROGRESS.md).

| Feature | Build | Verification | Notes |
| --- | --- | --- | --- |
| **Blink: local face landmarker** (MediaPipe Face Landmarker, `@mediapipe/tasks-vision` 1.1.1) | In progress: `src/access/blink-detector.ts`. Model and WASM served from `public/models` and `public/wasm` (uncommitted) | Not verified (no camera run) | `numFaces: 2`. GPU delegate with CPU fallback. Pinned assets with SHA-256 hashes in `public/models/README.md`. No runtime CDN fetch is intended, but network behavior has not been checked |
| **Blink: eye-closure scoring** | In progress | Synthetic tests only | Score = min(`eyeBlinkLeft`, `eyeBlinkRight`), so both eyes must close and winks don't count. Light smoothing, with open/closed hysteresis thresholds. The UI shows no confidence percentages |
| **Blink: gesture state machine** (`src/access/blink-gesture.ts`) | Implemented as a pure module (uncommitted) | **Synthetic tests pass** (ACCESS-10/11 in `blink-gesture.test.ts`). Not camera-verified | Closure onset marks the target. Closures under the minimum (default 600 ms) are ordinary blinks and are ignored. Over the maximum (default 2,500 ms) they are discarded. 800 ms cooldown. Re-arms only with eyes open. Face missing for more than 500 ms → gesture discarded, face lost. Reacquisition alone selects nothing. Multiple faces → hold. Stale or out-of-order frames → discard |
| **Blink: guided calibration** (`src/access/blink-calibration.ts`, `src/components/BlinkCalibration.tsx`) | Logic implemented, UI in progress (uncommitted) | Synthetic tests pass (`blink-calibration.test.ts`). Not camera-verified | Stages: consent → position → open-eye baseline → natural blinks → deliberate closures → review → practice select → separate practice confirm. Overlapping or weak signals fail openly. The minimum closure has a 400 ms floor. Only scalar settings are stored |
| **Blink: status UI, blink-first setup, runtime wiring** (`src/components/BlinkStatus.tsx`, setup changes) | In progress. At 11:35 not yet wired into `useStillHere` | Not verified | Text states: Ready, Closing, Selected, Cooldown, Face lost (paused), Multiple faces. **Use eye blinks** is the default. **Use keyboard/switch instead** is always visible |
| **Blink reliability gate** (20 intentional selections, ordinary blinking, tracking loss) | Not started | **Not measured** | Requires a real webcam test. See [docs/TEST_PLAN.md](docs/TEST_PLAN.md#blink-reliability-gate) |
| Shared communication kernel: one reducer, one target registry, immutable review, separate fresh confirmation, stale-result protection | Implemented (`src/core/`) | Unit tests pass: 82/82 committed tests. 106/106 including uncommitted blink tests at 11:32 CT (docs-workstream run, not yet in TEST_RESULTS). Browser fixture loop passed | All inputs, blink included, are designed to reach the same guarded `ACTIVATE` path. Blink has not been exercised through it yet |
| Switch/keyboard scanning (1.5 s per target, 2 s reading pause, adjustable 0.7–5 s) | Implemented (`src/access/`) | Browser: passed with key events synthesized in JavaScript | A held key with 20 repeats produced exactly one activation. No physical switch has been tested |
| "None of these" regeneration, guidance, change wording | Implemented | Unit tests pass. Browser pass (pointer/scripted) | Rejections apply to the current question only |
| Quick phrases, saved phrases, My words (scanning keyboard) | Implemented | Unit tests pass. Browser pass (pointer/scripted) | No AI needed. Drafts survive interruptions |
| Start a conversation, staged/parked turns, history | Implemented | Unit tests pass. Browser pass (pointer/scripted) | No fake partner question |
| Consented length learning, approved preferences, memory review | Implemented | Unit tests pass. Browser pass in fixture mode | Reload persistence not tested |
| Audit fixes (commit `6ea84db`) | Implemented | Unit tests pass (`audit-regressions.test.ts`) | Includes failed access-code throttling and own-words replies closing the question |
| Live AI replies: OpenAI Responses API, `gpt-6-astra`, `store: false`, strict `json_schema` | Implemented (`src/server/provider.ts`) | **Verified live** with synthetic inputs (local and Railway). 14 synthetic scenarios in [docs/evidence/live-scenarios.json](docs/evidence/live-scenarios.json) | Human judgments of those 14 outputs are not recorded yet. The Anthropic adapter is present but only mock-tested (no key) |
| Partner transcription (`gpt-transcribe`) | Implemented | Server path verified with a synthetic clip. Browser microphone not exercised | Typed input is the fallback |
| Speech synthesis and delivery status | Implemented | Playback callbacks observed in the browser. **Audible output not confirmed** by a listener | Never replays automatically |
| Fixture demo mode | Implemented | Browser pass | Labeled "Fixture demo". Never substituted for a failed live request |
| Railway deployment (`still-here` / `api`) | Deployed 11:15 CT | Smoke test passed: access code enforced | **Redeploy pending.** The audit fixes (11:23 CT) and blink work are not deployed |
| Measurement mode | Reducer events and content-minimal export present | Not run | **Nothing has been measured** |
| Native iOS client (`ios/`, SwiftUI) | Experimental secondary client | Builds. 9 Swift Testing tests pass on the iPhone 17 Pro simulator | Never run on screen, not connected end to end, **not part of the demo** |

## Supported inputs

- **Eye blinks (primary, in progress, not verified):** a webcam, MediaPipe running in the browser, a short guided calibration, and automatic scanning. One deliberate closure selects the target that was highlighted when the closure began. Speaking needs a second, separate closure on **Speak**. A helper may be needed to grant browser camera permission.
- **Single switch:** emulated by a configured keyboard key with automatic scanning. Specific external switch hardware has not been tested.
- **Keyboard and pointer:** normal button activation.
- **Partner input:** typed text, or microphone recording with an editable transcript (needs consent and a configured transcription service).
- **Not supported:** gaze cursor, face recognition, emotion inference, double-blinks, or winks.

## Setup

Requirements: Node.js 24 (`engines: >=24 <25`) and npm, a browser with camera access for blink mode (localhost counts as a secure context), and Python 3.10+ for the repository check. Main dependencies: Next.js 16.4.3, React 19.3, TypeScript 5, zod 4, `@mediapipe/tasks-vision` 1.1.1, `@anthropic-ai/sdk` 1.3.0, vitest 5.

```sh
npm install
node scripts/copy-mediapipe-assets.mjs   # copies the pinned MediaPipe WASM into public/wasm
cp .env.example .env.local               # optional; empty keys = Fixture / Local-only mode
npm run dev                              # http://localhost:3000
```

The face model (`public/models/face_landmarker.task`) is downloaded separately. Its source URL and SHA-256 hash are in `public/models/README.md`.

| Command | What it runs |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | vitest unit and API tests (`src/tests/**/*.test.ts`) |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint |
| `npm run check` | typecheck + lint + tests + `python3 scripts/check_repo.py` |

### Environment variables

Names only. Values go in `.env.local`, which is gitignored. See [.env.example](.env.example). All are read on the server, and none reach the browser.

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `openai` (verified) or `anthropic` (unverified) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Server-side provider key. The OpenAI key also serves transcription when `TRANSCRIPTION_PROVIDER=openai` and no separate key is set |
| `REPLY_MODEL` | Reply model id (verified: `gpt-6-astra`) |
| `REPLY_REASONING_EFFORT` | Optional OpenAI reasoning effort |
| `REPLY_FALLBACKS` | Anthropic refusal-fallback beta (`default` / `off`) |
| `TRANSCRIPTION_PROVIDER` / `TRANSCRIPTION_API_KEY` / `TRANSCRIPTION_MODEL` / `TRANSCRIPTION_BASE_URL` | Transcription adapter (verified: `openai`, `gpt-transcribe`) |
| `FIXTURES_ENABLED` | `true` (default) allows the labeled fixture demo mode |
| `GENERATION_TIMEOUT_MS` / `TRANSCRIPTION_TIMEOUT_MS` / `MAX_AUDIO_BYTES` | Request budgets (defaults 15000 / 20000 / 4000000) |
| `APP_ACCESS_TOKEN` | Access code for paid endpoints, sent as the `x-still-here-access` header. Required for any non-local deployment |

Blink detection needs no environment variables. It runs entirely in the browser.

## Live AI, fixture, and local-only modes

The interface always shows which source produced each suggestion.

| Mode | When | What it does |
| --- | --- | --- |
| **Live AI** | `AI_PROVIDER`, its key, and `REPLY_MODEL` are set, and the user consents to cloud transmission. The deployed server also needs the access code | Sends a bounded, structured request to the OpenAI Responses API (`store: false`, strict JSON schema, no tools, at most one repair attempt within the timeout). Output is validated: exactly three candidates, length policy, no markup, no duplicates, no repeats of rejected text. App code assigns all IDs |
| **Fixture demo** | Default setting; `FIXTURES_ENABLED=true` | Deterministic, synthetic suggestions labeled "Fixture demo" |
| **Local only** | Chosen in setup | No generation requests. Quick phrases, saved phrases, and My words still work |

## Privacy and data flow

Details: [docs/PRIVACY_AND_LIMITATIONS.md](docs/PRIVACY_AND_LIMITATIONS.md).

| Data | Handling |
| --- | --- |
| Camera frames | The camera turns on only after consent in blink setup. Frames are processed in the browser by the local MediaPipe model. The design stores and uploads no images or video. **The no-upload claim is pending verification with a network log.** Only scalar calibration settings (thresholds and durations) may be kept |
| Recorded partner audio | Sent to OpenAI transcription only after consent and an explicit Record action. Not stored by the app |
| Conversation text and approved context | Live AI mode only: sent to OpenAI with `store: false`. This includes up to 10 recent turns, the active question, approved profile entries, guidance, and approved preferences. Provider retention terms still apply and have not been independently reviewed |
| Speech text | Spoken through the browser's `speechSynthesis`. Whether the voice is local depends on the browser (not checked on the demo machine) |
| Approved preferences, profile, saved phrases | Kept in memory. Written to local storage only when "Remember on this device" is on. Transcripts, suggestions, recordings, and observations are never stored |

Server logs record only the request ID, route, outcome code, and duration.

## What it remembers, and when

- **Current question:** guidance and rejections belong to that question only and are cleared when it is answered, dismissed, or edited.
- **Session tendencies:** only with *Session adaptation* on. Length only. Expires after 30 minutes, keeps the last 20, and is cleared at End session.
- **Proposals:** after evidence across 3 distinct turns, a "Preference suggestion available" notice appears. Nothing is saved without **Yes, remember this** and a separate confirmation.
- **Approved preferences:** visible, editable, disableable, and deletable. **Pause personalization** stops their influence without deleting them.
- Rejections are never treated as opinions. Suggestions are never treated as facts about the user.

## Known limitations

- Blink detection is **in progress and unverified**. No real-webcam reliability numbers exist yet. If calibration cannot separate natural blinks from deliberate closures, the demo uses keyboard/switch and says so.
- Not tested with AAC users, people with ALS, clinicians, or specialists. Team testing is not clinical validation.
- Blinking will not work for everyone. Lighting, glasses, camera position, fatigue, and individual eye-movement ability are expected to affect detection. None of this has been studied.
- Audible speech, browser microphone capture, and the 200% zoom layout have not been verified.
- Session learning covers length only. English only. No offline guarantee. Local storage is not encrypted.
- Rate limits are in memory, for a single instance. They are not a spending cap.

## Provenance

- Application code in `src/` was written on 2026-10-24 after hacking began at 09:00 CT. Claude Code (Opus 5.5) implemented it, with Liam Howeth directing and reviewing. See [docs/AI_USAGE.md](docs/AI_USAGE.md).
- The generic repository foundation (collaboration docs, AI rules, hygiene script, templates) was committed 08:49–09:08 CT and contains no application code. Liam should confirm it fits the event's pre-event-work rule.
- **Third-party assets:** the `@mediapipe/tasks-vision` 1.1.1 WASM runtime (Apache-2.0 per its package) and the MediaPipe Face Landmarker model (`float16/1`, recorded as Apache-2.0; confirm against Google's model card before stating it publicly). Both are served locally. Sources and hashes: `public/models/README.md`. No other third-party models, images, or datasets are included. Fixtures are synthetic.
- No license chosen yet. Prior art: [docs/REFERENCES.md](docs/REFERENCES.md). We do not claim to have invented AAC, scanning, blink switches, or AI-assisted communication.

## Demo walkthrough

Full script with fallbacks: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

1. `npm run dev`, then open `http://localhost:3000` (or the Railway URL with the access code).
2. Setup: choose **Use eye blinks**, read the camera consent, and grant browser permission (a helper may do this). Complete calibration, including a practice select and a separate practice confirm. Choose **Live AI** (with cloud consent) or **Fixture demo**, which is labeled.
3. Hands off the keyboard and mouse. The partner types *"Are you coming to dinner tonight?"* on their own keyboard.
4. Three replies appear and the highlight scans. Blink on **None of these** to get different meanings. Blink through **Guide → Suggest an alternative**.
5. Blink to select a reply. Review opens on **Cancel**. Wait for the highlight to reach **Speak**, then blink again. The app speaks exactly that sentence.
6. Blink through **Quick phrases** or **Start a conversation**.
7. If calibration fails or tracking is unreliable, switch to keyboard/switch scanning and say so aloud.

## Repository docs

| File | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [AGENT_NOTES.md](AGENT_NOTES.md), [CONTRIBUTING.md](CONTRIBUTING.md) | AI rules, handoff notes, team process |
| [Project brief](docs/PROJECT_BRIEF.md), [Product spec](docs/PRODUCT_SPEC.md), [Architecture](docs/ARCHITECTURE.md) | What we are building and how |
| [Build plan](docs/BUILD_PLAN.md), [Progress](docs/PROGRESS.md), [Decisions](docs/DECISIONS.md) | Gates, current status, choices |
| [Test plan](docs/TEST_PLAN.md), [Test results](docs/TEST_RESULTS.md) | Planned coverage and recorded results |
| [Privacy and limitations](docs/PRIVACY_AND_LIMITATIONS.md), [References](docs/REFERENCES.md) | Data paths, limits, prior art, licenses |
| [Presentation log](docs/PRESENTATION_LOG.md), [Slide outline](docs/SLIDE_OUTLINE.md), [Demo script](docs/DEMO_SCRIPT.md), [Judge Q&A](docs/JUDGE_QA.md), [Submission draft](docs/SUBMISSION_DRAFT.md) | Presentation materials |
| [Demo checklist](docs/DEMO.md), [Setup checklist](docs/SETUP.md), [AI usage](docs/AI_USAGE.md) | Team process |

## Deployment (Railway)

One Next.js service on Railway (project `still-here`, service `api`): `https://api-production-18038.up.railway.app`. Latest deployment at the time of writing: 11:15 CT, which predates the audit fixes. **Redeploy pending.**

- Deploy from a clean checkout with `railway up --service api`. `.railwayignore` keeps `.env*`, `node_modules`, `.next`, and `ios/` out of the upload.
- Set variables in Railway, never in Git: `AI_PROVIDER`, `OPENAI_API_KEY`, `REPLY_MODEL`, `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_MODEL`, `APP_ACCESS_TOKEN`, `FIXTURES_ENABLED`.
- Live replies and transcription require the `x-still-here-access` header. Repeated wrong codes are throttled (in the audit fixes, not yet deployed).
- Rate limits are per instance and in memory (30 live requests/min, 12 transcriptions/min, 120 fixture requests/min per client). Keep a single instance.
- Blink mode on the deployed site needs HTTPS (Railway provides it) and the MediaPipe assets in `public/` included in the deploy.
