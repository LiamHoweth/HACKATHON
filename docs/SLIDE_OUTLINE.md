> **Historical working document** from earlier in the hackathon (October 24, 2026). Some details are superseded; see [README.md](../README.md) for the current state.

# Slide outline

Six parts (governing iPad + ElevenLabs brief §33). **Status at 12:20 CT (commit `5de1a57`):** gestures, calibration, iPad layout, and the ElevenLabs path are implemented and pass 285 automated tests (synthetic frames, mocked providers); nothing is physical-iPad verified; ElevenLabs live verification is blocked because `ELEVENLABS_API_KEY` is not configured. Before presenting, reconcile every claim with [PRESENTATION_LOG.md](PRESENTATION_LOG.md) and [TEST_RESULTS.md](TEST_RESULTS.md). Anything still marked "not run", "not measured", or "not iPad-verified" there must be described that way on the slides. Do not use patient imagery, testimonials, pity framing, or sponsor logos. Use only real app screenshots, kept separate from diagrams.

## 1. Human problem

- What happens when you know what you want to say, but entering it takes longer than the conversation allows?
- A design problem for some AAC users, not a universal claim. People who use AAC have plenty to say.

*Speaker notes:* "We built Still Here to explore reducing that effort while keeping every word under the person's control." Connect it to humor, relationships, boundaries, and independence. No statistics unless a verified source is in [REFERENCES.md](REFERENCES.md).

## 2. Product

- **AI offers possible words. The person decides what to say.**
- Partner question → three different possibilities → choose, reject ("None of these"), guide, or write your own → exact review → separate confirmation → spoken.
- The person can also start conversations. Nothing is ever spoken automatically.

*Speaker notes:* The AI cannot select, speak, or remember anything on its own.

## 3. Hands-free on iPad

- **Eyebrows up for half a second moves one item. A deliberate long blink selects. A fresh blink authorizes speech.**
- Small live self-view at the top right, with accepted-gesture feedback ("Eyebrow raise detected — Next", "Blink detected — Selected").
- Live demo: [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Operator's hands away after one setup touch.
- Screenshot candidates: real captures only. Current ones are iPad **Simulator** captures in touch mode (`docs/screenshots/ipad-sim-landscape-*.png`); label them "iPad Simulator" or replace them with physical-iPad captures in eyebrow mode.

*Speaker notes:* Say if a helper granted camera permission or tapped Enable Audio. If eyebrow detection fails, switch to auto-scan + blink and say "the eyebrow path is experimental".

## 4. Natural voice

- ElevenLabs speaks **the exact confirmed sentence**: no added words, no paraphrase, no generic chatbot talking for the user.
- Prebuilt AI voice, not a clone. Disclosed as AI-generated.
- Fallback: an explicitly labeled basic device voice that needs a fresh confirmation.

*Speaker notes:* Say this only if the voice was actually heard on the iPad. As of 12:20 CT: **implemented; live verification blocked (`ELEVENLABS_API_KEY` not configured locally or on Railway).** If still blocked, the slide says "implemented, not yet heard" and the demo uses the labeled basic device voice. Do not quote vendor latency as our latency.

## 5. Engineering and measured evidence

- Local MediaPipe face landmarker in Safari (pinned 1.1.1 assets from our origin). Brow-raise and eye-closure scores only: no identity, no gaze, no emotion.
- Per-person calibration, hysteresis, a 500 ms monotonic hold, latch and rearm, and one arbiter that accepts at most one command per physical gesture.
- One reducer and one target registry. Every input goes through the same guarded path. Review starts on Cancel. Confirmation needs a new input cycle.
- Structured OpenAI generation (`gpt-6-astra`, strict JSON schema, `store: false`, no tools). ElevenLabs key held on the server only.
- Tests: 285/285 automated tests at 12:18 CT (unit, synthetic frames, mocked providers; confirm the number is recorded in [TEST_RESULTS.md](TEST_RESULTS.md)). Live OpenAI verified with synthetic inputs. **iPad trial: real counts with n and conditions, or "not measured".**

*Speaker notes:* Give missed and false counts with n, never percentages from a tiny sample. Synthetic tests prove logic, not reliability.

## 6. Limitations and future work

- AAC and facial-gesture access already exist (see [REFERENCES.md](REFERENCES.md)). Our contribution is this working combination.
- Access needs differ. Not everyone can raise their eyebrows or blink on purpose, so auto-scan, switch, keyboard, and touch stay first-class.
- Privacy: the camera stays on the iPad by design (state only what the network check showed). The confirmed sentence goes to ElevenLabs; we make no zero-retention claim.
- Not clinically validated. Not tested with AAC users. Next step (planned, not arranged): evaluation and co-design with AAC users and specialists.

*Speaker notes:* Close with: "AI offers possibilities. The person keeps authorship. Our prototype uses simple calibrated facial gestures and a natural voice to explore less effortful conversation. The next step is evaluation and co-design with AAC users and specialists."
