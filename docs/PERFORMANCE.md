# Performance measurements

These measurements were taken on **2026-10-24, 12:18–12:22 CDT**, against the production deployment at
`https://api-production-18038.up.railway.app` (Railway edge `den1`, `server: railway-hikari`).
The production build matches the local `.next` build: BUILD_ID `h3RobooKwJE2vrsin7Sso`, with identical chunk filenames.

> **These are Mac measurements, not iPad measurements.** Every number below comes from an Apple M3 MacBook
> (16 GB RAM, macOS 27.0.1) using `curl` 8.7.1 and the Claude desktop app's built-in browser pane
> (Chromium 152, 8 logical cores, DPR 2, viewport 279×833). The pane has no camera.
> iPad Safari uses WebKit, a different GPU path and a slower CPU, so its numbers will differ. The steps to
> repeat these measurements on the iPad are [at the end of this document](#repeat-on-the-ipad).

Each measurement uses one of these methods:

| Label | Method |
|---|---|
| curl | Run from the Mac's shell. Each run is a new `curl` process, so each run opens a new TCP+TLS connection. |
| pane | Run in the built-in browser pane with `performance.getEntriesByType('navigation' \| 'resource' \| 'paint')`. |
| file | Byte counts from the local `.next/static` and `public/` folders. |

The scripts are in `scripts/perf/`. They only send GET requests, plus fixture-mode `POST /api/replies` requests (fixture mode is free).

## 1. Home page weight and load (production)

### Bytes as served (curl, `scripts/perf/page-weight.sh`)

| Resource | Raw bytes | Gzip on the wire | Notes |
|---|---:|---:|---|
| HTML `/` | 14,957 | 4,882 | Prerendered (`x-nextjs-prerender: 1`, `x-nextjs-cache: HIT`). |
| JS loaded by modern browsers (7 files) | 797,534 | 231,059 | `rootMainFiles` + page chunks. |
| CSS (2 files) | 29,824 | 7,335 | |
| Polyfill `0cz1d0mv5g_q7.js` | 112,594 | 39,627 | `noModule`, so modern Safari and Chrome do **not** download it. |

- **Brotli is not served.** A request with `Accept-Encoding: br` gets uncompressed bytes. Only gzip is applied, by Next's built-in compression.
- `/_next/static/*` is served with `Cache-Control: public, max-age=31536000, immutable`.

### Browser load (pane)

| Metric | Cold (first visit) | Warm (reload) |
|---|---:|---:|
| Requests (document + subresources) | 11 | 11 (9 from memory/disk cache) |
| Bytes transferred | ≈ 247 KB (HTML 5.2 KB + subresources 241.7 KB) | ≈ 0.9 KB (HTML revalidation 300 B + `/api/status` 571 B) |
| Decoded bytes | 842 KB | — |
| TTFB (navigation) | 189 ms | 76 ms |
| DOMContentLoaded | 387 ms | 94 ms |
| First contentful paint / LCP | 432 ms / 432 ms | 140 ms / — |
| `load` event | 429 ms | 116 ms |

On first paint the page makes one `/api/status` fetch. The page does **not** request any MediaPipe asset
until the camera starts: `mpLoaded: false` was checked against the resource entries.

### Time to first byte (curl, `scripts/perf/ttfb.sh`, n=10 each, new connection per run)

| URL | TTFB min / median / max | Total median |
|---|---:|---:|
| `/` (HTML) | 128 / 132 / 161 ms | 139 ms |
| `/api/status` | 126 / 130 / 136 ms | 132 ms |

A typical run spent about 32 ms on TCP connect and about 65 ms on TCP+TLS. That leaves roughly **65 ms**
of request round trip plus server time once the connection is up. The pane's warm-connection TTFB of 76 ms agrees with this.

## 2. MediaPipe assets

### Sizes and headers (curl HEAD and GET, production)

| Asset | Raw bytes | On the wire | `Cache-Control` |
|---|---:|---:|---|
| `/wasm/vision_wasm_internal.wasm` (SIMD build, the one fetched) | 13,519,922 | **3,965,787 (gzip)** | `public, max-age=31536000, immutable` |
| `/wasm/vision_wasm_internal.js` (loader) | 334,128 | 81,200 (gzip) | `public, max-age=31536000, immutable` |
| `/models/face_landmarker.task` | 3,758,596 | **3,758,596 (not compressed)** | `public, max-age=31536000, immutable` |
| Lazy JS chunk `3xnrk1bdqa5hx.js` (`@mediapipe/tasks-vision` + `blink-detector`) | 159,791 | 46,791 (gzip) | `public, max-age=31536000, immutable` |

- **The immutable cache headers are confirmed live after the redeploy.** The wasm `last-modified` is 17:15 GMT (12:15 CDT).
- `FilesetResolver.forVisionTasks('/wasm')` picked `vision_wasm_internal.{js,wasm}`, the SIMD build. The `nosimd` and `module` variants are deployed but were not fetched.
- The first camera start downloads about **7.85 MB** in total: wasm 3.97 MB, model 3.76 MB, loader 0.08 MB and chunk 0.05 MB.
- Next does not gzip `application/octet-stream`, so the model goes out uncompressed. `gzip -9` would make it 3,331,721 bytes, about 11% smaller.
- Next gzips the wasm on the fly for every request. `gzip -9` gives 3,933,217 bytes, so precompressing at gzip level brings little. Brotli was not measured because no brotli tool is installed.

### Fetch time, cold vs warm

| Asset | curl cold network (3 runs) | Pane cold (first `createFromOptions`) | Pane warm (HTTP cache) |
|---|---:|---:|---:|
| wasm (3.97 MB gz) | 733 / 745 / 783 ms, ≈ 5.3 MB/s | 587 ms | 23–36 ms (`transferSize` 0) |
| model (3.76 MB) | 368 / 362 / 380 ms, ≈ 10 MB/s | 283 ms | 2–4 ms (`transferSize` 0) |
| loader JS | 194–219 ms | 131 ms | cached |

These download rates come from this Mac's network. On slower venue Wi-Fi the downloads scale with bandwidth. At 2 MB/s,
about 7.85 MB would take roughly 4 s. That figure is **arithmetic, not a measurement**.

## 3. FaceLandmarker init and per-frame inference (pane, Mac)

**Method:** `scripts/perf/mediapipe-bench.js`, run in the production page's console.

- The library is `@mediapipe/tasks-vision` **1.1.1** from jsDelivr. Its `vision_bundle.mjs` has the same sha256 as `node_modules` (`a84921e0…68f1`). A bare `import('@mediapipe/tasks-vision')` cannot resolve from a console, so the bench imports that pinned URL.
- It uses the same options as `src/access/blink-detector.ts`: `VIDEO` mode, `numFaces: 2`, blendshapes on, transformation matrices off, assets loaded from `/wasm` and `/models/face_landmarker.task`.
- Each delegate was timed for 10 warm-up frames, then 100 `detectForVideo` calls on a 640×480 canvas, redrawn every frame.
- The canvas shows a crude drawn face, which **was detected** (`faces: 1`). The landmark and blendshape stages therefore ran too, not only the face detector. Real camera faces may still cost a different amount.

| Run | Init (`createFromOptions`) | First frame | `detectForVideo` median / mean / p95 (n=100) |
|---|---:|---:|---:|
| GPU, cold cache (includes downloads) | **1,097 ms** | 410 ms | 14.6 / 15.0 / 18.0 ms |
| CPU, warm (right after the GPU run) | 60 ms | 34 ms | 11.7 / 11.9 / 13.6 ms |
| CPU, warm (second pass) | 101 ms | 62 ms | 12.5 / 12.6 / 13.9 ms |
| GPU, warm | 54 ms | 173 ms | 14.4 / 14.8 / 17.3 ms |
| GPU, warm | 60 ms | 146 ms | 14.8 / 15.2 / 17.8 ms |
| CPU, warm | 57 ms | 28 ms | 11.5 / 11.7 / 12.8 ms |

Other timings:

- Importing the library from the CDN took 66 ms. `FilesetResolver.forVisionTasks` took about 1 ms.
- On this Mac, with a canvas as input, **the CPU delegate was about 20% faster per frame than GPU** and avoided a 150–400 ms GPU first-frame stall, probably from shader setup.
- Both delegates fit easily inside the app's 15 fps budget of 66 ms per processed frame.
- The app tries GPU first and falls back to CPU (`createLandmarker`, and `rebuildOnCpu` after 10 GPU errors).
- A camera `<video>` source on the iPad may behave differently: texture upload, and a different WebGL implementation in WebKit.

## 4. API latency on Railway (curl)

| Endpoint | n | TTFB per run | Notes |
|---|---:|---|---|
| `GET /api/status` | 10 | median 130 ms (126–136) | 271-byte JSON. Includes about 65 ms for connect + TLS per run. |
| `POST /api/replies`, `mode: "fixture"` | 5 | 399, 142, 161, 218, 139 ms (median 161 ms) | 402-byte `source: "demo-fixture"` response. Run 1 had a slow 120 ms TCP connect, which looks like a network blip. No live-mode request was sent. |

Live-mode `/api/replies` latency, which includes the model call, was **not measured**. Fixture latency shows only the cost of
the network path plus route validation.

## 5. Client bundle (file: `.next/static/chunks`, production build `h3RobooKwJE2vrsin7Sso`)

| Chunk | Raw | gzip -9 | Loaded | Contents (by string search) |
|---|---:|---:|---|---|
| `2pnyztrlv_a8-.js` | 341,325 | 95,361 | initial | App code + zod |
| `3wbm-994r45kr.js` | 229,820 | 71,795 | initial (`rootMainFiles`) | React DOM |
| `2esel1zvdrot7.js` | 185,424 | 49,475 | initial (`rootMainFiles`) | Next/React runtime |
| `3xnrk1bdqa5hx.js` | 159,791 | 46,513 | **lazy, only after camera start** | `@mediapipe/tasks-vision` + blink detector |
| `0cz1d0mv5g_q7.js` | 112,594 | 39,390 | `noModule` only | Polyfills |
| `1jtdxbo2ayz-w.css` | 26,735 | — | initial | Styles |
| `3cfn99dbrcvvp.js` | 16,898 | 5,933 | initial | |
| `0umf92h1sb77c.js` | 13,822 | 3,547 | initial | |
| `turbopack-3-ry682tkyiqk.js` | 10,030 | 3,973 | initial | Turbopack runtime |

`.next/static` totals 1.1 MB on disk. `npm run build` was **not** run for this report; these sizes come from the existing build.

## Recommendations

These are ordered by expected impact on the iPad demo. None of them has been implemented.

1. **Keep MediaPipe deferred. It already is.** No wasm, model or MediaPipe JS is fetched before the camera starts, so the home page costs about 247 KB on first visit.
2. **Overlap the download with the camera prompt.** `useBlink.ts` currently runs `getUserMedia` → `video.play()` → `import('@/access/blink-detector')` → `createFromOptions` one after another. After the user taps start (that tap is the consent), the code could begin the chunk `import()` and an HTTP-cache warm-up `fetch` of the wasm and model *at the same time as* `getUserMedia`. The ~1.1 s cold cost on this Mac, and more on venue Wi-Fi, would then hide behind the permission prompt. For the same reason, a `<link rel="prefetch">` could be added once the user opens blink setup.
3. **Warm the cache before the demo.** The assets are `immutable`, so opening blink setup once on the demo iPad before presenting means later starts read from cache. Warm init measured 55–100 ms on the Mac.
4. **Measure GPU vs CPU on the iPad before changing the delegate order.** On the Mac, CPU was faster per frame and had no first-frame stall. If the iPad shows the same pattern, trying CPU first would also sidestep the WebKit lost-context fallback path.
5. **Serve the model compressed (low priority).** It saves about 430 KB with gzip. Options are a precompressed file with `Content-Encoding`, or accepting the cost as it is. Brotli for the wasm is worth testing only if a brotli tool is available, because the wasm already goes out gzipped at about 3.97 MB.
6. **Remove unused wasm variants from `public/wasm` (deploy size only).** These are the `nosimd` and `module` files, about 26 MB raw. Browsers never download them, so this does not affect load time. Keep `nosimd` if older WebKit without SIMD has to be supported.

## Repeat on the iPad

1. On the iPad, open **Settings → Apps → Safari → Advanced** and turn on **Web Inspector**. On the Mac, open **Safari → Settings → Advanced** and turn on **Show features for web developers**.
2. Connect the iPad to the Mac with a cable and tap Trust. Then open the production URL in a **Private** tab on the iPad, which gives a cold cache without clearing the user's Safari data.
3. On the Mac, choose **Safari → Develop → [iPad name] → Still Here**.
   - For a cold load, check **Disable Caches** in the Network tab, reload, and note the transferred bytes and the load time.
   - Then run this in the Console:
     ```js
     const n = performance.getEntriesByType('navigation')[0];
     ({ ttfb: n.responseStart - n.startTime, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        bytes: performance.getEntriesByType('resource').reduce((a, r) => a + r.transferSize, n.transferSize),
        requests: performance.getEntriesByType('resource').length + 1 })
     ```
   - Repeat with caches enabled to get the warm numbers.
4. To measure inference, paste the contents of `scripts/perf/mediapipe-bench.js` into the Console, then run
   `await stillHereMediaPipeBench()`. For a fair warm comparison, also run
   `await stillHereMediaPipeBench({ delegates: ['CPU','GPU','GPU','CPU'] })`. Record `initMs`, `firstFrameMs`,
   `detectForVideoMs` and `faces` for each run.
5. To measure the real camera path, run blink setup in the app with the camera on and read **Processing: N frames/s** on the
   calibration screen (`BlinkCalibration.tsx`). It should be close to 15 fps. The Console warns `face detection frame failed`
   if the GPU delegate is failing.
6. Record the iPad model, iPadOS version, network (venue Wi-Fi or hotspot) and the time in CT next to every number. Keep the
   Mac and iPad numbers in separate tables.

## Hands-free listening: partner stops talking to transcript submitted (2026-10-24, ~13:40 CT)

Evidence: `docs/evidence/latency-transcribe-20261024-13-35.json`, made by `node scripts/transcribe-latency.mjs`
(23 calls, `say` clips encoded to m4a/AAC, sent straight to the provider from this Mac; not the iPad, not venue Wi-Fi).

**What dominates the delay.** The model round trip is small. The wait for the end-of-speech decision is the largest part.

| Step | Before | After | Source |
|---|---|---|---|
| Silence needed to end an utterance (`VAD.endSilenceMs`) | 900 ms | 650 ms | constant, `continuous-listener.ts` |
| Average leading silence in the upload (`VAD.idleRestartMs` 4000 to 2000, mean is half) | about 2.0 s | about 1.0 s | constant |
| Upload size for a 3 s clip (bitrate 64 kbps assumed before, `audioBitsPerSecond` 48 kbps now) | about 45 KB | about 20 to 30 KB | measured at 64 and 32 kbps; Safari may ignore the option |
| Model round trip, median of 4 clips (3 to 6 s long) | 599 ms (438 to 915) | 473 ms (440 to 604) | measured |

Expected saving from partner silence to submitted transcript: about 250 ms from the VAD change plus about 100 ms (not
significant at n=4) from shorter, smaller uploads. Rough total 0.3 to 0.4 s of roughly 1.5 s.

**Request parameters (measured on 4 clips each).** The provider accepted `language=en`, `prompt` and `response_format=text` with
`gpt-transcribe`. None gave a latency change larger than the run-to-run spread (medians 538 to 839 ms on identical clips, so the
spread is about 300 ms). The app now sends `language=en` (config `TRANSCRIPTION_LANGUAGE`, default `en`, `auto` disables), which avoids
language mis-detection on 1 to 2 word clips. A prompt is supported but **off by default** (`TRANSCRIPTION_PROMPT`): it showed no
speed gain, and prompts can be echoed back on noise. A silence-only clip returned an empty transcript with and without the prompt.
`response_format` stays `json` (`text` was not faster). A faster model was not evaluated, and `TRANSCRIPTION_MODEL` is unchanged.

**Noise risk.** The shorter silence window means a pause over 650 ms now splits one sentence into two partner lines. Pauses between
words are usually under 500 ms, and a test covers a 400 ms pause staying in one utterance. `minSpeechMs` (450) and the
`usableTranscript` filter are unchanged. The recorder is no longer swapped while an onset is building. The transcribe route limit went from 12 to 20 per
minute per client, because more splits mean more uploads.

**Not done.** Server-side trimming of leading silence needs an audio decoder, so it was skipped. Re-run the script on the demo
Wi-Fi, and time a real utterance on the iPad (Safari Web Inspector Network tab, `/api/transcribe` row), before quoting a number.

## 5. Reply latency (partner line to three suggestions), 24 Oct 2026

Evidence: [`docs/evidence/latency-replies-1349.json`](evidence/latency-replies-1349.json). Method: `scripts/latency-replies.mjs` calls the real
`generateLive()` (prompt, provider, validation, repair) from the dev Mac against the live OpenAI API, one request at a time, with the 14 synthetic
scenarios of `scripts/live-scenarios-data.mjs`. It bypasses the HTTP route, so add the route and network cost on top. About 200 live requests were
spent in total, including model probes. Quality notes are the agent's own reading, not a human review.

**What makes the slow mode.** Every request made exactly one upstream call and **no run needed a repair** (0 repaired in about 190 validated
batches), so the bimodal latency is not a retry or a timeout. It is reasoning tokens: `gpt-6-astra` spends 0 reasoning tokens on easy lines (about
2.5 s) and 50 to 250 on harder ones, such as explicit stances, "unknown history" and the detailed-length scenario (about 4.5 to 8 s).

| Run (n) | Valid | Median | p90 | Max | Requests that used reasoning tokens |
|---|---|---|---|---|---|
| Before: original prompt, no effort set, 4000 token cap (14) | 14/14 | 3.4 s | 6.3 s | 8.5 s | 6/14 (median 5.3 s vs 2.9 s without) |
| Original prompt + `effort: low` (14) | 14/14 | 3.1 s | 4.8 s | 7.0 s | 2/14 |
| **After (new defaults): low effort, 1200 cap, casual-student prompt, compact payload (56)** | 56/56 | **2.6 s** | **5.4 s** | 7.6 s | 14/56 (median 4.6 s vs 2.5 s without) |
| After + `REPLY_SERVICE_TIER=priority` (28, offline only; deployed test timed out, keep OFF) | 28/28 | **1.8 s** | **2.7 s** | **3.1 s** | 4/28 |

Findings, in order of effect:

- **`service_tier: "priority"` looked like the big win offline but failed live (see incident below).** It roughly halves the fixed overhead (a trivial call went from about 1.4 s to 0.9 s) and removes
  the slow tail on the same model, so quality is unchanged. It is **opt-in** because it is billed at a higher price. The Railway variable would be
  `REPLY_SERVICE_TIER=priority` (tested 14:05 — caused timeouts; keep OFF); see "Priority tier incident" below.
- **Lowest reasoning effort.** `gpt-6-astra` rejects `minimal` and `none` (it accepts `low`, `medium`, `high`, `xhigh`, `max`), so `low` is the floor.
  It is now the default, set in `src/server/config.ts` (`REPLY_REASONING_EFFORT=off` omits it for models that do not support it). It trims the tail
  (p90 6.3 s to 4.8 s on the original prompt) but does not eliminate it.
- **Prompt.** The system prompt now asks for most-likely-first ordering and a summary of at most 8 words, and tells the model to answer without long
  deliberation. The payload drops null and empty fields and sends at most the latest 6 turns. Input tokens went from about 760 to about 650. The
  effect on latency is small. A harsher trim ("first-person", shorter rules) pushed the model into more reasoning and made every reply start with
  "I'd like", so it was not kept.
- **`max_output_tokens`** 4000 to 1200 (`REPLY_MAX_OUTPUT_TOKENS`). Typical use is 80 to 250 tokens, so this is a runaway guard, not a speedup. A tighter cap
  risks a truncation and a repair call, which costs more than it saves.
- **Other models, not adopted.** `gpt-5.4-mini` is fastest (median 0.9 s, p90 1.1 s, 14/14 valid), but in 14 samples it invented consent ("Yeah, that's
  okay with me" to a medication change), invented a personal fact ("I haven't taken one yet") and ignored an explicit "suggest an alternative" intent.
  `gpt-6-luna` (median 2.1 s) was not meaningfully faster than astra with priority. Switching is just `REPLY_MODEL`, but that quality trade is the
  lead's call.
- **Keep-alive.** Node `fetch` already reuses connections inside one process, so nothing was added.
- **Deployed baseline** from `docs/evidence/E2E_LATENCY.md` (median 3.9 s, p90 6.6 s) matches the shape above. The deployed server had no
  `REPLY_REASONING_EFFORT`, so it will pick up `low` automatically once this code is deployed.

Examples (before = original prompt, after = final prompt; same scenario text):

| Partner line (scenario) | Before | After |
|---|---|---|
| "Do you want to watch a movie tonight?" | Yes, let's watch a movie tonight. / No movie for me tonight, thanks. / What movie did you have in mind? | Yeah, I'm down for a movie tonight. / Not tonight, I'm good. / What movie were you thinking? |
| "Are you coming to dinner tonight?" (suggest an alternative) | Could we have dinner another night instead? / Would you like to meet for coffee instead of dinner? / Could we get takeout together tonight instead? | Could we do dinner another night instead? / How about we grab lunch tomorrow instead? / Could we hang out after dinner instead? |
| "Is there anything you need?" (express a need) | I need some water, please. / I need a quiet break. / I need more time to explain what I need. | I'd like some water, please. / I could use some help, please. / I need a little quiet time. |
| "The doctor says we can change your medication. Is that okay with you?" | Why is the doctor suggesting a medication change? / What are the benefits and risks of changing my medication? / Please don't change my medication until I've discussed it with the doctor. | What would changing my medication help with? / I'd like to know the risks before deciding. / I want to talk with the doctor before deciding. |

The casual register is moderate: contractions and "Yeah, I'm down", "I'm good" appear when they fit, and consequential lines stay careful. Remaining stiff
spots are mostly in the scenario that asks for detailed (up to 40 word) answers. Not human-reviewed.

Settings now in code: low reasoning effort (default), `REPLY_MAX_OUTPUT_TOKENS` 1200, optional `REPLY_SERVICE_TIER` (do not set; tested 14:05 — caused timeouts; keep OFF). Re-run with
`node --import ./scripts/ts-register.mjs --env-file=.env.local scripts/latency-replies.mjs --label x --reps 2 --out docs/evidence/x.json`.

## Priority tier incident (2026-10-24)

- **14:05 CT:** `REPLY_SERVICE_TIER=priority` (OpenAI "Fast"/priority processing, 2x price) was set on Railway. On the deployed server, 4 of 6 `/api/replies` requests hit the 15 s server timeout (`outcome=TIMEOUT` in Railway logs, about 15,000 ms). The other 2 succeeded in about 1.6 to 2.1 s.
- **~14:10:** the variable was deleted, but deleting a Railway variable did **not** trigger a redeploy, so the timeouts continued with the old value still live.
- **14:16:** manual redeploy (deployment `19f642d2`). Standard tier afterwards: 4/4 OK in 2.6 to 5.2 s.
- **Decision:** priority stays **OFF** for the demo. The 1.8 s median above came from an offline run (28 calls) and did not hold on the deployed server. Do not quote it as a result.
- **Lesson:** after changing or deleting any Railway variable, always redeploy and run `node scripts/smoke-deployed.mjs`.
