# Still Here

**Your words. Your choice.**

Hands-free AAC for iPad. Raise your eyebrows to move to the next option. Close your eyes in a long, deliberate blink to select it. A natural ElevenLabs voice speaks only the exact sentence you reviewed and confirmed.

> **AI offers possible words. The person decides what to say.**

Still Here is a hackathon prototype built at SASEHacks for Good (University of Oklahoma, Saturday, October 24, 2026). The primary device is an **iPad in landscape, running Safari**. The front camera and a face-landmark model run locally in the browser. Two gestures drive the app:

- **NEXT:** raise both eyebrows and hold them up for **at least 500 ms**. The highlight moves forward by exactly one option. Holding longer does not repeat. Relax to neutral before the next raise. There is no automatic scanning in this mode.
- **SELECT:** a calibrated, deliberate **long blink** selects the option that was highlighted when your eyes closed. Ordinary blinks are ignored.
- **Speak:** review shows the whole sentence and starts on **Cancel**. Raise your eyebrows to move to **Speak**, then give a **new** long blink to confirm. One gesture can never both select and confirm.

A small, mirrored live camera preview sits in the top-right corner so you can see that tracking works. It is a live view only: nothing is recorded. Automatic scanning with blink selection, keyboard or switch, and touch remain working fallbacks.

The design hypothesis is that choosing a complete, reviewable message can reduce the physical effort of keeping up with a conversation for some people with ALS or other conditions affecting speech and movement. **That hypothesis has not been measured. The prototype is not clinically validated and has not been tested with AAC users.** Gesture detection is facial-gesture detection. It does not identify faces, estimate gaze, or infer emotion. Not everyone can raise their eyebrows or blink on purpose, which is why the fallbacks exist.

## How it works

```text
Partner types (or records) a question
  → visible, reviewable partner text
  → bounded conversation context + approved personalization
  → three different possible replies
  → eyebrows up 500 ms = NEXT (one step); long blink = SELECT
    (choose one, "None of these", Guide, Quick phrases, My words, Start a conversation)
  → exact-message review, starting on Cancel
  → eyebrow raise to Speak, then a new, separate long blink to confirm
  → server-side ElevenLabs synthesis of exactly that sentence → iPad playback
  → attributed history with honest delivery status
```

The person can also start a conversation without a partner question. The AI cannot pick an answer, decide what the person means, save memories, or speak.

## Feature status

Build, verification, and measurement are separate. "Implemented" means the code exists. It does not mean tested. Verification describes only results recorded in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) or the commit log. Status as of **2026-10-24, 12:10 CT**. The eyebrow, iPad UI, and ElevenLabs work was **being built by other engineers at that time and was uncommitted**. Its new test files existed but no run of them is recorded in TEST_RESULTS yet. See [docs/PROGRESS.md](docs/PROGRESS.md).

**Nothing in this build has been tested on an iPad.** Every row below is **not iPad-verified** unless it says otherwise.

