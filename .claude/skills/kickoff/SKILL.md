---
name: kickoff
description: Start the hackathon once the challenge is revealed. Fill the project brief, shortlist ideas, lock MVP scope, pick a stack, then scaffold a runnable skeleton. Use when the user pastes the prompt/rules or says the hackathon has started.
---

# Kickoff

Input: whatever the user gives you (pasted prompt, rules page URL, screenshot, judging criteria). $ARGUMENTS

1. **Capture the event facts** in `docs/PROJECT_BRIEF.md` → Event and constraints: rules URL, deadline with timezone (America/Chicago), theme/tracks/judging, team size, pre-event and AI-use/disclosure policy, submission materials. Only record facts you were given; leave the rest `Unconfirmed`. If a missing fact changes what we build (required tech, deadline, AI policy), ask one short question.
2. **Shortlist 3 ideas.** Score each against the judging criteria, demo impact, and buildability in the time left. Favor ideas with one clear "wow" moment you can show in 60 seconds. Present them with a recommendation and wait for Liam to pick or accept.
3. **Lock scope** in the brief → Product and MVP: user, problem, one-sentence pitch, demo flow, at most three must-ship outcomes (target done by ~50% of the time), stretch goals, out of scope, success check. Add a Decisions row naming the choice and Liam as owner.
4. **Pick the stack.** Prefer what the team can demo fastest unless rules require otherwise (web: Vite + React + TS; backend: Python 3.14 `.venv` or Node 24; Apple: SwiftUI / Xcode 27.1). Record it under Technical decisions.
5. **Scaffold** the minimal runnable skeleton, a `.env.example` if keys are needed, and add any dev server to `.claude/launch.json`. Start it and confirm it runs. Update the README run/build/test commands and `AGENT_NOTES.md` per `AGENTS.md`.
6. **Plan the build.** Break the must-ships into ordered, owned tasks with rough time boxes. Flag the riskiest piece and spike it first.
7. Run `/checkpoint`.
