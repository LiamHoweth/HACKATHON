@AGENTS.md

Keep shared policy in `AGENTS.md`. Read `AGENT_NOTES.md` and `docs/PROJECT_BRIEF.md` before work.

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
