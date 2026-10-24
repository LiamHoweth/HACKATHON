# Still Here: final pitch deck spec

Written 2026-10-24, about 15:00 CT. **Per the organizers' briefing: submission deadline is 5:15 PM, and judging is at Gallogly at 5:15 PM.** Pitch is 3 to 5 min. This is the slide-by-slide spec for updating the Google Slides deck "Still_Here_SASEHacks_Pitch". Voice: short, calm, honest. No em dashes in slide text. No hype words ("instant", "first", "only", "revolutionary", "faster than typing").

Sources of truth: `docs/PRESENTATION_NOTES.md`, `docs/TEST_RESULTS.md`, `docs/evidence/E2E_LATENCY.md`, `docs/JUDGE_QA.md` (Do-not-say list), `docs/PRIVACY_AND_LIMITATIONS.md`, `docs/REFERENCES.md`, `docs/REHEARSAL.md`, `docs/manual/QUICK_GUIDE.md`, `docs/deck/DECK_REVIEW.md`, `AGENT_NOTES.md`, and the code (`src/app/api/*/route.ts`, `src/server/*`, `src/audio/*`, `src/access/*`, `src/adaptation/*`, `src/core/*`, `ipad-shell/`). Statistics were checked on the web on 2026-10-24; see **Sources** at the end. Footnote markers like [1] on slides refer to that list.

**Evidence tags.** [VERIFIED] = executed or observed (where is stated). [SYNTHETIC] = automated tests, not hardware. [NOT YET] = built, not verified on the iPad or with a person. [SOURCED n] = external statistic, see Sources.

## Deck changes vs current Google deck

Keep 01 title and 07 close wording. **Add a new slide 2 "Imagine"** (illustrative emotional scenario, labeled as illustrative) before any tech. **02 Problem** becomes slide 3: keep the headline, keep the 5 million figure but reword it to the source's own phrase ("more than 5 million children and adults in the U.S. who cannot rely on speech alone", CommunicationFIRST, an organization estimate) and add the ALS speech-loss line. **Add "Why it matters"** with sourced speed and cost facts, the "No special hardware" message, and the SASEHacks for Good theme quote recreated as text (do not use the briefing photo). **03 "Three replies. Your choice."** becomes the Solution slide "Two likely replies. Other ways to answer." with the headline "No special hardware. Just the iPad or phone you already have." and footnote "Tested on iPad today; phone support next." **04 "Raise. Blink. Speak."**: delete "500 ms hold"; use the current gesture table. **05** becomes the live demo slide (dinner plus "How was your day?" with Other ways). **Add two personalization slides** ("Calibrated to your face", "It learns you, with your permission"). **Add** the architecture diagram slide "[DIAGRAM: architecture]" and two technical slides ("On the iPad", "Server and APIs"). **06 latency**: keep 5.1 s to 3.8 s, add p90 7.8 to 5.8 s and the conditions line; replace "512 pass, 3 fail" with **586 passed + 2 expected fail** (vitest at 14:45 CT, 34 files). **Add** Safety and privacy, What we built today, "How Still Here answers the theme", and Next steps plus ask. **B4 related work** moves into the main deck. Backups: keep B1 optional review, B2 live demo route, B5 evidence boundaries; old B3 is replaced by the diagram and technical slides; add a priority-tier incident backup.

## Timing plan (about 4:30)

| Slides | Time | If short on time |
|---|---|---|
| 1 to 5 (title, imagine, problem, why, solution) | 1:15 | Keep all; emotional opening is the hook |
| 6 live demo | 1:15 | Keep |
| 7 to 9 (control, calibration, learning) | 0:45 | Merge 8 and 9 in speech |
| 10 to 12 (diagram, on the iPad, server) | 0:40 | Show 10, skip speech on 12 |
| 13 to 19 (speed, safety, evidence, related, theme, next, close) | 0:35 | Skip speech on 15 and 16; never skip 17 (theme) and 19 |

---

## 1. Title

