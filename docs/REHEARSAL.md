# Judge rehearsal pack

Speaker prep for the Still Here judging slot at SASEHacks for Good. Every claim here comes from [PRESENTATION_NOTES.md](PRESENTATION_NOTES.md), which is the authoritative log. Supporting detail is in [JUDGE_QA.md](JUDGE_QA.md), [DEMO_SCRIPT.md](DEMO_SCRIPT.md), [REFERENCES.md](REFERENCES.md), [TEST_RESULTS.md](TEST_RESULTS.md), [PERFORMANCE.md](PERFORMANCE.md), [PRESENTATION_LOG.md](PRESENTATION_LOG.md) and [PRIVACY_AND_LIMITATIONS.md](PRIVACY_AND_LIMITATIONS.md). There is no `UX_ANALYSIS.md`.

**This reflects the evidence as of 12:26 CT on 2026-10-24** (commit `5de1a57` plus uncommitted wave-3 work). It **cannot** be rehearsed as final until these open items are settled.

| Open item at 12:26 CT | What it controls in this pack | Where to update it |
| --- | --- | --- |
| Physical-iPad trial (20 raises, 20 blinks, 2 min of normal movement) | Q11 and the reliability line in the pitches | TEST_RESULTS, then PRESENTATION_NOTES |
| ElevenLabs key and a line heard on the iPad | Every "natural voice" line (wording given in **[brackets]**) | `docs/evidence/tts/README.md`, TEST_RESULTS |
| SYS-13 network log | Q6 ("by design" vs. "verified") | TEST_RESULTS |
| Final automated test count (285/285 at 12:18; PRESENTATION_NOTES says "296+, rising") | Q25 | Rerun `npm test` and record the result |
| Final menu order | The gesture counts in the demo | DEMO_SCRIPT |

Tags used below: **[V]** verified (executed or observed), **[S]** synthetic or mocked tests only, **[NM]** not measured or not verified.

---

## 1. Pitches

Principles: speak about adults with something to say, not about victims. No statistics, no patient imagery, and no "voiceless" language. Say the source ("Live AI" or "Fixture demo") and which voice spoke.

### 60-second version (about 150 words)

> People who use AAC have plenty to say. The problem is time: by the time a reply is spelled out, the conversation has often moved on, and with it the joke, the disagreement, the chance to start a topic.
>
> Still Here is an iPad web app built on one rule: **AI offers possible words; the person decides what to say.** When a partner asks a question, the AI offers three *different* replies. It chooses nothing. The person can pick one, reject all of them, steer the direction ("disagree", "suggest an alternative"), or write their own.
>
> Hands-free control uses two facial gestures. Raise your eyebrows for half a second to move one step. A long, deliberate blink selects. Nothing is spoken until the person has reviewed the exact sentence and confirmed it with a *separate, new* blink. Then it is spoken **[in a natural ElevenLabs voice / in the basic device voice]**.
>
> We built this today. It has not been tested with AAC users yet, and that is the next step.

### 2-minute version (about 300 words)

> People who use AAC have plenty to say. What they often lack is time. By the time a reply is spelled out, the conversation has moved on, and so has the joke, the disagreement, or the chance to bring up something new. We asked: what if choosing a whole message took fewer actions than spelling it? We haven't measured that yet. It's the hypothesis we built toward today.
>
> Still Here runs in Safari on an iPad. Its core rule is **AI offers possible words; the person decides what to say.** A partner types or says a question, and the AI offers three replies with different meanings. It never picks one. If none fit, "None of these" brings new meanings, not paraphrases. "Guide my response" sets a direction: agree, disagree, suggest an alternative, add humor. "My words" and Quick phrases work with no AI at all.
>
> Control is hands-free. Eyebrows up for half a second moves the highlight exactly one step, and holding longer never skips ahead. A long, deliberate blink selects; ordinary blinks are ignored. Selecting doesn't speak. It opens a review of the exact sentence, and the review starts on **Cancel**. Speaking takes one eyebrow raise to "Speak" and a **new** blink. One gesture can never both select and confirm. The camera runs on the iPad by design, and only the confirmed sentence is sent out for speech.
>
> Learning works the same way. If the person keeps choosing shorter replies, the app asks before remembering that, and the preference can be viewed, paused or deleted.
>
> We're open about the limits. We built on known ideas, and VisioALS and SpeakFaster are close relatives. Our contribution is this combination of guarded authorization and gesture control. Gesture reliability is **[not measured yet / give the trial counts with n and conditions]**. No AAC users have tested it, and it is not clinically validated. The next step is co-design and evaluation with AAC users and specialists.

