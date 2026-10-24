# Architecture

**Updated about 3 PM CT:** see "Current state" below for what changed after this snapshot. The original text follows. It describes the code on 2026-10-24 at ~12:30 CT: commit `5de1a57` (12:13, eyebrow NEXT + blink SELECT, gesture arbiter, iPad UI, ElevenLabs speech path; deployed to Railway as `f65385bb`) plus uncommitted working-tree changes that are marked as such (the access-throttle fix, HSTS, the `/trial` recorder, gesture metrics). The governing brief is iPad Safari, eyebrow NEXT + long-blink SELECT, ElevenLabs voice ([D27](DECISIONS.md), [D28](DECISIONS.md)). Test evidence: [TEST_RESULTS.md](TEST_RESULTS.md) and [PROGRESS.md](PROGRESS.md). Nothing here has run on a physical iPad or a real camera.

## Current state (2026-10-24, about 3 PM CT)

The sections below were written earlier in the day. Where they conflict with this list, this list is current:

- **Fast mode is the default.** One long blink on a suggestion speaks it immediately. The review screen plus a separate confirming blink (and the 600 ms arming delay in the data-flow steps below) apply only when fast mode is turned off in setup.
- **Voice is prefetched in fast mode.** `src/audio/speech-prefetch.ts` asks the server for the on-screen suggested sentences ahead of time (including ones never chosen), so the chosen one can play from memory. Outside fast mode nothing is pre-synthesized and only the confirmed sentence is sent.
- **Eyebrow input:** the hold time comes from calibration (about 0.35-0.5 s, replacing the fixed 500 ms in the module notes), and keeping the eyebrows up repeats NEXT every 0.6 s (`repeatMs: 600`). A brief jaw drop (`src/access/jaw-gesture.ts`) goes back one choice.
- **Hands-free listening:** `src/audio/continuous-listener.ts` and `src/runtime/useContinuousListening.ts` cut utterances with on-device voice detection and send only those clips to transcription. Follow-up lines within 20 s merge into the open question, and pure filler is ignored.
- **Other ways to answer:** 2 replies plus 3-5 directions; replies for each direction are prefetched in the background.
- **Multi-face lock:** `src/access/face-selector.ts` follows the most central, longest-present face (unit-tested only).
- **Reply tier:** OpenAI priority tier is OFF (it caused timeouts; see [TEST_RESULTS.md](TEST_RESULTS.md)).
- **Verification status:** 586 unit tests pass plus 2 expected failures (34 files), and the deployed smoke test passes 6/6. Hold-to-move, jaw-drop Back, branching, multi-face lock, and audible prefetch have **not yet been tried by a person on the iPad**.

## Stack

Next.js 16.4.3 (App Router), React 19.3, TypeScript 5.9, zod 4.6, `@mediapipe/tasks-vision` 1.1.1, `@anthropic-ai/sdk` 1.3.0, vitest 5.0. There is one application, with no microservices and no database. It is deployed as a single Railway instance. An experimental SwiftUI client in `ios/` is outside the demo path and not connected end to end.

## Layers

```text
Browser
  components/                      ── render State + Target[]; call runtime.activate()
  runtime/useStillHere.ts + effects-runner.ts
     ├─ dispatch(Action) → core/reducer.ts (pure)
     ├─ executes queued Effects exactly once (generate, speak, persist, record, …)
     ├─ runtime/useBlink.ts        camera → MediaPipe (local assets) → blink + brow scores
     │    ├─ access/blink-gesture  long-blink SELECT proposals
     │    ├─ access/brow-gesture   eyebrow NEXT proposals (calibrated hold, repeats while held; 'brow-blink' mode only)
     │    └─ access/gesture-arbiter  the ONLY emitter of accepted NAV_NEXT / SELECT
     │                             → useStillHere → scan-controller.next() or the same guarded ACTIVATE
     ├─ access/                    scan-controller (one chained timer, or manual stepping), input-controller
     ├─ audio/                     eleven-player (one audio element), speech-controller (basic voice),
     │                             recording-controller, transcript-client, voices
     └─ adaptation/preference-store.ts  versioned local storage (approved items only)
  core/      pure state, reducer, target registry, context builder, schemas, limits
  adaptation/ pure session observations + preference resolution

Server (Next.js route handlers)
  /api/replies    → validate (zod) → fixture, or OpenAI (default) / Anthropic adapter → validate output → JSON
  /api/transcribe → bounded audio → OpenAI-compatible transcription → draft
  /api/speech     → access gate + rate limit + daily char budget → ElevenLabs (exact confirmed text) → audio/mpeg
  /api/voices     → server-approved ElevenLabs voices (never the key)
  /api/status     → which services are configured (no secrets)
  server/  config, request-guards, reply-prompt, provider, validation, fixtures, transcription, elevenlabs/
```

