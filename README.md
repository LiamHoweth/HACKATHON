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

Build, verification, and measurement are separate. "Implemented" means the code exists. It does not mean tested. Verification describes only results recorded in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md), [docs/PROGRESS.md](docs/PROGRESS.md), or the commit log. Status as of **2026-10-24, ~12:30 CT**, against commit `5de1a57` (12:13, "iPad eyebrow NEXT + blink SELECT, ElevenLabs speech path"), which is deployed to Railway as `f65385bb`. Other engineers had more uncommitted work in the tree at that time; rows that depend on it say so.

**Tests:** `npx vitest run` at **12:28 CT** on the uncommitted working tree (commit `5de1a57` plus in-progress changes): **396 of 396 passed in 24 files**. A run at 12:24, mid-edit, had 2 TTS-07 failures in `speech-authorization.test.ts`; they passed at 12:28. The last run on committed code alone is 285/285 in 17 files at 12:18 CT (PROGRESS). All tests use synthetic frames and mocked providers; they are not hardware or live-provider checks. The count changes as work lands, so refresh it before quoting it.

**Nothing in this build has been tested on a physical iPad.** Every row below is **not iPad-verified** unless it says otherwise. iPad **Simulator** Safari screenshots (touch, fixtures, no camera) exist in `docs/screenshots/ipad-sim-*`.