---

## 2. Twenty-five judge questions

Each answer takes 20 to 30 seconds spoken. Start with the direct answer and finish with the limit. Don't read the evidence tags aloud.

### Novelty

**Q1. How is this different from VisioALS?**
VisioALS is the closest prior work, and we checked it today. A caregiver asks a question, four AI replies appear, the user picks one by **gaze quadrant**, and a **cloned** ElevenLabs voice speaks it. Our difference is the combination: select and confirm are separate steps with an immutable review, eyebrow NEXT plus long-blink SELECT with an arbiter between them, "None of these" that returns different meanings, and learning gated by consent. We don't claim a first, and we copied no code. *[V: REFERENCES, fetched 2026-10-24]*

**Q2. And Google SpeakFaster, or other AI AAC apps?**
SpeakFaster is a Google Research and Team Gleason prototype. Eye-gaze typists enter word initials, and a language model expands them. That speeds up *typing*. We offer whole candidate replies and keep "My words" for spelling. Bobbai, Speak4Me and the DEAN research probe also suggest replies; Speak4Me is listed as coming soon, and Alek shut down in June. Conversation-first AI AAC is not new. Whether our approach is faster is **not measured**. *[V: REFERENCES]*

### Safety

**Q3. Could it say something the person didn't mean?**
Speech takes three deliberate acts: a long-blink selection, a review that starts on Cancel, and then an eyebrow raise to Speak plus a **new** blink from a separate input cycle, at least 600 ms after the review opens. Holding a gesture never repeats it. If the face is lost, the app pauses, and returning selects nothing. This is enforced in one reducer and covered by tests. In a browser test, one held key with 20 auto-repeats produced exactly one action. It is **not yet tested on a real face**. *[S + V browser]*

**Q4. What if the AI suggests something harmful, like agreeing to a medication change?**
The AI can't speak, select or remember anything by itself. The person reviews every word. In 14 of 14 synthetic live scenarios the batches were valid. On a medication question the model offered clarification and boundaries and did not invent consent. It also ignored a quoted prompt injection. Those are observations by our AI reviewer, not human judgments. Prompts are not guarantees, and this is not a medical or emergency tool. *[V: live-scenarios.json; human review NM]*

**Q5. What if someone walks into frame, or the user looks away?**
Losing the face cancels any gesture in progress and pauses with "Tracking lost — Paused". Resuming takes a deliberate blink on Resume. With two faces visible, selection is held. Face count is not identity. All of this is tested in code with synthetic frames. **Not tested on hardware.** *[S]*

### Privacy

**Q6. Does the camera video leave the iPad?**
By design, no. The face model runs inside Safari from files on our own server, and it outputs only brow and eye-closure scores and a face count. Nothing is recorded, and there's no face recognition, gaze or emotion detection. The network check that would *prove* nothing is uploaded **has not been run**, so I'm describing the design, not a tested fact. *[Design; SYS-13 NM]*

**Q7. What goes to the cloud, and is it kept?**
With consent at setup, the partner's question, a few recent turns and the person's guidance go to OpenAI with `store: false`. OpenAI's docs say abuse-monitoring logs can still be kept for up to 30 days, and we don't have zero retention. Only the exact confirmed sentence goes to ElevenLabs. Their logging is on by default, and zero retention is enterprise-only, so we make **no zero-retention claim**. Keys stay on the server. *[V: REFERENCES; provider retention for our plan not reviewed]*

### Users, access, fatigue

**Q8. ALS is progressive. What happens when eyebrow or blink control fades?**
Then the person shouldn't have to rely on it. Auto-scan with blink needs no eyebrow movement, and keyboard or switch and touch use the same screens and the same review-and-confirm path. Calibration is per person and fails openly if signals overlap. We haven't tested any of this with people with ALS or measured how it holds up over time, and that's the honest gap. *[Implemented; NM]*

**Q9. Isn't that tiring? How many gestures does a message take?**
The shortest path for a suggested reply is a long blink, one raise and a new long blink. Steering takes more. The full demo path with "None of these" and a direction is about 14 raises and 6 blinks. Fatigue and actions per message are **not measured**. Pause is reachable, and a review found it took 11 raises, which we cut to 7. *[DEMO_SCRIPT, PRESENTATION_NOTES; NM]*

