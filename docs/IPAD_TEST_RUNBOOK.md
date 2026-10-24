# iPad manual test runbook

This is the runbook for the physical demo iPad: iPad Air 13" (M2), iPadOS 27.2, in landscape. Test the installed **Still Here** app (WKWebView shell, rebuild with `scripts/build-ipad-shell.sh`). The Safari URL **https://api-production-18038.up.railway.app** is the fallback. You need three people: an **operator**, who uses only face gestures after setup, a **partner**, who just talks, and a **helper** (setup taps, stopwatch). The demo script is in [REHEARSAL.md](REHEARSAL.md).

Record results in the tables at the bottom: pass, fail, or note. Then tell Claude, who copies them into [TEST_RESULTS.md](TEST_RESULTS.md) and [PRESENTATION_NOTES.md](PRESENTATION_NOTES.md).

## 0. Prep (helper, about 2 minutes)

Before going on stage, run `node scripts/smoke-deployed.mjs` on the Mac — all lines must say PASS.
(It makes 5 API calls, takes under 30 s, and never prints the access code.)

- [ ] iPad charged (above 60%) or plugged in, brightness high, volume about 70%, silent mode off. Auto-lock is disabled by the app.
- [ ] Open **Still Here**. First launch only: tap **Allow** for camera and microphone. The access code is built in and audio needs no tap.
- [ ] Mount the iPad 50-70 cm from the operator's face at eye level, even light on the face, no bright window behind.
- [ ] Only for the Safari fallback: use a private tab at the app URL, tap **Allow**, tap **Enable audio & test voice**, and enter the access code. Get the code on the Mac by running this yourself (never in chat or git): `cut -d= -f2 /Users/howeth/Desktop/claudex/Experiments/HACKATHON/.env.railway.local`

## 1. Launch screen (helper)

1. [ ] The first screen is the **Ready when you are** card. It lists: eyebrows to move, long blink to choose; speaks as soon as you choose; live AI suggestions, natural voice.
2. [ ] Fast mode (**Speak as soon as I choose**) is on by default. Leave it on for the demo. (Turn it off only to test review + separate confirm.)
3. [ ] If not yet calibrated, the big button reads **Next: set up eyebrow + blink control**. If calibrated it reads **Start with saved calibration**. Other ways to choose (auto-scan, keyboard/switch, touch) are under **Other ways to choose**.

## 2. Calibration (skip if saved; operator gestures, helper taps)

Takes about 1 minute.

1. [ ] **Turn on camera**. Expect a mirrored preview and "Face detected".
2. [ ] **Relax your eyebrows** (neutral face while the meter fills), then **raise both eyebrows and hold until the bar fills**, 3-5 times.
3. [ ] **Eyebrow practice**: a 0.5 s raise moves the highlight one step ("Eyebrow raise detected — Next"). Holding longer must still move only one step.
4. [ ] **Blink naturally** a few times, then make 3-5 **deliberate long blinks** (about 1 s).
5. [ ] **Review timing**, then **Accept**. If the gestures can't be told apart, pick **Auto-scan with blink** or **Keyboard / switch** and note it in Results (valid fallback).
6. [ ] **Practice select**: raise to move, one long blink selects. In fast mode it speaks right away. With fast mode off, review starts on **Cancel** and a **new** blink on **Speak** confirms.
7. [ ] Tap **Start** (or **Start with saved calibration**).

## 3. Hands-free conversation (operator: gestures only; partner: talks only; helper: stopwatch)

Check the preview shows "Live preview — not recorded" and the panel says **Listening: just talk**. The narrator and helper stay quiet during each step (the mic hears everyone).

