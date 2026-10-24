# Privacy and limitations

This covers actual and intended handling in this build (commit `5de1a57` plus the working tree at ~12:30 CT on 2026-10-24). Provider retention statements below come from the providers' own docs, checked 2026-10-24 ([REFERENCES.md](REFERENCES.md#implementation-documentation)). We have not reviewed our account contracts or plans beyond that. Re-check the providers' current terms before describing them to anyone.

## Retention claims we can and cannot make

| Provider | What we can say | What we must not say |
| --- | --- | --- |
| **OpenAI** (replies, transcription) | Reply requests set `store: false`, so the response is not kept as application state. OpenAI's data-controls page says **abuse-monitoring logs may still be retained for up to 30 days** by default | "OpenAI keeps nothing" or "zero retention". Zero Data Retention needs OpenAI's prior approval, and **we do not have it** |
| **ElevenLabs** (confirmed sentence only) | Only the exact confirmed sentence is sent. The app does not store the audio | Any zero-retention claim. ElevenLabs Zero Retention Mode (`enable_logging=false`) is **enterprise-only**, and its covered-endpoint list does **not** name the Text-to-Dialogue WebSocket that `eleven_v4_turbo` uses. We don't send `enable_logging`, so the default (logging on) applies (D35) |
| **Camera** (local MediaPipe) | Frames are processed locally in Safari by design; the app has no code path that uploads them | "Verified that no frames leave the device". The network-log check on the device (SYS-13) is **pending** |

## The six data paths

| Data | Handling | Status |
| --- | --- | --- |
| **Camera frames (eyebrow and blink input)** | The camera starts only after the consent step in setup. Alternate input modes never ask for the camera. The iPad front camera feeds the MediaPipe Face Landmarker running in Safari, which loads its model and WASM from this app's own origin (`public/models`, `public/wasm`). The detector produces brow-raise and eye-closure scores and a face count. **Camera frames are processed locally:** no frames are uploaded, kept, or recorded by design. There is no face recognition, gaze estimation, or emotion inference. The small mirrored preview at the top right is a live, muted view only. It is not a recording, and it shows no REC label. Only scalar calibration settings (brow thresholds, hold/release/cooldown times, blink minimum/maximum closure and cooldown) may be kept | Implemented (`5de1a57`), **not iPad-verified.** "No upload" and "no third-party model fetch" are **pending a network-log check on the device** (SYS-13). Until then, present them as the design, not a verified fact |
| **Confirmed speech text (ElevenLabs)** | When the natural voice is on, **the exact sentence the person reviewed and confirmed is sent from our server to ElevenLabs to generate audio.** Nothing else goes to ElevenLabs: no unconfirmed suggestions, no history, no profile, no camera data. No suggestion is pre-synthesized. The key stays on the server and never reaches the browser. The audio comes back through our server to the iPad, is played once, and is **not stored** by the app (no disk writes, no logs of the sentence or audio). The audio is AI-generated, and the voice is a prebuilt ElevenLabs voice, not a clone of anyone | **Implemented** (`src/app/api/speech/`, `src/server/elevenlabs/`, commit `5de1a57`), mock-tested only. **Not configured** (`ELEVENLABS_API_KEY` missing locally and on Railway), so this path has **not run live**. Per the ElevenLabs docs checked 2026-10-24, `enable_logging` defaults to on, Zero Retention Mode is enterprise-only, and the Text-to-Dialogue WebSocket is not listed among its covered endpoints. We don't send it. **We do not claim zero retention** (D35) |
| **Basic device voice (fallback)** | Browser `speechSynthesis`, always labeled "basic device voice". Whether synthesis happens on the device depends on the voice (`SpeechSynthesisVoice.localService`) | Not checked on the iPad |
| **Recorded partner audio** | Captured only after cloud-transmission consent and an explicit Record action. Sent to OpenAI transcription (`gpt-transcribe`) and returned as a draft for review. Not stored by the app. Discarded when speech starts, on Pause, and on End session | Server path verified with a synthetic clip. Browser/iPad capture not exercised |
| **Conversation text and approved context** | **Live AI:** sent to the OpenAI Responses API with `store: false` (not kept as application state; abuse-monitoring logs may be retained up to 30 days; no Zero Data Retention approval). This includes the active question or initiation topic, up to 10 recent accepted turns (600 chars each), enabled approved profile entries, current guidance, approved preferences, session hints, up to 8 rejected batches for this question, and the length policy. Staged (unaccepted) partner turns are excluded. **Fixture / Local-only:** nothing leaves the device and the Still Here server | Live path verified with synthetic content |
| **Approved preferences / profile / custom phrases / calibration** | Held in memory for the session. Written to browser local storage (versioned schema) only when **Remember on this device** is on. Calibration is scalar-only | Reload not tested. Whether saving calibration is gated by **Remember on this device** is to be confirmed in the runtime |

