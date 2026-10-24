# End-to-end latency (deployed server)

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
