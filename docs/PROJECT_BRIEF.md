# Project brief

Status: event and idea selected (Still Here, **iPad eyebrow NEXT + long-blink SELECT + ElevenLabs** since ~12:00 CT). Facts below come from Liam's master prompts and the event briefing they supplied, and from the repository itself. The one-file iPad + ElevenLabs prompt now governs and supersedes the blink-first and earlier briefs. Fields still unconfirmed are marked. Do not invent answers to fill the template.

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
| Budget and approved paid services | An OpenAI key and a Railway deployment are in use (from ~11:15 CT). ElevenLabs is the required voice; Liam is obtaining its key (not provided at 12:05). Keys are kept in `.env.local` and Railway variables only. Spending limits not recorded |
| Repo visibility and license | Public repository; license undecided |

## Product and MVP

- **User:** Adults who understand a conversation and know what they want to say, but for whom speaking or typing is slow or difficult (for example, some people with ALS), and who can make a deliberate eyebrow raise and long blink (others use the fallbacks). Not tested with AAC users.
- **Problem:** Composing a reply can take longer than the conversation allows, which costs participation, humor, disagreement, and initiative.
- **One-sentence pitch:** On an iPad, Still Here offers three possible complete replies that the person can move through with half-second eyebrow raises and choose, reject, guide, or replace with their own words using long blinks. Nothing is spoken until they review the exact text and confirm it with a separate blink, and then a natural ElevenLabs voice says exactly that.
- **Demo flow (hands-free after calibration and one audio touch):** calibrate → Enable Audio → partner types a question → eyebrow NEXT through options → blink None of these → Guide: suggest an alternative → blink to select → review on Cancel → eyebrow to Speak → new blink → ElevenLabs speech → Start a conversation. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md).
- **Must ship:** (1) local iPad front-camera tracking with individual calibration, 500 ms eyebrow NEXT, long-blink SELECT at closure onset, a separate blink to confirm, and a small live preview; (1b) ElevenLabs primary voice with a labeled basic-voice fallback; (2) the shared kernel: typed input → suggestions → review → separate confirmation → speech, with rejection, guidance, and independent composition reachable by blink; (3) working keyboard/switch fallback and honest source labeling.
- **Stretch goals:** Partner audio in the demo; preference persistence across reload; measurement export.
- **Out of scope:** Gaze cursor, face recognition, emotion inference, a native app in the demo (an experimental iOS client exists outside the demo path), clinical features, emergency dispatch.
- **Success check:** On a real iPad after setup, an operator completes three turns hands-free (one regeneration, one independent message) and hears exactly the confirmed text in the ElevenLabs voice, and the §24 iPad trial is recorded. If any part fails, the tested fallback is used and the limitation is disclosed. If the iPad can't be tested, say "not iPad-verified".

Full requirements: [PRODUCT_SPEC.md](PRODUCT_SPEC.md).

## Team

| Responsibility | Human owner |
| --- | --- |
| Product and scope | Liam Howeth |
| Integration and PR review | Liam Howeth (Claude Code acts as integrator under Liam's direction) |
| Demo and final submission | Liam Howeth |
| Features / components | Implemented by Claude Code workstreams (runtime, interface, docs, tests) directed by Liam |

## Technical decisions

- Platforms, languages, and frameworks: Web app; Next.js 16.4.3 App Router, React 19.3, TypeScript, zod 4, `@mediapipe/tasks-vision` 1.1.1, `@anthropic-ai/sdk` 1.3.0, vitest 5.
- Required toolchain versions: Node.js + npm (versions pinned in `package-lock.json`); Python 3.10+ for `scripts/check_repo.py`.
- Installation, run, build, and test commands: `npm install`, `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run check` (see [README](../README.md)).
- Component boundaries and shared interfaces: `src/core` (pure reducer/contracts), `src/adaptation`, `src/server`, `src/runtime/contract.ts`. See [ARCHITECTURE.md](ARCHITECTURE.md).
- Data storage and synthetic demo fixtures: In-memory session state. Approved preferences in local storage only with consent. Synthetic fixtures in `src/server/fixtures.ts`.
- Configuration variable names and secure provisioning: See [.env.example](../.env.example). Values go in `.env.local` (gitignored). Never record values here.
- External APIs, rate limits, cost, and offline/demo fallback: OpenAI Responses API `gpt-6-astra` (verified) and `gpt-transcribe` (verified); Anthropic adapter (unverified); labeled Fixture and Local-only modes as fallbacks; in-memory per-instance rate limits and access-code throttling. Gesture detection runs in the browser with no external API. ElevenLabs (`eleven_v4_turbo`) via server-side `POST /api/speech`: in progress, not configured.
- Hosting, signing, or deployment owner: Liam. Railway project `still-here`, service `api` (`https://api-production-18038.up.railway.app`), single instance, access code required. Blink assets were served by 11:46 CT; a redeploy is pending for the eyebrow, iPad UI, and ElevenLabs work. HTTPS is required for the iPad camera.

## Decisions and scope changes

| Date | Decision and reason | Human owner / PR |
| --- | --- | --- |
| 2026-10-24 | Prepare a general collaboration foundation; choose the event, idea, and stack later. | Liam / setup request |
| 2026-10-24 | Liam approved Claude pushing working checkpoints directly to `main` during the hackathon (while `main` is unprotected); otherwise use PRs. | Liam / Claude Code chat |
| 2026-10-24 | Build Still Here (conversation-first AAC) for SASEHacks for Good, using Liam's master prompt as the brief. | Liam / master prompt |
| 2026-10-24 | Stack: Next.js + TypeScript single app; Fixture mode as the default because no key was configured at first; blink deferred. Details in [DECISIONS.md](DECISIONS.md). | Liam / Claude Code session |
| 2026-10-24 ~11:18 | OpenAI (`gpt-6-astra`) adopted as the runtime provider and deployed to Railway behind an access code. | Liam / Claude Code session |
| 2026-10-24 ~11:20 | **Direction changed to blink-first** per the new master prompt. Webcam blink is the primary input and demo. Keyboard/switch become fallbacks. The native iOS client stays out of the demo path. | Liam / blink-first master prompt |
| 2026-10-24 ~12:00 | **Direction changed to iPad eyebrow NEXT + long-blink SELECT + ElevenLabs** per the one-file brief. Auto-scan + blink, keyboard/switch, and touch become fallbacks. ElevenLabs is the required voice. The native iOS client stays out of the demo. See D27–D35 in [DECISIONS.md](DECISIONS.md). | Liam / iPad + ElevenLabs brief |
