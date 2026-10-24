# Presentation notes (running log)

The integrator keeps this compact, append-only log of facts we can say in the pitch. Each entry is tagged:
**[VERIFIED]** = actually executed or observed (with where); **[SYNTHETIC]** = deterministic tests, not hardware; **[NOT YET]** = built but unverified. Detailed per-feature evidence lives in [PRESENTATION_LOG.md](PRESENTATION_LOG.md) and [TEST_RESULTS.md](TEST_RESULTS.md).

## One-line pitch
AI offers possible words; the person decides what to say. On an iPad: raise your eyebrows for half a second to move, a long blink selects, and a separate new blink speaks the exact sentence aloud in a natural voice.

## Story beats that are true today
- Built in one day at SASEHacks for Good (OU, 2026-10-24). Hacking started 09:00 CT, and the first app code landed in commit `bb16883`.
- Safety core: nothing is ever spoken without (1) a deliberate selection, then (2) a review of the exact text, then (3) a separate, fresh confirmation. One physical gesture can never do two things. **[SYNTHETIC]** reducer, gesture and pipeline tests; **[VERIFIED]** browser switch test: one held key with 20 auto-repeats produced exactly one action.
- The user stays the author: "None of these" yields different meanings rather than paraphrases; guidance covers agree, disagree, alternative, humor and so on; My words (own composition) and quick phrases ("Please give me a moment") work with no AI at all.
- Consent-based learning: after three explicit "shorter" choices, it suggests "shorter replies?", saves only after two separate approvals, and you can see, pause or delete it. **[VERIFIED]** in the browser (11:10 CT).

## Numbers we can cite (with conditions)
- Live AI: OpenAI Responses `gpt-6-astra`, about 4 s per batch of 3 suggestions (local and Railway, synthetic prompts). 14 of 14 live scenarios returned valid batches: it held disagreement, did not follow prompt injection, and did not invent consent on a medication question. **[VERIFIED]** in `docs/evidence/live-scenarios.json` (no human judgments recorded yet).
- Model choice: astra beat luna (luna is slower, uses 2–3× the tokens, and once dropped plain yes/no answers). Small sample (n = 6 per model). **[VERIFIED]**
- Transcription: `gpt-transcribe` produced the exact transcript of a synthetic clip in about 1.2–1.8 s. **[VERIFIED]**
- Tests: 296+ automated tests (unit, API, synthetic hands-free pipeline). The count is still rising; refresh it before the talk.
- Railway deployment `https://api-production-18038.up.railway.app`: an access code gates paid calls, spoofed headers can't bypass it, there are no secrets in the client bundle, and security headers plus HSTS are on (HSTS is pending the next redeploy). **[VERIFIED]** by a live security probe (about 47 requests).

## Demo moments (rehearse these)
1. Partner types "Are you coming to dinner tonight?". Three suggestions appear.
2. Eyebrows up 0.5 s: the highlight moves exactly one step ("Eyebrow raise detected — Next"). Holding longer does not repeat.
3. Long blink selects. The review screen starts on **Cancel**. An eyebrow raise moves to **Speak**, and a **new** blink speaks the sentence.
4. Do "None of these" once to show the user rejecting the AI.
5. Quick phrase: "Please give me a moment."
6. Fallbacks if the room breaks things: Touch mode, auto-scan with blink, the basic device voice, and Fixture demo (all labeled on screen).

## Honest limits (say them)
- Not clinically validated, no AAC users have tested it, and eyebrow and blink reliability are **not measured** yet ([NOT YET]: the physical-iPad 20-raise / 20-blink trial, using the `/trial` page).
- ElevenLabs natural voice is implemented (server-only key, Text-to-Dialogue WebSocket for `eleven_v4_turbo`, exact text only) but **live voice is not verified until the key is added**.
- iPad Safari may need one tap to "Enable audio". Camera frames stay on the device; the confirmed sentence goes to ElevenLabs.

## Engineering decisions worth one slide
- One reducer and one target registry: touch, keyboard, switch, blink and eyebrow all converge on one guarded action path.
- A gesture arbiter: blink closure freezes the highlight and cancels a pending eyebrow; ambiguous input is discarded rather than guessed.
- Pivots during the day: switch-first, then blink-first, then iPad eyebrow NEXT plus blink SELECT with ElevenLabs. The safety core never changed.
- Multi-agent build: up to 15 concurrent Claude Code agents with exclusive file ownership, plus independent review and audit agents whose findings were fixed with regression tests.

