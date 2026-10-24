# iPad manual test runbook

This is the runbook for the physical demo iPad: iPad Air 13" (M2), iPadOS 27.2, in landscape. App URL: **https://api-production-18038.up.railway.app**. You need two people: an **operator**, who uses only face gestures after setup, and a **helper**, who handles setup taps and partner typing.

Record results in the tables at the bottom: pass, fail, or note. Then tell Claude, who copies them into [TEST_RESULTS.md](TEST_RESULTS.md) and [PRESENTATION_NOTES.md](PRESENTATION_NOTES.md).

## 0. Prep (helper, about 3 minutes)

- [ ] iPad charged (above 60%) or plugged in. Brightness high. **Settings → Display & Brightness → Auto-Lock → Never**.
- [ ] The silent switch or Control Center mute is off, and volume is around 70%.
- [ ] **Settings → Apps → Safari → Advanced → Web Inspector** is on. Optional: it lets Claude watch the console from the Mac.
- [ ] Open **Safari → a new Private tab** so personal tabs aren't visible, then go to the app URL.
- [ ] Get the access code on the Mac. Run this yourself; it is never put in chat or git:
  `cut -d= -f2 /Users/howeth/Desktop/claudex/Experiments/HACKATHON/.env.railway.local`
- [ ] Optional: Share → **Add to Home Screen** for full-screen use. If you do this, re-enter the access code inside the home-screen app. If the camera misbehaves in home-screen mode, use the Safari tab instead (see [IPAD_HOME_SCREEN.md](IPAD_HOME_SCREEN.md)).
- [ ] Mount the iPad about 50–70 cm from the operator's face at eye level, with even light on the face and no bright window behind.

## 1. Setup screen (helper taps)

1. [ ] "How will you choose?" shows **Use eyebrows + blinks (Recommended)**, already selected.
2. [ ] AI source: choose **Live AI**, then tick the cloud consent checkbox. Enter the access code. It should show "accepted"; Start is blocked while the code is wrong.
3. [ ] Voice: the card shows **Natural voice (ElevenLabs): configured**. Optionally pick Chris, River, or Alice.
4. [ ] Tap **Enable audio & test voice**. You should **hear** "This is the natural voice preview. It is not part of the conversation." in the natural voice. If you don't hear it, check the mute switch and volume, then tap again.
5. [ ] Tap **Next: set up eyebrow + blink control**.

## 2. Calibration (helper taps the buttons; the operator does the gestures)

1. [ ] **Turn on camera**, then Safari asks for camera permission. Tap **Allow**. Expected: a mirrored framing preview, and "Face detected" once the face is in view.
2. [ ] **Relax your eyebrows**: hold still with a neutral face while the meter fills.
3. [ ] **Raise both eyebrows and hold until the bar fills**, 3–5 times, relaxing between raises. The counter should go up once per completed raise.
4. [ ] **Eyebrow practice**: a raise held for 0.5 s moves the highlight one step and shows "Eyebrow raise detected — Next". Holding longer must **still move only one step**.
5. [ ] **Look normally**, then **blink naturally** a few times, then make **deliberate long blinks** (eyes closed about 1 s), 3–5 times.
6. [ ] **Review timing**: note the shown values (eyebrow thresholds, minimum blink closure) and any warnings. Tap **Accept**.
7. [ ] **Practice select**: raise eyebrows to move, then one long blink selects. **Practice confirm** starts on **Cancel**. Raise eyebrows to move to **Confirm**, then a **new** long blink confirms.
8. [ ] If calibration says the gestures can't be told apart, choose **Auto-scan with blink** or **Keyboard / switch** and note it in the results table (this is a valid fallback, not a failure of the person).

## 3. Hands-free conversation (operator: gestures only; helper: types partner lines only)

Check that the small **mirrored live preview at the top right** shows "Live preview — not recorded" and the status reads Ready.

1. [ ] The helper types **"Are you coming to dinner tonight?"** in the partner panel and taps Send. Three live suggestions appear within about 5 s, with source **Live AI**.
2. [ ] Eyebrow raise moves the highlight down **exactly one** card per raise. Natural blinking does **nothing**.
3. [ ] Raise to **None of these — new suggestions**, then long blink. Three **different** meanings appear.
4. [ ] Raise to **Guide my response**, blink, then Choose a direction, blink, then **Disagree**, blink. The suggestions now all disagree.
5. [ ] Raise to a card and long blink. **Review** shows the exact sentence, with the highlight on **Cancel**. **Nothing is spoken yet.**
6. [ ] Raise once to **Speak**, wait about 0.5 s, then a **new** long blink. You hear the **exact sentence** in the natural voice, once. Delivery shows as spoken.
7. [ ] **Quick phrases**: open them, select "Please give me a moment.", go through review, then a second blink speaks it.
8. [ ] **Start a conversation**: More tools → Start a conversation → Ask someone a question. Suggestions appear with no partner question. Speak one.
9. [ ] **My words**: compose a short word with group, then letter selections. Review shows exactly what was composed. Speak it.
10. [ ] **Stop**: while a long message is speaking, a long blink stops it. It must not replay.
11. [ ] **Face lost**: the operator looks away for about 3 s. Expected: "Tracking lost — Paused". After looking back, one long blink selects **Resume**.
12. [ ] **Pause**: More tools → **Pause** is the first item. Resume works by blink.

## 4. Gesture trial (for real reliability numbers)

Open **https://api-production-18038.up.railway.app/trial**. It uses the saved calibration from step 2 on this same browser or app. Follow the on-screen facilitator instructions for steps A–F:
A = 20 eyebrow raises, B = 20 long blinks, C = 2 minutes of normal movement, D = face-loss ×3, E = 2-second holds ×5, F = gestures that should be ignored.
Then tap **Download results (JSON)**, or **Copy JSON**, and AirDrop or send the file to the Mac. Claude summarizes it. These numbers are an engineering trial with one person, not clinical validation.

## 5. Fallbacks to try once (helper)

- [ ] Touch mode: setup → "Touch" → tap a card → review → Speak.
- [ ] Basic voice: More tools → Controls → Voice → basic device voice. Speak once and confirm it's audible.
- [ ] Fixture demo: setup → AI source **Fixture demo**. Suggestions are labeled "Fixture demo".

## Results

| Step | Pass/Fail | Notes (time, what happened) |
|---|---|---|
| 1.4 Natural voice preview audible |  |  |
| 2.4 One NEXT per raise (incl. long hold) |  |  |
| 2.7 Practice select + separate confirm |  |  |
| 3.2 Natural blinks ignored |  |  |
| 3.3 None of these → new meanings |  |  |
| 3.4 Guide → Disagree respected |  |  |
| 3.6 Second blink speaks exact sentence once (natural voice) |  |  |
| 3.6 Audio played without another touch after Enable audio |  |  |
| 3.10 Stop works, no replay |  |  |
| 3.11 Face lost → pause → blink Resume |  |  |
| 4 Trial JSON exported |  |  |
| Lighting / glasses / distance / orientation |  |  |