## Core modules (`src/core/`)

| File | Responsibility |
| --- | --- |
| [`types.ts`](../src/core/types.ts) | Domain contracts: anchors, candidates, batches, review snapshots, confirmed utterances, observations, approved preferences/profile, `ReplyRequest`, `ApiResult` |
| [`state.ts`](../src/core/state.ts) | `State`, `Surface` union (board, menus, compose, review, speaking, paused, and others), `Workspace`, `Command`, `Effect`, `Action`, `Target`, defaults (`aiMode: 'fixture'`, adaptation/persistence off) |
| [`reducer.ts`](../src/core/reducer.ts) | The only place decisions are made. It queues effects as data and never calls browser APIs |
| [`targets.ts`](../src/core/targets.ts) | The single target registry: `targetsFor(state)` returns the activatable targets for the visible surface. Pointer, keyboard, and switch all activate targets from this list |
| [`context-builder.ts`](../src/core/context-builder.ts) | Builds the bounded, attributed `ReplyRequest` for one workspace |
| [`schemas.ts`](../src/core/schemas.ts) | zod schemas for requests, model output, the JSON Schema for structured output, and versioned local storage (`version: 1`) |
| [`limits.ts`](../src/core/limits.ts) | Bounds, length policies, scan defaults, word count, duplicate normalization that keeps negations |
| [`phrases.ts`](../src/core/phrases.ts) | Built-in phrases, initiation/intent labels, keyboard groups |

## Adaptation (`src/adaptation/`)

- [`observations.ts`](../src/adaptation/observations.ts): deterministic, length-only evidence. A confirmed choice counts only if the batch's word-count spread is at least 4, the chosen candidate is uniquely the shortest or longest, the batch was not a refinement, and no explicit length guidance was active. Explicit Shorter/More detail feedback counts double. A session hint needs 2 distinct turns; a proposal needs 3. There is one proposal per dimension per session.
- [`preference-policy.ts`](../src/adaptation/preference-policy.ts): resolution in the order explicit current wording > saved preference (setting match = 2, relationship match = 1, global = 0; ties go to the latest approval) > session hint > default. Pause personalization or turning off saved preferences removes saved influence. Explicit guidance is unaffected.

## Server (`src/server/`)

| File | Responsibility |
| --- | --- |
| [`config.ts`](../src/server/config.ts) | Reads env vars server-side (`server-only`). Replies are configured only when `AI_PROVIDER` is `openai` or `anthropic` and that provider's key and `REPLY_MODEL` are set |
| [`request-guards.ts`](../src/server/request-guards.ts) | Access gate (`x-still-here-access`, timing-safe compare). With no token set, non-localhost requests are flagged `unprotected-remote`. Failed-code throttle: 10 wrong codes per client per 10 minutes. In the working tree (uncommitted, pending redeploy) **a correct code is checked first and always passes**, a missing code is denied without counting, and only wrong non-empty codes count, so a shared Wi-Fi IP cannot lock out a client that has the code. Also provides the per-process rate limiter, bounded body reads, `no-store` JSON, and content-free logs |
| [`elevenlabs/`](../src/server/elevenlabs/README.md) | Server-only ElevenLabs adapter: model routing (`eleven_v4_turbo` → Text-to-Dialogue WebSocket; `ELEVENLABS_TRANSPORT=http` → another, labeled model), approved voice ids, character budget, MP3 validation. Mock-tested; no live call yet (no key) |
| [`reply-prompt.ts`](../src/server/reply-prompt.ts) | Fixed system instructions plus a separate structured JSON data payload. Dynamic text is never concatenated into instructions |
| [`provider.ts`](../src/server/provider.ts) | **OpenAI** (verified): `fetch` to the Responses API with `store: false`, strict `json_schema` output, no tools, optional reasoning effort, and 429/401 mapping. **Anthropic** (unverified): `client.beta.messages.create`, `output_config: { effort: 'low', format: json_schema }`, optional `fallbacks: 'default'` with beta `server-side-fallback-2026-07-01`, `maxRetries: 0`, at most one repair attempt within the deadline, refusal mapped to `PROVIDER_REFUSAL` |
| [`validation.ts`](../src/server/validation.ts) | Output screening: schema (exactly three), length policy with small tolerance, markup, exact duplicates, repeats of rejected text. These are screening checks, not proof of semantic diversity |
| [`fixtures.ts`](../src/server/fixtures.ts) | Deterministic synthetic pools by intent, initiation category, seed, and refinement. Avoids rejected texts. Always labeled `demo-fixture` |