| Feature | Build | Verification | Notes |
| --- | --- | --- | --- |
| **Eyebrow NEXT** (500 ms both-brow hold → one step, latch, release + cooldown to rearm) | In progress: `src/access/brow-gesture.ts` (uncommitted) | **Not verified.** Synthetic tests written (`brow-gesture.test.ts`: GEST-01 to 04, 07), no run recorded. Real camera not tested | Score = max(`browInnerUp`, mean of `browOuterUpLeft`/`browOuterUpRight`) from the local face model. A raise held across a screen change, face loss, or blink never carries over. Thresholds are prototype defaults until calibrated |
| **Gesture arbiter** (one accepted command per physical cycle) | In progress: `src/access/gesture-arbiter.ts` (uncommitted) | **Not verified.** Synthetic tests written (`gesture-arbiter.test.ts`: GEST-05 to 07), no run recorded | A blink closure freezes the highlight and cancels an unfinished raise. A raise and a closure that start close together are treated as ambiguous and do nothing |
| **Brow calibration** (neutral samples + comfortable raises) | In progress: `src/access/brow-calibration.ts` (uncommitted) | Not verified. Test file written, no run recorded | Must fail openly if raised and neutral brows can't be separated |
| **Long-blink SELECT** (gesture state machine) | Implemented (`src/access/blink-gesture.ts`, commits `2230926`, `08c6abc`) | **Synthetic tests pass** (134/134 suite, 11:50 CT). **Real camera not tested** | Closure onset freezes the target. Short blinks are ignored, overlong closures discarded, then a cooldown. Face lost → discard and pause. Multiple faces → hold. Defaults in [D21](docs/DECISIONS.md) |
| **Blink calibration** | Implemented (`src/access/blink-calibration.ts`, `src/components/BlinkCalibration.tsx`) | Synthetic tests pass. Real camera not tested | Fails openly when natural and deliberate closures overlap. Only scalar settings are stored |
| **Local face landmarker** (MediaPipe Face Landmarker, `@mediapipe/tasks-vision` 1.1.1) | Implemented (`src/access/blink-detector.ts`; model in `public/models`, WASM copied to `public/wasm`) | Model created in a desktop browser pane, one blank frame returned 0 faces. Assets served from Railway (11:46 CT). **No real camera frames processed yet** | `numFaces: 2`. Served from this app's origin. Network behavior during camera use not yet checked |
| **Live camera preview, top right** (mirrored, muted, hideable) | In progress: `src/components/CameraPreview.tsx`, `GestureFeedback.tsx` (uncommitted) | Not verified | Shows tracking state, brow progress, "Eyebrow raise detected — Next" only after an accepted NEXT, and "Blink detected — Selected". No REC label because nothing is recorded |
| **iPad landscape layout** | In progress | **Not iPad-verified** | Desktop layouts were checked at 1440×900 and ~800 px (earlier, before the iPad brief) |
| **ElevenLabs voice** (`POST /api/speech`, `eleven_v4_turbo` over the server-side Text-to-Dialogue WebSocket; `GET /api/voices`) | In progress: `src/app/api/speech/`, `src/app/api/voices/`, `src/server/elevenlabs/` (uncommitted) | **Not configured. Live voice not verified.** No ElevenLabs key yet. Mock tests written (`speech-api.test.ts`: TTS-01/02/03/06), no run recorded | Required primary voice. The key stays on the server. Only the exact confirmed sentence is sent. MP3 returned as one blob, for iPad reliability ([D30](docs/DECISIONS.md)). `eleven_v4_turbo` has no documented HTTP route; `ELEVENLABS_TRANSPORT=http` means a different, labeled ElevenLabs model. The ElevenLabs docs disagree on whether the dialogue WebSocket accepts v4 ids; only the live check resolves it |
| **iPad audio setup** (one-time Enable Audio / Test Voice touch) and the single audio player | In progress: `src/runtime/useAudio.ts`, `src/audio/eleven-player.ts` (uncommitted) | **Not iPad-verified.** Player unit tests written (`eleven-player.test.ts`), no run recorded | iPad Safari may block audio that isn't started by a real touch. Whether later blink-confirmed speech plays without another touch is unknown until tested |
| **Basic device voice fallback** (browser `speechSynthesis`) | Speech controller implemented. Labeled fallback path with a fresh review and confirmation in progress (`src/core/reducer.ts`, uncommitted) | Playback callbacks observed in a desktop browser. **Audible output not confirmed** by a listener. Tests written (`speech-authorization.test.ts`: TTS-07, IPAD-03), no run recorded | Always labeled "basic device voice". Never used silently in place of ElevenLabs. A failed natural-voice message needs a new review and a new confirmation before the basic voice speaks it |
| Shared communication kernel: one reducer, one target registry, immutable review starting on Cancel, separate fresh confirmation, stale-result protection | Implemented (`src/core/`) | Unit tests pass: 134/134 in 10 files (11:50 CT). Browser fixture loop passed | Every input reaches the same guarded `ACTIVATE` path. Eyebrow/blink have not been exercised through it on camera |
| **Fallback:** auto-scan + blink select (1.5 s per target, 2 s reading pause) | Implemented (blink-first build) | Synthetic tests (scan attribution and timing). Real camera not tested | **Off in eyebrow mode.** Only one way of moving the highlight runs at a time |
| **Fallback:** keyboard / single switch | Implemented (`src/access/`) | Browser: passed with key events synthesized in JavaScript | A held key with 20 repeats produced exactly one activation. No physical switch tested |
| **Fallback:** touch / pointer | Implemented | Browser pass with pointer/scripted clicks (desktop) | iPad touch not tested |
| "None of these" regeneration, guidance, change wording | Implemented | Unit tests pass. Browser pass (pointer/scripted) | Rejections apply to the current question only |
| Quick phrases, saved phrases, My words (scanning keyboard) | Implemented | Unit tests pass. Browser pass (pointer/scripted) | No AI needed. Drafts survive interruptions |
| Start a conversation, staged/parked turns, history | Implemented | Unit tests pass. Browser pass (pointer/scripted) | No fake partner question |
| Consented length learning, approved preferences, memory review | Implemented | Unit tests pass. Browser pass in fixture mode | Reload persistence not tested |
| Live AI replies: OpenAI Responses API, `gpt-6-astra`, `store: false`, strict `json_schema` | Implemented (`src/server/provider.ts`) | **Verified live** with synthetic inputs (local and Railway). 14 synthetic scenarios in [docs/evidence/live-scenarios.json](docs/evidence/live-scenarios.json) | Human judgments of those 14 outputs are not recorded yet. The Anthropic adapter is present but only mock-tested |
| Partner transcription (`gpt-transcribe`) | Implemented | Server path verified with a synthetic clip. Browser/iPad microphone not exercised | Typed input is the fallback |
| Fixture demo mode | Implemented | Browser pass | Labeled "Fixture demo". Never substituted for a failed live request |
| Railway deployment (`still-here` / `api`, HTTPS) | Deployed. Access code enforced | Smoke test passed 11:18 CT (401 without code, 200 with code). Blink assets served 11:46 CT | Eyebrow, iPad UI, and ElevenLabs work is **not deployed**. HTTPS is what lets iPad Safari use the camera ([D29](docs/DECISIONS.md)) |
| Measurement mode | Reducer events and content-minimal export present | Not run | **Nothing has been measured** |
| Native iOS client (`ios/`, SwiftUI) | Experimental secondary client | Builds. 9 Swift Testing tests pass on the iPhone 17 Pro simulator | **Not part of the demo** ([D26](docs/DECISIONS.md)). The demo is the web app in iPad Safari |

