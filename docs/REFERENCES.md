# References

The listing of a source here does not mean it was verified, and it does not support any claim on its own. Each entry notes its status. Distinguish inspiration from our implemented contribution. We do not claim to have invented AAC, scanning, speech synthesis, or AI-assisted communication, or that no comparable product exists.

## Prior art: supplied research leads

**Status for every row: supplied research lead — not independently verified.** These came from Liam's project brief. We have not confirmed that each product currently operates or supports each listed feature. No code or assets from these projects were copied. Public source code is not automatically licensed for reuse.

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
| Anthropic Messages API, structured outputs, effort, server-side fallback beta, model ids | Claude API skill reference bundled with Claude Code (model table cached 2026-10-06) and installed `@anthropic-ai/sdk` 1.3.0 types | Used for the adapter. Not checked against the live account (no key) |
| Anthropic data retention / pricing | Anthropic's official docs | Not checked for this project |
| Next.js route handlers | <https://nextjs.org/docs/app/getting-started/route-handlers> | Supplied reference |
| Next.js environment variables | <https://nextjs.org/docs/app/guides/environment-variables> | Supplied reference |
| `getUserMedia` | <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia> | Supplied reference |
| `MediaRecorder.isTypeSupported` | <https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static> | Supplied reference |
| `SpeechSynthesis` | <https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis> | Supplied reference |
| `SpeechSynthesisVoice.localService` | <https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService> | Supplied reference |
| WCAG 2.2 contrast (minimum) | <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html> | Supplied reference; conformance not tested |
| WCAG 2.2 keyboard | <https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html> | Supplied reference; conformance not tested |
| MediaPipe Face Landmarker (web) | <https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js> | Not used (blink deferred) |
| Claude Code memory / subagents | <https://code.claude.com/docs/en/memory>, <https://code.claude.com/docs/en/sub-agents> | Development tooling only |
| GitHub CLI `gh repo edit` | <https://cli.github.com/manual/gh_repo_edit> | Not used yet; remote metadata unchanged |
| OpenAI-compatible transcription endpoint | The provider's official docs | Adapter targets `/audio/transcriptions`. Not verified (no key) |

## Deferred research consideration: Chicago Face Database

<https://www.chicagofaces.org/>. The supplied brief describes restrictions on noncommercial research use, redistribution or publication, cloud uploads, and identifying or contacting subjects. We have **not** verified its terms. It is **not used anywhere**: not in the app, fixtures, README, pitch, screenshots, or any pipeline. Static photos cannot establish blink reliability or selection usability. Any future use would require a permitted research purpose and methodology first.

## Dependencies and licenses

npm dependencies are listed in `package.json` and pinned in `package-lock.json`: `next`, `react`, `react-dom`, `zod`, `@anthropic-ai/sdk`, `server-only`, and dev tools (`typescript`, `eslint`, `eslint-config-next`, `vitest`, type packages). Their licenses come from their own packages and have not been audited individually for this submission. No third-party images, fonts, models, or datasets are committed. The project license is undecided.
