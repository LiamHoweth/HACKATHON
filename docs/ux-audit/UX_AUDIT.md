# iPad UI/UX audit (2026-10-24, about 30 minutes)

Captured on the demo iPad Air 13" in the installed app while the team walked through setup, the main board, quick phrases and a live conversation. That was 79 frames, of which six representative ones are in `before/`. Calibration was skipped because a calibration was already saved. Patterns are borrowed from Google Look to Speak (few big choices, almost no text), Vocable (a large highlight on what is being selected), Apple Switch Control (one instruction at a time), and Proloquo2Go/TD Snap (a consistent action row). No assets or branding were copied.

## Per screen

| Screen | What was wrong | Fixed today |
|---|---|---|
| Setup (01, 02) | It is a wall of text. The intro claimed "nothing is spoken without review" and "microphone and camera are off", and both are now false in fast hands-free mode. Privacy, context and profile options buried the Start button. | The intro is now one honest line. Privacy, context and profile fold under **More options**, which opens automatically if consent is missing. The consent text describes hands-free listening. |
| Main board, empty (03) | The header shows six status facts in small text, including "Mic: Off" while listening. The four choices are small, with a big empty area below them. | The header shows input, voice and suggestions only. Mic appears only during push-to-talk. |
| Quick phrases (04) | The partner spoke while the person was in a menu, and the message went to a "waiting" list. The subtitle promised a review step, and "Re-arming…" is jargon. | In fast mode a new partner line jumps straight to the new suggestions. The subtitle now reads "Choose a phrase to say it." "Re-arming" became "Got it — one moment". |
| Generating (05) | A debug line ("Active context · Guidance: none · Approved style: default") and "Spoken (playback reported complete)". | The context line shows only when guidance is set. The status reads "Spoken". |
| Suggestions (06) | The cards read well: big text, with "None of these" visually quieter. The highlight starts on suggestion 1. The partner panel duplicates hands-free with a text box, Send and Talk. | In the partner panel, listening comes first and Type/Talk fold under **Type or record instead**. |

## The whole app

- **One job per screen:** the partner talks, the person blinks. Everything else is secondary and folded away.
- **Text is honest and short.** No engineering words (re-arming, playback reported, context revision).
- **The highlight always starts on the most likely answer.** One long blink speaks it.
- **Next (not done today):** enlarge the action row, which is small next to the suggestion cards. Fill the empty space under the board with the gesture legend at a larger size. Recapture "after" shots.
