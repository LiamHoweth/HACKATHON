# Demo and submission checklist

The event's actual requirements in [the brief](PROJECT_BRIEF.md) control the submission. The spoken script is in [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

## Rehearse

- [ ] A teammate can follow README setup from a clean clone with the documented toolchain.
- [ ] The agreed core user journey works on the demo device/browser.
- [ ] Demo fixtures are synthetic, repeatable, and clearly identified.
- [ ] Network/API failures have an honest fallback; mocked behavior is disclosed.
- [ ] Screenshots/video match the actual working build and show no secrets or private data.
- [ ] The demo owner can explain the problem, implementation, limitations, and AI assistance.

### Still Here specifics

- [ ] `npm install && npm run dev` from a clean clone; `npm run check` passes and the result is recorded in [TEST_RESULTS.md](TEST_RESULTS.md).
- [ ] Brow and blink calibration complete on the iPad in the demo room's lighting. The §24 iPad trial is recorded in [TEST_RESULTS.md](TEST_RESULTS.md), or the team has decided which fallback to demo and says so.
- [ ] Network log checked during gesture use (frames not uploaded; model/WASM from this origin) before any privacy claim.
- [ ] ElevenLabs configured (key and voice in Railway variables, never on screen), Enable Audio tapped, and the test line heard on the iPad. Otherwise the presenter says "natural voice not configured".
- [ ] The source badge shows **Live AI** or **Fixture demo**, and the presenter says which one it is.
- [ ] Full loop with **eyebrows and blinks only** after setup: partner question → eyebrow NEXT → None of these → Guide (Suggest an alternative) → select → review on Cancel → eyebrow to Speak → new blink → audible ElevenLabs speech → history shows delivery status.
- [ ] The same loop with auto-scan + blink, and with the switch key only (fallbacks).
- [ ] A 2-second eyebrow hold moves one step. One long closure, or holding the switch key, on review does **not** speak. Normal talking and blinking for a minute selects and moves nothing.
- [ ] Face lost mid-closure pauses and selects nothing. Resume works by blink.
- [ ] Cancel on review returns without speaking; Stop interrupts speech and history shows "interrupted".
- [ ] Quick phrase interrupts My words and the draft survives.
- [ ] Start a conversation works without a partner question.
- [ ] Local-only mode: Quick phrases and My words still work.
- [ ] The voice is audible on the iPad; note the ElevenLabs model and voice name (not the id), or that the basic device voice was used.
- [ ] No `.env.local` values, API keys, or real personal data visible on screen or in the browser devtools.
- [ ] The fictional demo profile, if used, is labeled fictional.
- [ ] Claims in slides and Q&A match [PRESENTATION_LOG.md](PRESENTATION_LOG.md).

## Submit

- [ ] The human owner checks the deadline, timezone, team eligibility, and pre-event/AI rules.
- [ ] Required repo, live app, video, description, and attribution links are correct and accessible to judges.
- [ ] Required license, asset attribution, and AI disclosures are complete.
- [ ] The final commit/build is recorded and relevant checks pass.
- [ ] A human explicitly authorizes any deployment and makes the final submission.
- [ ] The submission owner saves confirmation evidence and verifies the submitted entry.

### Still Here specifics

- [ ] Submit by 17:15 CT (planning target 17:00 CT verification). Liam submits; [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md) bracketed items resolved.
- [ ] [AI_USAGE.md](AI_USAGE.md) includes today's Claude Code implementation work.
- [ ] Limitations stated: not tested with AAC users, eyebrow and blink reliability (measured numbers or "not measured"), not iPad-verified if true, helper needed for camera permission or Enable Audio if true, nothing else measured unless recorded.
- [ ] Railway redeployed with the final build if the live URL is submitted.
