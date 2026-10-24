# ElevenLabs live smoke and naturalness evidence (TTS-09)

**Status: not measured.** No live ElevenLabs request has been made yet. Fill in this page only from
a real run of `scripts/elevenlabs-smoke.mjs` and a real listening pass.

The script calls the app's own routes (`GET /api/voices`, `POST /api/speech`), so it exercises the
real server path: access gate, budget, model routing, and MP3 validation. It never prints the key or
the access code, never writes them to a file, and never puts them in a URL.

## How to run

1. Add `ELEVENLABS_API_KEY=…` to `.env.local`. Leave `ELEVENLABS_VOICE_ID` out for now.
2. Start the app with `npm run dev`. Restart it if it does not pick up the `.env.local` change.
3. List voices (free, spends no characters):
   ```sh
   node scripts/elevenlabs-smoke.mjs --voices-only
   ```
   Step 1 asks ElevenLabs `GET /v2/voices` directly, using the key from `.env.local`, and suggests
   3 adult premade voices (not cloned, not character voices). It prints each voice's name,
   category, labels, and free preview URL, plus a ready `ELEVENLABS_VOICE_ID=<id>` line for each.
   The ranking is a heuristic based on the labels. Listen to the previews and choose by ear.
4. Add the chosen `ELEVENLABS_VOICE_ID=<id>` to `.env.local`. To offer a small picker, also add
   `ELEVENLABS_ALLOWED_VOICE_IDS=<id2>,<id3>`. Let the dev server reload.
5. Run the paid check. It sends five lines, about 143 characters:
   ```sh
   node scripts/elevenlabs-smoke.mjs
   ```
6. Listen to the MP3s using the checklist below, then fill in `humanListening` and `listeningNotes`
   in `results.json` and the table at the end of this page.

To check the deployed app, use the access code from `.env.railway.local`. The script reads
`RAILWAY_APP_ACCESS_TOKEN` and sends it as the `x-still-here-access` header:

```sh
node scripts/elevenlabs-smoke.mjs https://<railway-app-host> --access-code-file .env.railway.local
```

The deployed server uses its own Railway env, not `.env.local`. The direct voice listing still uses
the local key, if one is present.

### Options

| Option | Effect |
| --- | --- |
| `[base]` or `--base URL` | App origin. Default `http://localhost:3000`. |
| `--max-lines N` | Send only the first N lines, from 1 to 5. Use `--max-lines 1` for a cheap first smoke. |
| `--voices-only` | Steps 0 and 1 only. No speech is requested. |
| `--dry-run` | Same as `--voices-only`, and also prints the planned lines and file names. |
| `--no-direct` | Skip the direct ElevenLabs `/v2/voices` listing. |
| `--access-code-file F` | Read `RAILWAY_APP_ACCESS_TOKEN` (or else `APP_ACCESS_TOKEN`) from F. |
| `--env-file F` | The env file to inspect. Default `.env.local`. |

**Guards.** The script sends at most 5 lines and at most 200 characters per run. Requests run one
at a time and stop at the first failure. The server keeps its own daily character budget
(`ELEVENLABS_DAILY_CHAR_BUDGET`) and rate limit.

**Exits.** The script exits 0 after printing `ELEVENLABS_API_KEY not configured` when the key or
voice is missing. In that case it requests no speech and writes no files. It exits 1 if a line
fails or the server is unreachable while a key is set, and 2 for bad arguments.

## What each file means

| File | Meaning |
| --- | --- |
| `1-hey-how-was-your-day.mp3` … `5-ill-be-there-at-3-15-dr-lee.mp3` | The exact MP3 that `/api/speech` returned for each line. A file is written only for HTTP 200 with `audio/mpeg` and an MP3 header. |
| `results.json` | One run. Per line it records `text`, `chars`, `httpStatus`, `errorCode`, `contentType`, `modelHeader` (`x-still-here-model`), `bytes`, `looksLikeMp3`, `headersMs`, `requestToBytesMs`, `humanListening` (starts as `"not reviewed"`) and `listeningNotes`. It also records env presence (booleans only), the budget, a summary, and `listener` fields that start as `"not recorded"`. |
| `previous-<timestamp>/` | An earlier run's MP3s and `results.json`. The script moves them here before a new paid run, so the files in this folder always come from one run. Nothing is deleted. |

**What the timing fields measure.** `requestToBytesMs` runs from sending `POST /api/speech` to
receiving the last byte, measured where the script runs. `headersMs` runs to the response headers.
Because the route buffers the whole MP3 before responding, the two are usually close. Neither one
is confirmation-to-first-sound on the iPad (TTS-10), and neither is the vendor's inference
latency.

**What a 200 proves.** HTTP 200 with MP3 bytes proves only that the request path works. It does
not show that every word was spoken correctly or naturally. Only listening can show that.

## Listening checklist

Listen on the device and output you will demo on, such as the iPad speaker or a wireless speaker,
at normal volume. Write down who listened, the device, and the output. Mark each item pass, fail,
or unsure, and write a short note.

- [ ] **Every word present, nothing added.** Compare against the text. Listen for dropped,
  repeated, or invented words, sounds, or laughs.
- [ ] **Negation is unmistakable.** In "I **don't** agree with that." and "Please **don't** change
  my medication.", "don't" must be clearly audible and must not blur into "do". This matters most:
  a lost negation reverses the meaning.
- [ ] **Names.** "Dr. Lee" should come out as "Doctor Lee", not "D R" or "Drive".
- [ ] **Numbers and time.** "3:15" should come out as "three fifteen", not "three one five" or
  "three colon fifteen".
- [ ] **Question intonation.** "Hey, how was your day?" should sound like a friendly question,
  with natural phrasing at the comma.
- [ ] **Humor not overacted.** "Only if I get to pick the movie." should sound light and wry, not
  theatrical, sarcastic, or laughing.
- [ ] **Serious line stays calm.** The medication line should sound firm and calm, not overly warm
  or performative.
- [ ] **Overall delivery.** An adult conversational voice, with even pace, natural pauses, and no
  clipping, glitches, or robotic artifacts at the start or end.
- [ ] **Compared with the browser voice.** Give an honest subjective preference against the basic
  device voice. Record how many listeners and which device.

Do not turn these notes into a numeric naturalness score or claim any clinical benefit. Report
what listeners actually said, and how many of them there were.

## Results (fill in after a real run)

Run date: not measured · Base: not measured · Model header: not measured · Voice: not measured ·
Listener(s) / device / output: not recorded

| # | Line | HTTP | Bytes | Request→bytes (ms) | Words exact | Negation / name / number | Intonation and tone | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Hey, how was your day? | not measured | not measured | not measured | not reviewed | n/a | not reviewed (question) | |
| 2 | I don't agree with that. | not measured | not measured | not measured | not reviewed | not reviewed (negation) | not reviewed | |
| 3 | Please don't change my medication. | not measured | not measured | not measured | not reviewed | not reviewed (negation) | not reviewed (calm, serious) | |
| 4 | Only if I get to pick the movie. | not measured | not measured | not measured | not reviewed | n/a | not reviewed (humor not overacted) | |
| 5 | I'll be there at 3:15, Dr. Lee. | not measured | not measured | not measured | not reviewed | not reviewed (number, name) | not reviewed | |

Comparison with the browser voice: not measured (listeners: 0).