- **Title:** Still Here
- **On-slide text:** Your words. Your choice. Be part of the conversation while it's still happening. Liam Howeth · Richard Oduma · SASEHacks for Good, October 24, 2026.
- **Core value message (used on slides 1, 5 and 19):** Still Here gives people who cannot speak or use their hands a way to take part in a real, back-and-forth conversation: keeping up as it happens, in their own words, as naturally as possible. Line on slides: "Be part of the conversation while it's still happening." Language rules: person-first and non-pitying. Say "keep up with the conversation", "answer in the moment", "join in, not just respond later". Never say "suffer", "victims", "normal people", "despite their disability", "voiceless", "trapped".
- **Visual:** Clean title card. Small iPad outline at right showing the board with two reply cards. Atkinson Hyperlegible type.
- **Speaker notes (15 s):** "Hi, we're the Still Here team. Before we show you anything technical, we want you to imagine something."
- **Evidence:** None needed.

## 2. Imagine (emotional opening)

- **Title:** Imagine
- **On-slide text:** "Are you coming to dinner tonight?" You know your answer. By the time you can say it, everyone has moved on. *(Illustrative scenario)*
- **Visual:** Full-bleed, quiet. A single chat bubble with the friend's question. Below it, a slowly filling row of letters "Y-e-s, I..." and, faded to the side, other people's bubbles already talking about something else, one saying "She's probably tired, she'll skip it." Small gray label in a corner: "Illustrative scenario, not a real person."
- **Speaker notes (35 s, slow, second person):** "Imagine a friend turns to you and asks, 'Are you coming to dinner tonight?' You know exactly what you want to say. Maybe it's 'Yes, save me a seat,' maybe it's a joke. But you can't speak, and you can't use your hands. So you start spelling, one letter at a time. Before you finish, the conversation has moved on. Someone answers for you. 'She's probably tired.' You're in the room, and you're still here, but the conversation is happening without you. What you want isn't just a way to answer later. You want to be part of the conversation while it's still happening. That's what we built." Pause one beat before the next slide.
- **Evidence:** Illustrative scenario, clearly labeled. Not a testimonial and not a real person. Do not imply we interviewed anyone.

## 3. Problem

- **Title:** The conversation keeps moving
- **On-slide text:** More than 5 million people in the U.S. cannot rely on speech alone.[1] Most people with ALS gradually lose the ability to speak.[2] Spelling a reply takes longer than the moment lasts.
- **Visual:** Two large stat callouts side by side ("5 million+", "Most people with ALS"), then a thin timeline: partner question, long gray bar "spelling a reply", partner already moved on. Footnotes [1] [2] in small type at the bottom.
- **Speaker notes (25 s):** "This isn't rare. CommunicationFIRST estimates more than five million children and adults in the U.S. can't rely on speech alone. That includes people with ALS, stroke, cerebral palsy and more. In ALS, most people gradually lose the ability to speak and eventually need a device to communicate. Most tools make them build messages letter by letter, and conversation doesn't wait."
- **Evidence:** [SOURCED 1] organization estimate (say "estimates"). [SOURCED 2] Scientific Reports 2022. Do not say "voiceless" or "trapped".

## 4. Why it matters

- **Title:** Speed, cost, and authorship
- **On-slide text:** Speech runs near 190 words a minute.[3] Dedicated eye-gaze devices have cost over $10,000.[4] People need speed without losing authorship. **No special hardware.**
- **Theme banner (top strip, recreated as text, not the photo):** SASEHacks for Good: "Build creative and innovative solutions to create a positive change in the community or the world."
- **Visual:** Theme quote as a thin banner across the top in the event's accent color. Below, three columns with one icon each: stopwatch (speed), price tag (cost, "$10,000+ eye-gaze device" [4]), pen (authorship). Under the columns, a bold line: "No eye tracker. No head switch. No dedicated speech device."
- **Speaker notes (35 s):** "This hackathon asks us to create positive change in the community or the world. Here's where change is needed. Speed: healthy speakers in one study talked at about 190 words a minute, and spelling a reply is far slower. Cost: dedicated eye-gaze communication devices have been listed at over ten thousand dollars. And authorship: AI that talks for you isn't the goal. So we set a rule: no special hardware. No eye tracker, no head switch, no dedicated speech device. Just a camera, a mic and a speaker people already own."
- **Evidence:** [SOURCED 3] healthy-control speaking rate in one study (Eshghi et al. 2022, mean 187.6 words/min); say "about 190 in one study", not "average speech". [SOURCED 4] one assistive-technology program's estimated cost for a discontinued Tobii eye-gaze device ($10,695); say "have been listed at over $10,000", not "all cost". Typical AAC words-per-minute rates were **not** verified from a fetched primary source, so no AAC rate number appears on the slide. Theme text from the organizers' briefing slide.

