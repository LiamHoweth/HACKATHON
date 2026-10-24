# Demo script

Rehearse this against the actual build and adjust it to what is verified. Every profile and partner line is fictional and synthetic. **Unless live AI has been verified and is enabled, the source badge reads "Fixture demo". Say so aloud.**

## Before the demo (2 minutes)

- [ ] `npm run dev` is running. The browser is at `http://localhost:3000`, at 100% zoom, with sound on and a test voice heard.
- [ ] Setup: input mode = switch scanning (single key) or keyboard; AI = Fixture demo (or Live if verified); microphone off; session adaptation off unless showing it.
- [ ] The fictional demo profile, if used, is visibly labeled fictional.
- [ ] Know the switch key and the Pause/Stop controls.

## Primary demo (90–120 seconds)

| # | Action | Say |
| --- | --- | --- |
| 1 | Point to the status bar: input mode, mic off, source badge | "The switch drives everything. The mic is off. These suggestions come from our labeled fixture set," *(or "live AI" only if verified)* |
| 2 | Partner types: *"Are you coming to dinner tonight?"* | "My partner types a question. It shows up exactly as typed." |
| 3 | Three suggestions appear | "Three different possibilities. Nothing has been said yet." |
| 4 | Scan to **None of these — new suggestions** and select | "None of these fit, so I reject them. That isn't stored as an opinion, just 'not these, for this question'." |
| 5 | **Guide my response → Choose a direction → Suggest an alternative** | "I know what I want: a different plan." |
| 6 | Select one alternative | "Now I review the exact sentence." |
| 7 | Pause briefly on review, then select **Speak** with a fresh press | "Speaking takes a separate, deliberate confirmation. One press can't do both." |
| 8 | App speaks; history shows delivery status | "History records exactly what was said and whether playback completed." |
| 9 | **Start a conversation → Ask someone a question** → choose → review → Speak | "I can start conversations too, not just answer." |

## Longer version (add if time allows)

- **Quick interruption:** open **My words**, type a few letters, then **Quick phrases → "Please give me a moment."** → review → Speak. Return to My words and show the draft is intact.
- **Staged turn:** while reviewing, the partner types a second question. A "waiting" notice appears and the review is unchanged. Open **Waiting** to answer it later.
- **Change wording:** on review, choose **Change wording → Same idea, shorter**.
- **Preferences:** open Preferences and show a manually approved "Short replies" setting, the confirm step, and Pause personalization. Show persistence across reload only if that was verified.
- **Unrehearsed question:** ask a judge for an ordinary question and type it in. Do not force it into a script.

## Transparent fallbacks

| Failure | Fallback | Say |
| --- | --- | --- |
| Microphone/transcription unavailable | Partner types instead (the primary path anyway) | "We'll use typed input." |
| Switch scanning misbehaves | Switch input mode to keyboard/pointer | "Switching to keyboard; same guarded path." |
| Live AI fails or is not configured | Fixture demo, or Local only: Quick phrases + My words | "The AI is unavailable, so I'm using my own words. That always works." |
| Speech not audible | Point to the on-screen message and delivery status | "Audio failed. The app shows the text and marks it failed instead of pretending it was heard." |
| App crashes | Restart `npm run dev`. If a backup recording is used, label it "recorded earlier" | "This is a recording from earlier today." |

## Do not say

- That AAC users tested it, or that it is clinically validated.
- Any speed/effort number not in [TEST_RESULTS.md](TEST_RESULTS.md).
- That the AI "understands" the user or knows what they mean.
- That it works offline, or that the voice is local, unless verified.
