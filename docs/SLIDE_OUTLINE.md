# Slide outline

Six parts (blink-first master prompt §33). Before presenting, reconcile every claim with [PRESENTATION_LOG.md](PRESENTATION_LOG.md) and [TEST_RESULTS.md](TEST_RESULTS.md). Anything still marked "not run" or "not measured" there must be described that way on the slides. Do not use patient imagery, testimonials, pity framing, or sponsor logos. Use only real app screenshots, kept separate from diagrams.

## 1. The conversational moment

- What happens when you know what you want to say, but entering the words takes longer than the conversation allows?
- A design problem, not a universal claim about AAC users.

*Speaker notes:* "We built Still Here to explore reducing that effort without taking away the person's choice." Connect it to humor, relationships, boundaries, and independence. No statistics unless a verified source is in [REFERENCES.md](REFERENCES.md).

## 2. Still Here

- **AI offers possible words. The person decides what to say.**
- Loop: partner question → three different possibilities → the highlight scans → a deliberate blink selects (or rejects, guides, or opens My words) → exact review → a **separate** blink to speak.
- The person can also start conversations.

*Speaker notes:* The AI cannot select, speak, or remember anything on its own.

## 3. Live, hands-free blink demonstration

- Status line visible: blink control, camera local, mic state, live/fixture source.
- Operator's hands away from the keyboard and mouse. The partner types.
- Reject → guide → select → review → second blink → speak → start a conversation.

*Speaker notes:* Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md). If blink fails, switch to keyboard/switch and say "blink is experimental". Say if a helper granted camera permission.

## 4. What we built (implemented contribution)

- One combination: blink selection over automatic scanning with individual calibration, semantic "None of these", explicit intent guidance, conversation continuity, and consent-gated personalization, all through one guarded selection engine.
- List only items marked verified in the presentation log at presentation time.

*Speaker notes:* Webcam and eye-controlled AAC already exist (see [REFERENCES.md](REFERENCES.md)). Our contribution is this working combination, not blink access or AAC itself.

## 5. Engineering and evidence

- Local MediaPipe face landmarker (pinned 1.1.1 assets served from the app). Eye-closure scoring only: no identity, no gaze.
- Gesture safety: target frozen at closure onset, ordinary blinks ignored, minimum and maximum closure, cooldown, face lost → pause, multiple faces → hold.
- One reducer and one target registry. Every input goes through the same guarded path. A fresh input cycle is required to confirm. Stale results are rejected.
- Live AI: OpenAI Responses API, strict JSON schema, `store: false`, no tools.
- Tests: the number from [TEST_RESULTS.md](TEST_RESULTS.md). **Blink reliability: the real gate numbers, or "not measured".**

*Speaker notes:* Explain the model's narrow role. Give missed/false selection counts with n and conditions, never percentages from a tiny sample.

## 6. Limitations and next steps

- Not tested with AAC users. Not clinically validated. Blink is experimental, and one team tester is not a population.
- Blinking does not work for everyone, so keyboard/switch/pointer stay first-class fallbacks.
- Camera privacy claim: state only what the network-log check showed.
- Next step (planned, not arranged): co-design and evaluation with AAC users and specialists.

*Speaker notes:* Close with: "AI offers possibilities. The person keeps authorship. Our next step is to evaluate this with AAC users and specialists, using their needs, not our assumptions, to guide the product."