## Log (newest last)
- 12:23 CT: Created this log. Wave-2 reviews found and wave-3 fixed: the access-code lockout on shared Wi-Fi, the wrong-target risk right after an eyebrow Next, Pause taking 11 raises (now 7), and stale voice status. iPad Simulator Safari layout was checked in landscape and portrait (`docs/screenshots/ipad-sim-*`).
- 12:26 CT — Prior art checked (docs/REFERENCES.md) [VERIFIED web sources]. **VisioALS** is the closest overlap: a caregiver asks, 4 AI replies are offered, the user picks one by gaze quadrant, and an ElevenLabs cloned voice speaks it. Also SpeakFaster (Google), Project Converse/DEAN (research probe, n=2), Speak4Me (coming soon), Bobbai, and Alek (shut down 2026-06-01). Say "we built on a known idea"; our difference is the *combination*: separate select vs confirm authorization with immutable review, eyebrow NEXT plus blink SELECT with arbitration, meaning-diverse "None of these", and consent-gated learning. MediaPipe model license is Apache-2.0, but its model card says it is "not intended for human life-critical decisions". That is why review and confirm are mandatory and we make no reliability claims.
- 12:30 CT: Performance (docs/PERFORMANCE.md) [VERIFIED on the Mac, not the iPad]. First load of the home page is 11 requests and ~247 KB, with first paint ~0.4 s. MediaPipe face tracking runs at ~12 ms/frame on CPU and ~15 ms on GPU, against a 66 ms budget at 15 fps. The first camera start downloads ~7.9 MB (wasm and model), which is cached immutably afterwards. Railway time to first byte is ~130 ms, and fixture replies take ~140–400 ms.
- 12:36 CT — Demo device: iPad Air 13" (M2, iPad14,10), iPadOS 27.2, USB, Developer Mode on. The deployed app opens in iPad Safari via `xcrun devicectl device process launch --payload-url … com.apple.mobilesafari`, and screenshots come from `xcrun devicectl device capture screenshot` (2732×2048). [VERIFIED] The setup screen renders on the real iPad. Use a Private Safari window for the demo (the tab bar showed personal tabs).
- 12:36 CT — Metrics module: opt-in, content-free gesture and voice timing (eyebrow onset→NEXT, blink closure, TTS request→bytes→playing callback). The export no longer leaks typed letters through key ids. [SYNTHETIC] 18 tests.
- 12:45 CT — Trial recorder at `/trial` [BUILT, not iPad-run]. It covers steps A–F: 20 eyebrow raises, 20 long blinks, 2 min of normal movement (counts inadvertent commands), face-loss ×3, 2-second holds ×5, and interrupted/ambiguous gestures. Misses, inadvertent NEXT, wrong target and extra commands are counted separately. JSON export has no images. Run it on the iPad to get our first real reliability numbers.
- 12:45 CT — Fixture fallback now matches the topic of the partner's question across 10 sets, gives 3 rounds of different meanings, and never produces consent wording on medication [SYNTHETIC]. Speech fixes: access-code check is debounced, line breaks are blocked before voice, the basic-voice review says which voice speaks, and the voice test reports its real outcome. The accessibility fix put Pause in More tools at 7 raises (was 11), and "None of these" keeps a fixed position. Tests: 396 [SYNTHETIC/unit].
- 12:50 CT — Live AI rerun: 14/14 valid, median 3.8 s (range 2.35–6.43 s), no repairs needed [VERIFIED, synthetic prompts, Claude-reviewed, not human-reviewed]. Behavior was consistent with the earlier run: 12/14 kept the same act pattern, and the safety scenarios (disagree, unknown history, injection, medication) behaved identically. Best slide examples are scenarios 12 (medication: clarify or set a boundary, never consent), 11 (injection refused) and 7 (no invented memories). See `docs/evidence/live-scenarios-review.md`. A design choice to defend: medication questions offer no "yes" option, so a user who wants to agree uses My words.
- 12:50 CT — Pitch deck: `docs/deck/Still_Here_Pitch.pptx` (12 slides plus notes). Its test count needs a refresh after TEST_RESULTS is updated. Rehearsal pack: `docs/REHEARSAL.md` (25 Q&A, never-say list, failure playbook, pre-stage checklist).
- 13:05 CT — Commits `ec7df44` + `0ba22f1`: wave-3 fixes, `/trial`, metrics, home-screen manifest, and landscape setup with Enable audio above the fold. Tests: **433 passing**, plus 2 documented known bugs in the auto-scan *fallback* mode (a natural blink right after a timer step undoes the step; very frequent blinking can stall scanning). The primary eyebrow mode is unaffected [SYNTHETIC]. A secret scan confirmed the access code and OpenAI key are absent from the repo and all git history [VERIFIED]. Agents: peak 15 concurrent; scaled back to normal at Liam's request (usage).
- 13:20 CT — **ElevenLabs natural voice is live** [VERIFIED by HTTP, not yet heard on the iPad]: `eleven_v4_turbo` over the Text-to-Dialogue WebSocket, server-side only, default voice Chris (picker: River, Alice). Five test lines: 5/5 OK, median 666 ms request→MP3 (local). Railway: 401 without the access code, 653 ms with it. The key is only in `.env.local` and Railway secrets. Rotate it after the event (it was shared in chat). Manual iPad runbook: `docs/IPAD_TEST_RUNBOOK.md`.
- 13:35 CT — **Checked on the physical iPad** (Safari driven from the Mac) [VERIFIED]: every capability the app needs is present (front camera, WebGL2, wake lock, audio session, mp4 recording). Live suggestions from the iPad took 3.6 s; a natural-voice MP3 from the iPad took 0.6 s. MediaPipe starts on the iPad GPU in 0.8 s. Without a tap, Safari blocks audio (NotAllowedError), which confirms the one-time "Enable audio" tap is required. Camera gestures still need a person.