## Supported inputs

- **Eyebrow NEXT + long-blink SELECT (primary, in progress, not iPad-verified):** the iPad front camera, MediaPipe running in Safari, and a short guided calibration (neutral brows, 500 ms raises, natural blinks, deliberate long blinks, a practice select, and a separate practice confirm). A helper may be needed to grant camera permission and to tap **Enable Audio** once.
- **Auto-scan + blink (fallback):** the highlight advances on a timer and a long blink selects. Use it when eyebrow raises are hard or unreliable.
- **Single switch / keyboard (fallback):** a configured key with automatic scanning, or normal keyboard activation. Specific external switch hardware has not been tested.
- **Touch / pointer (fallback):** tap an option. It enters the same review and confirmation steps.
- **Partner input:** typed text, or microphone recording with an editable transcript (needs consent and a configured transcription service).
- **Not supported:** gaze cursor, face recognition, emotion inference, double-blinks, winks, or head-movement control.

## Setup

Requirements: Node.js 24 (`engines: >=24 <25`) and npm, and Python 3.10+ for the repository check. For the iPad, use an **HTTPS** origin (the Railway deployment or another trusted HTTPS tunnel). `localhost` on the laptop is not `localhost` on the iPad, and a plain-HTTP LAN address may not get camera permission. Main dependencies: Next.js 16.4.3, React 19.3, TypeScript 5, zod 4, `@mediapipe/tasks-vision` 1.1.1, `@anthropic-ai/sdk` 1.3.0, vitest 5.

