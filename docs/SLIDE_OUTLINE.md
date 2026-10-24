# Slide outline

Six parts (master prompt §33). Before presenting, reconcile every claim with [PRESENTATION_LOG.md](PRESENTATION_LOG.md) and [TEST_RESULTS.md](TEST_RESULTS.md). Anything still marked "not run" or "not verified" there must be described that way on the slides. Do not use patient imagery, testimonials, pity framing, or sponsor logos.

## 1. The conversational moment

- What happens when you know what you want to say, but entering the words takes longer than the conversation allows?
- Frame it as a design problem, not a universal claim about AAC users.

*Speaker notes:* "We built Still Here to explore reducing that effort without taking away the person's choice." Connect it to humor, relationships, boundaries, and independence. Do not cite statistics unless a verified source is in [REFERENCES.md](REFERENCES.md).

## 2. Still Here

- **AI offers possible words. The person decides what to say.**
- Loop: partner speaks → three different possibilities → choose, reject, guide, or write your own → exact review → separate confirmation → speech.
- The user can also start conversations.

*Speaker notes:* The AI cannot select, speak, or remember anything on its own.

## 3. Live demonstration

- Fixture or live source shown on screen. Say "Fixture demo" aloud unless live AI was verified.
- Reject → guide (alternative) → select → review → confirm → speak → quick phrase → start a conversation.

*Speaker notes:* Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md). If something fails, use the scripted fallback and say so.

## 4. What we built (implemented contribution)

- One combination: accessible switch scanning, semantic "None of these", explicit intent guidance, conversation continuity (staged/parked questions, quick interruptions, initiation), and consent-gated personalization.
- List only what is marked verified in the presentation log at presentation time.

*Speaker notes:* Mention that similar products exist (see [REFERENCES.md](REFERENCES.md)). Our contribution is this specific working combination, not AAC itself.

## 5. Engineering and evidence

- One pure reducer. Every input goes through one guarded path.
- Request identities (session epoch, workspace, request, context/preference revision, anchor revision) reject stale results.
- Confirmation needs a fresh input cycle and an arming delay. One utterance plays once.
- Provenance: partner text, confirmed messages, suggestions, rejections, preferences, and observations are kept separate.
- Tests: number passing, from [TEST_RESULTS.md](TEST_RESULTS.md) only. Measurements: "not measured" unless real.

*Speaker notes:* Explain the model's narrow role: structured JSON, no tools, validated output, app-assigned IDs.

## 6. Limitations and next steps

- Not tested with AAC users. Not clinically validated.
- Live AI and transcription verified or not (state the actual status). No blink input.
- Next step (planned, not arranged): co-design and evaluation with AAC users and specialists.

*Speaker notes:* Close with: "AI offers possibilities. The person keeps authorship. Our next step is to evaluate this with AAC users and specialists, using their needs, not our assumptions, to guide the product."
