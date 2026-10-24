# AI assistance record

Keep meaningful assistance traceable without saving full chats, private prompts, or secret values. A PR can hold the details instead; link it here if needed for the event's disclosure. Do not log every autocomplete.

Each entry should identify the tool, contribution, human review, and validation. Record imported code/assets and their sources or licenses separately where they are used. The submission owner checks the event's actual disclosure requirements before submission; this record alone does not establish eligibility.

| Date | Tool | Contribution / affected area | Human review | Validation |
| --- | --- | --- | --- | --- |
| 2026-10-24 | Codex | General repository docs, shared AI ground rules, GitHub templates, and repository hygiene script/workflow. No application implementation. | Pending review of the setup PR | See setup PR for exact commands and results. |
| 2026-10-24 | Claude Code | `CLAUDE.md` tooling section, `.claude/` project settings, launch stub, and kickoff/checkpoint/demo-check/pitch skills. No application implementation. | Liam approved push in chat | `python3 scripts/check_repo.py`, `git diff --check`, JSON validation. |
| 2026-10-24 (from ~09:00 CT) | Claude Code (Opus 5.5) | Implemented the Still Here application from Liam's master prompts (blink-first from ~11:20 CT): core reducer/contracts, adaptation logic, server adapters (OpenAI and Anthropic replies, transcription), blink access (MediaPipe integration, gesture state machine, calibration; in progress), an experimental native SwiftUI client (outside the demo path), fixtures, browser runtime, access/audio, UI components, tests, and the README/`docs/*` presentation materials. An integrator session coordinated subagents for runtime, interface, docs, and tests. Liam directed scope and priorities; Liam owns the accuracy of this disclosure and compliance with event rules. | Liam directing and reviewing; review of the final diff pending | See [TEST_RESULTS.md](TEST_RESULTS.md) for commands actually run and their results. |
