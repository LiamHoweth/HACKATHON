# Submission draft (Devpost-style)

Status: draft. Do not submit. Liam reviews it, reconciles it with the final build and [TEST_RESULTS.md](TEST_RESULTS.md), and submits it himself. Bracketed items must be resolved before submission.

## Name and tagline

**Still Here**: Your words. Your choice.

## Inspiration

Some people with ALS or other conditions affecting speech and movement know exactly what they want to say, but entering the words takes longer than the conversation allows. We wanted to explore whether an iPad, two simple facial gestures, complete reviewable messages, and a natural voice could reduce that effort without taking away the person's authorship. This is a design hypothesis, not a measured result.

## What it does

On an iPad in landscape, raising both eyebrows for half a second moves the highlight one option forward. A deliberate long blink selects. Ordinary blinks and brief brow movements are ignored. When a partner asks a question, Still Here offers three meaningfully different replies. With those two gestures, the person can choose one, reject all of them ("None of these" gives different meanings, not rewordings), guide the direction ("Suggest an alternative", "Disagree", "Be humorous"…), use quick phrases, start a conversation, or spell their own message. Every message appears in full for review, starting on Cancel. It is spoken only after an eyebrow raise to Speak and a **second, separate** long blink. A natural ElevenLabs voice then speaks exactly that sentence. A small live self-view in the corner shows that tracking works and confirms each accepted gesture. If gestures don't suit someone, auto-scan with blink, keyboard or switch, and touch reach every screen.

**AI offers possible words. The person decides what to say.**

## How we built it

- Next.js 16, React 19, TypeScript, zod 4, in a single web app for iPad Safari.
- **Gesture input:** MediaPipe Face Landmarker (`@mediapipe/tasks-vision` 1.1.1) running in the browser from locally served, pinned model and WASM files. Brow-raise and eye-closure scores from blendshapes feed two pure state machines (a 500 ms monotonic brow hold with latch and rearm, and a long-blink detector that freezes the target at closure onset) and one arbiter that accepts at most one command per physical gesture. No face recognition, gaze tracking, or emotion inference. [Confirm each item once the brow and arbiter code lands.]
- One pure reducer and one target registry. Gestures, switch, keyboard, and touch all go through the same guarded path. Confirmation requires a fresh input cycle. Request identities reject stale AI results.
- Live suggestions: OpenAI Responses API (`gpt-6-astra`, strict JSON schema, `store: false`, no tools) with strict output validation. Partner transcription via `gpt-transcribe`.
- **Voice:** ElevenLabs through a server-side `/api/speech` route (`eleven_v4_turbo`, Text-to-Dialogue WebSocket or a verified ElevenLabs HTTP fallback), returning a short MP3 for reliable iPad playback. A labeled basic device voice is the fallback. [Confirm the model, transport, and voice actually used.]
- Deployed on Railway over HTTPS behind an access code, so the iPad can use its camera.
- Deterministic, opt-in, length-only session learning, with explicit approval before anything persists.
- Built by Liam Howeth with Claude Code (Opus 5.5) implementing under Liam's direction and review. See [AI_USAGE.md](AI_USAGE.md).

## Challenges

- Telling a deliberate half-second eyebrow raise from brows moving during speech, and making a long hold count only once.
- Making sure a raise can never move the highlight once a blink starts, and that one gesture can never both select and confirm.
- iPad Safari's audio policy: a camera gesture may not count as a user touch.
- Treating rejection as "not these, for this question" instead of learning opinions from it.

## Accomplishments

[List only items marked verified in [PRESENTATION_LOG.md](PRESENTATION_LOG.md) at submission time. As of 12:05 CT, verified: the shared communication kernel (134 passing unit/API tests, desktop browser fixture loop), switch scanning with synthesized keys, blink SELECT and calibration logic with synthetic tests, live OpenAI replies and transcription with synthetic inputs, and Railway access-code enforcement. Eyebrow NEXT, the iPad UI, and ElevenLabs were in progress and not iPad-verified.]

## iPad trial results

[Not measured. Replace with the real results from TEST_RESULTS.md: eyebrow raises (committed, missed, inadvertent), long-blink selections (correct, missed, wrong target), 2 minutes of normal movement, face-loss recovery, the hands-free 3-turn conversation, and conditions. Or state that the eyebrow path remained experimental and which fallback the demo used.]

## Voice

[Not verified. Replace with the ElevenLabs model, transport, and voice actually used, whether audio played on the iPad after one setup touch, and the TTS-09 listener notes with the listener count.]

## What we learned

[Fill in from the team's actual experience.]

## Limitations (be explicit)

- Not tested with AAC users or people with ALS. Not clinically validated.
- Eyebrow and blink detection are experimental: [iPad trial result or "not measured"]. They will not work for everyone. Auto-scan, switch, keyboard, and touch remain.
- Camera permission and the one-time audio unlock may need a helper. [Camera network check: verified no upload / not verified.]
- The exact confirmed sentence is sent to ElevenLabs. We make no zero-retention claim.
- English only. No offline guarantee. Session learning covers length only.

## What's next

Planned, not arranged: co-design and evaluation with AAC users and specialists, a measured comparison of gesture-selected replies against the scanning keyboard, and broader access methods.

## Built with

`nextjs` `react` `typescript` `zod` `mediapipe` `openai` `elevenlabs` `web-speech-api` `railway` `vitest`

## Links

- Repository: https://github.com/LiamHoweth/HACKATHON [confirm visibility and that the final commit is pushed]
- Live app: https://api-production-18038.up.railway.app [access code required; confirm it is redeployed with the final build, and decide whether judges get a code]
- Demo video: [none yet; do not link anything that does not exist]