**Never stored:** camera frames or face images, speech audio, conversation transcripts, suggestions, rejected batches, session observations, pending proposals, raw recordings, and metrics (unless explicitly exported in measurement mode).

## Logging and responses

- Server logs are content-free JSON: route, request ID, outcome code, and duration. `/api/speech` logs the utterance ID, outcome, duration, and character count only, never the sentence text, audio, or voice id (`src/app/api/speech/route.ts`). Not yet observed on a live ElevenLabs request.
- API responses use `cache-control: no-store`. Errors carry a code and a plain message, never provider traces, keys, prompts, or conversation content.
- In production, the status route reports the model name only with a valid access code (commit `6ea84db`).
- No analytics, session replay, or automatic export.

## Security

- Provider keys are read only on the server and never use a `NEXT_PUBLIC_` prefix. The OpenAI and ElevenLabs keys are separate.
- The browser sends a server-approved voice choice, never a raw ElevenLabs key, endpoint, or arbitrary voice id.
- Paid endpoints check `APP_ACCESS_TOKEN` via the `x-still-here-access` header with a timing-safe comparison. With no token set, non-localhost requests are refused. Wrong codes are throttled per client (10 per 10 minutes). In the uncommitted fix (`src/server/request-guards.ts`, pending redeploy), **only wrong non-empty codes count**, a missing code is denied without counting, and **a correct code always passes**, so other people on the same Wi-Fi cannot lock the iPad out. `/api/speech` uses the same gate plus a per-process daily character budget (`ELEVENLABS_DAILY_CHAR_BUDGET`); deployed in `f65385bb`, not exercised live (no key).
- Security headers are set on every path in `next.config.ts`. HSTS was added in the working tree and is pending the next redeploy.
- Rate limiting and throttling live in memory, per process. They are not a distributed cap or a spending guarantee. Railway runs a single instance. Set a credit limit on the ElevenLabs key in its dashboard as well.
- Request bodies are capped (64 KB for replies) and strictly validated. Model output is schema-validated, and the model has no tools.

## Ending a session

End session invalidates the session epoch, aborts pending generation, cancels speech, and discards recording. It also clears the conversation, drafts, staged turns, observations, and proposals. Whether End session also stops the camera and releases the audio player is to be confirmed in the iPad runtime. Approved preferences remain until deleted. Local cleanup does not delete anything already held by a provider.

## Limitations

- **Not iPad-verified.** No eyebrow, blink, preview, or audio check has been run on an iPad.
- **Eyebrow and blink detection are experimental.** Reliability is **not measured**. Expect lighting, glasses, camera angle, fatigue, speech movements, partial eye closure, and individual motor ability to affect them. They are not clinically reliable switches, and this is not gaze tracking. The 500 ms hold is a user-requested design target, not a validated value.
- **Not everyone can raise their eyebrows or blink on purpose.** Auto-scan + blink, keyboard, switch, and touch stay available.
- **iPad Safari audio.** Safari may block audio that a real touch did not start. A camera gesture may not count. Hands-free audible playback after one setup touch is unverified. When blocked, the app should say "Audio blocked" rather than pretend it spoke.
- **Natural voice not verified.** No ElevenLabs key yet. Generated speech can mispronounce or drop words even when the text is exact; listening tests (TTS-09) have not been run.
- **Camera permission and the audio unlock may need a helper.** Setup is not claimed to be hands-free.
- **Multiple faces:** the planned behavior holds selection, but face count is not identity and does not guarantee that only one person is present.
- **Not tested with AAC users** or people with ALS. No clinicians or specialists were consulted.
- **Nothing measured yet.**
- **Accessibility:** contrast, 200% zoom, VoiceOver, and Dynamic Type not checked. We make no conformance claim.
- **Switch hardware:** emulated with a keyboard key. External switches are untested.
- **Learning:** length only, using word counts. Position bias is a confounder.
- **Semantic diversity:** validation screens for duplicates only.
- **English only. No offline guarantee.** A cold reload needs the server, and the natural voice needs the network.
- **Shared devices:** local storage is not encrypted. **Two tabs** can diverge.
- **Consequential topics:** prompts are not guarantees. Still Here is not a medical, legal, or emergency tool. "Please get someone to help me." only speaks the phrase.