## Runtime contract

[`src/runtime/contract.ts`](../src/runtime/contract.ts) defines `StillHereRuntime`: `state`, `targets`, `highlightedTargetId` (scan highlight, kept separate from DOM focus), `switchHeld`, `activate(targetId, source)`, `dispatch`, `startSession`, `serverStatus`, voices, `testVoice` (fixed text, never in history), partner submit/record/transcript, and the access code.

## Main data flow (reply)

1. `PARTNER_SUBMIT`: if the user is idle on the board, the turn is accepted for context, a reply workspace is created, and a `generate` effect is queued. If the user is busy, the turn is staged and the user sees a notice.
2. The runtime posts the `ReplyRequest` to `/api/replies`. The result returns as `GENERATION_RESULT` with the request identity.
3. The reducer installs the batch only if the epoch, workspace, request ID, context revision, preference revision, and anchor content revision all match and the workspace is still open. Application IDs are assigned to candidates.
4. With fast mode on (default), `ACTIVATE` on a candidate speaks it directly. With fast mode off, it opens a frozen `ReviewSnapshot`.
5. With fast mode off, `ACTIVATE` on **Speak** creates a `ConfirmedUtterance` only if the confirming event and cycle differ from the selection's, the surface revision is current, and at least 600 ms have passed since the review opened. It then appends a user turn with `delivery: 'queued'` and queues one `speak` effect. The provider is `settings.speechProvider` (`elevenlabs` by default).
6. `SPEECH_EVENT`s update delivery. Errors or uncertainty show the text on screen and never replay.

### Speech authorization and the basic-voice fallback

- Only a `ConfirmedUtterance` is ever **played**. Its `exactText` is what is spoken (ElevenLabs or `speechSynthesis`). In fast mode the on-screen suggested sentences are synthesized **ahead of time** (`speech-prefetch.ts`) so the chosen one can start from memory, which means unchosen suggestions are sent to ElevenLabs, but no prefetched audio is played unless the person chooses it. With fast mode off, nothing is pre-synthesized and only the confirmed sentence is sent.
- After an ElevenLabs `error` or `uncertain` delivery, the reducer records `lastFailedSpeech` and the board offers **Say it with the basic device voice** and **Dismiss voice problem** (`src/core/targets.ts`). Choosing it opens a **new** review (origin `basic-voice`, linked to the original utterance id); speaking needs a **new, separate confirmation**, and the resulting utterance uses provider `browser`, labeled "basic device voice". There is no silent fallback. A later confirmed utterance clears the offer.
- Covered by `speech-authorization.test.ts` (TTS-07, passing at 12:28 CT on the working tree). Audible output has not been confirmed by a listener.

## Identities and what they protect