```sh
npm install
cp .env.example .env.local               # optional; empty keys = Fixture / Local-only, natural voice "not configured"
npm run dev                              # http://localhost:3000 (predev copies the pinned MediaPipe WASM into public/wasm)
```

The face model (`public/models/face_landmarker.task`) is committed. Its source URL and SHA-256 hash are in `public/models/README.md`.

| Command | What it runs |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm test` | vitest unit and API tests (`src/tests/**/*.test.ts`) |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint |
| `npm run check` | typecheck + lint + tests + `python3 scripts/check_repo.py` |

### Environment variables

Names only. Values go in `.env.local`, which is gitignored, or in Railway variables. See [.env.example](.env.example). All are read on the server, and none reach the browser. **There are two separate keys: one for OpenAI and one for ElevenLabs. They are not interchangeable.**

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `openai` (verified) or `anthropic` (unverified) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Server-side provider key. The OpenAI key also serves transcription when `TRANSCRIPTION_PROVIDER=openai` and no separate key is set |
| `REPLY_MODEL` | Reply model id (verified: `gpt-6-astra`) |
| `REPLY_REASONING_EFFORT` | Optional OpenAI reasoning effort |
| `REPLY_FALLBACKS` | Anthropic refusal-fallback beta (`default` / `off`) |
| `TRANSCRIPTION_PROVIDER` / `TRANSCRIPTION_API_KEY` / `TRANSCRIPTION_MODEL` / `TRANSCRIPTION_BASE_URL` | Transcription adapter (verified: `openai`, `gpt-transcribe`) |
| `ELEVENLABS_API_KEY` | ElevenLabs key for `POST /api/speech`. Server only. **Not provided yet** |
| `ELEVENLABS_VOICE_ID` | A voice available to the account. **This is not the API key.** Never invent or commit one |
| `ELEVENLABS_MODEL_ID` | `eleven_v4_turbo` (preferred). Any substitution is documented |
| `ELEVENLABS_OUTPUT_FORMAT` / `ELEVENLABS_TIMEOUT_MS` | `mp3_44100_128` / `15000` |
| `ELEVENLABS_TRANSPORT` | `ws` (default) or `http`. `eleven_v4_turbo` always uses the Text-to-Dialogue WebSocket. `http` is for another ElevenLabs model (for example `eleven_v4` or `eleven_flash_v2_5`) |
| `ELEVENLABS_ALLOWED_VOICE_IDS` | Optional extra voice ids the server will accept (`ELEVENLABS_VOICE_ID` is always allowed) |
| `ELEVENLABS_DAILY_CHAR_BUDGET` | Server-side character budget per process per UTC day (default `20000`) |
| `FIXTURES_ENABLED` | `true` (default) allows the labeled fixture demo mode |
| `GENERATION_TIMEOUT_MS` / `TRANSCRIPTION_TIMEOUT_MS` / `MAX_AUDIO_BYTES` | Request budgets (defaults 15000 / 20000 / 4000000) |
| `APP_ACCESS_TOKEN` | Access code for paid endpoints, sent as the `x-still-here-access` header. Required for any non-local deployment |

Gesture detection needs no environment variables. It runs entirely in the browser.

## Live AI, fixture, and local-only modes

The interface always shows which source produced each suggestion, and which voice spoke.

| Mode | When | What it does |
| --- | --- | --- |
| **Live AI** | `AI_PROVIDER`, its key, and `REPLY_MODEL` are set, and the user consents to cloud transmission. The deployed server also needs the access code | Sends a bounded, structured request to the OpenAI Responses API (`store: false`, strict JSON schema, no tools, at most one repair attempt within the timeout). Output is validated: exactly three candidates, length policy, no markup, no duplicates, no repeats of rejected text. App code assigns all IDs |
| **Fixture demo** | Default setting; `FIXTURES_ENABLED=true` | Deterministic, synthetic suggestions labeled "Fixture demo" |
| **Local only** | Chosen in setup | No generation requests. Quick phrases, saved phrases, and My words still work |
| **Natural voice (ElevenLabs)** | `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` set | Confirmed sentence → server → ElevenLabs → MP3 → iPad playback. Shows "not configured" when the key or voice is missing |
| **Basic device voice** | Chosen explicitly, or offered after a natural-voice failure | Browser `speechSynthesis`, always labeled. Needs its own review and confirmation after a failure |

## Privacy and data flow

Details: [docs/PRIVACY_AND_LIMITATIONS.md](docs/PRIVACY_AND_LIMITATIONS.md).

| Data | Handling |
| --- | --- |
| Camera frames | The camera turns on only after consent in setup. Frames are processed in Safari by the local MediaPipe model and are never sent anywhere by design. The top-right preview is live only, never recorded. Only scalar calibration settings (thresholds and durations) may be kept. **The no-upload claim is pending a network-log check** |
| Confirmed speech text | When the natural voice is on, **the exact sentence the person confirmed** is sent from our server to ElevenLabs for audio generation. Nothing else is sent: no unconfirmed suggestions, no history. The returned audio is played and not stored by the app. Per the ElevenLabs docs read today, request logging is on by default and zero-retention mode is enterprise-only; we don't use it. We make no zero-retention claim |
| Recorded partner audio | Sent to OpenAI transcription only after consent and an explicit Record action. Not stored by the app |
| Conversation text and approved context | Live AI mode only: sent to OpenAI with `store: false`. This includes up to 10 recent turns, the active question, approved profile entries, guidance, and approved preferences. Provider retention terms still apply and have not been independently reviewed |
| Approved preferences, profile, saved phrases | Kept in memory. Written to local storage only when "Remember on this device" is on. Transcripts, suggestions, recordings, audio, and observations are never stored |

Server logs record only the request ID, route, outcome code, and duration. They never include sentence text.

## What it remembers, and when

- **Current question:** guidance and rejections belong to that question only and are cleared when it is answered, dismissed, or edited.
- **Session tendencies:** only with *Session adaptation* on. Length only. Expires after 30 minutes, keeps the last 20, and is cleared at End session.
- **Proposals:** after evidence across 3 distinct turns, a "Preference suggestion available" notice appears. Nothing is saved without **Yes, remember this** and a separate confirmation.
- **Approved preferences:** visible, editable, disableable, and deletable. **Pause personalization** stops their influence without deleting them.
- Rejections are never treated as opinions. Suggestions are never treated as facts about the user.

## Known limitations

- **Not iPad-verified.** Eyebrow NEXT, long-blink SELECT on camera, the preview, iPad audio, and the landscape layout have not been run on an iPad. Eyebrow reliability is **not measured**.
- **ElevenLabs not configured.** No key has been provided, so live natural speech is not verified. Naturalness has not been judged by listeners.
- **iPad Safari audio policy.** A camera gesture may not count as a user touch. Hands-free audible playback after one setup touch is unverified.
- Not tested with AAC users, people with ALS, clinicians, or specialists. Team testing is not clinical validation.
- Eyebrow raises and long blinks will not work for everyone. Lighting, glasses, camera angle, fatigue, speech movements, and individual motor ability are expected to affect detection. None of this has been studied.
- Browser microphone capture and the 200% zoom layout have not been verified.
- Session learning covers length only. English only. No offline guarantee. Local storage is not encrypted.
- Rate limits are in memory, for a single instance. They are not a spending cap.

## Provenance

- Application code in `src/` was written on 2026-10-24 after hacking began at 09:00 CT. Claude Code (Opus 5.5) implemented it, with Liam Howeth directing and reviewing. See [docs/AI_USAGE.md](docs/AI_USAGE.md).
- The generic repository foundation (collaboration docs, AI rules, hygiene script, templates) was committed 08:49–09:08 CT and contains no application code. Liam should confirm it fits the event's pre-event-work rule.
- **Third-party assets:** the `@mediapipe/tasks-vision` 1.1.1 WASM runtime (Apache-2.0 per its package) and the MediaPipe Face Landmarker model (`float16/1`, recorded as Apache-2.0; confirm against Google's model card before stating it publicly). Both are served locally. Sources and hashes: `public/models/README.md`. No other third-party models, images, or datasets are included. Fixtures are synthetic. ElevenLabs is a remote API; no ElevenLabs code or audio is included. No voice cloning.
- No license chosen yet. Prior art: [docs/REFERENCES.md](docs/REFERENCES.md). We do not claim to have invented AAC, scanning, blink switches, facial-gesture access, or AI-assisted communication.

## Demo walkthrough (iPad)

Full script with labeled fallbacks: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md). This walkthrough is the plan. It has not been rehearsed on an iPad yet.

1. On the iPad in landscape, open the Railway HTTPS URL in Safari and enter the access code (or use another trusted HTTPS origin).
2. Setup (a helper may do the touches): read the camera consent and allow the camera. Calibrate: neutral brows, a few 500 ms raises, natural blinks, a few long blinks, a practice select, and a separate practice confirm. Tap **Enable Audio / Test Voice** once. Choose **Live AI** (with cloud consent) or **Fixture demo**, which is labeled.
3. Hands away from the iPad. The partner types *"Are you coming to dinner tonight?"*.
4. Three replies appear. Raise eyebrows for half a second to move one option at a time. Long-blink on **None of these** for different meanings, or on **Guide → Suggest an alternative**.
5. Move to a reply and long-blink to select it. Review opens on **Cancel**. Raise eyebrows to reach **Speak**, then give a new long blink. ElevenLabs speaks exactly that sentence, if it is configured and the iPad plays it.
6. Use the same gestures for **Quick phrases** or **Start a conversation**.
7. If eyebrow raises are unreliable, switch to auto-scan + blink, keyboard/switch, or touch, and say so aloud. If the natural voice fails, the app offers the labeled basic device voice after a fresh review and confirmation.

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

One Next.js service on Railway (project `still-here`, service `api`): `https://api-production-18038.up.railway.app`. The deployment serves the blink assets (checked 11:46 CT). It does **not** include the eyebrow, iPad UI, or ElevenLabs work, which was uncommitted at 12:10 CT. **Redeploy pending.**

- Deploy from a clean checkout with `railway up --service api`. `.railwayignore` keeps `.env*`, `node_modules`, `.next`, and `ios/` out of the upload.
- Set variables in Railway, never in Git: `AI_PROVIDER`, `OPENAI_API_KEY`, `REPLY_MODEL`, `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_MODEL`, `APP_ACCESS_TOKEN`, `FIXTURES_ENABLED`, and, once provided, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_DAILY_CHAR_BUDGET`.
- Live replies and transcription require the `x-still-here-access` header. `/api/speech` uses the same gate and a daily character budget in the uncommitted code (not yet deployed or verified on Railway). Repeated wrong codes are throttled.
- Rate limits are per instance and in memory (30 live requests/min, 12 transcriptions/min, 120 fixture requests/min per client). Keep a single instance.
- The iPad needs this HTTPS origin for camera access. Railway provides HTTPS.
