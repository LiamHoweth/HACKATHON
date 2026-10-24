# Judge Q&A

Refreshed **2026-10-24, about 13:50 CT**, for the current product: the installed iPad app with **fast mode on by default** (one long blink speaks the highlighted suggestion), **hands-free partner listening**, and natural-voice **prefetch**. Sources: [PRESENTATION_NOTES.md](PRESENTATION_NOTES.md), [manual/QUICK_GUIDE.md](manual/QUICK_GUIDE.md), [REHEARSAL.md](REHEARSAL.md), [TEST_RESULTS.md](TEST_RESULTS.md), [PERFORMANCE.md](PERFORMANCE.md), [REFERENCES.md](REFERENCES.md). `docs/evidence/E2E_LATENCY.md` does not exist yet. If it appears, replace the latency answer with its numbers and conditions.

**How to read the flags.** An answer marked **[NOT YET]** depends on something built but not verified. Say it with its caveat, or do not say it. Refresh these after the 3:30 PM rehearsal:

| Item | Status at 13:50 CT |
| --- | --- |
| Hands-free conversation, mic, audible reply, in the installed iPad app | Verified (team manual test, about 1:20 PM). Not a reliability study |
| Eyebrow and blink reliability (the 20-raise / 20-blink `/trial` run) | **[NOT YET]** not run, no numbers |
| One-blink speak timing end to end | **[NOT YET]** not measured live |
| Voice prefetch makes playback sooner | **[NOT YET]** unit-tested only. Do not say "instant" |
| Multi-face lock (follows the central, longest-present face) | **[NOT YET]** unit-tested only |
| Camera frames never leave the iPad | By design. The device network check (SYS-13) was **not run** |
| AAC users, SLPs, clinical anything | **[NOT YET]** none. Do not imply otherwise |

## Product and prior art

| Question | Answer |
| --- | --- |
| **What is it, in one sentence?** | Still Here is an iPad app where a conversation partner just talks, the AI offers three possible replies, and the person moves with eyebrow raises and speaks the highlighted reply with one long blink, in a natural voice. The rule we kept: AI offers possible words, the person decides what to say. It is an engineering prototype, not a medical device. |
| **What's new compared with existing AAC and eye-gaze systems?** | Cost and hardware: it runs on a stock iPad using the front camera, with no dedicated eye tracker. Dedicated eye-gaze AAC hardware is generally priced in the thousands of dollars (general knowledge, not a figure from our docs, not checked today). We have not compared accuracy or speed with any of them, so we claim accessibility of hardware, not better performance. |
| **Has this been done before?** | Parts of it, yes, and we checked on 2026-10-24 ([REFERENCES.md](REFERENCES.md)). **VisioALS** is the closest: a caregiver speaks, the app offers 4 AI replies, the user picks one by gaze quadrant, and a cloned ElevenLabs voice speaks it. Also Google SpeakFaster (research), Project Converse/DEAN (research probe, 2 participants), Bobbai, Speak4Me (coming soon). We built on a known idea. Our contribution is the implemented combination: face-gesture control (eyebrow Next, long-blink Select and Stop), hands-free partner listening, meaning-diverse "None of these" plus Guide my response, and a stock iPad. We do not claim a first. |
| **Why eyebrows and blinks?** | They are two deliberate, separable movements the front camera can see without extra hardware, so a person who cannot use their hands or speech can move (eyebrows) and choose (a long blink, which is different from a natural blink). We chose them for access on a stock iPad, not because we proved they beat gaze. How well they work across people, glasses and lighting is **[NOT YET]** measured. |
| **What did you build today?** | Eyebrow-and-blink control with calibration, hands-free listening, AI suggestions with Guide my response and "None of these", natural voice with prefetch, an installable iPad app, and a Railway backend. It started at 09:00 CT at SASEHacks for Good; the first app code landed in commit `bb16883`. Claude Code did the implementation under Liam's direction and review ([AI_USAGE.md](AI_USAGE.md)). |

## Safety and accuracy