**Q10. Why eyebrows instead of gaze tracking?**
Eyebrow NEXT lets the person move when they're ready, one step per raise, instead of waiting for a scan timer. It also needs no gaze calibration across a screen. That's a design argument, and we haven't measured it as faster. Not everyone can raise their eyebrows, so auto-scan with blink remains available. *[Design; NM]*

### Evidence

**Q11. How reliable is detection? Give us numbers.**
**[Until the trial is recorded:]** We don't have reliability numbers. The gesture logic passes unit and synthetic-frame tests, but eyebrow and blink detection have **not been measured on a real face or the physical iPad**. The MediaPipe model card says it isn't intended for "human life-critical decisions", which is why review and confirmation are mandatory. **[After the trial: give raw counts with n, lighting, glasses and tester. Never percentages.]** *[S; NM]*

**Q12. How fast is it, end to end?**
What we've observed: live AI returns three suggestions in about 4 seconds in single synthetic calls, and transcription of a synthetic clip took about 1.2 to 1.8 seconds. On a Mac, face tracking ran at about 12 to 15 ms per frame against a 66 ms budget. Confirmation-to-sound time and iPad numbers are **not measured**. *[V observations; not a latency study]*

### Cost and offline

**Q13. What does a message cost?**
**Not measured.** The costs are OpenAI per suggestion batch and ElevenLabs per spoken character. To keep them bounded, paid routes need an access code, speech has a server-side daily budget of 20,000 characters by default, and there's a per-client rate limit. We haven't reviewed either provider's pricing, so I won't give a per-message figure. *[Implemented; NM]*

**Q14. Does it work offline?**
**Not verified, and we don't claim it.** Gestures, Quick phrases and My words don't need AI, and the basic device voice may work offline depending on the voice. Live AI and the natural voice need the network, and a cold reload needs the server. *[NM]*

**Q15. Who pays for this?**
We haven't decided, and we haven't costed it. It runs on a standard iPad and in Safari, without special hardware, which helps. Ongoing AI and voice costs are real, and they're why there's an access code and a budget cap. A sustainable model is future work, alongside evaluation. *[No evidence either way; don't improvise numbers]*

### Validation and standards

**Q16. Is it clinically validated? Have people with ALS used it?**
No to both. No AAC users, no one with ALS and no clinicians have tested it or been consulted. It's a one-day prototype. Clinical use would need co-design with AAC users and specialists, measured reliability across people and conditions, an accessibility review, provider privacy and retention review, and regulatory advice. None of that has been done. *[V: honest limits]*

**Q17. Does it meet accessibility standards like WCAG?**
**Not tested, and we make no conformance claim.** There is an untimed keyboard path (Tab or the arrow keys move, Space selects), so timed auto-scan isn't the only way in, which matters for WCAG 2.2 keyboard access. Contrast, 200% zoom, VoiceOver and Dynamic Type have **not been checked**, and external switch hardware is untested because we emulated it with a key. *[Design; NM]*

### Bias and consent

**Q18. Won't AI suggestions flatten someone's voice, or be too agreeable?**
That's a known problem. The DEAN research probe found suggestions too agreeable. That's why "Disagree" and "Suggest an alternative" are first-class, and in our synthetic live runs Disagree stayed disagreement in all three options. The person can always write their own words. The output is English only, and we haven't evaluated bias across dialects or cultures. *[V observation; bias NM]*

**Q19. Does face detection work for everyone, across skin tone, glasses or facial differences?**
**We don't know yet.** The model card reports landmark fairness across 17 regions, perceived gender and skin tone, but that covers landmark accuracy only. It doesn't cover blink or brow scores, people with motor impairments, glasses or difficult lighting. Per-person calibration helps, and non-camera inputs are always available. *[V: REFERENCES; our testing NM]*

**Q20. What does it learn about me, and who decides?**
Only reply length, and only with consent. After three explicit "shorter" choices it asks whether to prefer shorter replies. It saves the preference only after two separate approvals, and you can see, pause or delete it. We verified that flow in the browser. Nothing else is profiled, and camera data is never used for learning. *[V browser 11:10 CT]*

### Security, scope, team

**Q21. Couldn't someone abuse your API and run up the bill?**
Paid calls need an access code, and spoofed headers don't bypass it. There are no secrets in the client bundle, and repeated wrong codes are throttled. We checked this with a live probe of about 47 requests against the Railway deployment. Rate limits are per process in memory, so this isn't a spending guarantee. *[V probe]*

**Q22. Is that the person's own voice? Why not clone it, like VisioALS?**
It's a prebuilt ElevenLabs voice, disclosed as AI-generated, and nobody's voice is cloned. Voice banking is a meaningful idea, but cloning raises consent and retention questions we haven't worked through. **[Voice heard on the iPad today? Yes or no. Say which.]** *[V design; live voice NM until heard]*

**Q23. Why a web app and not a native iPad app?**
Safari on an iPad needs no install and runs the face model locally. An experimental SwiftUI client is in the repo, but it isn't connected end to end and isn't part of the demo. Safari's audio policy may need one "Enable audio" tap, which a helper might do, so setup isn't fully hands-free. *[V; hands-free audio after setup NM]*

**Q24. What's next?**
In order: run the physical-iPad trial and report raw counts; verify the natural voice with listeners; run the network check on camera privacy; then the real step, co-design and evaluation with AAC users and specialists. That last step is planned, not arranged. *[PROGRESS, SLIDE_OUTLINE]*

**Q25. Who built this, and how much was AI?**
Liam Howeth, a computer engineering student at OU, built it solo today, starting at 9:00. Claude Code wrote the implementation under Liam's direction and review, with up to 15 parallel agents that each owned separate files, plus independent review agents whose findings were fixed with regression tests. Codex set up the repository docs. There are **[refresh: 285 at 12:18 / final count]** automated tests, which prove logic, not reliability. See AI_USAGE.md. *[V; Liam confirms the event's AI rules]*