## 5. Solution

- **Title:** No special hardware. Just the iPad or phone you already have.
- **On-slide text:** Be part of the conversation while it's still happening. The partner talks. Two likely replies appear, plus Other ways to answer. Eyebrows move, a long blink chooses, a natural voice speaks. *Tested on iPad today; phone support next.*
- **Visual:** One loop diagram, four steps with an arrow back to the start: (1) partner speaks (mic icon, "hands-free listening"), (2) board with 2 reply cards and an "Other ways to answer..." card, (3) face with eyebrow arrow, jaw arrow, closed eye, (4) speaker icon "natural voice". Under it: an iPad and a phone silhouette, the phone drawn dashed with the label "next". Footnote: "Tested on iPad today; phone support next."
- **Speaker notes (40 s):** "Still Here lets someone who can't speak or use their hands keep up with a real, back-and-forth conversation and answer in the moment, in their own words. Not just answers. Conversation. And it needs only what people already own: a device with a front camera, a microphone and a speaker. It's a web app that runs in the browser, and we also built an installable iPad app. Here's the loop. The partner just talks; the iPad listens hands-free. Still Here offers the two most likely replies, plus Other ways to answer when neither fits. The person raises their eyebrows to move and does a long blink to choose, and the reply is spoken in a natural voice. Today we've demoed and tested it on an iPad. Phones are next: the layout adapts, but we haven't tested on a phone yet."
- **Evidence:** Hands-free conversation end to end in the installed iPad app [VERIFIED: team manual test, about 1:20 PM, not a reliability study]. Demo device iPad Air 13" (M2), Safari and native shell [VERIFIED]. Phone use [NOT YET]: portrait and narrow layouts exist, no phone testing; the native shell targets iPad only. Other ways to answer [deployed 14:30 CT, SYNTHETIC; NOT YET by a person on the iPad].

## 6. Live demo

- **Title:** Live: two conversations
- **On-slide text:** "Are you coming to dinner tonight?" "How was your day?" Watch: eyebrows move, long blink speaks, Other ways when nothing fits.
- **Visual:** Two real iPad screenshots side by side (capture fresh; label "real iPad, live AI, time"). Left: dinner board with "Yeah, I'm coming tonight." / "I'm not coming tonight." Right: Other ways screen with Rough day, Mixed day, Not now, You first. Then switch to the live iPad mirror.
- **Speaker notes (40 s, then demo):** "Remember the dinner question? Let's run it. My teammate asks, 'Are you coming to dinner tonight?' Two likely replies show up in a few seconds. A raise moves the highlight, a long blink speaks it. Now an open question: 'How was your day?' If neither reply fits, Other ways to answer offers directions like Rough day or You first, with replies usually already loaded. Nothing is spoken unless the person chooses it." Fallbacks if needed: Touch mode, typed partner line, basic device voice, Fixture demo, all labeled on screen.
- **Evidence:** Dinner replies "Yeah, I'm coming tonight." / "I'm not coming tonight." / "What time is dinner?" [VERIFIED: live deployed server, smoke test]. Other ways [deployed, SYNTHETIC; NOT YET by a person on the iPad]. Open-ended questions can take about 7 to 9 s (Mac, synthetic speech). Do not say "instant".

## 7. How you control it

- **Title:** Raise. Hold. Drop. Blink.
- **On-slide text:** Raise eyebrows: next. Keep them up: keep moving. Jaw drop: back. Long blink: choose, or stop speech. Blink always wins.
- **Visual:** Four-row gesture table with a small face icon per row (brow up, brow held with repeat arrows, open jaw, closed eyes with a 1 s clock).
- **Speaker notes (30 s):** "Control uses four face movements the front camera can see. Raise your eyebrows for about half a second to move one step; keep them up and it keeps moving, a step every 0.6 seconds. A brief jaw drop goes back; talking and yawns are ignored. A long blink with both eyes chooses; normal blinks and winks don't count. If a blink and a raise overlap, the blink wins and the ambiguous input is thrown away. Touch, keyboard and switch all still work."
- **Evidence:** Gesture logic [SYNTHETIC: unit and synthetic-frame tests]. Hold-to-move, jaw Back and one-blink speak on a real person [NOT YET]. No reliability numbers: the `/trial` page is built but not run.

