# HACKATHON

Shared starting point for our hackathon team. The event, idea, and technology stack are still undecided. This repository currently contains collaboration docs and repository checks; there is no application to run yet.

## Start here

1. Read [the team workflow](CONTRIBUTING.md) and [AI ground rules](AGENTS.md).
2. Follow [the setup checklist](docs/SETUP.md) to join the repo and configure your tools.
3. When we choose an idea, fill in [the project brief](docs/PROJECT_BRIEF.md) together.
4. Pick one small task, give it a human owner, and open a branch and pull request.

## Get the repository

```sh
git clone https://github.com/LiamHoweth/HACKATHON.git
cd HACKATHON
python3 scripts/check_repo.py
```

The repository check uses Python 3.10 or newer and no third-party packages. It checks local Markdown file links and common sensitive filenames in tracked or unignored files. It is not an application build, test suite, or comprehensive secret scanner.

After selecting a stack, the first implementation PR must document prerequisites, installation, configuration, run, build, and test commands here and add the corresponding CI checks. Do not guess those commands or install a framework just to complete setup.

## Where things live

| File | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Shared rules for AI coding assistants |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branches, task ownership, reviews, and done criteria |
| [Project brief](docs/PROJECT_BRIEF.md) | Event rules, MVP, stack, team, and decisions |
| [Setup checklist](docs/SETUP.md) | Owner and teammate actions |
| [AI usage](docs/AI_USAGE.md) | Concise disclosure of meaningful AI assistance |
| [Demo checklist](docs/DEMO.md) | Demo rehearsal and submission preparation |
| [AGENT_NOTES.md](AGENT_NOTES.md) | Current technical handoff notes |
| [CLAUDE.md](CLAUDE.md), `.claude/` | Claude Code entry file, project settings, and hackathon skills |

## Working agreements

- Keep `main` demo-ready. Use small PRs and human review.
- Own one task at a time; coordinate before changing shared files.
- AI may help, but a human must understand, validate, and own the result.
- Store credentials outside Git. Commit safe configuration examples and synthetic demo data only.
- Record unknowns honestly. Confirm the event's rules before competition work or submissions.
