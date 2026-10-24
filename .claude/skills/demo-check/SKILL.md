---
name: demo-check
description: Rehearse the hackathon demo and check submission readiness against docs/DEMO.md and the brief. Use before the deadline, before recording a video, or when the user asks if we're ready.
---

# Demo check

1. From a fresh start (stop servers, restart from the README commands), run the exact demo flow in `docs/PROJECT_BRIEF.md` step by step. Use the browser preview or simulator and save key screenshots to `docs/screenshots/`.
2. Report each step as passed, failed, or flaky. For flaky steps, propose the simplest stabilization (seed data, cached response, fallback path) and label it honestly as a mock.
3. Walk `docs/DEMO.md` item by item. Mark only what you actually verified, and list what needs a human (rules confirmation, final submission).
4. Presentation basics: no console errors in the demo path, readable at projector size, no placeholder text, and no secrets or private data on screen.
5. Output a go/no-go list, with the remaining fixes ordered by impact per minute.