| Feature | Build | Verification | Notes |
| --- | --- | --- | --- |
| **Eyebrow NEXT** (500 ms both-brow hold → one step, latch, release + cooldown to rearm) | Implemented (`src/access/brow-gesture.ts`, commit `5de1a57`) | **Synthetic tests pass** (`brow-gesture.test.ts`). Real camera not tested | Score = max(`browInnerUp`, mean of `browOuterUpLeft`/`browOuterUpRight`) from the local face model. A raise held across a screen change, face loss, or blink never carries over. Thresholds are prototype defaults until calibrated |
| **Gesture arbiter** (the only emitter of accepted gesture commands; one command per physical cycle) | Implemented (`src/access/gesture-arbiter.ts`, `5de1a57`) | Synthetic tests pass (`gesture-arbiter.test.ts`, `handsfree-pipeline.test.ts`) | A blink closure freezes the highlight and cancels an unfinished raise. No NEXT is accepted during a closure. A raise and a closure that start within 120 ms of each other are ambiguous and do nothing. "Eyebrow raise detected — Next" / "Blink detected — Selected" appear only after acceptance |
| **Brow calibration** (neutral samples + comfortable raises) | Implemented (`src/access/brow-calibration.ts`, `5de1a57`) | Synthetic tests pass. Real camera not tested | Fails openly if raised and neutral brows can't be separated |
| **Long-blink SELECT** (gesture state machine) | Implemented (`src/access/blink-gesture.ts`, commits `2230926`, `08c6abc`) | **Synthetic tests pass.** **Real camera not tested** | Closure onset freezes the target. Short blinks are ignored, overlong closures discarded, then a cooldown. Face lost → discard and pause. Multiple faces → hold. Defaults in [D21](docs/DECISIONS.md) |
| **Blink calibration** | Implemented (`src/access/blink-calibration.ts`, `src/components/BlinkCalibration.tsx`) | Synthetic tests pass. Real camera not tested | Fails openly when natural and deliberate closures overlap. Only scalar settings are stored |
| **Local face landmarker** (MediaPipe Face Landmarker, `@mediapipe/tasks-vision` 1.1.1) | Implemented (`src/access/blink-detector.ts`; model in `public/models`, WASM copied to `public/wasm`) | Model created in a desktop browser pane, one blank frame returned 0 faces. Assets served from Railway (11:46 CT). **No real camera frames processed yet** | `numFaces: 2`. Served from this app's origin. Network behavior during camera use not yet checked (SYS-13) |
| **Live camera preview, top right** (mirrored, muted, hideable) | Implemented (`src/components/CameraPreview.tsx`, `GestureFeedback.tsx`, `5de1a57`) | Rendered in iPad Simulator without a camera. Not verified with a camera | Shows tracking state, brow progress, and the accepted-command lines. No REC label because nothing is recorded |
| **iPad landscape layout** | Implemented (`5de1a57`) | **iPad Simulator** Safari, landscape and portrait, touch + fixtures (12:15–12:19). **Not physical-iPad-verified** | Earlier desktop checks at 1440×900 and ~800 px |
| **ElevenLabs voice** (`POST /api/speech`, `eleven_v4_turbo` over the server-side Text-to-Dialogue WebSocket; `GET /api/voices`) | **Implemented** (`src/app/api/speech/`, `src/app/api/voices/`, `src/server/elevenlabs/`, `5de1a57`) | **Mock tests pass** (`speech-api.test.ts`). **Live voice not verified: `ELEVENLABS_API_KEY` is missing** locally and on Railway. Railway reports speech "not configured" (12:20 probe) | Required primary voice. The key stays on the server. Only the exact confirmed sentence is sent. MP3 returned as one blob, for iPad reliability ([D30](docs/DECISIONS.md)). Whether the dialogue WebSocket accepts `eleven_v4_turbo` for our account is confirmed only by a live call ([adapter notes](src/server/elevenlabs/README.md)) |
| **iPad audio setup** (one-time Enable Audio / Test Voice touch) and the single audio player | Implemented (`src/runtime/useAudio.ts`, `src/audio/eleven-player.ts`) | Player unit tests pass (`eleven-player.test.ts`). **Not iPad-verified** | iPad Safari may block audio that isn't started by a real touch. Whether later blink-confirmed speech plays without another touch is unknown until tested |
| **Speech authorization + basic device voice fallback** (browser `speechSynthesis`) | Implemented in `src/core/reducer.ts` (`5de1a57`), with further uncommitted edits | Authorization and TTS-07 fallback tests pass (12:28). Audible output not confirmed by a listener | Only a `ConfirmedUtterance` is ever spoken. Always labeled "basic device voice". Never used silently in place of ElevenLabs. After a natural-voice error or uncertain delivery, the basic voice needs a new review and a new confirmation |
| Shared communication kernel: one reducer, one target registry, immutable review starting on Cancel, separate fresh confirmation, stale-result protection | Implemented (`src/core/`) | Unit tests pass. Browser fixture loop passed | Every input reaches the same guarded `ACTIVATE` path. Eyebrow/blink have not been exercised through it on camera |
| **Fallback:** auto-scan + blink select (1.5 s per target, 2 s reading pause) | Implemented (access mode `'blink'`) | Synthetic tests (scan attribution and timing). Real camera not tested | **Off in eyebrow mode** (`'brow-blink'`, the default). Only one way of moving the highlight runs at a time |
| **Fallback:** keyboard / single switch | Implemented (`src/access/`) | Browser: passed with key events synthesized in JavaScript | A held key with 20 repeats produced exactly one activation. No physical switch tested |
| **Fallback:** touch / pointer | Implemented | Browser pass with pointer/scripted clicks (desktop); iPad Simulator touch | Physical iPad touch not tested |
| "None of these" regeneration, guidance, change wording | Implemented | Unit tests pass. Browser pass (pointer/scripted) | Rejections apply to the current question only |
| Quick phrases, saved phrases, My words (scanning keyboard) | Implemented | Unit tests pass. Browser pass (pointer/scripted) | No AI needed. Drafts survive interruptions |
| Start a conversation, staged/parked turns, history | Implemented | Unit tests pass. Browser pass (pointer/scripted) | No fake partner question |
| Consented length learning, approved preferences, memory review | Implemented | Unit tests pass. Browser pass in fixture mode | Reload persistence not tested |
| Live AI replies: OpenAI Responses API, `gpt-6-astra`, `store: false`, strict `json_schema` | Implemented (`src/server/provider.ts`) | **Verified live** with synthetic inputs (local and Railway, before the 12:13 redeploy). 14 synthetic scenarios in [docs/evidence/live-scenarios.json](docs/evidence/live-scenarios.json) | Not yet re-checked on `f65385bb`. Human judgments of the 14 outputs are not recorded yet. The Anthropic adapter is present but only mock-tested |
| Partner transcription (`gpt-transcribe`) | Implemented | Server path verified with a synthetic clip. Browser/iPad microphone not exercised | Typed input is the fallback |
| Fixture demo mode | Implemented | Browser pass | Labeled "Fixture demo". Never substituted for a failed live request |
| Railway deployment (`still-here` / `api`, HTTPS, access code required) | Deployed: `f65385bb` = commit `5de1a57` (12:13) | Access-code enforcement passed at 11:18 (401 without code, 200 with). 12:20 probe of `f65385bb`: `/api/status` 200 with speech not configured. Security headers present | **HSTS** (`Strict-Transport-Security`) is added in the uncommitted `next.config.ts`; **pending redeploy**. HTTPS is what lets iPad Safari use the camera ([D29](docs/DECISIONS.md)) |
| **Access-code throttle fix** | Uncommitted (`src/server/request-guards.ts`) | `access-throttle.test.ts` passes (12:28). **Not deployed** | Only wrong, non-empty codes count toward the throttle (10 per 10 min per client). **A correct code always passes** and is never counted. A missing code is denied without counting, so others on the same Wi-Fi cannot lock the iPad out |
| Measurement mode, gesture metrics, `/trial` engineering trial page | Reducer events and content-minimal export present. `src/metrics/gesture-metrics.ts` and a `/trial` recorder are uncommitted and in progress | Not run | **Nothing has been measured.** The trial page is labeled "Engineering trial — not clinical validation" |
| Native iOS client (`ios/`, SwiftUI) | Experimental secondary client | Builds. 9 Swift Testing tests pass on the iPhone 17 Pro simulator | **Not part of the demo** ([D26](docs/DECISIONS.md)). The demo is the web app in iPad Safari |

