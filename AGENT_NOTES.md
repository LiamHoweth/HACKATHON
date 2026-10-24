# Agent notes

- The app is **Still Here**, a conversation-first AAC prototype (Next.js 16.4 App Router, React 19.3, TypeScript, zod 4, `@anthropic-ai/sdk` 1.3, vitest 5). Commands: `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run check`.
- `AGENTS.md` is the shared AI policy. `CLAUDE.md` imports it and adds Still Here invariants and boundaries. Copilot's entry file points to `AGENTS.md`.
- Architecture: `src/core/reducer.ts` makes every decision. `src/core/targets.ts` (`targetsFor`) is the only target registry, and every input goes through `ACTIVATE`. Browser effects run once each in `src/runtime/effects-runner.ts`. Details are in `docs/ARCHITECTURE.md`.
- Live AI: `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `REPLY_MODEL=gpt-6-astra`, with transcription by `gpt-transcribe`. These are set in the git-ignored `.env.local` and in Railway variables. Both were verified live with synthetic inputs on 2026-10-24. The Anthropic adapter exists but is unverified.
- Deployment: Railway project `still-here`, service `api`, at https://api-production-18038.up.railway.app. Deploy with `railway up --service api`. On the deployed server, live AI and transcription require the `x-still-here-access` header. The access code is in Railway variables and the git-ignored `.env.railway.local`; never print it.
- Blink-first (the current brief): MediaPipe Face Landmarker runs locally, with assets in `public/models` and `public/wasm`. `src/access/blink-*.ts` holds the pure gesture and calibration logic, and `src/runtime/useBlink.ts` holds the adapter. Blink selects go through the same guarded `ACTIVATE` path.
- `ios/` holds an experimental SwiftUI client (xcodegen). It is outside the demo path.
- `docs/PROJECT_BRIEF.md` owns event facts and team decisions. `docs/PROGRESS.md` owns current status. `docs/TEST_RESULTS.md` records only executed checks.
- CI: `Repository hygiene` (links, sensitive filenames, whitespace) and `App checks` (typecheck, lint, test, build). The API tests mock the Anthropic SDK.
- Next.js 16 `next dev` may append a managed block to `AGENTS.md`; that block is expected.