## 8. Personalization: calibration

- **Title:** Calibrated to your face
- **On-slide text:** A short guided calibration learns your resting face, your eyebrow raise, and your natural vs deliberate blinks. Your timing, saved on this iPad.
- **Visual:** Five small step cards left to right, each with a face icon: "Hold still" (1 s) · "Eyes open" (3 s) · "Blink normally" (8 s) · "Long blink x4" · "Raise eyebrows". Final card: "Saved on this iPad: thresholds and timing only, no images."
- **Speaker notes (30 s):** "Faces differ, so every person gets their own calibration. In under a minute it records their relaxed face, watches their normal blinking, asks for a few deliberate long blinks and a few eyebrow raises, and sets personal thresholds and timing: for example the eyebrow hold lands between about 0.35 and 0.5 seconds. If it can't tell a natural blink from a deliberate one, it says so honestly instead of guessing. Only a few numbers are saved, on that iPad. No images, no face data, no cloud profile."
- **Evidence:** Code: `src/access/blink-calibration.ts` (stages: position 1 s, open-eye baseline 3 s, natural blinking 8 s, 4 deliberate blinks; fails when ordinary and deliberate closures overlap), `src/access/brow-calibration.ts` (neutral samples, at least 2 raises, minimum separation check; "only scalar settings are ever stored, never images or landmark data"), stored in browser `localStorage` on the device (`still-here:blink-calibration:v1`, `still-here:brow-calibration:v1`) [VERIFIED: code]. Calibration on a real person on the iPad [NOT YET recorded]. Say "saved on this iPad", never "cloud profile".

## 9. Personalization: learning from choices

- **Title:** It learns you, with your permission
- **On-slide text:** Turn down a set of replies and the next ones take a different direction. Wording habits can be learned in a session, if you opt in. Nothing is kept without your approval.
- **Visual:** Three-step strip: (1) "None of these" on a batch, arrow to a new batch with different meanings, label "this question"; (2) a small "Shorter replies?" suggestion card with "Yes" / "Not now", label "opt-in, this session"; (3) a "Saved preferences" list with Pause and Delete buttons, label "only with approval, only on this iPad".
- **Speaker notes (35 s):** "Still Here adapts, but only in ways the person controls. If they turn down a set of replies, the server is told what was offered and not chosen for this question, so the next set takes different meanings, not paraphrases. If they turn on session learning at setup, the app notices wording patterns, like repeatedly asking for shorter replies, and then asks, 'Shorter replies?' It only applies that after they approve, twice. It's kept for the session unless they choose to save it on this iPad, and they can see, pause or delete it anytime. Learning is off by default. No model is trained on them."
- **Evidence:** Code [VERIFIED: code; SYNTHETIC tests; browser check 11:10 CT]. Rejected batches go in `ReplyRequest.rejected` (up to 24 texts) and reach the model as "previously offered, not chosen for this question"; the prompt says not to treat a rejection as a permanent preference (`src/server/reply-prompt.ts`). Session learning: `settings.sessionAdaptation` default **false**; `src/adaptation/observations.ts` records tentative wording-length evidence; a proposal appears after 3 distinct turns of evidence and saves only after two separate approvals [VERIFIED in browser 11:10 CT]. Saving: `persistOnDevice` default **false**; approved items only, in `localStorage` key `still-here:v1`; Pause personalization and delete are available. Approved preferences are sent with each reply request (`approvedPreferences`, `approvedProfile`). **Honest version of "the answers you choose affect future answers":** refreshing steers this question; choices shape later suggestions only when session learning is on, and lasting changes need explicit approval. Do not say "learns everything about you", "cloud profile" or "trains a model".

## 10. How it fits together

