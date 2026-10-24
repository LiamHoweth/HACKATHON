# Submission draft (Devpost-style)

Status: draft. Do not submit. Liam reviews it, reconciles it with the final build and [TEST_RESULTS.md](TEST_RESULTS.md), and submits it himself. Bracketed items must be resolved before submission.

## Name and tagline

**Still Here**: Your words. Your choice.

## Inspiration

Some people with ALS or other conditions affecting speech and movement know exactly what they want to say, but entering the words takes longer than the conversation allows. Many can still close their eyes on purpose. We wanted to explore whether a laptop webcam, deliberate blinks, and complete reviewable messages could reduce that effort without taking away the person's authorship. This is a design hypothesis, not a measured result.

## What it does

A highlight moves through the options on its own. A deliberate eye closure selects whatever was highlighted when the eyes closed. Ordinary blinks are ignored. When a partner asks a question, Still Here offers three meaningfully different replies. With blinks alone, the person can choose one, reject all of them ("None of these" gives different meanings, not rewordings), guide the direction ("Suggest an alternative", "Disagree", "Be humorous"…), use quick phrases, start a conversation, or spell their own message. Every message appears exactly for review, and it is spoken only after a **second, separate** deliberate blink on Speak. A short guided calibration adapts to each person. If it can't tell natural blinks from deliberate ones, it says so and offers keyboard or switch scanning.

**AI offers possible words. The person decides what to say.**

## How we built it

- Next.js 16, React 19, TypeScript, zod 4, in a single app.
- **Blink input:** MediaPipe Face Landmarker (`@mediapipe/tasks-vision` 1.1.1) running in the browser from locally served, pinned model and WASM files. Eye-closure scores from blendshapes feed a gesture state machine: freeze the target at closure onset, enforce minimum and maximum closure, cooldown, face lost → pause, multiple faces → hold. No face recognition, gaze tracking, or emotion inference. [Confirm each item once the blink code lands.]
- One pure reducer and one target registry. Blink, switch, keyboard, and pointer all go through the same guarded path. Confirmation requires a fresh input cycle. Request identities reject stale AI results.
- Live suggestions: OpenAI Responses API (`gpt-6-astra`, strict JSON schema, `store: false`, no tools) with strict output validation. Partner transcription via `gpt-transcribe`. Deployed on Railway behind an access code.
- Deterministic, opt-in, length-only session learning, with explicit approval before anything persists.
- Built by Liam Howeth with Claude Code (Opus 5.5) implementing under Liam's direction and review. See [AI_USAGE.md](AI_USAGE.md).

## Challenges

- Telling a natural blink from a deliberate one per person, and failing openly when they overlap.
- Making sure the highlight never moves under a closure, and that one gesture can never both select and confirm.
- Treating rejection as "not these, for this question" instead of learning opinions from it.

## Accomplishments

[List only items marked verified in [PRESENTATION_LOG.md](PRESENTATION_LOG.md) at submission time. As of 11:30 CT, verified: the shared communication kernel (82 passing unit/API tests, browser fixture loop), switch scanning with synthesized keys, live OpenAI replies and transcription with synthetic inputs, and Railway access-code enforcement. Blink was in progress and unverified.]

## Blink reliability

[Not measured. Replace with the real gate results from TEST_RESULTS.md: trials, missed gestures, false selections, false confirmations, gesture duration, conditions. Or state that blink remained experimental and the demo used keyboard/switch.]

## What we learned

[Fill in from the team's actual experience.]

## Limitations (be explicit)

- Not tested with AAC users or people with ALS. Not clinically validated.
- Blink detection is experimental: [reliability result or "not measured"]. It will not work for everyone. Keyboard/switch/pointer remain.
- Camera permission may need a helper. [Camera network check: verified no upload / not verified.]
- English only. No offline guarantee. Session learning covers length only.

## What's next

Planned, not arranged: co-design and evaluation with AAC users and specialists, a measured comparison of blink-selected replies against the scanning keyboard, and broader access methods.

## Built with

`nextjs` `react` `typescript` `zod` `mediapipe` `openai` `web-speech-api` `railway` `vitest`

## Links

- Repository: https://github.com/LiamHoweth/HACKATHON [confirm visibility and that the final commit is pushed]
- Live app: https://api-production-18038.up.railway.app [access code required; confirm it is redeployed with the final build, and decide whether judges get a code]
- Demo video: [none yet; do not link anything that does not exist]
