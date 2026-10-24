# Agent notes

- Foundation only: no application, product decision, runtime dependencies, or app build/test commands yet.
- `AGENTS.md` is the shared AI policy; `CLAUDE.md` imports it and Copilot's entry file points to it.
- `docs/PROJECT_BRIEF.md` owns event rules, team decisions, MVP, and toolchain choices. Undecided fields are intentional.
- `python3 scripts/check_repo.py` uses only Python 3.10+ standard libraries. CI's `Repository hygiene` job runs it and a whitespace check. It does not build or test an app or provide comprehensive secret scanning.
- When implementation begins, update README setup commands and add real build/test CI in the same PR. Repository settings, collaborators, credentials, hosting, and a license are owner decisions; file setup does not configure them.
