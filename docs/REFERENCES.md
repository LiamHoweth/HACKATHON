# References

The listing of a source here does not mean it was verified, and it does not support any claim on its own. Each entry notes its status. Distinguish inspiration from our implemented contribution. We do not claim to have invented AAC, scanning, speech synthesis, or AI-assisted communication, or that no comparable product exists.

## Prior art: supplied research leads

**Status for every row: supplied research lead — not independently verified.** These came from Liam's project brief (blink-first master prompt §27). We have not confirmed that each product currently operates or supports each listed feature. No code or assets from these projects were copied. Public source code is not automatically licensed for reuse.

Several leads (VisioALS, Bobbai) describe webcam or eye-controlled interaction, so camera-based AAC access is **not new**. We have not checked how any of them detect blinks or gaze.

| Reference | Supplied inspiration to investigate | Address |
| --- | --- | --- |
| VisioALS | Webcam interaction, personalized profiles, contextual suggestions, regeneration, modular architecture | <https://github.com/ephemeralwx/VisioALS> (license not checked) |
| Bobbai | User-directed response types, personalized suggestions, eye-controlled interaction, authorship | <https://lifechaingers.com/en/> |
| Speak4Me | Conversational listening, personalized suggestions, regeneration, phrase/word support | <https://www.speak4me.ai/> |
| Google SpeakFaster | Reducing input via contextual language modeling and abbreviated input; measurement | <https://research.google/blog/speakfaster-revolutionizing-communication-for-people-with-severe-motor-impairments/> |
| Project Converse / DEAN | Partner-speech context, conversation timing, disagreement, initiative | <https://project-converseaac.com/deliverable-dean/> |
| Alek | Large targets, saved phrases, contextual communication; supplied research reported discontinuation | <https://alekassist.com/> |

## Background (not yet consulted for specific claims)

- ASHA AAC practice portal: <https://www.asha.org/practice-portal/professional-issues/augmentative-and-alternative-communication/>
- ALS Association, AAC: <https://www.als.org/navigating-als/living-with-als/therapies-care/augmentative-alternative-communication>

## Implementation documentation

| Topic | Source | Status |
| --- | --- | --- |
| OpenAI Responses API, structured outputs (`json_schema`, strict), `store` | OpenAI official docs; the key's `/v1/models` list (checked 2026-10-24) | Used for the runtime adapter. `gpt-6-astra` confirmed in the model list and in live calls |
| OpenAI audio transcriptions (`gpt-transcribe`) | OpenAI official docs | Used. Verified live with a synthetic clip on 2026-10-24 |
| OpenAI data retention / pricing | OpenAI official docs | Not reviewed for this project. Do not describe retention beyond "`store: false` is set" |
| Anthropic Messages API, structured outputs, refusal-fallback beta | Claude API skill reference (cached 2026-10-06) and `@anthropic-ai/sdk` 1.3.0 types | Secondary adapter. Not checked against a live account (no key) |
| Next.js route handlers | <https://nextjs.org/docs/app/getting-started/route-handlers> | Supplied reference |
| Next.js environment variables | <https://nextjs.org/docs/app/guides/environment-variables> | Supplied reference |
| `getUserMedia` | <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia> | Supplied reference |
| `MediaRecorder.isTypeSupported` | <https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static> | Supplied reference |
| `SpeechSynthesis` | <https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis> | Supplied reference |
| `SpeechSynthesisVoice.localService` | <https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService> | Supplied reference |
| WCAG 2.2 contrast (minimum) | <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html> | Supplied reference; conformance not tested |
| WCAG 2.2 keyboard | <https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html> | Supplied reference; conformance not tested |
| MediaPipe Face Landmarker (web) | <https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js> | Used for eyebrow and blink detection. See "Blink detection assets" below |
| ElevenLabs models | <https://elevenlabs.io/docs/overview/models> | Supplied reference (brief, checked by the brief's author 2026-10-24). `eleven_v4_turbo` preferred. Not yet checked against our account (no key) |
| ElevenLabs Text-to-Dialogue WebSocket (v4 Turbo) | <https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd>, <https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/tts-vs-ttd-websockets> | Supplied reference. The standard TTS stream-input WebSocket is not for v4 models |
| ElevenLabs Text-to-Dialogue HTTP / Text-to-Speech stream | <https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert>, <https://elevenlabs.io/docs/api-reference/text-to-speech/stream> | Supplied reference (fallback transports) |
| ElevenLabs voices and voice settings | <https://elevenlabs.io/docs/api-reference/voices/search>, <https://elevenlabs.io/docs/api-reference/voices/settings/get-default> | Supplied reference. Voice ids are account-specific |
| ElevenLabs authentication, key scope and credit limits | <https://elevenlabs.io/docs/api-reference/authentication> | Supplied reference |
| ElevenLabs retention / `enable_logging` / pricing | ElevenLabs official docs | **Not reviewed for this project.** Plan-dependent. Make no zero-retention claim |
| iPad Safari audio playback policy | Current WebKit/Safari documentation and the actual iPad | Not reviewed. Test on the device; a camera gesture may not count as a user touch |
| Claude Code memory / subagents | <https://code.claude.com/docs/en/memory>, <https://code.claude.com/docs/en/sub-agents> | Development tooling only |
| GitHub CLI `gh repo edit` | <https://cli.github.com/manual/gh_repo_edit> | Not used yet; remote metadata unchanged |

## Blink detection assets

| Asset | Version | Source | License | Status |
| --- | --- | --- | --- | --- |
| `@mediapipe/tasks-vision` (JS API and WASM runtime in `public/wasm`) | 1.1.1, pinned exactly in `package.json` | npm, copied by `scripts/copy-mediapipe-assets.mjs` | Apache-2.0 (from the package's `license` field) | Present locally. Hashes in `public/models/README.md` |
| `face_landmarker.task` (face detector, landmarks, blendshapes) | `float16/1` | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, downloaded 2026-10-24, SHA-256 recorded | Apache-2.0, as recorded by the blink engineer. **To confirm against Google's model card** before the license is stated publicly | Present locally |

The eye-closure and brow-raise signals come from the model's blendshape outputs (`eyeBlinkLeft`/`eyeBlinkRight`; `browInnerUp`, `browOuterUpLeft`, `browOuterUpRight`). These are facial-gesture estimates. They are not gaze, identity, or emotion, and we have no evidence that they are clinically validated. We have not verified that the model behaves well across skin tones, glasses, or lighting. That would need its model card and our own testing.

## Deferred research consideration: Chicago Face Database

<https://www.chicagofaces.org/>. The supplied brief describes restrictions on noncommercial research use, redistribution or publication, cloud uploads, and identifying or contacting subjects. We have **not** verified its terms. It is **not used anywhere**: not in the app, fixtures, README, pitch, screenshots, or any pipeline. Static photos cannot establish blink reliability or selection usability. Any future use would require a permitted research purpose and methodology first.

## Dependencies and licenses

npm dependencies are listed in `package.json` and pinned in `package-lock.json`: `next`, `react`, `react-dom`, `zod`, `@mediapipe/tasks-vision`, `@anthropic-ai/sdk`, `server-only`, and dev tools (`typescript`, `eslint`, `eslint-config-next`, `vitest`, type packages). Their licenses come from their own packages and have not been audited individually, except MediaPipe above. The only third-party model is the MediaPipe face landmarker. No third-party images, fonts, or datasets are included. The project license is undecided.
