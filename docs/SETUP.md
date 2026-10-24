# Setup checklist

This is the owner and teammate checklist. The repository files supply instructions, templates, and a CI workflow; they do not configure accounts, collaborators, branch protections, or tool permissions.

## Owner: do now

1. Review and merge the foundation PR after its `Repository hygiene` check passes.
2. In the repository's **Settings → Collaborators**, invite each teammate's GitHub account with the access they need.
3. Confirm whether the team wants this repository to stay public. The initial repository is public; keep credentials and private material outside Git regardless of visibility.
4. In **Settings → Rules → Rulesets** (or branch protection), protect `main`: require a pull request, require the `Repository hygiene` check once it has run, block force pushes and deletion, and require one human approval once another reviewer is available. Avoid leaving the active rule bypassable for routine work. Verify enforcement using the next PR.
5. Review GitHub's secret protection options and enable secret scanning / push protection where available. The local hygiene script catches common filenames, not secret values embedded in arbitrary files.

The initial setup does not enable automatic merges, deployments, AI subscriptions, or spending. Instruction files guide assistants; branch rules and human review enforce the merge process. Do not treat AI-generated review as the human approval requirement.

## Every teammate: do now

1. Accept the GitHub invitation and verify Git is installed and authenticated for your account. Use your own account and credentials.
2. Clone the repo using the README commands, or pull `main` after the foundation PR is merged.
3. Install Python 3.10+ if you do not already have it. Confirm with `python3 --version`, then run `python3 scripts/check_repo.py`. No app runtime or paid AI plan is required for this foundation.
4. Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md), then open the repository root in your editor or AI tool.
5. Start your first AI session with the prompt below. Confirm it can read the actual repo files and repeat the relevant rules. Keep your normal permission controls enabled; the repo does not grant unrestricted shell, account, or deployment access.

```text
Read AGENTS.md, AGENT_NOTES.md, README.md, and docs/PROJECT_BRIEF.md first.
Inspect the current branch, Git status, and existing implementation.
Summarize the relevant constraints before editing.
My task is: <one small outcome and its acceptance criteria>.
Keep the diff focused, preserve other work, run relevant checks, and report
what you actually verified. Prepare a PR; leave merge/release to a human.
```

## AI tool entry points

- **Codex:** root `AGENTS.md` supplies project instructions. Open the repo root as the project and start a new task after pulling instruction changes. [Official guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
- **Claude Code:** `CLAUDE.md` imports `AGENTS.md` so the shared policy is available even in sessions that do not load `AGENTS.md` directly. Verify loaded instructions in the tool. [Official guidance](https://code.claude.com/docs/en/memory).
- **GitHub Copilot:** `.github/copilot-instructions.md` points to the shared rules and repeats the essential constraints. Ensure repository custom instructions are enabled; support varies by client and feature. [Official guidance](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions).
- **Other AI tools:** explicitly attach/read `AGENTS.md` and the relevant task files. Do not assume that an arbitrary tool automatically discovers them.

Use a tool you already have access to. These files do not install agents, configure cloud review, create API accounts, or guarantee an assistant will obey every instruction. The task owner remains responsible for reviewing the work.

## Together: when the event and idea are chosen

- Fill in [the project brief](PROJECT_BRIEF.md): official rules, AI/pre-event policy, deadline with timezone, demo flow, three or fewer MVP outcomes, stack, and human owners.
- Choose a license if you want to grant reuse rights, consistent with event and dependency requirements. Do not let an assistant invent this decision.
- Add the app and exact setup/run/build/test commands in the first implementation PR; add real app CI and required checks at the same time.
- Provision any necessary accounts, signing identities, development secrets, and hosting through the human owner. Document variable names and safe examples, never values.
- Agree on the shared interfaces, split small tasks, and rehearse the demo with synthetic data early.