## 12:55 PM — Installable iPad app
- [VERIFIED] Still Here now installs as a native iPad app (development build, WKWebView shell). It opens straight into the app with audio already unlocked and the access code built in; camera/microphone are pre-granted for the app's own site and auto-lock is off. One-command rebuild: `scripts/build-ipad-shell.sh`.
- [NOT YET] Gestures and audible speech inside the installed app.
- Talking point: no App Store needed for a demo; a free/dev signing build runs on the registered iPad (7-day profile on a free team).

## 1:15 PM — Conversational mode (commit c5519d0)
- [VERIFIED, unit tests + deployed] Hands-free partner listening: the partner just talks; each utterance is detected, transcribed and becomes the partner line automatically. Listening pauses while Still Here speaks, so it never hears itself.
- [VERIFIED, unit tests + deployed] Fast mode: the top suggestion is highlighted first; one long blink speaks it immediately (no review step). Review + separate confirmation is still available with one setup checkbox.
- [VERIFIED, unit tests + deployed] Multiple faces: tracking locks onto one face (most central and longest in frame) and keeps working when someone leans in.
- [VERIFIED, manual on the iPad] Hands-free conversation works end to end in the installed app (team test, ~1:20 PM). Multi-face lock and one-blink speak: covered by unit tests; confirm in rehearsal.
- Talking point: time from partner question to spoken reply = transcription + suggestions + one blink + voice (~0.6 s).
- Earlier fix (1:04 PM): the microphone failed on iPad because a "playback" audio session blocks capture; recording now switches to play-and-record.

## 1:45 PM — UI simplified from an iPad screen audit
- [VERIFIED, deployed + tests] Simplified the demo UI after auditing 90 iPad screenshots: honest one-line setup intro, advanced options folded away, a 3-item header, hands-free listening first in the partner panel, plain wording ("Got it — one moment", "Spoken"), and a partner line now jumps straight to new suggestions from any menu.
- Sources for slides: docs/ux-audit/UX_AUDIT.md (before table + 6 before screenshots) and docs/manual/QUICK_GUIDE.md (one-page user guide: setup, gestures, troubleshooting, privacy).
- [NOT YET] After-screenshots of the new UI (skipped by choice).

Current test count: see TEST_RESULTS.md / latest commit (487+ passing at 2:30 PM).

## 2:00–2:30 PM — Speed, interruption handling, redesign (not yet deployed)
- [VERIFIED, Mac] Latency baseline measured (docs/evidence/E2E_LATENCY.md): partner stops → suggestions median 5.1 s / p90 7.8 s, from a Mac against the deployed server. Replies are the bottleneck (median 3.9 s, bimodal). After-numbers are [NOT YET]: pending a re-run after deploy.
- [unit tests; NOT YET live] Instant voice: audio for all 3 suggestions is prefetched, so a blink plays it from memory (~0.7 s saved). Trade-off: unchosen suggestions are also sent to ElevenLabs; the server daily budget was raised to 60,000 chars.
- [unit tests + Mac transcription ~0.5 s] Faster listening: end-of-speech 0.9 → 0.65 s, smaller uploads, English hint.
- [unit tests; NOT YET live] Follow-ups merge (Option B): partner speech within 20 s of an unanswered question is merged into it and the suggestions refresh, so the person never loses the question.
- [unit tests] Filler filter: "uh huh", "mm-hmm" and "got it" alone are ignored; short answers like "yeah" and "sure" still count.
- [unit tests] Safety fixes from code review: partner speech can't knock the app out of Pause; the voice player can't deafen the mic; lines heard during speech are answered after Stop too.
- [headless render at 1366x1024; NOT YET on iPad] One coherent design system: slim header, chat-style conversation panel, larger action tiles, gesture legend chips, launch-card setup. Accessibility fixes: fewer live announcements, corrected heading order.
- [IN PROGRESS] Replies restyled to sound like a casual college student, plus speed tuning.
- [config set; applies on next deploy] Voice switched to "Will" (young, male, conversational ElevenLabs voice); Jessica and Chris remain available.
- [VERIFIED] New tooling: scripts/smoke-deployed.mjs (6/6 PASS pre-deploy) and scripts/e2e-latency.mjs.
- [VERIFIED] Native app pre-built and signed (profile valid to Oct 2027).
- Talking point: "About 4 seconds from the partner finishing to suggestions on screen, and the voice starts the instant they blink (Mac-measured)." [VERIFIED, Mac; synthetic speech, excludes gesture time, not iPad-measured]
- Talking point: "The person never loses their place: follow-ups join the question."

