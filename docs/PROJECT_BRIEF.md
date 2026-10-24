# Project brief

Status: event and idea selected (Still Here). Facts below come from Liam's master prompt, which supplied the event briefing, and from the repository itself. Fields still unconfirmed are marked. Do not invent answers to fill the template.

## Event and constraints

| Decision | Agreed value |
| --- | --- |
| Event and official rules URL | SASEHacks for Good, University of Oklahoma. Official rules URL not recorded in the repo |
| Start, end, and submission deadline (include timezone) | Saturday 2026-10-24. Hacking began 09:00 CT; submission and return to Gallogly for judging at 17:15 CT (from the supplied event briefing). Our planning targets, not official deadlines: feature freeze 15:30 CT, submission verification 17:00 CT |
| Theme / track / judging criteria | "For Good" (social impact). Specific track and judging criteria not recorded |
| Team size and eligibility | Liam Howeth (University of Oklahoma, computer engineering). Eligibility unconfirmed |
| Pre-event work and existing-code policy | Briefing says new project code must be written after 09:00 CT. All `src/` code was written after 09:00 on 2026-10-24. The generic repo foundation (no app code) was committed 08:49–09:08 CT. Liam to confirm this is permitted |
| AI tools, generated assets, and disclosure policy | Unconfirmed. AI use is disclosed in [AI_USAGE.md](AI_USAGE.md); Liam to confirm the event's rule |
| Required submission materials and hosting duration | Unconfirmed; draft in [SUBMISSION_DRAFT.md](SUBMISSION_DRAFT.md) |
| Budget and approved paid services | No paid services authorized. No API keys configured as of 10:50 CT |
| Repo visibility and license | Public repository; license undecided |

## Product and MVP

- **User:** Adults who understand a conversation and know what they want to say, but for whom speaking or typing is slow or difficult (for example, some people with ALS). Not tested with AAC users.
- **Problem:** Composing a reply can take longer than the conversation allows, which costs participation, humor, disagreement, and initiative.
- **One-sentence pitch:** Still Here offers three possible complete replies that the person can choose, reject, guide, or replace with their own words. Nothing is spoken until they review the exact text and confirm it separately.
- **Demo flow:** Partner types a question → three suggestions → None of these → Guide: suggest an alternative → select → review → confirm → speech → start a conversation. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md).
- **Must ship:** (1) typed input → suggestions → review → separate confirmation → speech; (2) switch-accessible rejection, guidance, and independent composition; (3) honest source labeling (fixture vs. live vs. local).
- **Stretch goals:** Partner audio transcription; approved-preference UI with persistence; measurement mode.
- **Out of scope:** Blink/camera input (deferred), native app, face recognition, emotion inference, clinical features, emergency dispatch.
- **Success check:** A teammate runs `npm run dev`, completes the demo flow with the keyboard/switch only, and hears exactly the confirmed text.

Full requirements: [PRODUCT_SPEC.md](PRODUCT_SPEC.md).

## Team

| Responsibility | Human owner |
| --- | --- |
| Product and scope | Liam Howeth |
| Integration and PR review | Liam Howeth (Claude Code acts as integrator under Liam's direction) |
| Demo and final submission | Liam Howeth |
| Features / components | Implemented by Claude Code workstreams (runtime, interface, docs, tests) directed by Liam |

## Technical decisions

- Platforms, languages, and frameworks: Web app; Next.js 16.4.3 App Router, React 19.3, TypeScript, zod 4, `@anthropic-ai/sdk` 1.3.0, vitest 5.
- Required toolchain versions: Node.js + npm (versions pinned in `package-lock.json`); Python 3.10+ for `scripts/check_repo.py`.
- Installation, run, build, and test commands: `npm install`, `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run check` (see [README](../README.md)).
- Component boundaries and shared interfaces: `src/core` (pure reducer/contracts), `src/adaptation`, `src/server`, `src/runtime/contract.ts`. See [ARCHITECTURE.md](ARCHITECTURE.md).
- Data storage and synthetic demo fixtures: In-memory session state. Approved preferences in local storage only with consent. Synthetic fixtures in `src/server/fixtures.ts`.
- Configuration variable names and secure provisioning: See [.env.example](../.env.example). Values go in `.env.local` (gitignored). Never record values here.
- External APIs, rate limits, cost, and offline/demo fallback: Anthropic Messages API (live replies, not verified); OpenAI-compatible transcription (not verified); labeled Fixture mode and Local-only mode as fallbacks; in-memory per-process rate limit.
- Hosting, signing, or deployment owner: Liam. Local only so far; no deployment authorized.

## Decisions and scope changes

| Date | Decision and reason | Human owner / PR |
| --- | --- | --- |
| 2026-10-24 | Prepare a general collaboration foundation; choose the event, idea, and stack later. | Liam / setup request |
| 2026-10-24 | Liam approved Claude pushing working checkpoints directly to `main` during the hackathon (while `main` is unprotected); otherwise use PRs. | Liam / Claude Code chat |
| 2026-10-24 | Build Still Here (conversation-first AAC) for SASEHacks for Good, using Liam's master prompt as the brief. | Liam / master prompt |
| 2026-10-24 | Stack: Next.js + TypeScript single app; Anthropic adapter for replies; Fixture mode as default demo path because no API key is configured; blink input deferred. Details in [DECISIONS.md](DECISIONS.md). | Liam / Claude Code session |