---

## 3. Never say

| Don't say | Say instead |
| --- | --- |
| "first", "only", "nobody has done this" | "We built on a known idea. Our contribution is the combination." |
| Any reliability, accuracy or latency number not in TEST_RESULTS, or a percentage from a small sample | "Not measured", or raw counts with n and conditions |
| "Clinically validated", "tested with ALS patients or AAC users", "therapists approved" | "Not tested with AAC users. That's the next step." |
| "Camera never leaves the iPad" stated as verified | "By design, the camera stays on the iPad. The network check hasn't been run." |
| "OpenAI or ElevenLabs keeps nothing", "zero retention", "HIPAA compliant" | "`store: false` is set. We make no zero-retention claim." |
| "Works offline" | "Offline is not verified." |
| "Natural voice", "sounds human", "instant" (unless heard on this iPad today) | "ElevenLabs is implemented. [It was / wasn't] heard today." |
| "Their own voice", "cloned voice" | "A prebuilt AI voice, disclosed as AI." |
| "Fully hands-free setup" when a helper tapped Allow or Enable audio | "A helper did one setup tap." |
| "Faster than typing", "fewer gestures" as a result | "That's our hypothesis. Not measured." |
| "285 tests prove it works" | "Tests prove the logic, not reliability on a real face." |
| "Reads gaze, emotion or identity", "eye tracking" | "Two facial gestures: brow raise and long blink." |
| "WCAG compliant", "VoiceOver ready", "works with switches" | "Not tested. Switches were emulated with a key." |
| "Learns your personality", "knows what you want to say" | "It learns length only, with two approvals." |
| "Gives a voice to the voiceless", "trapped", "suffers from", "victims" | "People who use AAC have plenty to say." |
| Mac performance numbers presented as iPad numbers | "Measured on a Mac. iPad not measured." |
| Anything about the iOS app working | "An experimental native client exists. It's not in the demo." |
| An emergency or medical use case | "It's not a medical or emergency tool." |

---

## 4. Live-demo failure playbook

Rule: **switch, then say what happened.** Never let a fallback pass silently. Rehearse each one once.