## 1:55 PM — Deployed: speed + merge + redesign
- [VERIFIED, deployed] Railway deployment 157e3e90 at 13:50 CDT, CSS follow-up 1fd48c97 at 13:54 CDT. Native iPad app reinstalled and launched with the new build.
- [VERIFIED, Mac -> deployed server, synthetic speech, excludes gesture time, not iPad-measured] Latency, before -> after (docs/evidence/E2E_LATENCY.md, 10 runs each, 0 failures): partner stops -> suggestions median 5.1 s -> 3.8 s, p90 7.8 s -> 5.8 s; /api/replies median 3.9 s -> 2.5 s. Blink -> voice about 0 with prefetch (0.63 s without). One 10-run sample per side, not a controlled A/B.
- [VERIFIED] Smoke test of the deployed server: 6/6 PASS. Unit tests: 514 passed + 2 expected fail.
- [VERIFIED, live deployed server] Casual college-student replies. For "Are you coming to dinner tonight?": "Yeah, I'm coming tonight." / "I'm not coming tonight." / "What time is dinner?".
- [VERIFIED, dev server, Touch + Fixture mode, browser] Follow-ups merge walkthrough: 5/5 pass. [NOT YET] merge on the iPad.
- [VERIFIED, config deployed] Voice is now "Will" (young male). Jessica and Chris remain available.
- [NOT YET live on iPad] Multi-face lock, one-blink speak timing, audible prefetch, merge on device, redesigned UI on device.
- [MEASURED offline, then FAILED live, OFF] OpenAI priority tier: replies call 1.8 s median / 2.7 s p90 in the offline run, but on the deployed server at 14:05 CT 4 of 6 requests hit the 15 s timeout. Keep it off; do not cite the 1.8 s number. (tested 14:05 — caused timeouts; keep OFF)

## 2:30 PM — Other ways to answer + faster gestures
- [deployed, unit-tested; NOT YET on iPad] Deployed 14:30 CT (commit 2e0954b) and installed on the iPad; no person has tested it on the iPad yet.
- [deployed, unit-tested; NOT YET on iPad] **Other ways to answer** (setup checkbox "Show other ways to answer", ON by default): the board shows the 2 most likely replies, then an "Other ways to answer…" card previewing 3-5 AI directions (for "How was your day?": Rough day, Mixed day, Not now, You first). Choosing it opens a screen of direction cards plus "Something else. New ideas" and Back. Replies for every direction are fetched in the background as soon as that screen opens, so a direction usually shows 3 ready replies at once, with a breadcrumb such as "Other ways › Rough day". One long blink speaks a reply (fast mode).
- [deployed, unit-tested; NOT YET on iPad] **Gestures:** raise eyebrows to move; KEEP them up to keep moving (a step every 0.6 s) and relax to stop. A brief deliberate JAW DROP (about 0.4-1.5 s, then close) goes BACK one option; talking and yawns are ignored. Long blink selects, and blink always wins over other gestures. The eyebrow hold is personalized from calibration (0.35-0.5 s) and re-arming after a select is faster.
- [deployed] **Typeface:** Atkinson Hyperlegible (Braille Institute, designed for low-vision legibility). Copy shortened, no em dashes. Not tested with low-vision users.
- [MEASURED, Mac -> deployed server, synthetic; not iPad-measured] Latency: concrete questions with branching 2.4-3.7 s; open-ended questions such as "How was your day?" can take 7-9 s. The OpenAI priority tier stays OFF.
- Talking point: "When none of the likely replies fit, the person steers by direction: Rough day, Mixed day, Not now, You first. The AI offers words; they choose."
- Caveat: do not claim these gestures are reliable. Hold-to-move and jaw-drop thresholds have not been measured on a person on the iPad.
- Docs updated: manual/QUICK_GUIDE.md, QUICK_GUIDE_SLIDE.md, quick-guide.html, the Quick Guide and Stage Card PDFs, REHEARSAL.md (new Beat 5), JUDGE_QA.md, deck/CODEX_DECK_PROMPT.md.
