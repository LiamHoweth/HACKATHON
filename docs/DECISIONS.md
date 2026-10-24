# Decisions

Important choices, assumptions, and deviations from the master prompt. Superseded rows stay in the table so the history is preserved. Team-level decisions are also listed in the [project brief](PROJECT_BRIEF.md).

| # | Date / time (CT) | Decision | Reason | Consequence / follow-up |
| --- | --- | --- | --- | --- |
| D1 | 2026-10-24 morning | Build Still Here: conversation-first AAC with accessible controls | Liam's selected direction for SASEHacks for Good | Refined by D19 (blink-first) |
| D2 | 2026-10-24 | Next.js App Router + React + TypeScript, single app with server route handlers | Keeps provider keys server-side in one deployable app | `npm` scripts in `package.json` |
| D3 | 2026-10-24 | One pure reducer plus queued effects; one target registry for all inputs | Enforces the speech invariants in one testable place. Every input shares one guarded path | Blink must emit the same guarded `ACTIVATE` (D21) |
| D4 | 2026-10-24 | zod 4 strict schemas on every boundary | Client and model data are untrusted | Unknown fields are rejected |
| D5 | 2026-10-24 | ~~Anthropic as the single generation provider~~ | — | **Superseded by D24** |
| D6 | 2026-10-24 | No SDK retries; at most one app-level repair within `GENERATION_TIMEOUT_MS` | Avoids multiplying retries across layers | Rate limits and refusals are not retried |
| D7 | 2026-10-24 | Anthropic refusal-fallback beta on by default when that provider is used | Fewer dead ends on ordinary content | Applies only to the unverified Anthropic path |
| D8 | 2026-10-24 ~10:50 | Fixture mode as the default setup choice | No key existed then. Fixtures are synthetic and labeled | Live AI has since been verified (D24). The demo may use Live. Say which source is on screen |
| D9 | 2026-10-24 | Transcription via an OpenAI-compatible `/audio/transcriptions` adapter | Small adapter, separate from reply generation | `gpt-transcribe` verified with a synthetic clip |
| D10 | 2026-10-24 | Deterministic, length-only session learning | Explainable. No LLM personality inference | Other dimensions are set manually |
| D11 | 2026-10-24 | Proposal after 3 distinct turns; hint after 2; 30-minute expiry; last 20 observations | Configurable heuristics, not statistical confidence | No confidence percentages shown |
| D12 | 2026-10-24 | Cross-tab synchronization disabled | A second tab must not silently rewrite review or preferences | Two tabs can diverge |
| D13 | 2026-10-24 | ~~Blink/camera input deferred (P2)~~ | — | **Superseded by D19** |
| D14 | 2026-10-24 | Chicago Face Database not used | Research-only terms. Static photos cannot validate live blink input | Recorded in [REFERENCES.md](REFERENCES.md) |
| D15 | 2026-10-24 | Paid endpoints refuse non-localhost requests unless `APP_ACCESS_TOKEN` is set. Failed codes are throttled (commit `6ea84db`) | A public paid endpoint needs server-side protection | Throttling not yet deployed |
| D16 | 2026-10-24 | Confirmation needs a new input cycle/event, a current surface revision, and a 600 ms arming delay | One held gesture must never both select and confirm | For blink, a new closure is a new cycle. 600 ms is untested with users |
| D17 | 2026-10-24 | Duplicate screening keeps negations distinct | "I can come" ≠ "I cannot come" | Screening only |
| D18 | 2026-10-24 | English-only word-count length policies (14/24/40 words) | Prototype scope | Not multilingual |
| D19 | 2026-10-24 ~11:20 | **Blink-first.** Deliberate eye closure over automatic scanning is the primary input, the default setup choice, and the judging demo. Keyboard/switch/pointer are fallbacks | The new governing brief (blink-first master prompt) supersedes the earlier brief | `accessMode` default changed to `'blink'` (uncommitted). If the real-webcam gate fails, the demo uses keyboard/switch and says so |
| D20 | 2026-10-24 | **MediaPipe Face Landmarker served from local, pinned assets** (`@mediapipe/tasks-vision` 1.1.1 WASM in `public/wasm`; `face_landmarker.task` `float16/1` in `public/models`, Apache-2.0) | Frames stay in the browser. Avoids a runtime CDN dependency. Versions and hashes are auditable | Hashes in `public/models/README.md`. "No upload" and "no CDN fetch" still need network-log verification |
| D21 | 2026-10-24 | Blink is **select only**. Scanning moves the highlight. The target highlighted at closure onset is the one selected. No double-blinks or winks. The score is the minimum of the two eyes' blink values | Simplest gesture to calibrate. Avoids fatiguing repeated blinking. Winks or one-eye squints can't select | The highlight must never move under an active closure. Defaults: 600–2,500 ms closure, 800 ms cooldown, 400 ms calibration floor (prototype values, not clinical) |
| D22 | 2026-10-24 | **Multiple faces = hold** (an in-progress closure is discarded; nothing commits until exactly one face is stable for 500 ms) rather than pause | A second face must not silently take control. Confirmed in `src/access/blink-gesture.ts` (uncommitted), and the detector uses `numFaces: 2` (`blink-detector.ts`) so a second face can be noticed | Synthetic test only. Face count is not identity and does not prove exclusive presence |
| D23 | 2026-10-24 | Calibration fails openly when natural and deliberate closures overlap, then offers keyboard/switch | The brief forbids forcing a pass | Only scalar settings are stored, never images |
| D24 | 2026-10-24 ~11:18 | **OpenAI as the runtime provider:** Responses API, `gpt-6-astra`, `store: false`, strict `json_schema`, no tools | A working key was available. The model was verified in the key's model list and OpenAI docs, and in live calls | Anthropic adapter kept but unverified (no key) |
| D25 | 2026-10-24 | **Railway, single instance** (project `still-here`, service `api`) | In-memory rate limits and throttling are per process | Do not scale out without a shared store. Redeploy pending for the audit fixes |
| D26 | 2026-10-24 ~11:25 | **Native iOS client kept out of the demo path** | Built earlier at Liam's request. The blink-first brief says not to add a native mobile app for the demo | `ios/` builds and has 9 passing simulator tests. Never run on screen. Not connected end to end. Excluded from Railway uploads |
