# Team workflow

Read [the project brief](docs/PROJECT_BRIEF.md) and [AI ground rules](AGENTS.md) before starting. Keep the process small enough to use during a hackathon.

## Take a task

Create an issue using the task template, or agree on a small task in team chat and reference it in the PR. Every task needs a human owner, an observable acceptance criterion, and the files or interfaces likely to be shared. Coordinate overlapping work before editing.

One teammate should own integration and demo readiness. Assign that role in the brief; AI is not the accountable owner.

## Branch and change

```sh
git switch main
git pull --ff-only
git switch -c feat/short-task-name
```

Use `fix/`, `docs/`, or `chore/` when clearer; Codex-created branches use `codex/`. Check `git status` before switching branches and preserve local changes. Keep each PR about one outcome.

Before committing, inspect the diff and staged files. Commit only intended files; avoid blanket staging when unrelated work is present. Include normal dependency lockfiles when a stack is selected. Keep local credentials and generated build output out of Git.

## Validate and review

Run `python3 scripts/check_repo.py` and the build/tests relevant to the change. Use `git diff --check` before staging or `git diff --cached --check` after staging. Record commands and results in the PR. For visible behavior, attach a screenshot or describe the manual verification and device/browser used. Say when a check is unavailable.

Open a PR to `main` using the template. Disclose meaningful AI help and reused assets, and identify limitations. Another human teammate should review the diff and understand the change before merging. While working alone, explicitly review your own diff and checks; never label that as an independent review. GitHub enforcement is configured separately by the owner in [the setup checklist](docs/SETUP.md).

## Definition of done

- The acceptance criteria work and the change is integrated without breaking the agreed demo flow.
- Relevant checks pass, or a human reviewer explicitly accepts a documented limitation. Never mark a failed check as passed.
- User-facing errors, empty/loading states, and accessibility are considered where applicable.
- Setup instructions, configuration examples, and API contracts reflect the actual implementation.
- A human can explain the code, its dependencies, and the AI assistance used.

## Dependencies, data, and submission

Use existing or native tooling where practical. Propose significant dependency or service changes with their purpose, setup cost, license, and effect on teammates. Paid services and external publication require explicit owner authorization.

Keep datasets synthetic or approved for use. Record the source and license of reused material near its use. A public repo does not establish the team's licensing decision; choose a license together after checking event requirements.

Use [the demo checklist](docs/DEMO.md) before submission. The human submission owner confirms the event rules, AI disclosure, links, and final submission receipt.