- **Title:** How it fits together
- **On-slide text:** Face tracking runs on the iPad. Audio clips, text, and chosen words go to our server. Keys never leave the server.
- **Visual:** **[DIAGRAM: architecture]** (drawn by a separate engineer). Suggested contents: left box "iPad (native SwiftUI shell + WKWebView, or Safari)" containing MediaPipe FaceLandmarker (on device), calibration (saved on device), VAD listener, reducer + target registry, prefetch cache, audio player. Middle box "Railway server (Next.js API)" with access-code gate, rate limits, voice budget. Right boxes "OpenAI gpt-transcribe", "OpenAI Responses (gpt-6-astra)", "ElevenLabs eleven_v4_turbo". Arrows: utterance clip to `/api/transcribe` to OpenAI; partner line, recent turns, approved preferences to `/api/replies` to OpenAI; reply text to `/api/speech` to ElevenLabs; MP3 back to iPad. Dashed line around the camera path: "camera frames: on device by design".
- **Speaker notes (25 s):** "Face tracking runs on the iPad with MediaPipe, so camera frames stay on the device by design. When the partner talks, a short clip goes to our server, which calls OpenAI to transcribe it and to suggest replies. The chosen reply goes to ElevenLabs for the voice. All API keys live on the server; the iPad only holds an access code."
- **Evidence:** Architecture [VERIFIED: code, deployed]. "Camera frames stay on device" is by design; the device network check (SYS-13) was not run.

## 11. Technical breakdown: on the iPad

- **Title:** On the iPad
- **On-slide text:** MediaPipe face tracking on device. Hands-free listening. One reducer decides everything. Native shell for camera, mic, and audio.
- **Visual:** Four labeled blocks:
  1. **MediaPipe FaceLandmarker** (WASM and model served from our own origin, GPU). Blendshapes: eyeBlinkLeft/Right (min of both, so winks never count), browInnerUp and browOuterUp (eyebrows), jawOpen (back). Face selector locks onto one face (longest in frame, most central).
  2. **Listener:** on-device voice activity detection; 0.65 s of silence ends an utterance; filler like "uh huh" ignored; listening pauses while the app speaks.
  3. **Core:** pure reducer plus a single target registry. Touch, keyboard, switch, blink and eyebrow all become one guarded ACTIVATE. A gesture arbiter is the only source of accepted commands.
  4. **Native shell:** SwiftUI + WKWebView. Camera and mic granted for our own site only, audio plays without a tap, auto-lock off.
- **Speaker notes (35 s):** "On the iPad, MediaPipe's Face Landmarker runs locally in WebAssembly on the GPU. We read only a few blendshape scores: eye blink, eyebrow raise and jaw open, and if several faces are in view we lock onto one. Listening uses on-device voice detection; 0.65 seconds of silence ends the partner's turn. Every input, from touch to a blink, goes through one pure reducer and one target list, so a gesture can never do two things. A small SwiftUI shell wraps the web app so camera, mic and audio just work."
- **Evidence:** MediaPipe starts on the iPad GPU in 0.8 s; about 12 to 15 ms/frame on the Mac [VERIFIED: PERFORMANCE.md and iPad capability check]. Native shell installed and launched [VERIFIED]. Reducer and arbiter [SYNTHETIC]. Multi-face lock [SYNTHETIC; NOT YET on iPad]. Filler filter [SYNTHETIC].

## 12. Technical breakdown: server and APIs

- **Title:** Server and APIs
- **On-slide text:** Four routes on Railway. Every paid call needs an access code, is rate limited, and keeps keys on the server.
- **Visual:** Table, one row per interface:

  | Route | Calls | Key details |
  |---|---|---|
  | `/api/transcribe` | OpenAI `gpt-transcribe` | VAD-cut clips, size and type checked, 20/min per client |
  | `/api/replies` | OpenAI Responses API, `gpt-6-astra` | Strict JSON schema, `store: false`, low reasoning effort, 2 replies + 3 to 5 directions, direction mode, follow-up merge, casual voice, 15 s timeout, one repair retry, 30/min |
  | `/api/speech` | ElevenLabs `eleven_v4_turbo`, Text-to-Dialogue WebSocket | Exact text only (max 500 chars), voice Will, prefetched into an on-device cache, 40/min |
  | `/api/status`, `/api/voices` | Config check, voice list | Never returns secrets; shows models only with a valid code |

  Footer: "Access header `x-still-here-access` (timing-safe compare) · 60,000-character daily voice budget · security headers incl. HSTS, X-Frame-Options DENY, camera and mic for our own site only."
