# Demo conversations for the Still Here pitch

Companion to [REHEARSAL.md](REHEARSAL.md) (beats, failures, never-say list). Timings come from [evidence/E2E_LATENCY.md](evidence/E2E_LATENCY.md): Mac to deployed server, synthetic speech, not iPad-measured. Concrete yes/no or choice questions put suggestions on screen in about 2.5-3.7 s. Open-ended questions take 7-9 s. Quote only what the stopwatch shows today. Live replies are not scripted, so the operator takes whatever is on screen; the wording below is an example.

Partner rules: one short sentence, clear voice, then silent. Filler ("uh huh", "mm-hmm") is ignored; "yeah", "sure", "okay" count. Narrator stays quiet while the iPad listens.

## 1. Recommended 3-minute run (5 exchanges)

| # | Partner says (exact) | Operator does | Shows | Audience should notice | Expected |
|---|---|---|---|---|---|
| 1 | "Do you want to grab coffee after class?" | Wait. Top reply is highlighted. One long blink. | Hands-free listening, top-2 replies, one-blink speak, natural voice "Will" | Nobody touched the iPad. The reply sounds like a person. Nothing is spoken until the blink. | Suggestions 2.5-3.7 s after the partner stops, voice right after the blink. About 30 s. |
| 2 | "Are you coming to dinner tonight?" Pause about 3 s, then "It's at seven." | Do not choose yet. When the board refreshes, hold eyebrows up to glide to the second reply, relax, long blink. | Follow-up merge (within 20 s), hold-to-move | The question and the new detail are joined, the highlight returns to the top, and the person never loses the question. | Refresh about 3 s after the second line. About 40 s. |
| 3 | "Want to watch a movie tonight?" | Raise to **Guide my response**, long blink. Raise to **Disagree**, long blink. Long blink on the top reply. | Person steers meaning; AI only offers words | Every option now disagrees. The person chose the direction. | Disagree set about 2-4 s. About 40 s. Raise counts: see rehearsal log. |
| 4 | "Can I get you anything to drink?" (a judge leans in next to the operator, silent) | Long blink on **None of these** for new ideas, then blink on a reply. | Multi-face lock, "None of these" | A second face appears and tracking holds. New ideas mean different things, not rewordings. | About 35 s. **Cut first if tracking is flaky or time is over.** |
| 5 | "How was your day?" (everyone quiet and waiting) | Keep eyebrows up to reach **Other ways to answer**, long blink, pick **Rough day**, long blink on a reply. If you overshoot, brief jaw drop goes back one. | Branching by direction, hold-to-move, jaw drop = back | Directions, not only sentences. Replies are ready when the screen opens. | Open-ended: 7-9 s wait. Narrator says "open-ended questions take the AI longer". About 40 s. |

Total is about 3:05 to 3:30 with narration. Order matters: the fast concrete questions come first, the slow open-ended one goes last. If a hard 3:00, drop exchange 4. Beat 5 (exchange 5) is [deployed, unit-tested; NOT YET tested by a person on the iPad], so rehearse it twice before relying on it.

## 2. Extra conversation starters

**Hands-free listening and one-blink speak (fast, reliable)**
- "Do you want some pizza tonight?" Concrete yes/no with an obvious top reply.
- "Are we still on for the study group?" Short, clear, easy for the transcriber.
- "Do you want to go to the game on Saturday?" Choice with a natural yes, no or "what time".

**Top-2 and "Other ways to answer" (branching)**
- "Do you want to get dinner or just order in?" Two clear options map to the two likely replies.
- "What are you doing this weekend?" Direction cards are easy to read (plans, nothing, you first). Open-ended, so expect a longer wait.

**Hold eyebrows to keep moving and jaw drop = back**
- "Which sounds better, pizza or tacos?" Several different replies; hold up to travel, jaw drop to step back one.

