# Live demo script: 3 minutes

For the Still Here judging slot (5:15 PM CT). Rehearse at about 3:30 PM. Facts come from [PRESENTATION_NOTES.md](PRESENTATION_NOTES.md), [manual/QUICK_GUIDE.md](manual/QUICK_GUIDE.md) and [TEST_RESULTS.md](TEST_RESULTS.md). For judge questions, use [JUDGE_QA.md](JUDGE_QA.md), but note it predates the conversational flow: its "review, then separate confirm" and "two faces hold selection" answers are out of date. Setup details and result tables are in [IPAD_TEST_RUNBOOK.md](IPAD_TEST_RUNBOOK.md).

**One rule to say and to keep: AI offers possible words; the person decides what to say.**

## What is verified, and what rehearsal must settle

| Item | Status |
| --- | --- |
| Installed app, hands-free conversation, mic, audible reply on the iPad | **Verified** (team manual test, about 1:20 PM) |
| Multi-face tracking | Unit-tested only. **Not yet run live. Test it in rehearsal.** |
| One-blink speak timing | **Not yet measured live.** Time it at rehearsal and say only what you measured. |
| Audio prefetch (so the chosen line plays at once) | **Not yet verified.** Do not say "instant". |
| Narrator voice leaking into the mic | **Unknown. Test it first** (see Cast). |
| Raise counts for Guide my response, then Disagree | Write them in at rehearsal: ____ raises to Guide, ____ to Disagree |

## Cast and positions

- **Operator** sits facing the iPad, eye level, 50-70 cm away, light on the face (not a window behind). Only face gestures after the demo starts. The iPad faces both the operator and the judges where possible.
- **Partner** stands or sits close beside the iPad, a little to one side, and speaks clearly at normal volume toward it. Partner talks only when a line is scripted.
- **Narrator** stands 1.5 m or more from the iPad, facing the judges. **The mic hears everyone.** Narrate only in the gaps marked *(narrator talks)*. During the waits marked *(quiet)*, say nothing.
- **Timekeeper** is the narrator (a silent phone stopwatch) or a fourth person. **Never count aloud.** It would be transcribed as a partner line.

```
   judges
 ---------------
   Narrator          (>= 1.5 m back, quiet during "quiet" beats)
        |
   [ iPad ]  <- Partner (close, right side)
      ^
   Operator (50-70 cm, eye level)
```

## T-5 minutes (operator and narrator, 2 minutes)