| Identity | Where checked |
| --- | --- |
| `sessionEpoch` | `ACTIVATE`, `GENERATION_RESULT`, `SPEECH_EVENT`, `confirmSpeak` |
| `workspaceId` + `requestId` | `GENERATION_RESULT` (superseded requests are ignored) |
| Anchor `turnContentRevision` | `GENERATION_RESULT`, history return, refresh |
| `contextRevision` | Bumped on accepted partner turns, guidance changes, and confirmed messages. Not bumped by staging or scan ticks |
| `preferenceRevision` | Bumped on preference/profile/flag/scope changes. Invalidates pending old-policy results |
| `surfaceRevision` | Every `ACTIVATE` must match it. It increments on every surface change and after every accepted activation |
| `cycleId` / `eventId` | Remembered (last 200) so a gesture is consumed once. Confirmation must use a different cycle and event than the selection |
| Review / utterance IDs | One `speak` effect per confirmation. Delivery is keyed by utterance ID |

## Trust boundaries

- **Client to server:** every request is parsed with a strict zod schema with bounds (10 turns, 600 chars per turn, 1,000 chars partner text, 12 profile entries, 8 rejected batches, allowed length policies only, 64 KB request cap). The `approved` labels are provenance, not authentication.
- **Model to app:** output is untrusted. It is parsed by a strict schema, screened, and given IDs by the app. The model has no tools and cannot speak, save, or navigate.
- **Paid endpoints** (`/api/replies` live, `/api/transcribe`, `/api/speech`): access is gated by `APP_ACCESS_TOKEN`, and remote requests without a token are refused. Only wrong non-empty codes count toward the throttle; a correct code always passes (working tree, pending redeploy). The rate limiter, throttle, and character budget work for one process only.
- **Security headers** on every path (`next.config.ts`): `nosniff`, `no-referrer`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, and a `Permissions-Policy` allowing camera/microphone for this origin only. HSTS is added in the working tree, pending redeploy.
- **Browser storage:** only approved preferences, profile entries, custom phrases, and suppressed dimensions are stored, using a versioned schema. `preference-store.ts` returns `corrupt` (and loads nothing) when the stored JSON fails the schema. Cross-tab synchronization is intentionally not implemented (see [DECISIONS.md](DECISIONS.md)).

## Runtime modules

| Path | Responsibility (from source headers) |
| --- | --- |
| `src/runtime/useStillHere.ts`, `effects-runner.ts` | Implements `StillHereRuntime`; executes queued effects (generate, speak, persist, clear-storage, recording, export) |
| `src/access/scan-controller.ts` | Single scanning timer using chained `setTimeout` (missed ticks are never replayed). Freezes while the switch is held or the tab is hidden |
| `src/access/input-controller.ts` | Converts pointer/keyboard/switch events into guarded `ACTIVATE` actions |
| `src/audio/eleven-player.ts`, `src/runtime/useAudio.ts` | The single audio element for ElevenLabs MP3 playback, the one-time **Enable audio / Test voice** unlock, Stop, and an honest "Audio blocked" state |
| `src/audio/speech-controller.ts` | The one wrapper around `speechSynthesis` (basic device voice). Accepts only a `ConfirmedUtterance`. Start/end watchdogs report `uncertain` without replaying |
| `src/audio/recording-controller.ts` | Push-to-record with runtime format selection (`MediaRecorder.isTypeSupported`) and a 20 s cap. Discards capture when the app speaks |
| `src/adaptation/preference-store.ts` | Versioned storage key `still-here:v1`. Stores approved items only. No `storage` event listener (cross-tab sync disabled) |
| `src/metrics/export.ts` | Content-minimal summary of metric events (kinds, timestamps, sources, IDs; no message text) |
| `src/app/api/replies/route.ts` | Bounded read → strict schema → fixture (if enabled) or live (if configured, access-checked, rate-limited) |
| `src/app/api/transcribe/route.ts` | Size/type checks, access gate, rate limit, then the OpenAI-compatible adapter |
| `src/app/api/speech/route.ts`, `voices/route.ts` | Access gate, rate limit, daily character budget, approved voice id, then the ElevenLabs adapter. Logs carry the utterance id, outcome, duration, and character count only |
| `src/app/api/status/route.ts` | Reports configured/not configured (including speech), fixtures enabled, and whether an access code is required. Never returns secrets |

## Gesture access (camera)