## Supported inputs

- **Eyebrow NEXT + long-blink SELECT (primary, default access mode `brow-blink`; implemented, not iPad-verified):** the iPad front camera, MediaPipe running in Safari, and a short guided calibration (neutral brows, 500 ms raises, natural blinks, deliberate long blinks, a practice select, and a separate practice confirm). A helper may be needed to grant camera permission and to tap **Enable Audio** once.
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
| Confirmed speech text | When the natural voice is on, **the exact sentence the person confirmed** is sent from our server to ElevenLabs for audio generation. Nothing else is sent: no unconfirmed suggestions, no history. The returned audio is played and not stored by the app. Per the ElevenLabs docs checked 2026-10-24, request logging is on by default, zero-retention mode is enterprise-only, and the Text-to-Dialogue WebSocket we use is not explicitly listed among the zero-retention endpoints. We don't use it and make **no zero-retention claim** |
| Recorded partner audio | Sent to OpenAI transcription only after consent and an explicit Record action. Not stored by the app |
| Conversation text and approved context | Live AI mode only: sent to OpenAI with `store: false`. This includes up to 10 recent turns, the active question, approved profile entries, guidance, and approved preferences. Per OpenAI's data-controls page (checked 2026-10-24), `store: false` stops the response from being kept as application state, but **abuse-monitoring logs may still be retained for up to 30 days**. Zero Data Retention needs OpenAI's approval, which we don't have. So we say "`store: false` is set", never "OpenAI keeps nothing" |
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
- **ElevenLabs implemented but not configured.** `ELEVENLABS_API_KEY` is missing locally and on Railway, so live natural speech is not verified. Naturalness has not been judged by listeners.
- **iPad Safari audio policy.** A camera gesture may not count as a user touch. Hands-free audible playback after one setup touch is unverified.
- Not tested with AAC users, people with ALS, clinicians, or specialists. Team testing is not clinical validation.
- Eyebrow raises and long blinks will not work for everyone. Lighting, glasses, camera angle, fatigue, speech movements, and individual motor ability are expected to affect detection. None of this has been studied.
- Browser microphone capture and the 200% zoom layout have not been verified.
- Session learning covers length only. English only. No offline guarantee. Local storage is not encrypted.
- Rate limits, the access-code throttle, and the ElevenLabs character budget are in memory, for a single instance. They are not a spending cap.
- The MediaPipe model cards say the models are not intended for human life-critical decisions. AAC input is outside their stated primary domain, which is one reason review and a separate confirmation are mandatory before anything is spoken.