| Question | Answer |
| --- | --- |
| **Can a blink or a gesture accidentally make it speak?** | In fast mode, yes, that risk exists and it is the main trade-off. A normal blink is ignored (only a deliberate, calibrated long closure of both eyes counts, roughly one second), one eyebrow raise moves exactly one step and holding does not repeat, and ambiguous raise-plus-blink input is discarded. Those rules pass synthetic-frame and unit tests, but the real false-positive rate is **[NOT YET]** measured: the 2-minute normal-movement trial has not been run. |
| **Fast mode removes the review step. Isn't that unsafe?** | It trades a safety step for speed, and we say so plainly. By default one long blink speaks the highlighted suggestion at once, and because the top suggestion is highlighted first, one stray long blink would speak it. A helper can untick the setup checkbox to turn on review plus a separate confirming blink, which is slower and safer. Nothing is ever spoken without a deliberate long blink or a touch. |
| **How do you stop it if it speaks the wrong thing?** | A long blink while the app is speaking stops the speech. The helper can also tap **Pause** (top right) to stop gesture control, and can tap answers directly. Stopping does not unsay what was heard, so the review mode matters in higher-stakes settings. |
| **What if the AI's suggestions are wrong or none fit?** | The person is never forced to accept them. **None of these** returns three different meanings (not paraphrases), **Guide my response** sets a direction (agree, disagree, ask and so on), **Quick phrases** need no AI, and **My words** lets them compose. In 14 synthetic scenarios the model kept disagreement, refused an embedded prompt injection, and offered no consent on a medication question ([live-scenarios-review.md](evidence/live-scenarios-review.md)); the reviewer was Claude, not a human. |
| **What if the room is noisy, or the partner line is wrong?** | A wrong partner line produces wrong suggestions but never speech by itself. The helper taps **Stop listening** and types the partner line under **Type or record instead**. The app pauses listening while it speaks so it does not hear itself. A pause longer than about 650 ms can split one sentence into two partner lines. |
| **What if two faces are in view, or someone walks in?** | Tracking follows the most central face that has been in view longest and ignores others, so someone leaning in should not take over. This is unit-tested only. **[NOT YET]** confirmed live, and face count is not identity, so it is not a guarantee. If the face is lost the app pauses ("Tracking lost: Paused") and a long blink on **Resume** continues. |

## Privacy

| Question | Answer |
| --- | --- |
| **Does the camera leave the iPad?** | By design, no. MediaPipe FaceLandmarker runs on the iPad (its model and WASM are served from our own origin) and outputs only eyebrow and eye-closure scores and a face count. Nothing is recorded, and there is no face recognition, gaze tracking, or emotion detection. We say "by design" because the network check that would prove it on the device has not been run. |
| **What audio and text go to the cloud?** | The microphone is open while hands-free listening is on, and voice-activity detection runs on the iPad. Only the detected utterance clips go to OpenAI transcription (`gpt-transcribe`), which becomes the partner line. The partner line, recent turns, guidance and preferences go to OpenAI's Responses API with a strict JSON schema and `store: false`. The app does not store audio. Anyone speaking near the iPad is transcribed, so partners should know that. |
| **What goes to ElevenLabs, given prefetch?** | In fast mode, every suggested sentence on screen (up to three per batch), not only the chosen one, is sent from our server to ElevenLabs before selection so the chosen one can play from memory. In review mode only the confirmed sentence is sent. No camera data, history or profile goes there, the key stays on the server, and the voice is a prebuilt one, not a clone. |
| **Do OpenAI or ElevenLabs keep anything?** | We make no zero-retention claim. `store: false` means OpenAI does not keep the response as application state, but OpenAI's docs say abuse-monitoring logs may be kept for up to 30 days, and we do not have Zero Data Retention approval. ElevenLabs zero-retention mode is enterprise-only and we do not use it. Details: [PRIVACY_AND_LIMITATIONS.md](PRIVACY_AND_LIMITATIONS.md) (parts of it still describe the older confirmed-sentence-only flow). |
| **How is the paid backend protected?** | Paid routes (replies, transcription, speech) need an access code, which is built into the installed app and not in the repo. Without the code they return 401, and a live probe found spoofed headers cannot bypass it. There are per-client rate limits and a daily voice character budget (20,000 characters by default). |

## Speed, voice, and cost

