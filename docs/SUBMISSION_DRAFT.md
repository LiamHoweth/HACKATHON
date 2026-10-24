> **Historical working document** from earlier in the hackathon (October 24, 2026). Some details are superseded; see [README.md](../README.md) for the current state.

# Submission draft (Devpost-style)

**Status: final draft, not submitted.** Liam reviews it, refreshes the items marked **[REFRESH]** against [PRESENTATION_NOTES.md](PRESENTATION_NOTES.md) (the authoritative log) and [TEST_RESULTS.md](TEST_RESULTS.md), and submits it himself. Every claim here reflects PRESENTATION_NOTES through its 12:45 CT entry, on commit `5de1a57` plus uncommitted wave-3 work. Use SUBMISSION_CHECKLIST.md (checklist not yet written) to work through the steps before 17:00 CT.

Evidence tags (do not paste these into Devpost): **[V]** verified by execution or observation, **[S]** synthetic or mocked tests only, **[NM]** not measured or not verified.

---

## Project name

Still Here

## Tagline

Your words. Your choice. A hands-free iPad conversation aid where AI offers possible words and the person decides what to say.

## Inspiration

Many people who use AAC (augmentative and alternative communication) know exactly what they want to say. Time is the problem. By the time a reply is spelled out, the conversation has often moved on, and with it the joke, the disagreement, or the chance to bring up something new.

We wanted to test one design idea: maybe choosing a complete, reviewable message takes fewer actions than spelling it. We also wanted the person to stay the author, so the AI never picks, never speaks on its own, and never decides what someone means. This is a hypothesis we built toward. We have not measured it.

## What it does

Still Here is a web app for an iPad in landscape, running in Safari.

- **A partner asks a question** by typing or with a recorded clip that is transcribed and can be edited. Still Here offers **three possible replies with different meanings**.
- **Hands-free control uses two facial gestures** from the iPad's front camera:
  - **NEXT:** raise both eyebrows for half a second to move the highlight exactly one step. Holding longer does not repeat.
  - **SELECT:** a calibrated, deliberate long blink chooses the highlighted option. Ordinary blinks are ignored.
  - A gesture arbiter makes sure one physical gesture produces at most one command. If a raise and a blink are ambiguous, nothing happens and the app says so.
- **The person stays in charge of the content.** "None of these" brings different meanings, not rewordings. "Guide my response" sets a direction such as agree, disagree, suggest an alternative, or add humor. Quick phrases (for example "Please give me a moment") and "My words" (a scanning keyboard) work with no AI at all. The person can also start a conversation without waiting for a question.
- **Nothing is spoken without two separate decisions.** Selecting opens a review of the exact sentence, and the review starts on **Cancel**. Speaking takes an eyebrow raise to **Speak** and then a **new, separate** long blink.
- **Voice:** the confirmed sentence goes from our server to ElevenLabs (`eleven_v4_turbo`) and plays on the iPad. A clearly labeled basic device voice is the fallback, and switching to it needs a fresh review and confirmation. **[REFRESH: the ElevenLabs voice is implemented but live voice is not verified, because the key was not configured as of 12:45 CT. Change this line only if a line was actually heard on the iPad.]**
- **Learning only with consent.** After three explicit "shorter" choices, the app asks whether to prefer shorter replies. It saves the preference only after two separate approvals, and the person can view, pause, or delete it.
- **Fallbacks** reach every screen through the same review-and-confirm path: auto-scan with blink, keyboard or single switch, and touch. A labeled Fixture demo mode works without any AI provider.
- A small mirrored camera preview in the corner shows that tracking works. Nothing is recorded.

**Verification status:** The setup screen rendered on a physical iPad Air 13" (M2) in Safari from the Railway deployment [V]. Eyebrow NEXT, long-blink SELECT, the gesture arbiter, and calibration pass unit and synthetic-frame tests [S] but have **not yet been verified on a real face or on the physical iPad** [NM]. **[REFRESH after the `/trial` run on the iPad.]**

## How we built it

