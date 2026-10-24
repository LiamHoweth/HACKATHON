# Still Here: Devpost submission (paste-ready)

Before pasting: add the video link and confirm the event's AI-use rules match the disclosure below. Delete this line.

## Project name

Still Here

## Tagline (pick one, 60 characters or fewer)

1. Talk with your eyebrows. The AI offers, you decide.
2. Hands-free replies for people who can't speak or type
3. A reply ready before the conversation moves on

## Team

Liam Howeth and Richard Ognefijiro.

## Elevator pitch (Devpost, 200 characters or fewer)

Still Here lets people who can't speak or use their hands keep up with a real conversation. AI offers replies; they choose with an eyebrow raise and a blink, and it speaks.

## Inspiration

People with ALS, locked-in syndrome, severe cerebral palsy, or spinal cord injuries can have plenty to say and no way to say it aloud or with their hands. Most communication tools build a sentence letter by letter. The faster ones usually need eye-gaze hardware that costs thousands of dollars.

Slow replies have a real cost. By the time a sentence is spelled out, the conversation has moved on. We wanted a reply ready in seconds, on a device people already own.

## What it does

Still Here runs on an iPad and uses only the front camera and microphone.

1. The conversation partner just talks. The app listens, transcribes, and shows what they said.
2. A few seconds later it shows the two most likely replies, plus an "Other ways to answer" card with directions such as "Rough day", "Mixed day", "Not now", or "You first".
3. The person raises their eyebrows to move to the next option and keeps them up to keep moving. A brief jaw drop goes back. A long, deliberate blink chooses.
4. The chosen reply is spoken in a natural voice.

Nothing is spoken unless the person chooses it. By default (fast mode) one long blink speaks the highlighted reply; turning fast mode off adds a review screen and a separate confirming blink. A long blink while the app is speaking stops it, and Pause is always available. Quick phrases and typed words work without AI.

## How we built it

The app is Next.js, React, and TypeScript. MediaPipe FaceLandmarker runs on the device to read eyebrow, jaw, and blink movement, so camera frames are processed locally by design. The partner's speech is transcribed with OpenAI gpt-transcribe. Suggested replies come from the OpenAI Responses API with a strict JSON schema, and ElevenLabs produces the voice. A Railway backend keeps the API keys off the device. A native iPad shell (SwiftUI and WKWebView) installs the app with permissions ready.

Gestures, touch, keyboard, and switch input all go through one pure reducer, so the safety rules live in one place. It has 586 passing unit tests plus 2 expected failures that document known bugs, and the deployed server passes a 6-check smoke test. They check logic, not how well gestures work on real faces.

We used AI coding tools and want to say so plainly. Claude Code, with parallel agents, wrote the application code, the docs, and the final pitch deck under our direction. Codex made an earlier deck draft and the initial repository scaffolding, with no app code. We set the scope, made the product decisions, and reviewed the results (docs/AI_USAGE.md).

## Challenges we ran into

- **iPad audio.** A playback audio session blocks the microphone on iPad. We had to switch to play-and-record for listening.
- **Natural versus deliberate blinks.** People blink constantly. We only count a calibrated, longer closure, and discard ambiguous input instead of guessing.
- **Multiple faces.** Tracking now locks onto one face (the most central, longest in view) so someone leaning in does not take over.
- **Latency.** Median time from the partner finishing to suggestions on screen fell from 5.1 s to 3.8 s (conditions below).
- **A failed experiment.** We tried OpenAI's priority tier. It looked fast offline, then 4 of 6 live requests timed out. We rolled it back.
- **Interruptions.** Partners often keep talking mid-selection. Follow-ups within 20 seconds now merge into the open question and the suggestions refresh, so the person does not lose their place.

## Accomplishments that we're proud of

- Hands-free conversation worked end to end on a stock iPad in a team test.
- In fast mode the voice is prefetched, so a blink can play audio from memory without the roughly 0.6 s fetch (not yet confirmed audibly by a person on the iPad).
- One blink speaks a whole reply, instead of many selections per sentence.
- An evidence log where every claim is tagged verified, synthetic, or not yet done.

## What we learned

With AI in communication tools, the hard problem is control, not generation. Most of our work went into making sure nothing is said without a deliberate choice. Discarding ambiguous gestures matters as much as detecting intended ones. And a prototype is easier to trust when it labels what it has not tested.

## What's next for Still Here

- Test with AAC users and speech-language pathologists before adding features.
- Measure gesture reliability across people, glasses, and lighting.
- On-device models so it works offline.
- Personal voice banking, so users can have their own voice.
- Android and other tablets.

## Built with

nextjs, react, typescript, mediapipe, openai, elevenlabs, railway, swift, swiftui, ipad, accessibility, aac

## Try it out

- Code: https://github.com/LiamHoweth/HACKATHON
- Live app: demo available on request (it needs an access code)
- Backup demo video: [ADD VIDEO LINK]

## Timeline and rules

The event rule is that all code must be written after hacking started at 9:00 AM. The repository setup commit at 08:59 contained documentation, a contributing guide, a CI workflow, and a repo-hygiene script, with no application code. All application code was written after 9:00; the first application commit is at 10:53.

## Evidence and honesty

These were one-person engineering trials, not clinical validation. No AAC user or person with ALS has tested Still Here, and it is not a medical device.

Latency was measured from a Mac against the deployed server with synthetic speech, 10 runs per side, not a controlled comparison. It excludes the person's reading and blink time and was not measured on the iPad.

Hands-free conversation was verified in a team test on the iPad, on an earlier build. Hold-to-move, jaw-drop back, "Other ways to answer", multi-face tracking, and audible voice prefetch are deployed and unit-tested but not yet tried by a person on the iPad. No AAC user has tested it and there is no clinical validation. Gesture reliability is not measured.

Camera frames are processed on the device by design; we have not confirmed this with a network check on the iPad. The partner's speech goes to OpenAI for transcription, and in fast mode suggested sentences go to ElevenLabs ahead of time, including unchosen ones. We claim no zero retention for either.

Prior art: VisioALS offers AI replies chosen by gaze with an ElevenLabs voice, and we built on that idea, as did SpeakFaster and Project Converse. Our version combines eyebrow and blink control on a stock iPad, nothing spoken unless chosen, and directions for when no suggestion fits.
