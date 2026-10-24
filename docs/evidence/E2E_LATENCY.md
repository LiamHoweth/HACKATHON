# End-to-end latency (deployed server)

## Before (baseline, 2026-10-24 13:38 CDT)

> **How this was measured.** From a Mac on the venue network against the deployed server (https://api-production-18038.up.railway.app), by `scripts/e2e-latency.mjs`. The partner questions are **synthetic speech** (macOS `say`, encoded to m4a/AAC). It **excludes the person's gesture/reading time** (the blink). It is **not iPad-measured**: no on-device audio capture, VAD or playback latency is included. Run window: 2026-10-24T18:38:43.760Z to 2026-10-24T18:39:58.694Z. Raw data: `docs/evidence/e2e-latency-1338.json`.

Chain: partner finishes speaking -> end-of-speech detection (650 ms, `VAD.endSilenceMs`, a client constant, not measured here) -> `/api/transcribe` (T1) -> `/api/replies` for 3 suggestions (T2) -> person's blink (excluded) -> `/api/speech` (T3) -> first audio.

10 runs (5 questions x 2 passes), 40 API calls. All values in ms.

| Step | Median | p90 | Min-max |
|---|---|---|---|
| End-of-speech detection (constant) | 650 | 650 | 650-650 |
| T1 transcribe | 520 | 656 | 424-818 |
| T2 replies (3 suggestions) | 3872 | 6648 | 2061-7108 |
| T3 speech, full MP3, first suggestion | 691 | 797 | 617-857 |
| T3 speech, time to first byte | 663 | 754 | 601-797 |
| T3 full MP3, one request alone | 657 | 797 | 617-797 |
| T3 full MP3, first suggestion while 3 run in parallel (as prefetch does) | 704 | 857 | 655-857 |
| T3 full MP3, slowest of the 3 parallel | 802 | 905 | 715-905 |

**Headline numbers**

| | Median | p90 |
|---|---|---|
| Partner stops -> 3 suggestions on screen (650 + T1 + T2) | 5070 ms | 7784 ms |
| Blink -> voice, **with prefetch** | ~0 ms | ~0 ms |
| Blink -> voice, without prefetch (T3, full MP3) | 691 ms | 797 ms |

**Reading the "with prefetch ~0" claim honestly.** With prefetch, the app requests speech for the suggestions as soon as they appear, while the person reads. Audio is ready after T3 (median 691 ms, p90 797 ms) from the moment suggestions show, so the blink-to-voice delay is ~0 only if reading plus the blink takes longer than that. A faster blink would wait for the remainder. This script does not measure how long people take to read and select.

Per-run transcripts and suggestions are in the JSON (transcripts are of synthetic audio; the questions contain no personal data).

**Notes on this run.** T2 (the live model call, model id reported by the server: gpt-6-astra, source live-model) was bimodal: five runs took 2.1-2.5 s and five took 5.2-7.1 s, so the median sits between the two clusters and p90 is the number to plan around. No call needed a retry (40 calls, 0 failures). This run is the "before" measurement for any later faster-replies change; compare against a re-run of `node scripts/e2e-latency.mjs`. Suggestions-on-screen timestamps for each run are in the JSON (`suggestionsAt`).

## After (deployed 13:50 CDT, measured 13:54 CDT)

> **How this was measured.** Same conditions as the baseline: a Mac on the venue network against the deployed server (https://api-production-18038.up.railway.app, Railway service `api`, deployment `157e3e90-10ca-4967-a942-59a846e6d8a8`, SUCCESS at 13:50:36 CDT; baseline deployment was `7b03f15d-b2ce-4aa8-abc4-ef07cd86641b`), by `scripts/e2e-latency.mjs`. Synthetic speech (macOS `say`, m4a/AAC). **Excludes the person's gesture/reading time** (the blink). **Not iPad-measured**: no on-device audio capture, VAD or playback latency. Run window: 2026-10-24T18:54:15.333Z to 2026-10-24T18:55:17.512Z. Raw data: `docs/evidence/e2e-latency-1354.json`. Smoke test `scripts/smoke-deployed.mjs`: 6/6 PASS.

10 runs (5 questions x 2 passes), 40 API calls, 0 retries, 0 failures. Same server-reported model as baseline (gpt-6-astra, source live-model). All values in ms; "Before" is the baseline above.

| Step | Before median | After median | Before p90 | After p90 | After min-max |
|---|---|---|---|---|---|
| End-of-speech detection (constant) | 650 | 650 | 650 | 650 | 650-650 |
| T1 transcribe | 520 | 647 | 656 | 734 | 434-892 |
| T2 replies (3 suggestions) | 3872 | 2547 | 6648 | 4403 | 2215-5288 |
| T3 speech, full MP3, first suggestion | 691 | 629 | 797 | 720 | 573-877 |
| T3 speech, time to first byte | 663 | 604 | 754 | 715 | 564-837 |
| T3 full MP3, one request alone | 657 | 633 | 797 | 877 | 573-877 |
| T3 full MP3, first suggestion, 3 in parallel (prefetch) | 704 | 625 | 857 | 720 | 601-720 |
| T3 full MP3, slowest of the 3 parallel | 802 | 863 | 905 | 891 | 666-891 |

**Headline numbers**

| | Before median | After median | Before p90 | After p90 |
|---|---|---|---|---|
| Partner stops -> 3 suggestions on screen (650 + T1 + T2) | 5070 ms | 3846 ms | 7784 ms | 5751 ms |
| Blink -> voice, with prefetch | ~0 ms | ~0 ms | ~0 ms | ~0 ms |
| Blink -> voice, without prefetch (T3, full MP3) | 691 ms | 629 ms | 797 ms | 720 ms |

The after-T2 values were mostly tight (eight of ten runs 2.2-2.8 s, two slower at 4.4 s and 5.3 s) instead of the bimodal 2.1-7.1 s spread before, so the tail improved more than the median. T1 (transcribe) was slightly slower in this run (median 647 vs 520 ms); with 10 runs per side and a shared network, differences of this size in T1 and T3 are within run-to-run noise. This is one 10-run sample per side, not a controlled A/B. The same "with prefetch ~0" caveat applies: it holds only if reading plus the blink takes longer than T3 (median 629 ms, p90 720 ms).

**Sample suggestions (new casual style)**, from `POST /api/replies` in the smoke test (deployed build) for "Are you coming to dinner tonight?":

1. Yeah, I'm coming tonight.
2. I'm not coming tonight.
3. What time is dinner?

More from the latency run (JSON `runs[].suggestions`): "How are you feeling today?" -> "I'm feeling pretty good today." / "I'm not feeling great today." / "I'm not sure how I'm feeling yet."; "What did you think of the game?" -> "I thought it was pretty good." / "Honestly, I wasn't that into it." / "I'm not sure what to think yet."

Note: `scripts/e2e-latency.mjs` overwrites `docs/evidence/E2E_LATENCY.md` on every run; re-running it will drop this Before/After text, so copy the file first.
