---
name: checkpoint
description: Save a working hackathon increment. Verify it runs, run repo checks, commit, push, and log status. Use after finishing a feature, before risky changes, or when the user says checkpoint/save/commit.
---

# Checkpoint

1. **Verify behavior.** Build/start the app and exercise the part that changed (browser preview, simulator, curl). If it's broken, fix it or say so; never checkpoint a broken demo silently.
2. **Run checks.** `python3 scripts/check_repo.py`, `git diff --check`, and the stack's build/tests once they exist. Report each as passed/failed/not run.
3. **Review the diff.** `git status` and `git diff`. No secrets, `.env` files, large binaries, or build output. Stage specific paths.
4. **Commit** with a short message describing what now works.
5. **Push.** If the `docs/PROJECT_BRIEF.md` Decisions table records Liam's direct-push approval and `main` isn't protected, push `main`. Otherwise push a task branch and open a PR with the template. If GitHub rejects the push (new remote commits, protection), fetch and inspect first. Never force-push.
6. **Log.** If AI did meaningful work, add or extend a row in `docs/AI_USAGE.md`. Update `AGENT_NOTES.md` only for durable technical facts. State time left until the deadline; if more than half the time is gone and must-ships aren't done, propose cuts.