1. [ ] **Partner talks, no touch:** "Are you coming to dinner tonight?" The words become the **Partner asked** line. Three suggestions appear a few seconds later, source **Live AI**, and the **top one is highlighted**.
2. [ ] **One-blink speak:** the operator long-blinks once. The highlighted reply speaks in the natural voice, once. **Stopwatch:** partner's last word to voice start. Record 3 runs.
3. [ ] **Prefetch (note only):** does the voice start noticeably sooner after the blink than it did in the first run? Record yes/no and the gap. This is unverified.
4. [ ] **Eyebrow move:** a raise moves exactly **one** card. Natural blinking does nothing. A long blink on the second card speaks it.
5. [ ] **While speaking:** a long blink stops the voice and it does not replay. Also try the **partner talking while the app speaks**: it should answer right after the voice ends.
6. [ ] **Partner line in a menu:** open **Guide my response**, then have the partner ask something. The app should jump straight to the new suggestions.
7. [ ] **None of these:** raise to **None of these**, blink. Three **different** meanings appear.
8. [ ] **Guide my response:** raise to it, blink, raise to **Disagree**, blink. The suggestions all disagree. Count the raises to Guide and to Disagree and record them.
9. [ ] **Quick phrases:** "Please give me a moment." speaks.
10. [ ] **My words:** compose a short word (group, then letters) and speak it.
11. [ ] **More tools, Controls, Voice:** switch to basic voice, speak once, confirm it is audible, then switch back.
12. [ ] **Multiple faces:** a second person leans in next to the operator (silent). Operator long-blinks. Tracking should stay on the operator. Then the second person leaves. Record whether it paused or changed face.
13. [ ] **Face lost:** the operator looks away for about 3 s. Expect "Tracking lost — Paused". Looking back, one long blink on **Resume** continues.
14. [ ] **Pause (helper):** tap **Pause** (top right), then resume by blink or tap.
15. [ ] **Noisy hall:** with the room noise at hall level, count wrong transcripts in 5 partner lines. If more than 1 is wrong, use **Stop listening** and type under **Type or record instead**, and note it.
16. [ ] **Narrator leak:** from the planned narrator position, speak a sentence at presentation volume. Does it appear as a Partner line? Yes/no.

## 4. Gesture trial (for real reliability numbers)

Open **https://api-production-18038.up.railway.app/trial**. It uses the saved calibration from step 2 on this same browser or app. Follow the on-screen facilitator instructions for steps A–F:
A = 20 eyebrow raises, B = 20 long blinks, C = 2 minutes of normal movement, D = face-loss ×3, E = 2-second holds ×5, F = gestures that should be ignored.
Then tap **Download results (JSON)**, or **Copy JSON**, and AirDrop or send the file to the Mac. Claude summarizes it. These numbers are an engineering trial with one person, not clinical validation.

## 5. Fallbacks to try once (helper)

- [ ] **Stop listening**, then type a partner line under **Type or record instead**.
- [ ] Touch mode: launch screen → **Other ways to choose** → Touch → tap a card.
- [ ] Basic voice: More tools → Controls → Voice → basic device voice. Speak once, confirm audible.
- [ ] Fixture demo: setup → AI source **Fixture demo**. Suggestions are labeled "Fixture demo".
- [ ] Safari fallback: open the app URL in a private tab, tap Allow for camera and microphone, tap Enable audio & test voice, enter the access code, and run one question.

## Results

| Step | Pass/Fail | Notes (time, what happened) |
|---|---|---|
| 2.3 One NEXT per raise (incl. long hold) |  |  |
| 2.6 Practice select (fast mode speaks at once) |  |  |
| 3.1 Partner talks, no touch → transcribed → 3 suggestions, top highlighted |  |  |
| 3.2 One long blink speaks highlighted reply, once (natural voice audible) |  |  |
| 3.2 Stopwatch: partner last word → voice start (3 runs, seconds) |  |  |
| 3.3 Prefetch makes playback sooner (yes/no, gap) |  |  |
| 3.4 Natural blinks ignored |  |  |
| 3.5 Stop works, no replay |  |  |
| 3.5 Partner talks while speaking → answered right after |  |  |
| 3.6 Partner line in a menu jumps to new suggestions |  |  |
| 3.7 None of these → new meanings |  |  |
| 3.8 Guide → Disagree respected (raises to Guide / Disagree) |  |  |
| 3.9-3.11 Quick phrase / My words / basic voice |  |  |
| 3.12 Multi-face: second person leans in, tracking stays |  |  |
| 3.13 Face lost → pause → blink Resume |  |  |
| 3.15 Hall noise: wrong transcripts per 5 lines |  |  |
| 3.16 Narrator voice picked up as partner line (yes/no) |  |  |
| 4 Trial JSON exported |  |  |
| Lighting / glasses / distance / orientation |  |  |