**Follow-up merge**
- "Are you free after class?" then "I was thinking the library." One idea in two sentences, merged inside 20 s.
- "Want to get coffee?" then "My treat." Short second line, visible refresh.

**None of these and Guide my response**
- "Do you want to go for a walk?" Guide, then Agree or Disagree gives a clear contrast with the first reply.
- "Want to do homework together tomorrow?" Easy second round of new ideas (for example a different time).

**Quick phrases and My words** (any question works; show after a partner line)
- Partner: "Can I get you anything?" Operator opens **Quick phrases** and speaks "Please give me a moment." Works with no AI.
- My words: spell two or three short words only (for example "yes please"). Slow by design, so only if there is time.

**Stop by long blink**
- Any reply that takes a few seconds to say. Operator long-blinks during playback to cut it off. Narrator: "A long blink during speech stops it."

**Multi-face**
- "Can I get you anything to drink?" Simple one-line question while a judge leans in. The judge stays silent, because their words would become a partner line.

## 3. Lines to AVOID

- **Too open-ended as an opener:** "How was your day?" first, "Tell me about yourself", "What do you want to do with your life?" (7-9 s or more).
- **Sensitive or medical:** medication, doctor, pain, mood, health. The app deliberately offers no "yes" on medication questions, which looks like a bug on stage.
- **Names, places, or shared history:** "Did you see Alex at the library?", "Remember last summer?" The AI can misattribute or invent memories.
- **Jokes or sarcasm:** "You're coming, right?", "Nice weather we're having." Tone does not survive transcription.
- **Compound questions:** two questions in one breath ("Are you coming and what time?") confuse the replies.
- **Pure filler and long monologues:** "uh huh" is ignored, and a long speech with pauses over 0.65 s may split.
- **Narrator or hall chatter near the iPad.** The mic hears everyone. Never count aloud.

## 4. 30-second fallback run (Fixture demo mode)

Start in **Fixture demo** (labeled on screen). The same lines give known, topic-matched replies in about 0.4 s, so say "this is our labeled fixture set" first.

| Partner says | Known top replies (fixture) | Operator |
|---|---|---|
| "Are you coming to dinner tonight?" | "Yes, that sounds good." / "Not right now, thanks." / "What are we having?" | One blink on the top reply. |
| "Want to watch a movie tonight?" | "Yes, let's watch something." / "I'll pass this time." / "What did you have in mind?" | **Guide my response**, **Disagree** (set: "No, I don't think so." and similar), blink. |
| "Can I get you anything to drink?" | "Yes, please." / "No, I'm okay for now." / "What were you thinking of?" | **None of these** for a different meaning, blink. |

Other fixture-safe lines: "What are your plans for the weekend?", "What do you think of the game?", "Do you want to go for a walk?" (food, screen, help, plans, opinion and outside sets). Avoid "coffee" here, since it falls back to the generic set. Say "Fixture demo" out loud: the replies are scripted, only the control is live.

## 5. If it goes wrong

| Problem | Do | Say |
|---|---|---|
| No suggestions after about 8 s | Wait 5 s more, then **None of these** or **Quick phrases** | "Live AI is slow on this network." |
| Wrong partner transcript or hall noise | Helper taps **Stop listening**, partner types the line | "The room is loud, so the partner's line is typed." |
| Gesture missed | Retry once, slower. After two misses the helper taps the card | "Same flow, by touch." |
| Highlight overshoots | Jaw drop back, or pick what is acceptable, or **None of these** | "Jaw drop goes back one." |
| Tracking lost or Paused (second face) | Look at the screen, second person steps back, blink **Resume**. Skip exchange 4 | "It paused because it lost tracking. That is the safe behavior." |
| No sound | Volume up, silent mode off, or More tools, Controls, Voice | "Audio is off here, the screen shows the sentence." |
| Live AI fails | Restart in Fixture demo and run section 4 | "Live AI is unavailable. This is our labeled fixture set." |
