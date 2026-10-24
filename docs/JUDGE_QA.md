# Judge Q&A

Grounded in evidence as of **12:20 CT, commit `5de1a57`**: `npx vitest run` 285/285 passed (12:18 CT; synthetic frames and mocked providers), iPad **Simulator** screenshots (touch, fixture, no camera), Railway deployment `f65385bb`, live OpenAI checks with synthetic inputs (11:18–11:35). Reconcile with [TEST_RESULTS.md](TEST_RESULTS.md) and [PRESENTATION_LOG.md](PRESENTATION_LOG.md) just before judging. Replace "not measured" only with recorded results.

## Gestures

| Question | Answer |
| --- | --- |
| **How reliable is the eyebrow detection?** | **Not measured.** The logic passes unit and synthetic-frame tests; it has not run on a real face or a physical iPad yet. *(After the iPad trial: give raises attempted, NEXTs committed, missed, and inadvertent during 2 minutes of normal movement, with n, lighting, glasses, and tester. A small team test, not a reliability study.)* |
| **How reliable is blink selection?** | **Not measured on a real camera.** Synthetic tests pass. Closures shorter than the calibrated minimum (600 ms default) are ignored as ordinary blinks; both eyes must close, so winks don't count. |
| **Why eyebrows for NEXT instead of auto-scan?** | You move when you're ready, one step per raise, instead of waiting for a timer. That's a design argument; we haven't measured whether it's faster. Auto-scan + blink is still available. |
| **Why half a second? How is it calibrated?** | 500 ms was the requested hold: long enough to filter brief brow movement, short enough to feel responsive. Calibration samples relaxed brows and at least two comfortable half-second raises, sets per-person thresholds with hysteresis, and fails openly if they overlap. Timing uses frame timestamps, not frame counts. Prototype values, not clinical ones. |
| **What if I hold my eyebrows up?** | One step only. The raise latches until the brows relax for 250 ms and a 500 ms cooldown passes. Tested (GEST-03/04). |
| **What if I raise my eyebrows and blink together?** | A blink starting freezes the highlight and cancels an unfinished raise. If both start within 120 ms, both are discarded and the app says "Not sure which gesture — nothing happened." Tested with synthetic frames, not a real face. |
| **Can a gesture accidentally make it speak?** | Speaking needs a selection, then a review that starts on "Cancel", an eyebrow raise to "Speak", and a **new** long blink from a different input cycle, at least 600 ms after review opens. One gesture can't both select and confirm. Unit-tested; **not tested on an iPad**. Someone can still deliberately confirm the wrong message, which is why review shows the exact text. |
| **What if someone can't raise their eyebrows or blink reliably?** | Then they shouldn't have to. Auto-scan + blink, keyboard/switch, and touch reach every screen through the same guarded path. |
| **What happens if I look away or someone walks in?** | Losing the face cancels any gesture in progress and pauses ("Tracking lost — Paused"). Coming back selects nothing by itself; a deliberate blink on "Resume" is needed. With two faces visible, selection is held. Face count is not identity. Tested in code, not on hardware. |

## Voice

| Question | Answer |
| --- | --- |
| **Is the voice natural?** | **Not verified.** ElevenLabs is implemented as the primary voice (`eleven_v4_turbo`, Text-to-Dialogue WebSocket, server-side), but live verification is blocked: `ELEVENLABS_API_KEY` is not configured, so we have not heard it in our app. *(If it was heard on the iPad, say so, and give TTS-09 listener notes with the listener count. No naturalness score unless listeners gave one.)* |
| **Is it cloned?** | No. A prebuilt ElevenLabs voice, disclosed as AI-generated. No one's voice is cloned. |
| **What goes to ElevenLabs?** | Only the exact sentence the person confirmed, from our server, after the second blink. No suggestions, history, or camera data; nothing synthesized in advance. The key never reaches the browser (tested, TTS-01). We don't claim zero retention; their retention depends on the plan, which we haven't reviewed. |
| **How does Safari play audio after a blink?** | iPad Safari can block audio that a real touch didn't start, so setup has one "Enable audio & test voice" tap, possibly by a helper. The same audio element is then reused. Whether later blink-confirmed speech plays without another touch is **not verified on a physical iPad**. If Safari blocks it, the app shows "Audio blocked — tap Enable audio" instead of pretending. |
| **What if ElevenLabs fails?** | The text stays on screen and the board offers "Say it with the basic device voice", which opens a fresh review and needs a new confirmation. It never switches silently (tested, TTS-07). |

