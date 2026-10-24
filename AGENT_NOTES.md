# Agent notes

- The app is **Still Here**, a conversation-first AAC prototype (Next.js 16.4 App Router, React 19.3, TypeScript, zod 4, `@anthropic-ai/sdk` 1.3, vitest 5). Commands: `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run check`.
- `AGENTS.md` is the shared AI policy. `CLAUDE.md` imports it and adds Still Here invariants and boundaries. Copilot's entry file points to `AGENTS.md`.
- Architecture: `src/core/reducer.ts` makes every decision. `src/core/targets.ts` (`targetsFor`) is the only target registry, and every input goes through `ACTIVATE`. Browser effects run once each in `src/runtime/effects-runner.ts`. Details are in `docs/ARCHITECTURE.md`.
- Live AI requires `.env.local` with `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and `REPLY_MODEL`. Without them the app offers the labeled fixture mode and local-only mode. As of 2026-10-24 11:05 CT no key was configured, so live generation and transcription were unverified.
- `docs/PROJECT_BRIEF.md` owns event facts and team decisions. `docs/PROGRESS.md` owns current status. `docs/TEST_RESULTS.md` records only executed checks.
- CI: `Repository hygiene` (links, sensitive filenames, whitespace) and `App checks` (typecheck, lint, test, build). The API tests mock the Anthropic SDK.
- Next.js 16 `next dev` may append a managed block to `AGENTS.md`; that block is expected.
