# Privacy and limitations

This covers actual and intended handling in the current build. It was refreshed on 2026-10-24 (afternoon) to match [JUDGE_QA.md](JUDGE_QA.md): fast mode with voice prefetch, hands-free partner listening, and central-face tracking. Some table cells still cite the earlier commit `5de1a57`. Provider retention statements below come from the providers' own docs, checked 2026-10-24 ([REFERENCES.md](REFERENCES.md#implementation-documentation)). We have not reviewed our account contracts or plans beyond that. Re-check the providers' current terms before describing them to anyone.

## Retention claims we can and cannot make

| Provider | What we can say | What we must not say |
| --- | --- | --- |
| **OpenAI** (replies, transcription) | Reply requests set `store: false`, so the response is not kept as application state. OpenAI's data-controls page says **abuse-monitoring logs may still be retained for up to 30 days** by default | "OpenAI keeps nothing" or "zero retention". Zero Data Retention needs OpenAI's prior approval, and **we do not have it** |
| **ElevenLabs** (suggested sentences in fast mode, the confirmed sentence otherwise) | In fast mode the three suggested sentences are sent ahead of time so the chosen one can play at once. Outside fast mode only the exact confirmed sentence is sent. The app does not store the audio | Any zero-retention claim. ElevenLabs Zero Retention Mode (`enable_logging=false`) is **enterprise-only**, and its covered-endpoint list does **not** name the Text-to-Dialogue WebSocket that `eleven_v4_turbo` uses. We don't send `enable_logging`, so the default (logging on) applies (D35) |
| **Camera** (local MediaPipe) | Frames are processed locally in Safari by design; the app has no code path that uploads them | "Verified that no frames leave the device". The network-log check on the device (SYS-13) is **pending** |

## The six data paths

| Data | Handling | Status |
| --- | --- | --- |
| **Camera frames (eyebrow and blink input)** | The camera starts only after the consent step in setup. Alternate input modes never ask for the camera. The iPad front camera feeds the MediaPipe Face Landmarker running in Safari, which loads its model and WASM from this app's own origin (`public/models`, `public/wasm`). The detector produces brow-raise and eye-closure scores and a face count. **Camera frames are processed locally:** no frames are uploaded, kept, or recorded by design. There is no face recognition, gaze estimation, or emotion inference. The small mirrored preview at the top right is a live, muted view only. It is not a recording, and it shows no REC label. Only scalar calibration settings (brow thresholds, hold/release/cooldown times, blink minimum/maximum closure and cooldown) may be kept | Implemented (`5de1a57`), **not iPad-verified.** "No upload" and "no third-party model fetch" are **pending a network-log check on the device** (SYS-13). Until then, present them as the design, not a verified fact |
| **Speech text (ElevenLabs)** | When the natural voice is on, text is sent from our server to ElevenLabs to generate audio. **In fast mode, the three suggested sentences on screen are sent ahead of time (prefetch), including ones the person never chooses, so the chosen one can play instantly from memory. Outside fast mode (review mode), only the exact sentence the person confirmed is sent.** Nothing else goes to ElevenLabs: no history, no profile, no camera data. The key stays on the server and never reaches the browser. The audio comes back through our server to the iPad, is played once, and is **not stored** by the app (no disk writes, no logs of the sentence or audio). The audio is AI-generated, and the voice is a prebuilt ElevenLabs voice, not a clone of anyone | **Implemented** (`src/app/api/speech/`, `src/server/elevenlabs/`) and **configured on the server** (key held server-side only). Verified by HTTP calls, and team members have heard replies on the iPad. Prefetch making playback sooner is unit-tested only, not measured live. Per the ElevenLabs docs checked 2026-10-24, `enable_logging` defaults to on, Zero Retention Mode is enterprise-only, and the Text-to-Dialogue WebSocket is not listed among its covered endpoints. We don't send it. **We do not claim zero retention** (D35) |
| **Basic device voice (fallback)** | Browser `speechSynthesis`, always labeled "basic device voice". Whether synthesis happens on the device depends on the voice (`SpeechSynthesisVoice.localService`) | Not checked on the iPad |
| **Partner audio (hands-free listening)** | Hands-free listening is on by default during a session: after cloud-transmission consent, the microphone stays open. A voice-activity detector running on the iPad cuts each utterance, and only those utterance clips are sent to OpenAI transcription (`gpt-transcribe`); the result becomes the partner line. Listening pauses while the app speaks, so it does not hear itself. **Stop listening** turns it off, and push-to-talk (an explicit Record press) remains under **Type or record instead**. Audio is not stored by the app. Discarded when speech starts, on Pause, and on End session. **Anyone speaking near the iPad is transcribed**, so partners should be told | Server path verified with a synthetic clip. Hands-free conversation with the mic was verified in a team manual test on the installed iPad app (about 1:20 PM), not as a reliability study |
| **Conversation text and approved context** | **Live AI:** sent to the OpenAI Responses API with `store: false` (not kept as application state; abuse-monitoring logs may be retained up to 30 days; no Zero Data Retention approval). This includes the active question or initiation topic, up to 10 recent accepted turns (600 chars each), enabled approved profile entries, current guidance, approved preferences, session hints, up to 8 rejected batches for this question, and the length policy. Staged (unaccepted) partner turns are excluded. **Fixture / Local-only:** nothing leaves the device and the Still Here server | Live path verified with synthetic content |
| **Approved preferences / profile / custom phrases / calibration** | Held in memory for the session. Written to browser local storage (versioned schema) only when **Remember on this device** is on. Calibration is scalar-only | Reload not tested. Whether saving calibration is gated by **Remember on this device** is to be confirmed in the runtime |