## Provenance

- Application code in `src/` was written on 2026-10-24 after hacking began at 09:00 CT. Claude Code (Opus 5.5) implemented it, with Liam Howeth directing and reviewing. See [docs/AI_USAGE.md](docs/AI_USAGE.md).
- The generic repository foundation (collaboration docs, AI rules, hygiene script, templates) was committed 08:49–09:08 CT and contains no application code. Liam should confirm it fits the event's pre-event-work rule.
- **Third-party assets:** the `@mediapipe/tasks-vision` 1.1.1 WASM runtime (Apache-2.0 per its package) and the MediaPipe Face Landmarker model (`float16/1`). The model license is **confirmed Apache-2.0** (2026-10-24) from the three component model cards (BlazeFace short range, Face Mesh V2, Blendshape V2). Those cards also state an intended-use caveat: the models are "not intended for human life-critical decisions". That is not a license barrier, but it is why review and a separate confirmation are mandatory and why we make no reliability claim ([details](docs/REFERENCES.md#blink-detection-assets)). Both are served locally. Sources and hashes: `public/models/README.md`. No other third-party models, images, or datasets are included. Fixtures are synthetic. ElevenLabs is a remote API; no ElevenLabs code or audio is included. No voice cloning.
- No license chosen yet. We do not claim to have invented AAC, scanning, blink switches, facial-gesture access, or AI-assisted communication.

## Related work

Conversation-first, AI-assisted AAC and camera-based AAC access already exist. [docs/REFERENCES.md](docs/REFERENCES.md) lists what we checked on 2026-10-24, with each source's own claims and its status: VisioALS (webcam gaze quadrants, four AI replies, a cloned ElevenLabs voice; the closest overlap), Google SpeakFaster, Project Converse / DEAN, Speak4Me, Bobbai, and Alek (shut down 2026-06-01). No code or assets were copied from any of them. We describe Still Here as one implemented combination, not as a first or a novel product.

## Demo walkthrough (iPad)

Full script with labeled fallbacks: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md). This walkthrough is the plan. It has not been rehearsed on an iPad yet.

1. On the iPad in landscape, open the Railway HTTPS URL in Safari and enter the access code (kept in Railway variables and the git-ignored `.env.railway.local`; never shown on screen or in chat), or use another trusted HTTPS origin.
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

One Next.js service on Railway (project `still-here`, service `api`): `https://api-production-18038.up.railway.app`. Paid routes require the access code. Deployment `f65385bb` (12:13 CT) is commit `5de1a57`, which includes the eyebrow, iPad UI, and ElevenLabs code. No `ELEVENLABS_*` variables are set there, so natural voice reports "not configured". The HSTS header and the access-throttle fix are uncommitted and **pending redeploy**. Runbook: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

- Deploy from a checkout with `railway up --service api`. A Git push does not deploy. `.railwayignore` keeps `.env*`, `node_modules`, `.next`, and `ios/` out of the upload.
- Set variables in Railway, never in Git: `AI_PROVIDER`, `OPENAI_API_KEY`, `REPLY_MODEL`, `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_MODEL`, `APP_ACCESS_TOKEN`, `FIXTURES_ENABLED`, and, once provided, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_DAILY_CHAR_BUDGET`.
- Live replies, transcription, and `/api/speech` require the `x-still-here-access` header. `/api/speech` also has a daily character budget. Wrong codes are throttled per client. In the pending fix, only wrong non-empty codes count, a missing code is denied without counting, and a correct code always passes.
- Security headers are set on every path (`X-Frame-Options: DENY`, `frame-ancestors 'none'`, a camera/microphone `Permissions-Policy`, and others). HSTS is added in the working tree and goes live with the next redeploy.
- Rate limits are per instance and in memory (30 live requests/min, 12 transcriptions/min, 120 fixture requests/min per client). Keep a single instance.
- The iPad needs this HTTPS origin for camera access. Railway provides HTTPS.