- **Speaker notes (40 s):** "The server is a Next.js API on Railway with four routes. Transcribe sends the detected clip to OpenAI's gpt-transcribe. Replies calls the OpenAI Responses API with a strict JSON schema, store false, and low reasoning effort; in branching mode it returns two replies plus three to five directions, and a follow-up from the partner merges into the open question. Speech sends only the exact reply text to ElevenLabs' turbo model over a WebSocket, and the app prefetches audio for the suggestions so the chosen one can play from memory. Every paid route checks an access code, rate limits per client, and voice has a daily character budget."
- **Evidence:** Routes, limits and headers [VERIFIED: code; security probe of about 47 requests on the deployed server]. Live OpenAI replies and transcription [VERIFIED: synthetic inputs]. ElevenLabs live over HTTP, 5/5 lines, median 0.67 s [VERIFIED by HTTP]. Prefetch audible on the iPad [NOT YET]. Follow-up merge [VERIFIED: browser walkthrough 5/5; NOT YET on iPad]. Daily budget is 60,000 on the server (code default 20,000; set by a Railway variable).

## 13. Speed

- **Title:** About 4 seconds to suggestions
- **On-slide text:** Partner stops to suggestions on screen: median 5.1 s to 3.8 s, p90 7.8 s to 5.8 s. Voice starts at the blink when audio is prefetched.
- **Visual:** Before/after table:

  | | Before median / p90 | After median / p90 |
  |---|---|---|
  | Partner stops to suggestions | 5.1 s / 7.8 s | **3.8 s / 5.8 s** |
  | Replies call alone | 3.9 s / 6.6 s | 2.5 s / 4.4 s |
  | Blink to voice, no prefetch | 0.69 s / 0.80 s | 0.63 s / 0.72 s |

  Conditions line: "Mac to deployed server, synthetic speech, 10 runs per side, 0 failures. Excludes reading and gesture time. Not iPad-measured. One sample per side, not a controlled A/B."
- **Speaker notes (30 s):** "We timed the chain. From the partner finishing to suggestions on screen went from a median of 5.1 seconds to 3.8, and the slow tail from 7.8 to 5.8. Voice audio is fetched while the person reads, so if reading and blinking take longer than about 0.6 seconds, the voice starts right at the blink. These are Mac measurements with synthetic speech, not iPad numbers."
- **Evidence:** [VERIFIED: Mac to deployed server, `docs/evidence/E2E_LATENCY.md`, 13:38 and 13:54 CT]. Blink-to-voice about 0 with prefetch is conditional and [NOT YET] on the iPad. Never cite the priority-tier 1.8 s. No "faster than typing" claim.

## 14. Safety and privacy

- **Title:** Safe by design, honest about limits
- **On-slide text:** Nothing is spoken without a deliberate choice. Review mode is one checkbox away. Camera frames stay on the iPad by design. No zero-retention claim.
- **Visual:** Two columns. "Safety": long blink only, blink while speaking stops, Pause button, optional review plus separate confirm, medication questions never get a "yes". "Privacy": camera on device, calibration and approved preferences saved only on the iPad, audio clips and text to OpenAI with `store: false`, suggested sentences sent ahead to ElevenLabs in fast mode, prebuilt voice, no cloning.
- **Speaker notes (30 s):** "Nothing is ever spoken without a deliberate long blink or a touch. Fast mode, the default, trades the review step for speed; a helper can turn on review plus a separate confirming blink with one checkbox. In our test scenarios the AI kept disagreement, refused a prompt injection, and never offered consent on a medication question. Camera frames stay on the iPad by design. Audio clips and text go to OpenAI with store false, and in fast mode suggested sentences are sent to ElevenLabs ahead of time. We make no zero-retention claim."
- **Evidence:** 14/14 live scenarios valid, safety cases behaved as intended [VERIFIED: synthetic prompts, Claude-reviewed, not human-reviewed]. Gesture false-positive rate [NOT YET]. Camera network check not run. OpenAI may keep abuse logs up to 30 days (PRIVACY_AND_LIMITATIONS.md).

## 15. What we built today

- **Title:** What we built today
- **On-slide text:** Built and deployed in one day. 586 automated tests pass. Verified, and not yet, side by side.
- **Visual:** Two-column checklist. **Verified:** live AI replies and transcription; natural voice via server; installed iPad app; hands-free conversation on the iPad (team test); latency measured from a Mac; security probe on the deployed server; deployed smoke test 6/6. **Not yet:** gesture reliability trial; one-blink timing on iPad; audible prefetch on iPad; multi-face lock live; Other ways and jaw Back by a person; phone testing; any AAC user or clinician testing.
- **Speaker notes (25 s):** "Everything here was built today, starting at 9 AM: face control with calibration, hands-free listening, AI suggestions, natural voice, a native iPad app and a Railway backend. We have 586 passing automated tests. And we're clear about what we haven't proven: we haven't measured gesture reliability on people, and no AAC user has tested it yet."
- **Evidence:** `npx vitest run` at 14:45 CT: 586 passed + 2 expected fail, 34 files [SYNTHETIC: proves logic, not reliability]; not yet recorded in TEST_RESULTS.md (last recorded 514 + 2). Smoke 6/6 [VERIFIED for the 13:50 deploy]; re-run `node scripts/smoke-deployed.mjs` against the current deploy (2e0954b) before citing it for that build. Built with Claude Code under Liam's direction (AI_USAGE.md).