The default access mode is **`brow-blink`** (`src/core/state.ts`). `blink` (timed auto-scan + blink select), `switch`, `keyboard`, and `pointer` are fallbacks. All of them end in the same guarded `ACTIVATE`.

- `blink-detector.ts`: MediaPipe `FaceLandmarker` in `VIDEO` mode, `numFaces: 2` (the face selector then locks onto one face), blendshapes on, GPU delegate with CPU fallback, throttled frame processing. Per frame it outputs the face count, an eye-closure score = min(`eyeBlinkLeft`, `eyeBlinkRight`), and a brow score = max(`browInnerUp`, mean of `browOuterUpLeft`/`browOuterUpRight`).
- `blink-gesture.ts`: pure long-blink state machine (phases `no-face`, `face-lost`, `multiple-faces`, `ready`, `closing`, `cooldown`). Emits `closure-start`, `select`, `discard`, `face-lost`, `face-found`.
- `brow-gesture.ts`: pure eyebrow state machine, `NEUTRAL → RISING → (held ≥ the calibrated hold, about 0.35-0.5 s) one brow-next → LATCHED → stable release → REARMING (cooldown) → NEUTRAL`. Holding the brows up keeps moving, one NEXT every 0.6 s, until they relax. After a reset, face loss, stale frame, or cancel, a neutral frame is required before a new raise can start, so a raise never carries across a screen change. Brow input runs only in `brow-blink` mode.
- `gesture-arbiter.ts`: the **only** emitter of accepted commands (`NAV_NEXT`, `SELECT`). A closure onset freezes the highlight at once and cancels an unfinished raise. No NEXT is accepted during a closure. A brow-start and a closure-start within 120 ms are ambiguous: the raise is cancelled, the blink cycle discarded, and nothing happens. Each accepted command carries a fresh physical cycle id. Feedback ("Eyebrow raise detected — Next", "Blink detected — Selected") is shown only after acceptance.
- `blink-calibration.ts`, `brow-calibration.ts`: pure sample segmentation and threshold proposal, honest failure when classes overlap, scalar-only storage.
- `scan-controller.ts`: in `brow-blink` it runs in **manual** mode with **no timer** (auto-scan off): the highlight starts on the surface's first, safe target and moves one step, wrapping, per accepted `NAV_NEXT` (eyebrow, or Tab/ArrowRight as a keyboard fallback). In `blink` mode it is the timed auto-scan. Only one highlight mover is active at a time ([D31](DECISIONS.md)).

| Piece | Responsibility |
| --- | --- |
| Assets | `public/wasm/*` (copied from `@mediapipe/tasks-vision` 1.1.1 by `scripts/copy-mediapipe-assets.mjs`) and `public/models/face_landmarker.task` (`float16/1`, Apache-2.0 per its model cards). Hashes in `public/models/README.md`. Loaded from the app's origin |
| `useBlink.ts` | Owns the camera, both gesture machines, and the one arbiter. Exposes status, messages, closure and brow progress, face count, fps, calibrations, preview attach, and the command stream |
| `useStillHere.ts` | The arbiter's single command handler: `NAV_NEXT` → `scan.next()`; `SELECT` → `ACTIVATE` of the target snapshotted at closure onset (source `blink`) |
| `CameraPreview.tsx`, `GestureFeedback.tsx` | Small mirrored, muted live preview at the top right and the accepted-command feedback. Nothing is recorded |
| `src/components/trial/` | Uncommitted, in progress: the `/trial` engineering-trial recorder. It never dispatches app actions and keeps only counts and durations |

Integration rule: at closure onset the runtime snapshots the highlighted target and surface revision and freezes the highlight. A valid reopening emits one activation of *that* target through the same `ACTIVATE` path, as a new input cycle. So the reducer's guards (surface revision, fresh cycle for confirmation, 600 ms arming, Stop/Resume-only surfaces) apply to gestures unchanged. Covered by synthetic tests (`brow-gesture`, `gesture-arbiter`, `face-runtime`, `handsfree-pipeline`); **not verified on a real camera or iPad**.

## Not present

A service worker or offline cache, any database, analytics, session replay, face recognition, gaze estimation, or emotion inference.