| Question | Answer |
| --- | --- |
| **How fast is it, from the partner's question to a spoken reply?** | We have **not measured the whole chain** and will only quote the stopwatch time from the demo run. The parts we measured: the app waits 650 ms of silence to end an utterance (a constant), transcription took about 0.47 s median (n = 4, Mac to provider, synthetic clips), three suggestions took a median of 3.8 s (n = 14, range 2.35 to 6.43 s, synthetic prompts; 3.6 s in one call from the iPad), and a natural-voice clip took about 0.65 s to arrive (median 666 ms, n = 5, Mac; 623 ms in one call from the iPad), plus a deliberate blink of about one second. Adding those is arithmetic, roughly 6 s, not a measurement, and suggestion generation dominates. Prefetch is meant to remove the voice wait but is **[NOT YET]** verified. |
| **How reliable is eyebrow and blink detection?** | **[NOT YET]** measured. The logic passes unit and synthetic-frame tests, and face tracking costs about 12 to 15 ms per frame on a Mac (0.8 s to start on the iPad GPU). We built a `/trial` page to count misses and inadvertent commands on the iPad, but it has not been run, so we give no accuracy numbers. Lighting, glasses, camera angle and fatigue will matter. |
| **Is the voice natural? Is it cloned?** | It uses ElevenLabs `eleven_v4_turbo` from our server with a prebuilt voice (default Chris), disclosed as AI-generated, and no one's voice is cloned. Five test lines all returned audio in about 0.45 to 0.8 s each. Team members have heard replies on the iPad, but we have no listener ratings, so we say "natural-sounding" as our impression, not a measured score. |
| **What if the voice or the audio fails?** | The text stays on screen and a labeled basic device voice is available under More tools, Controls, Voice. It does not switch silently, and Safari blocking audio shows "Audio blocked" rather than pretending. The installed app unlocks audio at launch. |
| **What does a conversation cost? (estimate)** | Rough estimate, not measured, and we have not reviewed price sheets, so we give no dollar figure. Each exchange is one transcription call, one reply call, and in fast mode about three prefetched sentences, perhaps 100 to 200 characters of speech (a guess), against 40 to 70 if only the chosen one were synthesized. At the 20,000-character daily budget that is on the order of 100 to 200 exchanges a day (arithmetic from our guess). Prefetch spends extra voice characters for speed. |

## Accessibility and offline

| Question | Answer |
| --- | --- |
| **What about people who cannot raise eyebrows or blink on purpose?** | They should not have to. Touch reaches every screen (the helper or the person can tap), keyboard and switch input use the same guarded path, and auto-scan plus blink is available. Switch hardware is emulated with a keyboard key, and external switches are untested. |
| **Is it accessible? Dynamic Type, VoiceOver?** | We make no conformance claim. Dynamic Type, VoiceOver, contrast and 200% zoom have not been checked. What is in place: large touch targets, live-region announcements (status and blink state use `aria-live`/`role="status"`), reduced-motion styling on setup, and touch, keyboard, switch and scan alternatives. Real accessibility review with disabled users is next-step work. |
| **What happens without internet?** | Offline is **not verified**, so we do not claim it. The live suggestions, transcription and natural voice need the network. **Quick phrases** and **My words** need no AI, and the basic device voice may work offline. If the suggestion service fails the app says so and offers those, and the labeled **Fixture demo** mode (scripted suggestions) is a manual choice at setup, not an automatic fallback. |

## Evidence, scope, and what's next

| Question | Answer |
| --- | --- |
| **Has anyone who uses AAC tested it? Is it clinically validated?** | No, to both. No AAC user, person with ALS, or clinician has tested it, and it is not a medical device. Testing so far is engineer trials, automated tests (433 passing at 13:05 CT, synthetic and mocked), and a team manual test of the hands-free flow on the iPad. |
| **How is it deployed? Is it on the App Store?** | It is a native iPad app, a WKWebView shell that loads our Railway backend, development-signed and installed directly on one registered iPad. It is not on the App Store or TestFlight, and a free signing profile expires after 7 days. The same app also runs in Safari as the backup. |
| **What would clinical deployment need?** | Co-design and evaluation with AAC users and speech-language pathologists, measured reliability across people and conditions, an accessibility review, a privacy and retention review of each provider, and regulatory advice. None of that has been done. |
| **What are the next steps?** | First, user testing with AAC users and SLPs, plus the measured reliability trial and an end-to-end latency study on venue and home Wi-Fi. Then a personal or custom voice (with that person's consent), and on-device transcription and suggestion models to cut latency and cloud exposure. Those are plans, not built (**[NOT YET]**). |
| **What's the impact or business case?** | The hypothesis is that a low-cost option on hardware people may already own could widen access to conversational AAC and reduce time to reply. We have no usage data, user study, or market research to back that, and we are not selling anything. Realistic paths are an open prototype for researchers and AAC clinics, or a partnership with an established AAC provider. |

## Do not say

| Do not say | Say instead |
| --- | --- |
| "Instant" or "faster than typing" | "That's our hypothesis. We timed one run." |
| "First", "only", "nobody has done this" | "We built on a known idea. Our contribution is the combination." |
| Any accuracy or false-positive figure | "Not measured yet. The trial page is built." |
| "Camera never leaves the iPad" as a verified fact | "By design. We haven't run the network check." |
| "Only the chosen sentence goes to the voice service" | "Suggested sentences are sent ahead for speed in fast mode." |
| "Zero retention" or "OpenAI keeps nothing" | "`store: false` is set. We make no zero-retention claim." |
| "Works offline", "multi-face is proven", "tested with AAC users", "clinical" | "Not verified", "tested in code", "not tested with AAC users". |
