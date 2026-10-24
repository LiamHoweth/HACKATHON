# Product spec: Still Here

This is the reconciled requirements summary. The full, authoritative brief is Liam's master prompt, `Still_Here_Claude_Master_Prompt_FINAL.md`. It was supplied locally and is not committed to this repository. Where this file and the code disagree, the code describes current behavior, and the difference belongs in [DECISIONS.md](DECISIONS.md).

Numeric thresholds below are prototype engineering defaults from [`src/core/limits.ts`](../src/core/limits.ts). They are not clinical findings.

## Identity

- **Name:** Still Here. **Tagline:** Your words. Your choice.
- **Principle:** AI offers possible words. The person decides what to say.
- **Users we design for:** adults who understand the conversation and know what they want to express, but find speaking or typing slow or difficult (for example, some people with ALS). We assume nothing about comprehension, and we do not assume blinking or any other single input works for everyone.
- **Status:** hackathon prototype; not clinically validated and not tested with AAC users.

## Non-negotiable invariants

1. Nothing is spoken without a deliberate selection **and** a separate, fresh confirmation of the exact displayed text.
2. One physical input cycle is accepted at most once.
3. A review snapshot is immutable.
4. Playback is authorized only from the current valid review.
5. A given utterance starts at most once. Repeating it requires new authorization.
6. New partner input is staged. It never silently replaces the active question or draft.
7. Rejected suggestions and UI commands are never attributed as user speech.
8. Unapproved observations never become persistent preferences or personal facts.
9. Pausing, errors, hidden tabs, and unknown states cannot trigger speech.
10. Independent composition stays reachable when AI or recording fails.

## Priorities

| Priority | Scope | Current status |
| --- | --- | --- |
| P0 | Typed partner input; live suggestions when configured; selection; review; separate confirmation; exact speech; keyboard/switch scanning; semantic regeneration; independent composition; central state; stale-result protection; recoverable errors | Core logic implemented; runtime/UI/speech present but not verified; live AI not verified |
| P1 | Intent guidance; quick phrases; parked turns; initiation; session style adaptation; approved preferences; memory UI; saved phrases; microphone transcription; measurement; presentation evidence | Reducer logic implemented; transcription and measurement export present but not verified |
| P2 | Blink input; advanced ranking; shorthand expansion; deeper personalization | Deferred |
| Out of scope | Native app, gaze cursor, face recognition, emotion inference, clinical decision support, emergency dispatch, caregiver surveillance, fine-tuning, vector DB, runtime multi-agent systems | Not built |

## Functional requirements (summary)

### Reply suggestions
- Exactly three complete, meaningfully different candidates per batch. Each has a short meaning label (`act` + `summary`), which is not hidden reasoning.
- **None of these — new suggestions** regenerates for the same anchored question. It sends the rejected texts and meaning labels for that question only, and is never spoken.
- After two rejected batches, **Write it myself** appears. Regeneration stays available.
- Length policies: short 14 words / 100 chars (default), balanced 24 / 160, detailed 40 / 260.

### Guide my response
- Directions: Agree, Disagree, Ask a question, Suggest an alternative, Express a need, Change the subject, Explain something, Something else (opens a topic/keyword composer).
- Wording: Be humorous, Be direct, Shorter, More detail, Gentler, More casual, More formal, Warmer.
- Guidance applies to the current question only, persists across its regenerations, and can be cleared.
- Order of influence: the user's authored words > explicit intent/wording > approved preferences > session hints > defaults.

### Change wording
- From review: **Same idea, shorter** or **Different tone** keeps the selected meaning and produces a refinement batch. Leaving a refinement does not count as rejecting that meaning.

### Quick phrases and saved phrases
- Ten built-in phrases (eight conversational, then "Please stop." and "Please get someone to help me."). Interruption phrases come first. Six per page.
- Custom phrases can be added after confirmation. Every phrase goes through review and confirmation, and none needs AI.
- "Please get someone to help me." only speaks locally. It does not contact anyone.

### My words
- Grouped-letter scanning keyboard: letters, digits, `. , ? ! ' -`, space, delete, clear (with confirmation), review.
- Choosing a group never also inserts a letter.
- 500-character limit with a notice. Drafts survive quick phrases and cancelled reviews.

### Start a conversation
- Categories: Ask someone a question, Tell someone something, Share a thought, Make a request, Tell a joke, Talk about an approved interest, Return to an earlier topic, Express a feeling in my own words, Write something original.
- Initiation uses its own anchor and workspace. It creates no fake partner turn and never invents memories.

### Conversation continuity
- Partner input that arrives while the user is busy is staged (queue capped at 10, with an explicit "full" notice).
- History offers Answer, Return to a parked question, Keep for later, and Dismiss. None of these rewrites chronology.
- Editing a partner turn marks that question's suggestions stale and clears its rejection history.

### Personalization (three levels)
1. **Current turn:** rejections and refinements, scoped to one workspace.
2. **Session:** opt-in, deterministic, length-only observations (30-minute expiry, last 20 kept). Hints need 2 turns. Proposals need 3 distinct turns.
3. **Approved preferences:** six style dimensions (length, directness, formality, humor, warmth, follow-up) with optional relationship/setting scope. Saved only through an explicit confirmation step. Can be edited, disabled, or deleted.
- Profile fields are limited to preferred name, interests, and language. A profile stays a draft until approved.
- Controls: use saved preferences, session adaptation, **Pause personalization**, remember on this device, clear session learning, and delete everything saved.

### Speech
- One controller around browser `speechSynthesis`. Only a `ConfirmedUtterance` can be spoken.
- Delivery states are queued, speaking, completed, interrupted, failed, and uncertain. Nothing is replayed automatically.
- While speaking, the only target is **Stop speaking**. While paused, the only target is **Resume**.

### Partner audio (present; not verified)
- Push to record, then Finish. The transcript is reviewed (**Use this / Edit / Re-record / Back**). Typed input is the fallback.
- Recording requires cloud consent and stops before speech plays.

### Source labels
- **Live AI**, **Fixture demo**, and **Local phrases/composition** are always distinguishable. A failed live request never returns fixture text.

## Acceptance

Test IDs CORE, GEN, PREF, CONV, ACCESS, and SYS are mapped in [TEST_PLAN.md](TEST_PLAN.md). Gates are in [BUILD_PLAN.md](BUILD_PLAN.md).
