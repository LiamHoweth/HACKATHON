# Demo script: hands-free blink demo

Rehearse this against the actual build and keep only the steps that are verified. Every profile and partner line is fictional and synthetic. **Say the source aloud: "Live AI" or "Fixture demo", whichever the badge shows.** Status at 11:30 CT: blink is in progress and unverified, so this script is a plan until the reliability gate in [TEST_PLAN.md](TEST_PLAN.md#blink-reliability-gate) is recorded.

## Roles

- **Operator:** sits facing the laptop webcam. Hands stay visibly in their lap after setup.
- **Partner:** types questions on a separate keyboard (typed input is an allowed partner fallback). The partner never clicks the operator's reply.
- **Helper (setup only):** clicks the browser's camera permission prompt if needed. Say so.

## Before the demo (3 minutes)

- [ ] App running (local `npm run dev` or the redeployed Railway URL with the access code). 100% zoom, sound on, test voice heard.
- [ ] Even, front-facing light on the operator. Camera at eye level. No second face in frame.
- [ ] Setup: **Use eye blinks** → consent → helper grants permission → calibration completed, **including the practice select and separate practice confirm**. Scan speed set (default 1.5 s/target).
- [ ] AI source chosen: Live (consent given) or Fixture. Microphone off unless it was verified. Fictional profile labeled fictional.
- [ ] Fallback ready: you know how to switch to keyboard/switch scanning, and which key is the switch.

## Primary demo (90–120 seconds)

| # | On screen | Operator / partner action | Say |
| --- | --- | --- | --- |
| 1 | Status line: blink control, face tracked, camera local, mic off, source badge | Operator lowers hands | "Everything from here is eyes only. The camera runs in the browser. These suggestions are *(live AI / our labeled fixture set)*." |
| 2 | Partner text appears exactly as typed | Partner types: *"Are you coming to dinner tonight?"* | "My partner types the question." |
| 3 | Three replies. The highlight advances on its own | Operator watches | "The highlight moves by itself. An ordinary blink does nothing. A deliberate, longer closure selects." |
| 4 | Status shows Closing, then Selected | Blink on **None of these** | "None fit, so I reject them. That is not stored as an opinion." |
| 5 | Guide menu | Blink on **Guide**, then **Suggest an alternative** | "I know the direction I want: a different plan." |
| 6 | New alternatives | Blink on one reply | "The card I chose is the one highlighted when my eyes closed, even if the highlight would have moved on." |
| 7 | Review: exact sentence, highlight starts on **Cancel** | Operator waits for the highlight to reach **Speak**, then blinks again | "Speaking takes a second, separate blink. One blink can't do both." |
| 8 | App speaks. History shows delivery status | — | "It says exactly that sentence and records whether playback finished." |
| 9 | Quick phrases or Start a conversation | Blink on **Start a conversation → Ask someone a question** → select → review → blink on Speak | "I can start conversations too, not just answer." |

### Optional (longer slot)

- **Face-lost recovery:** the operator turns away mid-closure. Status shows "Face lost, paused". Nothing is selected. They return and blink on **Resume**.
- **Quick interruption:** while in My words, blink **Quick phrases → "Please give me a moment."** The draft survives.
- **Unrehearsed question:** a judge says an ordinary question and the partner types it. Do not force it into the script.

## Transparent fallbacks (label every one)

| Failure | Fallback | Say |
| --- | --- | --- |
| Calibration fails, or blinks are missed or falsely detected | Switch to keyboard/switch scanning. The same screens and the same guarded path. The prepared message is kept | "Blink detection isn't reliable in this light. Here is the same flow with a single switch. Blink is experimental." |
| Face lost repeatedly | Reposition, Resume, or switch inputs as above | "It paused because it lost my face. That's the safe behavior." |
| Microphone/transcription unavailable | Partner types (already the primary path) | "We'll use typed input." |
| Live AI fails | Fixture demo, or Quick phrases + My words | "The AI is unavailable, so this is our labeled fixture set *(or my own words)*." |
| Speech not audible | Point to the on-screen text and delivery status | "Audio failed. The app shows the text and marks it instead of pretending it was heard." |
| App crashes | Restart. Any backup recording is introduced as recorded earlier | "This is a recording from earlier today." |

## Do not say

- That blink detection is accurate, reliable, or clinical, or give any number not in [TEST_RESULTS.md](TEST_RESULTS.md).
- That frames never leave the laptop, unless the network-log check (SYS-13) is recorded.
- That setup is hands-free if a helper granted permission.
- That AAC users or people with ALS tested it, or that the AI understands what the user means.
- That it works offline, or that the voice is local, unless verified.
- Anything about the iOS client. It is not part of the demo.
