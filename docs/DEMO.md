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
- [ ] Blink calibration completes on the demo laptop in the demo room's lighting. The blink reliability gate is recorded in [TEST_RESULTS.md](TEST_RESULTS.md), or the team has decided to demo with keyboard/switch and say so.
- [ ] Browser network log checked during blink use (frames not uploaded; model/WASM from this origin) before any privacy claim.
- [ ] The source badge shows **Live AI** or **Fixture demo**, and the presenter says which one it is.
- [ ] Full loop with **blinks only** after setup: partner question → None of these → Guide (Suggest an alternative) → select → review → separate blink on Speak → audible speech → history shows delivery status.
- [ ] The same loop with the switch key only (fallback).
- [ ] One long closure, or holding the switch key, on review does **not** speak. Normal blinking for a minute selects nothing.
- [ ] Face lost mid-closure pauses and selects nothing. Resume works by blink.
- [ ] Cancel on review returns without speaking; Stop interrupts speech and history shows "interrupted".
- [ ] Quick phrase interrupts My words and the draft survives.
- [ ] Start a conversation works without a partner question.
- [ ] Local-only mode: Quick phrases and My words still work.
- [ ] The voice is audible on the demo laptop; note the voice name and whether it is local.
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
- [ ] Limitations stated: not tested with AAC users, blink reliability (measured numbers or "not measured"), helper needed for camera permission if true, nothing else measured unless recorded.
- [ ] Railway redeployed with the final build if the live URL is submitted.