**Never stored:** camera frames or face images, speech audio, conversation transcripts, suggestions, rejected batches, session observations, pending proposals, raw recordings, and metrics (unless explicitly exported in measurement mode).

## Logging and responses

- Server logs are content-free JSON: route, request ID, outcome code, and duration. `/api/speech` logs the utterance ID, outcome, duration, and character count only, never the sentence text, audio, or voice id (`src/app/api/speech/route.ts`). Not separately audited on live ElevenLabs requests.
- API responses use `cache-control: no-store`. Errors carry a code and a plain message, never provider traces, keys, prompts, or conversation content.
- In production, the status route reports the model name only with a valid access code (commit `6ea84db`).
- No analytics, session replay, or automatic export.

## Security

- Provider keys are read only on the server and never use a `NEXT_PUBLIC_` prefix. The OpenAI and ElevenLabs keys are separate.
- The browser sends a server-approved voice choice, never a raw ElevenLabs key, endpoint, or arbitrary voice id.
- Paid endpoints check `APP_ACCESS_TOKEN` via the `x-still-here-access` header with a timing-safe comparison. With no token set, non-localhost requests are refused. Wrong codes are throttled per client (10 per 10 minutes). In the uncommitted fix (`src/server/request-guards.ts`, pending redeploy), **only wrong non-empty codes count**, a missing code is denied without counting, and **a correct code always passes**, so other people on the same Wi-Fi cannot lock the iPad out. `/api/speech` uses the same gate plus a per-process daily character budget (`ELEVENLABS_DAILY_CHAR_BUDGET`, now 60,000 characters on the server). Prefetch spends extra characters for speed. Budget exhaustion has not been exercised live.
- Security headers are set on every path in `next.config.ts`. HSTS was added in the working tree and is pending the next redeploy.
- Rate limiting and throttling live in memory, per process. They are not a distributed cap or a spending guarantee. Railway runs a single instance. Set a credit limit on the ElevenLabs key in its dashboard as well.
- Request bodies are capped (64 KB for replies) and strictly validated. Model output is schema-validated, and the model has no tools.

## Ending a session

End session invalidates the session epoch, aborts pending generation, cancels speech, and discards recording. It also clears the conversation, drafts, staged turns, observations, and proposals. Whether End session also stops the camera and releases the audio player is to be confirmed in the iPad runtime. Approved preferences remain until deleted. Local cleanup does not delete anything already held by a provider.

## Limitations

- **Reliability not measured on the iPad.** The hands-free conversation was verified once in a team manual test, but the 20-raise / 20-blink `/trial` run and the network check (SYS-13) have not been run.
- **Eyebrow and blink detection are experimental.** Reliability is **not measured**. Expect lighting, glasses, camera angle, fatigue, speech movements, partial eye closure, and individual motor ability to affect them. They are not clinically reliable switches, and this is not gaze tracking. The 500 ms hold is a user-requested design target, not a validated value.
- **Not everyone can raise their eyebrows or blink on purpose.** Auto-scan + blink, keyboard, switch, and touch stay available.
- **iPad Safari audio.** Safari may block audio that a real touch did not start. A camera gesture may not count. The installed app unlocks audio at launch, but Safari in the browser backup may still block it. When blocked, the app should say "Audio blocked" rather than pretend it spoke.
- **Natural voice not formally evaluated.** The ElevenLabs key is configured on the server and team members have heard replies on the iPad, but there are no listener ratings. Generated speech can mispronounce or drop words even when the text is exact; listening tests (TTS-09) have not been run.
- **Camera permission and the audio unlock may need a helper.** Setup is not claimed to be hands-free.
- **Multiple faces:** tracking follows the most central, longest-present face and ignores others, so someone leaning in should not take over. This is unit-tested only, not confirmed live. Face count is not identity and does not guarantee that only one person is present.
- **Background voices.** In a noisy room, other people's voices may be transcribed as partner lines. A wrong partner line produces wrong suggestions, never speech by itself. Use **Stop listening** and type the line instead.
- **Fast mode removes the review step.** By default one long blink speaks the highlighted suggestion at once, so one stray long blink would speak it. Stop (a long blink while speaking) and Pause remain available. Review plus a separate confirming blink is one setup checkbox away.
- **Sentence splitting.** A pause longer than about 0.65 s may split one partner sentence into two partner lines. Within about 20 s of an unanswered question, the later line is merged into the same question and the suggestions refresh; after that it starts a new question.
- **Back-channel filter.** Lone interjections ("uh huh", "mm-hmm", "yeah", "okay", "got it") are ignored, so a real one-word reply could be missed. "Yes?", "No." and "Hey" still count.
- **Prefetch sends unchosen text.** In fast mode, suggestions the person never picks are still sent to ElevenLabs.
- **Not tested with AAC users** or people with ALS. No clinicians or specialists were consulted.
- **Nothing measured yet.**
- **Accessibility:** contrast, 200% zoom, VoiceOver, and Dynamic Type not checked. We make no conformance claim.
- **Switch hardware:** emulated with a keyboard key. External switches are untested.
- **Learning:** length only, using word counts. Position bias is a confounder.
- **Semantic diversity:** validation screens for duplicates only.
- **English only. No offline guarantee.** A cold reload needs the server, and the natural voice needs the network.
- **Shared devices:** local storage is not encrypted. **Two tabs** can diverge.
- **Consequential topics:** prompts are not guarantees. Still Here is not a medical, legal, or emergency tool. "Please get someone to help me." only speaks the phrase.