- **App:** Next.js 16 (App Router), React 19, TypeScript, and zod 4 in a single web app, aimed at iPad Safari.
- **Gesture input:** MediaPipe Face Landmarker (`@mediapipe/tasks-vision` 1.1.1) runs in the browser from model and WASM files that we pin and serve ourselves. Camera frames are processed on the device by design. Blendshape scores for brow raise and eye closure feed two pure state machines: a 500 ms brow hold with latch and rearm, and a long-blink detector that freezes the target when the eyes close. One arbiter emits the accepted commands. We do no face recognition, gaze tracking, or emotion inference.
- **Safety core:** one pure reducer and one target registry. Eyebrows, blink, switch, keyboard, and touch all reach the same guarded action path. Confirmation requires a fresh input cycle, and request identities reject stale AI results.
- **Suggestions:** the OpenAI Responses API with `gpt-6-astra`, a strict JSON schema, `store: false`, and no tools. Server-side validation requires exactly three candidates, enforces the length policy, and allows no markup. Partner audio is transcribed with `gpt-transcribe`.
- **Voice:** ElevenLabs `eleven_v4_turbo` through a server-only `/api/speech` route over the Text-to-Dialogue WebSocket. It sends only the confirmed sentence and returns an MP3 for iPad playback. The key never reaches the browser. The fallback is the browser's `speechSynthesis`, always labeled. **[REFRESH: live voice pending the key.]**
- **Deployment:** Railway over HTTPS, which the iPad camera requires. An access code gates every paid route. Security headers are set, and the server has per-client rate limits and a daily character budget for speech.
- **Process:** Liam Howeth directed a multi-agent Claude Code build, with up to 15 concurrent agents that each owned separate files. Independent review and audit agents looked for problems, and their findings were fixed with regression tests. The direction changed twice during the day (switch-first, then blink-first, then eyebrow NEXT plus blink SELECT with ElevenLabs). The safety core stayed the same throughout.

## Challenges we ran into

- Telling a deliberate half-second eyebrow raise apart from brows that move while someone talks, and making a long hold count only once.
- Arbitration: once a blink starts, a raise must not be able to move the highlight, and one gesture must never both select and confirm.
- iPad Safari's audio policy. A blink is not a user touch, so setup needs one "Enable audio" tap, possibly by a helper.
- Making rejection mean "not these, for this question" instead of treating it as the user's opinion.
- Running a public deployment on shared event Wi-Fi. A review found that wrong-code throttling could lock the iPad out. Now only wrong, non-empty codes count, and a correct code always passes.
- Three pivots in one day without losing the guarantees of the safety core.

## Accomplishments that we're proud of

Every number below comes with its conditions.

- **396 automated tests pass** (unit, API, and a synthetic hands-free pipeline) on the working tree at 12:45 CT. They prove the logic, not real-world reliability. **[REFRESH: rerun `npm test` on the final commit and use that count.]** [S]
- **Live AI:** 14 of 14 synthetic scenarios returned valid batches from `gpt-6-astra`, at about 4 s per batch of three replies (local and Railway, synthetic prompts). In those runs it kept disagreement when asked, did not follow a quoted prompt injection, and did not invent consent on a medication question. These are AI-reviewer observations; no human judgments are recorded yet. [V]
- **Model choice:** `gpt-6-astra` was faster than the alternative we tried and used one-half to one-third of its tokens. Small sample (n = 6 per model). [V]
- **Transcription:** `gpt-transcribe` returned the exact transcript of a synthetic clip in about 1.2–1.8 s. [V]
- **Safety core:** in the browser, one held key with 20 auto-repeats produced exactly one action. [V] Separate selection and confirmation are enforced in a single reducer. [S]
- **Consent-gated learning** worked end to end in the browser: three "shorter" choices led to the proposal, two approvals, and an approved preference attached to the next request. [V]
- **Performance on a Mac** (not the iPad): first load is 11 requests and about 247 KB, with first paint at about 0.4 s. Face tracking takes about 12 ms per frame on CPU and about 15 ms on GPU, against a 66 ms budget at 15 fps. Railway time to first byte is about 130 ms. [V, Mac only]
- **Deployment security:** a live probe of about 47 requests confirmed that the access code gates paid calls, spoofed headers can't bypass it, the client bundle holds no secrets, and security headers are present. [V] HSTS goes live with the next redeploy.
- **Real device:** the setup screen rendered in Safari on a physical iPad Air 13" (M2, iPadOS 27.2). [V]

## What we learned

