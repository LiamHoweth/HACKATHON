# Architecture

This describes the code present on 2026-10-24 around 11:00 CT. Modules marked **(landing)** had just arrived from concurrent workstreams. Their summaries come from file headers and a quick read, and they are not yet integration-tested. Check [PROGRESS.md](PROGRESS.md) for the latest status.

## Stack

Next.js 16.4.3 (App Router), React 19.3, TypeScript 5.9, zod 4.6, `@anthropic-ai/sdk` 1.3.0, vitest 5.0. There is one application, with no microservices and no database.

## Layers

```text
Browser
  components/ (landing)            ── render State + Target[]; call runtime.activate()
  runtime/useStillHere.ts + effects-runner.ts (landing)
     ├─ dispatch(Action) → core/reducer.ts (pure)
     ├─ executes queued Effects exactly once (generate, speak, persist, record, …)
     ├─ access/ (landing)          scan-controller (one chained timer), input-controller
     ├─ audio/  (landing)          speech-controller, recording-controller, transcript-client, voices
     └─ adaptation/preference-store.ts  versioned local storage (approved items only)
  core/      pure state, reducer, target registry, context builder, schemas, limits
  adaptation/ pure session observations + preference resolution

Server (Next.js route handlers, landing)
  /api/replies    → validate (zod) → fixture or Anthropic adapter → validate output → JSON
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
| [`config.ts`](../src/server/config.ts) | Reads env vars server-side (`server-only`). Replies are configured only when `AI_PROVIDER=anthropic` and both the key and model are set |
| [`request-guards.ts`](../src/server/request-guards.ts) | Access gate (`x-still-here-access`, timing-safe compare). With no token set, non-localhost requests are flagged `unprotected-remote`. Also provides the per-process rate limiter, bounded body reads, `no-store` JSON, and content-free logs |
| [`reply-prompt.ts`](../src/server/reply-prompt.ts) | Fixed system instructions plus a separate structured JSON data payload. Dynamic text is never concatenated into instructions |
| [`provider.ts`](../src/server/provider.ts) | Anthropic adapter: `client.beta.messages.create`, `output_config: { effort: 'low', format: json_schema }`, optional `fallbacks: 'default'` with beta `server-side-fallback-2026-07-01`, `maxRetries: 0`, at most one repair attempt within the deadline, refusal mapped to `PROVIDER_REFUSAL` |
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

## Landed modules (summary, not yet integration-tested)

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

## Not present

Blink/camera code, a service worker or offline cache, any database, analytics, or session replay.