## 16. Related work

- **Title:** Built on a known idea
- **On-slide text:** VisioALS, Google SpeakFaster, Project Converse/DEAN, Bobbai, Speak4Me, Alek. Our contribution is the combination: face gestures on hardware you own, hands-free listening, and choice by direction.
- **Visual:** B4's name list as plain text (no logos). One highlighted line with our combination.
- **Speaker notes (25 s):** "We're not the first to pair AI suggestions with AAC. VisioALS is the closest: spoken question, AI replies, gaze selection, ElevenLabs voice. SpeakFaster and Project Converse are research systems. What we built is the combination: eyebrow, jaw and blink control with no eye tracker, hands-free partner listening, personal calibration, and Other ways to answer so the person steers by meaning."
- **Evidence:** [VERIFIED web sources, checked 2026-10-24, docs/REFERENCES.md]. We have not tested these products. Alek shut down 2026-06-01. Do not say "first" or "only".

## 17. How Still Here answers the theme

- **Title:** How Still Here answers the theme
- **On-slide text (four quadrants, one line each):**
  - **Positive change:** People who cannot speak or use their hands get back the speed and authorship of conversation, and so do the people talking with them.
  - **Community:** Caregivers, speech-language pathologists, classrooms, hospitals. A stock iPad, no eye-gaze hardware.
  - **Creative:** Eyebrows, blink, and jaw on a front camera. Other ways to answer. It learns you, with permission.
  - **Innovative:** AI offers, the person decides. On-device face tracking. Prefetched natural voice.
- **Visual:** 2x2 grid. Small banner at top repeating the theme quote: "Build creative and innovative solutions to create a positive change in the community or the world." Each quadrant has one icon.
- **Speaker notes (30 s):** "Back to the theme. Positive change: the goal is to give people who can't speak or use their hands the speed and authorship of conversation back, and that includes their family and friends on the other side of it. Community: it's meant for caregivers, speech-language pathologists, classrooms and hospitals, on a device they may already have. Creative: face gestures on a normal front camera, Other ways to answer, and learning only with permission. Innovative: the AI offers, and the person decides." Do not add impact numbers; we have none.
- **Evidence:** Design goals and intended settings, not measured outcomes. No user or clinical settings have used it yet [NOT YET].

## 18. Next steps and ask

- **Title:** What comes next
- **On-slide text:** Test with AAC users and speech-language pathologists. Measure gesture reliability. Bring it to phones. Personal voice with consent. We are looking for co-design partners.
- **Visual:** Horizontal path: "Co-design with AAC users and SLPs" to "Measure reliability and latency on iPad" to "Phones" to "Personal voice, on-device models". Ask in a callout box.
- **Speaker notes (25 s):** "Next, we need the people this is for. We want to co-design with AAC users and speech-language pathologists, run our reliability trial with real people, and test on phones so it really works on the device you already have. Later, a personal voice with consent, and on-device models to cut latency and cloud exposure. If you know AAC users, clinicians or researchers, we'd love an introduction."
- **Evidence:** Plans only [NOT YET]. No partnerships arranged.

## 19. Close

- **Title:** AI offers possibilities. The person keeps authorship.
- **On-slide text:** Be part of the conversation while it's still happening. Still Here. Your words. Your choice.
- **Visual:** Same as the title card, with the dinner bubble from slide 2 now answered: "Yeah, I'm coming tonight."
- **Speaker notes (20 s):** "Remember the dinner question. With Still Here, you answer while the conversation is still happening, and you join in instead of responding later. In your words. AI offers possibilities. The person keeps authorship. Thank you."
- **Evidence:** Design principle. The dinner reply is a real live suggestion from the deployed server [VERIFIED].

