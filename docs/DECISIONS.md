# Decisions

Important choices, assumptions, and deviations from the master prompt. Team-level decisions are also listed in the [project brief](PROJECT_BRIEF.md) Decisions table.

| # | Date / time (CT) | Decision | Reason | Consequence / follow-up |
| --- | --- | --- | --- | --- |
| D1 | 2026-10-24 morning | Build Still Here: conversation-first AAC with accessible controls | Liam's selected direction for SASEHacks for Good | Master prompt is the source brief |
| D2 | 2026-10-24 | Next.js App Router + React + TypeScript, single app with server route handlers | The prompt recommends it for a new project; it keeps provider keys server-side | `npm` scripts in `package.json` |
| D3 | 2026-10-24 | One pure reducer plus queued effects; one target registry for all inputs | Lets us enforce the speech invariants in one testable place and gives pointer, keyboard, and switch one guarded path | Browser effects run in `src/runtime/effects-runner.ts` |
| D4 | 2026-10-24 | zod 4 strict schemas on every boundary (request, model output, storage) | Client and model data are untrusted | Unknown fields are rejected |
| D5 | 2026-10-24 | Anthropic Messages API as the single generation provider; model chosen by `REPLY_MODEL` (suggested `claude-opus-5-5`) | One provider with structured JSON output. The model id comes from the Claude API skill table cached 2026-10-06, not from older prompts | Must be verified against the live account. No other providers added |
| D6 | 2026-10-24 | `effort: 'low'`, SDK `maxRetries: 0`, at most one app-level repair within `GENERATION_TIMEOUT_MS` | Keeps latency low and avoids multiplying SDK, app, and UI retries | Rate limits and refusals are not retried automatically |
| D7 | 2026-10-24 | Server-side refusal fallback on by default (`REPLY_FALLBACKS=default`, beta `server-side-fallback-2026-07-01`) | Reduces dead ends from refusals on ordinary conversational content | `REPLY_FALLBACKS=off` disables it. Behavior not verified live |
| D8 | 2026-10-24 ~10:50 | **Fixture mode is the default demo path** | No live API key was configured on the dev machine. Fixtures are explicit, synthetic, and labeled `demo-fixture` | Demo must say "Fixture demo" aloud. Live claims are not allowed until verified |
| D9 | 2026-10-24 | Transcription via an OpenAI-compatible `/audio/transcriptions` adapter (`TRANSCRIPTION_PROVIDER=openai`) | One transcription path behind a small adapter, kept separate from reply generation | Model left empty in the template. Not verified |
| D10 | 2026-10-24 | **Deterministic, length-only session learning** | The prompt calls for a small explainable evidence model and forbids LLM personality inference. Length is the one dimension where word counts give a defensible signal | Other dimensions can only be set manually |
| D11 | 2026-10-24 | Proposal threshold of 3 distinct turns; hint threshold of 2; 30-minute expiry; last 20 observations | Configurable heuristics suggested by the prompt. They are not statistical confidence | No confidence percentages are shown |
| D12 | 2026-10-24 | **Cross-tab synchronization disabled** (no `storage` event listener; see `src/adaptation/preference-store.ts`) | The prompt forbids a second tab silently rewriting a review or preferences. Disabling sync is the simplest safe option | Two open tabs can diverge; the last write wins on reload. Document this |
| D13 | 2026-10-24 | **Blink/camera input deferred** (P2) | Keyboard/switch foundation and conversation features come first. Camera work carries privacy, licensing, and reliability risk | No camera code, MediaPipe assets, or face data in the repo |
| D14 | 2026-10-24 | Chicago Face Database not used | Research-only consideration with redistribution and cloud-upload restrictions, and it cannot validate live blink input | Recorded in [REFERENCES.md](REFERENCES.md) as deferred |
| D15 | 2026-10-24 | Paid endpoints refuse non-localhost requests unless `APP_ACCESS_TOKEN` is set | A public paid endpoint needs real server-side protection | In-memory rate limiter is for a single process only |
| D16 | 2026-10-24 | Confirmation requires a new input cycle/event, a current surface revision, and a 600 ms arming delay after the review opens | Prevents a held or repeated gesture from selecting and confirming at once | 600 ms is an engineering default, not tested with users |
| D17 | 2026-10-24 | Duplicate screening keeps every word (negations stay distinct) | "I can come" and "I cannot come" must not be merged | Screening only; not proof of semantic diversity |
| D18 | 2026-10-24 | English-only word-count length policies (14/24/40 words) | Prototype scope | Not a multilingual implementation |