## AI, privacy, and cost

| Question | Answer |
| --- | --- |
| **Does the camera leave the iPad?** | By design, no: the face-landmark model runs in Safari from files on our own server and outputs only brow and eye-closure scores and a face count. Nothing is recorded. The network check that would verify this on the iPad (SYS-13) **has not been run**, so we state it as design, not as a tested fact. No face recognition, gaze tracking, or emotion detection. The MediaPipe model is Apache-2.0 licensed, and its model card says it is not intended for human life-critical decisions. That is one reason review and a separate confirmation are mandatory and we make no reliability claims. |
| **What goes to OpenAI?** | After consent at setup: the partner's question, a few recent conversation turns, explicit guidance, rejected candidates for this question, and approved preferences and session style hints (see `src/core/context-builder.ts`). No camera data. Responses API with `store: false`, strict JSON schema, no tools. Partner audio goes to transcription only when the partner presses Talk. |
| **Why candidate replies rather than predictive typing?** | Hypothesis: choosing a whole message takes fewer gestures than spelling it. **Not measured.** "My words" (a scanning keyboard) is always there. |
| **How do you reject or initiate?** | "None of these — new suggestions" gives different meanings for this question only. "Guide my response" sets a direction ("Disagree", "Suggest an alternative"…). "Start a conversation" lets the person begin, with no fake partner turn. |
| **How much does it cost?** | OpenAI per reply batch, ElevenLabs per spoken character. Paid routes need an access code; speech has a server-side daily character budget (20,000 default) and a per-client rate limit. Cost per conversation is **not measured**. |
| **What happens without internet?** | Gestures, "Quick phrases", and "My words" don't need AI; the basic device voice may work offline. The natural voice and live AI need the network. Offline behavior is **not verified**. |
| **Why are session preferences separate from saved memory?** | Session learning is temporary and only about length. Nothing persists without "Yes, remember this" and a separate confirmation. |

## Evidence and scope

| Question | Answer |
| --- | --- |
| **What is truly measured?** | Nothing yet as a measurement. 285 automated tests pass (logic, synthetic frames, mocked providers). Live OpenAI returned valid batches in about 4 s in single synthetic calls: an observation, not a latency study. Eyebrow/blink reliability and confirmation-to-sound latency: **not measured**. |
| **Have AAC users tested it?** | No. No one with ALS or any AAC user has tested it. |
| **Has this been done before?** | Yes, related work exists, and we checked it today (landing pages fetched 2026-10-24; see [REFERENCES.md](REFERENCES.md)). The closest overlap is **VisioALS**: a caregiver speaks a question, the app offers 4 AI replies, the user picks one by **gaze quadrant** (not facial gestures), and an ElevenLabs cloned voice speaks it. Bobbai describes eye-movement control; Google SpeakFaster (Research blog, 2024-11-19) reduces input with contextual language models; Project Converse / DEAN is a research probe with 2 participants; Speak4Me is listed as coming soon; Alek shut down on 2026-06-01. We built on a known idea. Our contribution is the implemented **combination**: separate select and confirm authorization with an immutable review, eyebrow NEXT plus long-blink SELECT with arbitration, meaning-diverse "None of these", and consent-gated preferences. We are not claiming a first. |
| **What did you build today?** | Eyebrow NEXT and long-blink SELECT with calibration and a single arbiter; one guarded reducer for all inputs; semantic "None of these"; intent guidance; conversation continuity; consent-gated preferences; a server-side ElevenLabs path that speaks only the confirmed sentence; a labeled basic-voice fallback; Railway HTTPS deployment. *(Say "tested on the iPad" only for items the trial covered.)* |
| **Is there a native app?** | An experimental SwiftUI client is in the repo but not in the demo. The demo is the web app in iPad Safari. |
| **How was AI used to build this?** | Claude Code implemented it under Liam's direction and review. See [AI_USAGE.md](AI_USAGE.md). |
| **What would clinical deployment require?** | Co-design and evaluation with AAC users and specialists, measured reliability across people and conditions, accessibility review, a privacy and retention review of each provider, and regulatory advice. None of that has been done. |
