# Demo script: hands-free iPad demo

Rehearse this against the actual build on the actual iPad and keep only the steps that are verified. Every profile and partner line is fictional and synthetic. **Say the source aloud: "Live AI" or "Fixture demo", whichever the badge shows, and say which voice spoke.** Status at 12:05 CT: eyebrow NEXT, the preview, iPad audio, and ElevenLabs are in progress and **not iPad-verified**, and ElevenLabs is **not configured**. This script is a plan until the iPad trial in [TEST_PLAN.md](TEST_PLAN.md#ipad-acceptance-trial-24) is recorded.

## Roles

- **Operator:** sits facing the iPad (landscape, front camera at eye level). Hands stay visibly in their lap after setup.
- **Partner:** asks the question. Typed input on a separate keyboard is the default; spoken input only if transcription was verified on the iPad. The partner never selects the operator's reply.
- **Helper (setup only):** taps the camera permission prompt and **Enable Audio / Test Voice** if needed. Say so.

## Before the demo (3 minutes)

- [ ] Railway HTTPS URL open in iPad Safari, redeployed with the final build, access code entered. iPad volume up, silent mode off, test voice heard.
- [ ] Even, front-facing light. No second face in frame. Glasses noted.
- [ ] Setup: consent → helper allows the camera → calibration (neutral brows, 500 ms raises, natural blinks, long blinks) → practice select → separate practice confirm → **Enable Audio / Test Voice** tapped once.
- [ ] Status shows `Face detected` and, **only if truly ready**, `ElevenLabs: ready`. Otherwise it shows the real state.
- [ ] AI source chosen: Live (consent given) or Fixture. Microphone off unless verified. Fictional profile labeled fictional.
- [ ] Fallback ready: you know how to switch to auto-scan + blink, keyboard/switch, or touch, and how the basic device voice is offered.

## Primary demo (90–120 seconds)

| # | Time | On screen | Operator / partner action | Say |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | iPad landscape. Small live self-view top right with `Face detected`. Source badge. Voice status | Operator lowers hands | "What happens when you know what you want to say, but entering it takes longer than the conversation allows? From here, it's two facial gestures. The camera stays on the iPad." |
| 2 | 0:10 | Partner text appears exactly as typed | Partner types: *"Are you coming to dinner tonight?"* | "My partner asks a question." |
| 3 | 0:20 | Three replies. Highlight on the first. Brow progress ring fills while raised | Operator raises eyebrows for half a second, relaxes, raises again | "Eyebrows up for half a second moves one step. Holding longer doesn't skip ahead. Nothing moves on a timer." |
| 4 | 0:35 | `Blink detected — Selected` | Long blink on **None of these** | "None of these fit, so I reject them. That's not stored as an opinion." |
| 5 | 0:45 | Guide menu | Eyebrow to **Guide**, long blink, then eyebrow to **Suggest an alternative**, long blink | "I know the direction I want: a different plan." |
| 6 | 1:00 | New alternatives | Eyebrow to one reply, long blink | "The card I chose is the one highlighted when my eyes closed." |
| 7 | 1:10 | Review: the whole sentence, highlight on **Cancel** | Eyebrow raise to **Speak**, then a **new** long blink | "Nothing is spoken yet. Review starts on Cancel. Speaking takes a second, separate blink." |
| 8 | 1:20 | `Generating natural voice`, then `Speaking`. History shows delivery status | — | "That's ElevenLabs saying exactly the sentence I confirmed, and nothing else." *(Only if it was heard. Otherwise use the fallback row.)* |
| 9 | 1:35 | Start a conversation | Eyebrow + blink through **Start a conversation → Ask someone a question** → review → Speak → new blink | "I can start conversations too, not just answer." |
| 10 | 1:55 | — | — | "AI offers possibilities. The person keeps authorship. Next is evaluation and co-design with AAC users and specialists." |

### Optional (longer slot)

- **Face-loss recovery:** the operator turns away mid-raise. Status shows tracking lost, paused. Nothing moves or is selected. They return, and a deliberate blink on **Resume** continues.
- **Stop:** a long blink while speaking stops playback and does not select anything else.
- **Unrehearsed question:** a judge asks an ordinary question and the partner types it. Do not force it into the script.

## Transparent fallbacks (label every one)

| Failure | Fallback | Say |
| --- | --- | --- |
| Eyebrow raises missed or falsely detected | Switch to **auto-scan + blink**. Same screens, same guarded path, prepared message kept | "Eyebrow detection isn't reliable in this light, so the highlight now moves on a timer and I still blink to select. The eyebrow path is experimental." |
| Blink calibration fails | Keyboard/switch scanning or touch | "Blinks aren't separating cleanly here. Same flow with a single switch." |
| Face lost repeatedly | Reposition, Resume, or switch inputs as above | "It paused because it lost my face. That's the safe behavior." |
| ElevenLabs not configured, quota, or network error | The app shows the exact text and offers **Speak with basic device voice**, which needs a fresh review and confirmation | "The natural voice is unavailable. This is the basic device voice, and I had to confirm again." |
| `Audio blocked` on the iPad | Helper taps Enable Audio again, or point to the on-screen text | "Safari blocked the audio, so it isn't fully hands-free here. The app says so instead of pretending." |
| Microphone/transcription unavailable | Partner types (already the default) | "We'll use typed input." |
| Live AI fails | Fixture demo, or Quick phrases + My words | "The AI is unavailable, so this is our labeled fixture set *(or my own words)*." |
| App crashes | Restart. Any backup recording is introduced as recorded earlier | "This is a recording from earlier today." |

## Do not say

- That eyebrow or blink detection is accurate, reliable, or clinical, or give any number not in [TEST_RESULTS.md](TEST_RESULTS.md). Eyebrow reliability is **not measured** until the iPad trial is recorded.
- That frames never leave the iPad as a verified fact, unless the network-log check (SYS-13) is recorded. "The design keeps the camera on the iPad" is fine.
- That ElevenLabs keeps nothing. We don't know their retention for our plan.
- That setup is hands-free if a helper tapped Allow or Enable Audio.
- That the voice is the user's own or cloned. It is a prebuilt AI voice.
- That AAC users or people with ALS tested it, or that the AI understands what the user means.
- That it works offline.
- Anything about the iOS client. It is not part of the demo.
