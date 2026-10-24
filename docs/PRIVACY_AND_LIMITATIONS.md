# Privacy and limitations

This covers actual and intended handling in this build. Paths that depend on in-progress code are marked. Provider retention policies have **not** been independently verified for this project. Check the provider's current terms before describing them to anyone.

## The five data paths

| Data | Handling | Status |
| --- | --- | --- |
| **Camera frames (blink input)** | The camera starts only after the consent step in blink setup. Alternate input modes never ask for the camera. Frames go to the MediaPipe Face Landmarker running in the browser, which loads its model and WASM from this app's own origin (`public/models`, `public/wasm`). The detector produces eye-closure scores and a face count. The design keeps no images or video, uploads no frames, and does no face recognition or emotion inference. Only scalar calibration settings (thresholds, minimum/maximum closure, cooldown) may be kept. The small framing preview appears during calibration only | **In progress.** "No upload" and "no third-party model fetch" are **to be verified with a browser network log.** Do not claim them in the presentation until verified |
| **Recorded partner audio** | Captured only after cloud-transmission consent and an explicit Record action. Sent to OpenAI transcription (`gpt-transcribe`) and returned as a draft for review. Not stored by the app. Discarded when speech starts, on Pause, and on End session | Server path verified with a synthetic clip. Browser capture not exercised |
| **Conversation text and approved context** | **Live AI:** sent to the OpenAI Responses API with `store: false`. This includes the active question or initiation topic, up to 10 recent accepted turns (600 chars each), enabled approved profile entries, current guidance, approved preferences, session hints, up to 8 rejected batches for this question, and the length policy. Staged (unaccepted) partner turns are excluded. **Fixture / Local-only:** nothing leaves the machine and the Still Here server | Live path verified with synthetic content |
| **Speech text** | Spoken through the browser's `speechSynthesis`. Synthesis may be local or remote depending on the voice (`SpeechSynthesisVoice.localService`) | Not checked on the demo machine |
| **Approved preferences / profile / custom phrases / calibration** | Held in memory for the session. Written to browser local storage (versioned schema) only when **Remember on this device** is on. Blink calibration is scalar-only (`saveCalibration` in `src/access/blink-calibration.ts`). Whether saving it is gated by **Remember on this device** depends on the runtime wiring (to confirm) | Reload not tested |

**Never stored:** camera frames or face images, conversation transcripts, suggestions, rejected batches, session observations, pending proposals, raw recordings, and metrics (unless explicitly exported in measurement mode).

## Logging and responses

- Server logs are content-free JSON: route, request ID, outcome code, and duration.
- API responses use `cache-control: no-store`. Errors carry a code and a plain message, never provider traces, keys, prompts, or conversation content.
- In production, the status route reports the model name only with a valid access code (commit `6ea84db`, not yet deployed).
- No analytics, session replay, or automatic export.

## Security

- Provider keys are read only on the server and never use a `NEXT_PUBLIC_` prefix.
- Paid endpoints check `APP_ACCESS_TOKEN` via the `x-still-here-access` header with a timing-safe comparison. Repeated wrong codes are throttled. With no token set, non-localhost requests are refused.
- Rate limiting and throttling live in memory, per process. They are not a distributed cap or a spending guarantee. Railway runs a single instance.
- Request bodies are capped (64 KB for replies) and strictly validated. Model output is schema-validated, and the model has no tools.

## Ending a session

End session invalidates the session epoch, aborts pending generation, cancels speech, and discards recording. It also clears the conversation, drafts, staged turns, observations, and proposals. Whether End session also stops the camera is to be confirmed in the blink implementation. Approved preferences remain until deleted. Local cleanup does not delete anything already held by a provider.

## Limitations

- **Blink detection is experimental and unverified.** No real-webcam reliability measurement exists yet. Expect lighting, glasses, camera angle, fatigue, partial eye closure, and individual motor ability to affect it. It is not a clinically reliable switch, and it is not gaze tracking.
- **Blinking is not universal.** Some people cannot produce a reliable deliberate closure. Keyboard, switch, and pointer stay available.
- **Camera permission may need a helper.** Setup is not claimed to be hands-free.
- **Multiple faces:** the planned behavior holds selection, but face count is not identity and does not guarantee that only one person is present.
- **Not tested with AAC users** or people with ALS. No clinicians or specialists were consulted.
- **Nothing measured yet.**
- **Accessibility:** contrast, 200% zoom, and screen readers not checked. We make no conformance claim.
- **Switch hardware:** emulated with a keyboard key. External switches are untested.
- **Learning:** length only, using word counts. Position bias is a confounder.
- **Semantic diversity:** validation screens for duplicates only.
- **English only. No offline guarantee.** A cold reload needs the server.
- **Shared computers:** local storage is not encrypted. **Two tabs** can diverge.
- **Consequential topics:** prompts are not guarantees. Still Here is not a medical, legal, or emergency tool. "Please get someone to help me." only speaks the phrase.
