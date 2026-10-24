# Architecture

**12:05 CT update:** the governing brief is now iPad eyebrow NEXT + long-blink SELECT + ElevenLabs. In progress and uncommitted at 12:05: `src/access/brow-gesture.ts` (500 ms brow hold), `src/access/gesture-arbiter.ts` (the only emitter of accepted gesture commands), the speech contract in `src/runtime/contract.ts`, and a labeled basic-voice path in `src/core/`. A server route `POST /api/speech` (ElevenLabs) is planned but was not yet present. The rest of this file describes the code as of 11:30 CT, with blink committed since (`2230926`, `08c6abc`).

This describes the code on 2026-10-24 at 11:30 CT. The kernel, runtime, UI, and server are integrated and tested (see [TEST_RESULTS.md](TEST_RESULTS.md)). The **blink access adapter** is being built. It is described here from its runtime contract and the uncommitted modules present at 11:35 (`src/access/blink-{detector,gesture,calibration}.ts`, `src/components/Blink{Calibration,Status}.tsx`). It was not yet wired into `useStillHere`. Check [PROGRESS.md](PROGRESS.md) for the latest status.

## Stack

Next.js 16.4.3 (App Router), React 19.3, TypeScript 5.9, zod 4.6, `@mediapipe/tasks-vision` 1.1.1, `@anthropic-ai/sdk` 1.3.0, vitest 5.0. There is one application, with no microservices and no database. It is deployed as a single Railway instance. An experimental SwiftUI client in `ios/` is outside the demo path and not connected end to end.

## Layers