- With AI in AAC, the hard part is authorization, not generation. Most of our engineering went into making sure nothing is spoken without a deliberate selection, an exact review, and a separate confirmation.
- Project Converse / DEAN found AI suggestions too agreeable, so disagreement and refusal have to be first-class options. In our 14 synthetic scenarios, an explicit "Disagree" stayed disagreement (an AI reviewer's reading, not human judgment). We also chose to scope rejection to one question rather than learn opinions from it.
- With facial gestures, it matters as much to throw out ambiguous input as to detect intended input. "Nothing happened" is a safe outcome.
- Honest labels (Live AI or Fixture demo, natural or basic voice, verified or not) make the prototype easier to trust and to judge.
- Prior work exists and is close. Checking it early kept our claims accurate.

## What's next for Still Here

- **Co-design with AAC users and speech-language pathologists** before adding features. No AAC user has tested Still Here yet.
- **An on-device reliability trial** with the built-in `/trial` recorder: 20 eyebrow raises, 20 long blinks, 2 minutes of normal movement, face loss, and long holds. It counts misses, inadvertent commands, and wrong targets separately, across different people and lighting.
- A measured comparison of choosing whole replies versus the scanning keyboard, which tests our core hypothesis.
- A network-log check on the iPad to confirm that camera frames never leave the device.
- A privacy and retention review of each provider before any use outside a demo.

## Built with

`next.js` `react` `typescript` `zod` `mediapipe` `openai` `elevenlabs` `web-speech-api` `railway` `vitest` `github-actions` `claude-code`

Notes: the ElevenLabs integration is implemented, and its live use depends on the key **[REFRESH]**. The repository also contains an Anthropic adapter (unit-tested with a mocked SDK, never run live) and an experimental SwiftUI client (not in the demo). Neither is listed above.

## AI assistance disclosure

Still Here was built by **Liam Howeth** (University of Oklahoma, computer engineering) on 2026-10-24, starting at 09:00 CT. **Claude Code (Anthropic, Opus 5.5) wrote most of the code and documentation under Liam's direction.** Liam set the scope, made the product decisions, and directed the pivots, and he owns review and the accuracy of every claim. The build used up to 15 concurrent Claude Code agents with exclusive file ownership, plus independent review agents. Codex set up the generic repository foundation (collaboration docs, AI ground rules, and a hygiene script). That foundation was committed 08:49–09:08 CT and contains no application code. The app uses OpenAI models for reply suggestions and transcription, and ElevenLabs for synthetic speech. The voice is a prebuilt AI voice, disclosed as AI-generated, and nobody's voice is cloned. Full record: [AI_USAGE.md](AI_USAGE.md).

**[CONFIRM: the event's AI and pre-event-work rules are not recorded in the repo. Liam checks them with the organizers and adjusts this paragraph if they require a specific format.]**

## Related work

Conversation-first, AI-assisted AAC and camera-based AAC access already exist. We checked these sources on 2026-10-24 ([REFERENCES.md](REFERENCES.md)) and copied no code or assets:

- **VisioALS** is the closest overlap: a caregiver asks a question, four AI replies are offered, the user chooses by gaze quadrant, and a cloned ElevenLabs voice speaks the reply.
- **Google SpeakFaster** (Google Research and Team Gleason) expands abbreviated eye-gaze typing with language models.
- **Project Converse / DEAN** (University at Buffalo) is a research probe with two participants. It found suggestions too agreeable and called for support for disagreement.
- **Speak4Me** (listed as coming soon), **Bobbai**, and **Alek** (shut down 2026-06-01) all suggest replies.

We do not claim a first. Our contribution is a specific implemented combination: select and confirm as separate authorizations with an immutable review, eyebrow NEXT plus long-blink SELECT with arbitration, "None of these" that returns different meanings, and consent-gated preferences.

## Limitations

- Not clinically validated. No AAC users or people with ALS have tested it.
- Eyebrow and blink reliability are **not measured**, and these gestures will not work for everyone. Lighting, glasses, camera angle, fatigue, and individual motor ability will affect them. **[REFRESH with trial counts, n, and conditions if the `/trial` run happens.]**
- The MediaPipe model cards say the models are "not intended for human life-critical decisions." That is one reason review and a separate confirmation are mandatory.
- Camera frames stay on the device by design. The network check that would confirm this on the iPad has not been run.
- The exact confirmed sentence is sent to ElevenLabs, and conversation context is sent to OpenAI with `store: false`. We make no zero-retention claim for either provider.
- English only. No offline guarantee. Session learning covers reply length only.

## Links

- **GitHub:** https://github.com/LiamHoweth/HACKATHON (public)
- **Live app:** https://api-production-18038.up.railway.app. Fixture demo and Local-only modes work without a code. **Live AI and the natural voice need an access code, which we give judges in person.**
- **Demo video:** **[CONFIRM whether the event requires one. Do not link a video that does not exist.]**
- **Slides:** `docs/deck/Still_Here_Pitch.pptx` in the repository **[REFRESH: commit it, or upload it if Devpost asks]**