- [ ] iPad charged or plugged in, volume up (hall is loud), silent mode off. Still Here app open on the launch screen: **Ready when you are**. Tap **Start with saved calibration** (if not calibrated, do the 1-minute calibration first, in this room's light).
- [ ] Fast mode on (the "Speak as soon as I choose" default). Status shows **Listening: just talk**. Self-view shows "not recorded".
- [ ] **Quiet check:** narrator says a sentence at presentation volume from the narrator position. If it appears as a Partner line, move farther back or lower your voice. If the hall noise still feeds it, plan to use **Stop listening** and type (see failures).
- [ ] One practice: Partner asks something, operator long-blinks once, you hear the voice. Then clear it and return to a fresh state.
- [ ] Backups ready: Safari open to the app URL in a private tab (https://api-production-18038.up.railway.app). **Get the access code on the Mac before you go on, with the projector off, by running this yourself:** `cut -d= -f2 /Users/howeth/Desktop/claudex/Experiments/HACKATHON/.env.railway.local`. Never show or say the code.

## The script (3:00)

### 0:00-0:15 Problem *(narrator talks)*
**Narrator:** "People who use AAC have plenty to say. The problem is time. By the time a reply is spelled out, the conversation has moved on. Still Here takes a different path: the AI offers possible words, and the person decides what to say."
- **Audience should notice:** the iPad is already running, no one is touching it.
- **If it fails:** nothing to fail. Do not start Beat 1 until the iPad shows Listening.

### 0:15-0:50 Beat 1: a question, spoken back *(narrator talks, then quiet)*
**Narrator:** "[Operator] is using only eyebrows and blinks. I'm going to stay quiet so the iPad only hears [Partner]. I'm timing this." *(narrator starts a silent stopwatch when the partner finishes the question)*
**Partner (normal voice, to the iPad):** "Are you coming to dinner tonight?"
**Operator:** *(quiet)* waits. Three suggestions appear a few seconds later. Top one is highlighted. Operator makes **one long blink** (about 1 s, eyes closed deliberately).
**Narrator** *(after the voice finishes)*: "Question to spoken reply: [say the stopwatch number]. That is transcription, three AI suggestions, one blink, and the voice. Nothing was spoken until [Operator] chose it."
- **Audience should notice:** the partner just talked, no typing. Three different meanings, top one pre-highlighted, the voice sounds natural, and the person (not the AI) triggered it.
- **If no suggestions after about 8 s:** narrator says "Live AI is slow on this network." Operator waits another 5 s, then taps/blinks **None of these** (or helper taps **Quick phrases, Please give me a moment**).
- **If the partner line is wrong or missing:** helper taps **Stop listening**, partner types the line under **Type or record instead**. Narrator: "The hall is noisy, so we're typing the partner's line."
- **If the blink is missed:** operator tries once more, slower and deliberate. After two misses, the helper taps the highlighted card (Touch works on every screen). Narrator: "Same flow, by touch."
- **If no sound:** narrator: "Audio is off in this room, the app still shows the sentence." Helper checks volume or switches to **More tools, Controls, Voice** (basic device voice).

### 0:50-1:15 Beat 2: a follow-up *(quiet, then narrator talks)*
**Partner** *(as soon as the voice finishes; wait for it to stop)*: "What time should we meet?"
**Operator:** raises eyebrows **once** (hold about 0.5 s) to move the highlight to the second suggestion, then **one long blink** to speak it.
**Narrator:** "One raise moves one step. A long blink chooses. Normal blinking does nothing."
- **Audience should notice:** the highlight moves exactly one card per raise, and the natural blinks in between do not trigger anything.
- **Bonus (only if rehearsed twice with no problems):** the partner asks the follow-up while the app is still speaking. The app answers right after it finishes. Do not do this live if it was not clean in rehearsal.
- **If a raise is not detected:** hold 0.5 s again, slightly more pronounced, no more than twice. Then blink on the top suggestion and move on. Narrator: "Eyebrow detection is lighting dependent. The top choice is already ready."
- **If the highlight overshoots:** pick whatever is highlighted if it is acceptable, otherwise raise to **None of these** and continue.

### 1:15-1:55 Beat 3: control, Guide my response then Disagree *(narrator talks first, then quiet until the voice finishes)*
**Narrator:** "The AI is not in charge. [Operator] can steer it. I'll stay silent while they work." *(then quiet)*
**Partner:** "Let's skip dinner and just stay in. Okay?" **Partner then stays silent.** If the partner speaks while Operator is in a menu, the app jumps to new suggestions and the demo loses its place.
**Operator:** when suggestions appear, raise eyebrows ____ times to **Guide my response**, long blink; raise ____ times to **Disagree**, long blink. New suggestions all disagree; top one is highlighted. Long blink to speak it.
**Narrator** *(only after the voice finishes; any voice during the menus is heard as a partner line)*: "Guide my response, then Disagree. Every option now disagrees. The AI offers words, but the person chose the direction and the sentence."
- **Audience should notice:** the person rejects the default and changes the meaning of every suggestion, and the spoken reply disagrees.
- **If the menu navigation goes wrong:** the helper taps **Guide my response** and **Disagree** directly. Narrator: "Same screens, same control, touch instead of face."
- **If a stray voice jumps to new suggestions mid-menu:** helper taps **Stop listening**, operator continues by blink or touch. Narrator: "The room picked up a voice, so I'm turning listening off."
- **If time is running out (past 1:55):** skip speaking the disagree reply and go to Beat 4 now.

### 1:55-2:25 Beat 4: someone leans in (multi-face) *(narrator talks, then quiet)*
**Narrator:** "In a crowded room, other faces appear. Would one of you lean in beside [Operator], and please don't speak? The app follows the central face that has been in view longest." *(invite a judge; quiet)*
**Partner:** "Can I get you anything to drink?" *(partner is a safe second leaning face if no judge volunteers: practice it)*
**Operator:** one **long blink** on the top suggestion (or one raise then blink).
- **Audience should notice:** a second face is next to the operator and the app does not pause or lose the operator.
- **Honest note:** this is unit-tested and **not yet verified live**. If rehearsal at 3:30 shows it is flaky, **cut this beat** and give its 30 s to Beat 3 or the close.
- **If "Tracking lost: Paused" appears:** operator looks at the screen, the second person moves back, operator long-blinks on **Resume**. Narrator: "It paused because it lost tracking. That's the safe behavior, and one blink resumes it."
- **If the leaning judge speaks and it becomes a partner line:** treat it as the follow-up, or helper taps **Stop listening** and the partner types the line.

### 2:25-3:00 Close: privacy and what's next *(narrator talks)*
**Narrator:** "Privacy: camera images stay on the iPad and only eyebrow and eye movement is measured. Nothing is recorded. The partner's speech is sent for transcription to make suggestions, and the chosen sentence goes to a voice service. Nothing is said unless the person chooses it. This is an engineering prototype built today: it has not been tested with AAC users, it is not clinically validated, and our gesture reliability is not measured yet. The next step is to work with AAC users and specialists. Thank you."
- **Honest wording:** say "camera images stay on the iPad by design". The network check proving it has not been run.
- Do not claim: instant, first, faster than typing, reliability numbers, clinical, or offline (see below).

## If it goes wrong (any time)

Rule: **switch, then say what happened.** Never let a fallback pass silently.

| Failure | Do | Say |
| --- | --- | --- |
| Noisy hall: wrong voices become partner lines | Helper taps **Stop listening**. Partner types under **Type or record instead**. Partner stands closer. | "The room is loud, so the partner's line is typed." |
| Face lost, "Paused" repeats | Operator looks at the screen, moves back to arm's length, long blink on **Resume** (or helper taps **Resume**). | "It paused because it lost my face. That's the safe behavior." |
| Gestures unreliable | Helper taps answers directly (Touch). If the whole session is bad, restart in **Touch mode**. | "Gestures need good light. The screens and control are identical by touch." |
| No sound / hall too loud | Volume up, silent mode off. Or **More tools, Controls, Voice** for the basic device voice. | "The natural voice isn't carrying here, so this is the basic voice." |
| Natural voice or network error | Retry once. Then basic voice, or **Quick phrases** (no AI needed). | "The voice service is unavailable, so this is the basic device voice." |
| Live AI slow (over about 8 s) or fails | Wait, then **None of these**. If it fails, restart with **Fixture demo** (labeled scripted suggestions). | "Live AI is unavailable, so this is our labeled fixture set. The badge says Fixture demo." |
| App misbehaves or crashes | Relaunch **Still Here**. If still broken, open **https://api-production-18038.up.railway.app** in Safari (private tab). This needs the access code (typed before going on stage), an **Allow** for camera and microphone, and the Enable audio tap, so it is slower. | "Switching to the web version of the same app." |
| Second face breaks tracking | Skip Beat 4. | "We'll skip that. It's an area we're still testing." |

## Never say (short list)

| Don't say | Say instead |
| --- | --- |
| "First", "only", "nobody has done this" | "We built on a known idea. Our contribution is the combination." |
| A reliability, accuracy or time number you did not measure today | "Not measured", or the stopwatch number you just recorded |
| "Instant", "faster than typing" | "That's our hypothesis. We timed this one run." |
| "Clinically validated", "tested with ALS or AAC users" | "Not tested with AAC users. That's the next step." |
| "Camera never leaves the iPad" as verified | "By design, the camera stays on the iPad." |
| "Zero retention", "OpenAI keeps nothing" | "We make no zero-retention claim." |
| "Works offline" | "Offline is not verified." |
| "Multi-face is proven" (unless it worked in rehearsal and on stage) | "It's tested in code, and we're checking it live." |
| "Gives a voice to the voiceless", "trapped", "victims" | "People who use AAC have plenty to say." |

## Rehearsal log (3:30 PM)

Fill this in during the run-through. Delete what does not apply and update PRESENTATION_NOTES.md after.

- Stopwatch, partner finishes to voice starts: ____ s over ____ runs. Quote the range, not a single best run.
- Narrator mic leak at the planned spot: yes / no. Moved to: ______
- Raises to Guide my response: ____ ; to Disagree: ____
- Multi-face beat: worked / paused / cut. Who leaned in: ______
- Hall noise plan: type partner lines if more than 1 wrong transcript in 3.
- Total time: ____ (target 3:00; cut Beat 4 first if over).