| Failure (how you'll notice) | Exact fallback action | Line to say |
| --- | --- | --- |
| **Camera fails**: no permission prompt, "camera unavailable", or a black self-view | Setup → "Touch" (or "Keyboard / switch") → "Start session". If the session is already running: tap "More tools" → "Controls" → "End session…" → "End session and clear the conversation" → Touch | "The camera isn't available here, so I'll use touch. It's the same screens, the same review and the same separate confirmation." |
| **Eyebrow not detected**: no progress bar, missed raises, or false NEXTs | Tap the card directly, since touch works in every mode. To keep it hands-free: More tools → Controls → End session… → "Auto-scan with blink" → "Start with saved calibration" | "Eyebrow detection isn't reliable in this light, so the highlight now moves on a timer and I still blink to select. The eyebrow path is experimental." |
| **Blink calibration fails** ("could not tell signals apart") | Setup → "Touch" → "Start session" | "Blinks aren't separating cleanly here. Same flow, by touch." |
| **"Tracking lost — Paused" keeps repeating** | Reposition to arm's length, eye level, light in front. Long blink on "Resume", or a helper taps "Resume" | "It paused because it lost my face. That's the safe behavior." |
| **Audio blocked** ("Audio blocked — tap Enable audio") | Helper taps "Enable audio". The sentence stays on screen as text | "Safari blocked the audio, so it isn't fully hands-free here. The app says so instead of pretending it spoke." |
| **Natural voice fails** (not configured, quota or network error) | Board → "Say it with the basic device voice" → new review → "Speak" → new blink | "The natural voice is unavailable. This is the basic device voice, and I had to confirm again." |
| **AI slow**: "Finding possible responses…" for more than ~8 s (the normal wait is about 4 s) | Keep narrating to ~10 s, then "Try again". If it fails again, use "Quick phrases" → "Please give me a moment." | "Live AI is slow on this network. Quick phrases need no AI, and they still go through review." |
| **AI fails** ("Suggestions could not be loaded.") | "Try again" → or End session → restart with "Fixture demo (labeled scripted suggestions)" → "Start with saved calibration" | "The AI is unavailable, so this is our labeled fixture set. The badge says 'Fixture demo'." |
| **Network down** (venue Wi-Fi) | If a hotspot is prepared, join it and reload. If not, stay on the loaded page and use "Quick phrases" / "My words" with the basic device voice. Fixture mode also needs our server. **Untested: rehearse once with Wi-Fi off after the page loads** | "The network is down. Quick phrases and My words don't use AI. This is the basic device voice." |
| **Microphone or transcription unavailable** | The partner types, which is already the default | "We'll use typed input." |
| **Safari or the app crashes** | Reload → the Railway URL → Touch mode for speed. Show a backup video only if it really exists | "This is a recording from earlier today." (Say this only if it's true.) |

---

## 5. Run-of-show checklist (T-5 minutes, before going on stage)

Operator: ______  Partner (types): ______  Helper (setup taps): ______

**Device**
- [ ] iPad **charged or plugged in**. The 12:25 device probe showed **55%**. Low Power Mode **off**.
- [ ] Settings → Display & Brightness → **Auto-Lock: Never**. Brightness high; turn off auto-brightness if the stage lights change.
- [ ] **Focus / Do Not Disturb on**, so no notification banners interrupt.
- [ ] **Silent mode off, volume up.** If an external speaker is used, it's connected and tested.
- [ ] **Close unrelated Safari tabs.** The 12:25 probe showed personal and course tabs in the tab bar, which would be on the projector. Use one Still Here tab only, because two tabs can diverge.

**App**
- [ ] Safari → the Railway URL, freshly loaded after the final redeploy.
- [ ] **Safari camera allowed** (aA → Website Settings → Camera: Allow, or the helper taps Allow at the prompt).
- [ ] **"Enable audio & test voice" tapped** → "Audio ready". Note what you **heard**: natural voice, basic voice, or nothing. This decides the voice lines.
- [ ] **Access code entered** with the projector **off or turned away**. Live AI consent box checked. Never show or say the code.
- [ ] **Calibration fresh, in this room's light**: arm's length, front camera at eye level, light in front of the face, glasses as they'll be worn. Finish through "Eyebrow + blink control is ready".
- [ ] The board shows: "Live preview — not recorded", "Ready — raise eyebrows to move", "Eye gestures" ready, "Mic: Off", and "Voice: Natural" or "Voice: Basic device voice".
- [ ] One practice raise and one practice blink on the board. Then Cancel, and leave "No active question".

**Fallbacks ready**
- [ ] **Fixture fallback**: you know the path (More tools → Controls → End session… → "Fixture demo (labeled scripted suggestions)" → "Start with saved calibration").
- [ ] Touch fallback agreed: who taps, and the line to say.
- [ ] Hotspot ready (if one exists), and the backup video exists (yes/no). Don't mention a video that doesn't exist.
- [ ] Partner has the first line ready: *"Are you coming to dinner tonight?"*

**Words**
- [ ] Refresh these: the test count, the trial result (counts or "not measured"), and whether the voice was heard. Cross out the bracketed options in the pitch that no longer apply.
- [ ] Reread **Never say** (section 3).
