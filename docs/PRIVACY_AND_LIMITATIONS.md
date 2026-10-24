# Privacy and limitations

This covers actual and intended handling in this build. Where a path depends on code that is still in progress, it is marked. Provider retention policies have **not** been independently verified for this project. Check the provider's current terms before describing them to anyone.

## The five data paths

| Data | Handling | Status |
| --- | --- | --- |
| **Camera frames** | No camera feature exists. No frames are captured. | Blink input deferred |
| **Recorded partner audio** | Captured only after cloud-transmission consent and an explicit Record action (`record-start` is ignored without `cloudConsent` or while speaking). Sent to the configured OpenAI-compatible transcription service and returned as a draft for review. The app does not store raw audio. Recording is discarded when speech starts, on Pause, and on End session. | Present in source; not verified (no key) |
| **Conversation text and approved context** | **Live AI:** the server sends the Anthropic API the active question or initiation topic, up to 10 recent accepted turns (600 chars each), enabled approved profile entries (only when personalization is on), current guidance, applied approved preferences, session hints, up to 8 rejected batches for this question, and the length policy. Staged (unaccepted) partner turns are excluded. **Fixture / Local-only:** nothing leaves the local machine and the local Next.js server. | Live path not verified |
| **Speech text** | Spoken through the browser's `speechSynthesis`. Depending on the browser and voice, synthesis may be local or remote (`SpeechSynthesisVoice.localService`). We have not verified which voice is used on the demo machine. | Present in source; not hardware-verified |
| **Approved preferences / profile / custom phrases** | Held in memory for the session. Written to browser local storage (versioned schema) only when **Remember on this device** is on. Suppressed-learning dimensions are kept across sessions only under that same setting. If a write fails, the app says "Applied for this session; could not save on this device." | Present in source (`preference-store.ts`, key `still-here:v1`); reload not tested |

**Never stored:** conversation transcripts, candidate suggestions, rejected batches, session observations, pending proposals, raw recordings, metrics (unless explicitly exported in measurement mode), and face data.

## Logging and responses

- Server logs are content-free JSON: route, request ID, outcome code, and duration (`logRequest` in `src/server/request-guards.ts`).
- API responses use `cache-control: no-store`. Errors carry a code and a plain message, with no provider traces, keys, prompts, or conversation content.
- No analytics, session replay, or automatic export.

## Security

- Provider keys are read only server-side (`server-only` import) and never use a `NEXT_PUBLIC_` prefix.
- Paid endpoints check `APP_ACCESS_TOKEN` via the `x-still-here-access` header with a timing-safe comparison. With no token set, non-localhost requests are refused. **Do not deploy publicly without setting the token.**
- Rate limiting is in-memory and per process. It is not a distributed cap or a spending guarantee.
- Request bodies are capped (64 KB for replies) and strictly validated before any provider call.
- Model output is parsed with a strict schema. The model has no tools and cannot trigger speech, storage, or navigation.

## Ending a session

End session invalidates the session epoch, aborts pending generation, cancels speech, and discards recording. It also clears the conversation, drafts, staged turns, workspaces, observations, and proposals, then returns to setup. Approved preferences remain until they are deleted explicitly (Memory → delete, or **Delete everything saved**). Local cleanup does not delete anything already held by a provider.

## Limitations

- **Not tested with AAC users** or people with ALS. No clinicians or specialists were consulted. Team testing is not validation.
- **No measurements yet.** The design hypothesis (fewer actions or less time per turn) is unmeasured.
- **Live AI and transcription unverified.** The demo uses the labeled Fixture mode.
- **Integration in progress.** UI, browser runtime, speech, and recording had just landed at the time of writing and were not yet verified. Accessibility (contrast, 200% zoom, screen readers) has not been checked. We make no accessibility-conformance claim.
- **Switch hardware.** The single switch is emulated with a keyboard key. External switches that send other events are untested.
- **Learning scope.** Session learning is length-only and uses word counts. Position bias and semantic differences are confounders, so observations are tentative.
- **Semantic diversity.** Validation screens for exact duplicates and repeats only. It cannot prove that three suggestions differ in meaning.
- **English only.**
- **Offline.** No service worker. If the network drops, loaded quick phrases and My words should keep working, but this has not been tested. A cold reload needs the server.
- **Shared computers.** Local storage is not encrypted.
- **Two tabs.** Cross-tab sync is intentionally disabled, so two tabs can diverge.
- **Consequential topics.** The prompt tells the model not to invent medical decisions, consent, or facts, but prompts are not guarantees. Users can always compose their own words. Still Here is not a medical, legal, or emergency tool. "Please get someone to help me." only speaks the phrase.
