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
- [ ] The source badge shows **Fixture demo** (or **Live AI** only if a live request was verified today), and the presenter says which one it is.
- [ ] Full loop with the switch key only: partner question → None of these → Guide (Suggest an alternative) → select → review → separate Speak → audible speech → history shows delivery status.
- [ ] Holding the switch key or double-pressing on review does **not** speak.
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
- [ ] Limitations stated: not tested with AAC users, live AI status, no blink input, nothing measured unless recorded.