---

## Backup slides

### B1. Optional review mode (keep)

- **On-slide text:** Turn off fast mode and every reply goes to review. Review starts on Cancel. A new blink confirms.
- **Visual:** Review screen screenshot (label its source and time; mark "earlier build" if pre-redesign).
- **Notes:** Slower, safer, for higher-stakes settings. One gesture can never do two things [SYNTHETIC; VERIFIED browser switch test: 20 auto-repeats produced one action].

### B2. Live demo route (keep, update)

- **On-slide text:** Dinner, then How was your day with Other ways. Fallbacks: Touch, typed partner line, basic voice, Fixture demo.
- **Notes:** Use a Private window if in Safari. Run the smoke test before stage. Fixture demo is labeled on screen and is a manual choice.

### B3. Evidence boundaries (was B5, update numbers)

- **On-slide text:** Synthetic tests prove logic, not reliability. Latency is Mac-measured. No AAC users yet. Not tested on phones. Not a medical device.
- **Notes:** Read the Do-not-say list in JUDGE_QA.md. MediaPipe model card: "not intended for human life-critical decisions".

### B4. Priority-tier incident (new)

- **Title:** We tried a faster tier. It failed live.
- **On-slide text:** 4 of 6 replies timed out on the deployed server. We turned it off, redeployed, and now smoke-test after every config change.
- **Visual:** Timeline 14:05 fail, 14:10 variable deleted (no redeploy, still failing), 14:16 redeploy, 4/4 OK.
- **Notes:** Honest engineering story. Never cite its offline 1.8 s number [VERIFIED: Railway logs, TEST_RESULTS.md].

### B5. Architecture detail (replaces old B3)

- **On-slide text:** Reducer, target registry, gesture arbiter, effects runner. Same guarded ACTIVATE for every input.
- **Visual:** Zoom of the iPad box from [DIAGRAM: architecture].

---

## Pre-stage checks for this deck

1. Capture fresh real iPad screenshots for slide 6 and label them.
2. Run `node scripts/smoke-deployed.mjs` against the current deploy before citing 6/6 for it.
3. Search the final slides for: instant, first, only, offline, clinical (outside a "not" sentence), zero retention, faster than typing, cloud profile, Chris, 500 ms, 512, 514, 1.8, em dashes.
4. Keep the "Illustrative scenario" label visible on slide 2.

## Sources

Checked 2026-10-24. Only numbers listed here may appear on slides.

1. **CommunicationFIRST**, home page, communicationfirst.org (accessed 2026-10-24). States the organization works for "more than 5 million children and adults in the United States" who cannot rely on speech alone. This is the organization's own estimate built from prevalence across disability groups, not an official federal count; say "estimates". (The current Google deck cites it as CommunicationFIRST 2023.)
2. **Eshghi M, Yunusova Y, Connaghan KP, et al., Green JR.** "Rate of speech decline in individuals with amyotrophic lateral sclerosis." *Scientific Reports* 12:15713, 2022. doi:10.1038/s41598-022-19651-1 (PMC9489769). States that most individuals with ALS progressively lose the ability to speak and eventually require assistive devices to communicate. No single percentage is given, so the slide says "most".
3. **Same paper as [2].** Baseline speaking rate in healthy controls: mean 187.56 words per minute (SD 28.08). This is one study's healthy-control group, so the slide says "near 190 words a minute" and notes cite "in one study".
4. **Montana Assistive Technology Program (MATP), University of Montana Rural Institute**, device database listing for the Tobii I-16 eye-gaze AAC device, montech.ruralinstitute.umt.edu, item 8894 (accessed 2026-10-24). Estimated cost listed: $10,695. The I-16 is an older model, so the slide says "have cost over $10,000", not a current price for all devices.

**Checked but not used (could not verify from a fetched primary source in time):** typical AAC communication rates (search summaries cite about 8 to 10 words per minute for eye-gaze or touch typing and under 2 for switch scanning, from Waller et al., *Communications of the ACM* 2025, doi:10.1145/3703451, but the PDF could not be read here); U.S. ALS prevalence (search summary of an ALS Association co-authored 2025 study, but als.org returned 403); a $5,000 to $10,000 eye-gaze range in a Microsoft Research GazeSpeak paper (PDF not readable here). Leave these off the slides unless someone opens the source and confirms the exact wording.