```text
Browser
  components/                      ── render State + Target[]; call runtime.activate()
  runtime/useStillHere.ts + effects-runner.ts
     ├─ dispatch(Action) → core/reducer.ts (pure)
     ├─ executes queued Effects exactly once (generate, speak, persist, record, …)
     ├─ access/                    scan-controller (one chained timer), input-controller
     │    └─ blink (in progress)   camera → MediaPipe (local assets) → eye-closure score
     │                             → gesture state machine → SELECT → same guarded ACTIVATE
     ├─ audio/                     speech-controller, recording-controller, transcript-client, voices
     └─ adaptation/preference-store.ts  versioned local storage (approved items only)
  core/      pure state, reducer, target registry, context builder, schemas, limits
  adaptation/ pure session observations + preference resolution

Server (Next.js route handlers)
  /api/replies    → validate (zod) → fixture, or OpenAI (default) / Anthropic adapter → validate output → JSON
  /api/transcribe → bounded audio → OpenAI-compatible transcription → draft
  /api/status     → which services are configured (no secrets)
  server/  config, request-guards, reply-prompt, provider, validation, fixtures, transcription
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
| [`request-guards.ts`](../src/server/request-guards.ts) | Access gate (`x-still-here-access`, timing-safe compare). With no token set, non-localhost requests are flagged `unprotected-remote`. Also provides the per-process rate limiter, bounded body reads, `no-store` JSON, and content-free logs |
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
4. `ACTIVATE` on a candidate opens a frozen `ReviewSnapshot`.
5. `ACTIVATE` on **Speak** creates a `ConfirmedUtterance` only if the confirming event and cycle differ from the selection's, the surface revision is current, and at least 600 ms have passed since the review opened. It then appends a user turn with `delivery: 'queued'` and queues one `speak` effect.
6. `SPEECH_EVENT`s update delivery. Errors or uncertainty show the text on screen and never replay.

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
- **Paid endpoints:** access is gated by `APP_ACCESS_TOKEN`, and remote requests without a token are refused. The rate limiter works for one process only.
- **Browser storage:** only approved preferences, profile entries, custom phrases, and suppressed dimensions are stored, using a versioned schema. `preference-store.ts` returns `corrupt` (and loads nothing) when the stored JSON fails the schema. Cross-tab synchronization is intentionally not implemented (see [DECISIONS.md](DECISIONS.md)).

## Runtime modules

| Path | Responsibility (from source headers) |
| --- | --- |
| `src/runtime/useStillHere.ts`, `effects-runner.ts` | Implements `StillHereRuntime`; executes queued effects (generate, speak, persist, clear-storage, recording, export) |
| `src/access/scan-controller.ts` | Single scanning timer using chained `setTimeout` (missed ticks are never replayed). Freezes while the switch is held or the tab is hidden |
| `src/access/input-controller.ts` | Converts pointer/keyboard/switch events into guarded `ACTIVATE` actions |
| `src/audio/speech-controller.ts` | The one wrapper around `speechSynthesis`. Accepts only a `ConfirmedUtterance`. Start/end watchdogs report `uncertain` without replaying |
| `src/audio/recording-controller.ts` | Push-to-record with runtime format selection (`MediaRecorder.isTypeSupported`) and a 20 s cap. Discards capture when the app speaks |
| `src/adaptation/preference-store.ts` | Versioned storage key `still-here:v1`. Stores approved items only. No `storage` event listener (cross-tab sync disabled) |
| `src/metrics/export.ts` | Content-minimal summary of metric events (kinds, timestamps, sources, IDs; no message text) |
| `src/app/api/replies/route.ts` | Bounded read → strict schema → fixture (if enabled) or live (if configured, access-checked, rate-limited) |
| `src/app/api/transcribe/route.ts` | Size/type checks, access gate, rate limit, then the OpenAI-compatible adapter |
| `src/app/api/status/route.ts` | Reports configured/not configured, fixtures enabled, and whether an access code is required. Never returns secrets |

## Blink access adapter (in progress)

- `blink-detector.ts`: MediaPipe `FaceLandmarker` in `VIDEO` mode, `numFaces: 2`, blendshapes on, GPU delegate with CPU fallback, throttled frame processing. Per frame it outputs `{ faces, score }`, where score = min(`eyeBlinkLeft`, `eyeBlinkRight`).
- `blink-gesture.ts`: a pure state machine with no timers or DOM (phases `no-face`, `face-lost`, `multiple-faces`, `ready`, `closing`, `cooldown`). Fed monotonic frames, it emits gesture events.
- `blink-calibration.ts`: pure sample segmentation, threshold and duration proposal, honest failure, and scalar-only storage parsing.

| Piece | Responsibility |
| --- | --- |
| Assets | `public/wasm/*` (copied from `@mediapipe/tasks-vision` 1.1.1 by `scripts/copy-mediapipe-assets.mjs`) and `public/models/face_landmarker.task` (`float16/1`). Hashes in `public/models/README.md`. Loaded from the app's origin |
| `BlinkRuntime` | `status` (`off`, `unsupported`, `permission-denied`, `starting`, `no-face`, `multiple-faces`, `ready`, `closing`, `selected`, `cooldown`, `face-lost`), a short `message`, `closureProgress`, `eyeScore` (calibration meter only), `faceCount`, measured `fps`, `calibration`, camera start/stop, preview attach, gesture-event subscription, and `calibrator` |
| `BlinkCalibration` | Scalars only: `closedThreshold`/`openThreshold` (hysteresis), `minClosureMs`, `maxClosureMs`, `cooldownMs`, observed natural maximum and deliberate minimum |
| Gesture events | `closure-start`, `select` (with duration), `discard` (`too-short`, `too-long`, `face-lost`, `multiple-faces`, `stale`), `face-lost`, `face-found` |
| Calibration stages | `consent` → `position` → `baseline` → `natural` → `deliberate` → `review` → `practice-select` → `practice-confirm` → `done`, or `failed` with a reason |

Integration rule: at closure onset the adapter snapshots the highlighted target and surface revision and freezes scanning. A valid reopening emits one activation of *that* target through the same `ACTIVATE` path, as a new input cycle. So the reducer's existing guards (surface revision, fresh cycle for confirmation, 600 ms arming, Stop/Resume-only surfaces) apply to blink unchanged. **Not yet verified in code or on camera.**

## Not present

A service worker or offline cache, any database, analytics, session replay, face recognition, gaze estimation, or emotion inference.
