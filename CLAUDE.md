@AGENTS.md

Keep shared policy in `AGENTS.md`. Read `AGENT_NOTES.md` and `docs/PROJECT_BRIEF.md` before work.

## Still Here (the app in this repo)

Conversation-first AAC prototype: Next.js 16 App Router, React 19, TypeScript, zod 4, `@anthropic-ai/sdk`, vitest. Full requirements are in [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Live status is in [docs/PROGRESS.md](docs/PROGRESS.md).

**Commands:** `npm run dev` (preview entry `still-here-dev`, port 3000) · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run check` (all of these plus `scripts/check_repo.py`).

**Invariants. Never break these:**
1. Nothing is spoken without a deliberate selection plus a separate, fresh confirmation of the exact displayed text. `confirmSpeak` in `src/core/reducer.ts` is the only path to a `speak` effect.
2. Every input source (pointer, keyboard, switch) goes through `ACTIVATE` → `targetsFor(state)`. Never call speech or mutate state directly from a component.
3. Review snapshots are immutable. Async results are checked against epoch, workspace, request, context and preference revisions before they install.
4. New partner input is staged, never substituted for the active question or draft.
5. Rejections are turn-scoped. Observations are session-only. Nothing persists without the `confirm-change` flow.
6. Local phrases and own-words composition must keep working when AI, the microphone, or storage fails.

**Boundaries:**
- `src/core` holds pure state and decisions.
- `src/adaptation` holds the preference policy, observations and storage.
- `src/runtime`, `src/access` and `src/audio` hold browser effects (scanner, input, speech, recording).
- `src/components` holds presentation only.
- `src/server` and `src/app/api` are server-only. Provider code and secrets never reach the client.

**Evidence rules:** keep build status, verification level (unit, browser, hardware) and measurements separate in `docs/PRESENTATION_LOG.md` and `docs/TEST_RESULTS.md`. Mocked-provider tests prove plumbing, not model behavior. Write "not measured" rather than placeholder numbers. Fixture output must always be labeled as fixture output.

## Claude Code specifics

These add tooling details only. If anything here seems to conflict with `AGENTS.md`, `AGENTS.md` wins.

- **Hackathon pace.** A narrow, working demo beats a broad one that doesn't work. If a task has eaten about 30 minutes with no progress, stop, report it, and propose a cheaper path (mock it, cut it, or swap the library). Label the fallback honestly.
- **Pushing.** Push to `main` only while the Decisions table in `docs/PROJECT_BRIEF.md` records Liam's approval for direct checkpoint pushes. Otherwise use a task branch and a PR.
- **Dev servers.** When a runnable app exists, add it to `.claude/launch.json` so `preview_start` can run it. Don't start servers with bare Bash.
- **Apple targets.** Use the reusable iPhone 17 Pro simulator (`D9ED530C-743A-4714-A9B1-C69A9B28F708`). Never use the protected Basketball baseline simulator.
- **Claude API features.** Take model ids and SDK usage from the `claude-api` skill, not from memory. Keys stay server-side in env vars.
- **Secrets.** `.claude/settings.json` blocks Claude from reading `.env` files. Document variable names in a `.env.example`.
- **Plugins.** For game, SwiftUI, or UI-heavy work, suggest one or two fitting entries from `~/.claude/references/dev-skill-repos.md`. Don't install anything without Liam's OK.

### Project skills (`.claude/skills/`)

- `/kickoff`: turn the revealed challenge into the project brief, an idea shortlist, MVP scope, and a stack. Scaffold only after the choice is recorded.
- `/checkpoint`: verify, run `scripts/check_repo.py`, commit, push per the rule above, and log status.
- `/demo-check`: rehearse the demo from a fresh start against `docs/DEMO.md`.
- `/pitch`: draft the README, submission text, and a timed demo script from what actually works. Never submit.
