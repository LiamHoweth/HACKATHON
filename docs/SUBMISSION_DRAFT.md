# Submission draft (Devpost-style)

Status: draft. Do not submit. Liam reviews it, reconciles it with the final build and [TEST_RESULTS.md](TEST_RESULTS.md), and submits it himself. Bracketed items must be resolved before submission.

## Name and tagline

**Still Here**: Your words. Your choice.

## Inspiration

Some people with ALS or other conditions that affect speech and movement know exactly what they want to say, but entering the words takes longer than the conversation allows. We wanted to explore whether offering complete, reviewable messages could reduce that effort without taking away the person's authorship. This is a design hypothesis, not a measured result.

## What it does

A conversation partner types a question. Still Here offers three meaningfully different possible replies. The user can choose one, reject all of them ("None of these" gives different meanings, not rewordings), guide the direction ("Suggest an alternative", "Disagree", "Be humorous"...), or spell their own message with a scanning keyboard. Every message is shown exactly for review and is spoken only after a separate, deliberate confirmation. Quick phrases like "Please give me a moment" are always reachable. The user can start conversations, not just answer. Personalization is opt-in, and nothing is remembered without explicit approval.

**AI offers possible words. The person decides what to say.**

## How we built it

- Next.js 16 App Router, React 19, TypeScript, zod 4. There is one application.
- A single pure reducer owns every decision. All input sources (pointer, keyboard, single-switch scanning) activate targets from one registry through one guarded path.
- Request identities (session epoch, workspace, request ID, context, preference, and anchor revisions) reject stale AI results.
- Live suggestion adapter: Anthropic Messages API with structured JSON output and strict output validation. Application code assigns all IDs. [State whether live AI was verified.]
- Deterministic, opt-in, length-only session learning with explicit approval before anything persists.
- Built by Liam Howeth with Claude Code (Opus 5.5) implementing under Liam's direction and review. See [AI_USAGE.md](AI_USAGE.md).

## Challenges

- Making sure one held switch press can never both select and confirm a message.
- Treating rejection as ambiguous ("not these, for this question") instead of learning opinions from it.
- Keeping a conversation's earlier questions and drafts intact while the partner keeps talking.

## Accomplishments

[List only items marked verified in [PRESENTATION_LOG.md](PRESENTATION_LOG.md) at submission time. At ~11:00 CT, the core reducer, adaptation logic, server adapter, fixtures, and unit tests existed in source. UI, runtime, audio, and routes had just landed and were unverified. No test results were recorded yet.]

## What we learned

[Fill in from the team's actual experience.]

## Limitations (be explicit)

- Not tested with AAC users or people with ALS. Not clinically validated.
- [Live AI: verified / not verified.] [Transcription: verified / not verified.] The demo uses a clearly labeled fixture mode when live AI is unavailable.
- No blink or camera input. English only. No offline guarantee.
- Nothing measured yet [update from TEST_RESULTS.md].

## What's next

Planned, not arranged: co-design and evaluation with AAC users and specialists, a measured comparison against the scanning keyboard, a verified live-AI path, and broader access methods.

## Built with

`nextjs` `react` `typescript` `zod` `anthropic` `web-speech-api` `vitest`

## Links

- Repository: https://github.com/LiamHoweth/HACKATHON [confirm visibility and that the final commit is pushed]
- Demo video: [none yet; do not link anything that does not exist]
