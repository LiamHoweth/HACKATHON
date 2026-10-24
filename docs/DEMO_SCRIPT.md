# Demo script: hands-free iPad (90–120 s)

**Status at 12:20 CT (commit `5de1a57`):** every gesture step below is implemented and passes unit and synthetic-frame tests, but **none has been run on a physical iPad or a real face**. ElevenLabs is implemented, but **live verification is blocked: `ELEVENLABS_API_KEY` is not configured**. Until the iPad trial and a live voice line are recorded in [TEST_RESULTS.md](TEST_RESULTS.md), this is a rehearsal plan, not a verified demo. Labels in quotes are the exact on-screen text from `src/core/targets.ts` and `src/components/*`.

Rules for whoever presents: the profile "Sam (fictional)" and every partner line are fictional. **Say the source aloud** ("Live AI" or "Fixture demo", whatever the status bar shows) **and say which voice spoke.** If anything fails, switch to the fallback and say so.

## Roles

- **Operator:** faces the iPad (landscape, front camera at eye level, about an arm's length). Hands in lap after setup.
- **Partner:** types the question in the right-hand "Conversation partner" panel ("Type what you said" → "Send"). Spoken input ("Record speech") only if it was verified on the iPad that day.
- **Helper (setup only):** taps Safari's camera prompt and "Enable audio & test voice". Say that a helper did this.

## Setup (before the clock starts, about 3 minutes)

1. iPad Safari → Railway URL (redeployed with the final build). Volume up, silent mode off. Auto-Lock set to Never (the app shows "For hands-free use, set Auto-Lock to Never").
2. "Set up this session": "How will you choose?" → "Use eyebrows + blinks" (Recommended). Suggestions: "Live AI" (consent box + "Access code for this deployment") or "Fixture demo (labeled scripted suggestions)". Profile: "Sam (fictional)".
3. Voice panel → **"Enable audio & test voice"** (one real tap). Expect "Audio ready". If ElevenLabs is configured you should hear the test line; if the panel says "Not configured on this server — the basic device voice will be used, and it will be labeled.", the demo uses the basic voice and you say so.
4. "Next: set up eyebrow + blink control" → "Turn on camera" (helper taps Allow) → Framing → "Relax brows" → "Raise brows" → "Practice Next" → "Look normally" → "Natural blinks" → "Deliberate blinks" → "Check settings" → "Accept and practice" → "Practice select" → "Practice confirm" → "Eyebrow + blink control is ready". If calibration says it could not tell signals apart, use a fallback below.
5. On the board, check: top-right self-view "Live preview — not recorded", feedback "Ready — raise eyebrows to move", status bar "Eye gestures" ready, "Mic: Off", "Voice: Natural" (this only means configured; say "natural voice" aloud only if the test line was heard) or "Voice: Basic device voice".

## Gesture budget

One NEXT = brows up ≥ 0.5 s, then relax (about 1.5–2 s per step with release and cooldown). One SELECT = eyes closed ≥ the calibrated minimum (600 ms default, under 2.5 s), then open. Disabled items are skipped. The highlight starts on the first item of each screen and wraps.

Board order while choosing: card 1, card 2, card 3, "None of these — new suggestions", "Guide my response", "Quick phrases", "My words", "More tools".

**Menu order is in flux.** Counts here match commit `5de1a57`. Uncommitted wave-3 changes in `src/core/targets.ts` (12:25 CT) keep the board order above (a voice-problem pair, if shown, sits after "None of these") but reorder "More tools" to "Pause", "Start a conversation", "Controls", "History and waiting (N)", "Preferences and memory", "Keep this question for later", "Back", and drop the scan-speed items in eyebrow mode. Re-count the optional and fallback paths against the final build before rehearsal.

## Primary script

| # | Clock | Operator gestures (exact count) | On screen | Say |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | Hands in lap | Board: "No active question". Self-view top right | "What happens when you know what you want to say, but entering it takes longer than the conversation allows? From here on, it's two facial gestures. The camera view is live only and not recorded." |
| 2 | 0:10 | — | Partner types *"Are you coming to dinner tonight?"* → "Send". "Partner asked:" then "Finding possible responses…" then three cards | "My partner asks a question. The AI offers three different possibilities. It chooses nothing." |
| 3 | 0:20 | **1 raise** (hold, relax) | Progress bar, then "Eyebrow raise detected — Next"; highlight on card 2 | "Eyebrows up for half a second moves one step." |
| 4 | 0:25 | Keep brows up about 2 s, then relax | Highlight stays on card 2; "Relax your eyebrows" | "Holding longer doesn't skip ahead. Nothing moves on a timer." |
| 5 | 0:32 | From card 2: **2 raises** (card 3, then "None of these — new suggestions"), then **long blink** | "Blink detected — Selected"; new cards | "None of these fit. That rejects them for this question only; it isn't stored as an opinion." |
| 6 | 0:45 | From card 1 (check in rehearsal where the highlight lands after new suggestions): **4 raises** to "Guide my response", **long blink**. Highlight on "Choose a direction": **long blink**. On the direction list ("Agree", "Disagree", "Ask a question", "Suggest an alternative"…): **3 raises**, **long blink** | Board refreshes with alternatives (fixture: "Could we do it tomorrow instead?" …); "Guidance:" shows the direction | "I know the direction I want: a different plan. The person steers; the AI follows." |
| 7 | 1:10 | Raise to the wanted card (0–2 raises), **long blink** | "Review your message": the full sentence, "Source:", "Answering:". Highlight on **"Cancel"** | "Nothing is spoken yet. Review shows the exact text and starts on Cancel. The card I got is the one highlighted when my eyes closed." |
| 8 | 1:20 | **1 raise** to **"Speak"**, then a **new long blink** | Hint "Raise eyebrows to move to Speak • New long blink speaks it"; then "Generating natural voice…" → "Speaking" | "Speaking takes a second, separate blink." |
| 9 | 1:30 | — | Audio plays. History shows delivery status | *Only if heard:* "That's ElevenLabs saying exactly the sentence I confirmed and nothing else." *Basic voice:* "That's the basic device voice; the natural voice isn't configured here." |
| 10 | 1:40 | — | — | "AI offers possibilities. The person keeps authorship. Next is evaluation and co-design with AAC users and specialists." |

Timing check: steps 3–8 need about 14 raises and 6 long blinks. At 2 s per raise and 2 s per blink that is about 40 s of gestures. Rehearse twice and trim narration, not gestures. If the rehearsal runs past 2:00, drop step 5 ("None of these") and go straight to Guide (step 6 is then 4 raises from card 1).

### Optional, if the slot is longer

- **Stop:** while "Speaking", the only item is "Stop speaking"; one long blink stops playback ("Speech stopped").
- **Start a conversation:** "More tools" (last board item) → long blink → raise to "Start a conversation" → long blink → "Ask someone a question" → long blink → cards → review → "Speak" → new blink. If the board shows "Start a conversation" as its first item (no active question), select it directly.
- **Face loss:** the operator turns away mid-raise. "Tracking lost — Paused". Nothing moves or is selected. They return; a deliberate long blink on "Resume" continues.
- **Unrehearsed judge question:** the partner types it. Don't force it into the script.

## Transparent fallbacks (rehearse each once; label every one aloud)

| Failure | Fallback (exact labels) | Say |
| --- | --- | --- |
| Eyebrow raises missed or false | **Touch:** tap the card directly; touch works in every mode. Or **auto-scan + blink:** "More tools" → "Controls" → "End session…" → "End session and clear the conversation" → choose "Auto-scan with blink" → "Start with saved calibration" (or recalibrate) | "Eyebrow detection isn't reliable in this light, so I'm tapping / the highlight now moves on a timer and I still blink to select. The eyebrow path is experimental." |
| Blink calibration fails | Setup → "Touch" (or "Keyboard or switch") → "Start session" | "Blinks aren't separating cleanly here. Same screens, same review and confirmation, by touch." |
| "Tracking lost — Paused" repeatedly | Reposition; long blink on "Resume", or a helper taps "Resume" | "It paused because it lost my face. That's the safe behavior." |
| ElevenLabs not configured, quota, or network error | Board offers "Say it with the basic device voice" → new review → "Speak" → new blink. Or before the demo: "More tools" → "Controls" → "Voice: natural (ElevenLabs)" switches to "Voice: basic device voice" | "The natural voice is unavailable. This is the basic device voice, and I had to confirm again." |
| "Audio blocked — tap Enable audio" | Helper taps "Enable audio"; the sentence stays on screen as text | "Safari blocked the audio, so it isn't fully hands-free here. The app says so instead of pretending." |
| Live AI fails ("Suggestions could not be loaded.") | "Try again"; or restart with "Fixture demo (labeled scripted suggestions)"; or "Quick phrases" / "My words" | "The AI is unavailable, so this is our labeled fixture set *(or a saved phrase / my own words)*." |
| Microphone or transcription unavailable | Partner types (already the default) | "We'll use typed input." |
| App or Safari crashes | Reload. Any backup video is introduced as recorded earlier | "This is a recording from earlier today." (Only if one actually exists.) |

## Do not say

- Any accuracy, reliability, or latency number not in [TEST_RESULTS.md](TEST_RESULTS.md). Eyebrow and blink reliability on a real face are **not measured**.
- That the natural voice works, sounds natural, or is fast, unless it was heard on this iPad today.
- That camera frames never leave the iPad as a verified fact until the network check (SYS-13) is recorded. "By design, the camera stays on the iPad" is fine.
- That ElevenLabs keeps nothing. Retention for our plan is not reviewed.
- That setup is hands-free when a helper tapped Allow or "Enable audio & test voice".
- That the voice is the user's own or cloned. It is a prebuilt AI voice.
- That AAC users or people with ALS tested it, or that it works offline.
- Anything about the iOS client. It is not part of the demo.
