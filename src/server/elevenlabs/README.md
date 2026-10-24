# ElevenLabs speech adapter

Server-only. The browser never sees the key; it calls `POST /api/speech` and `GET /api/voices`.
Endpoint facts below come from the official docs, read on **2026-10-24**. Everything is mock-tested
(`src/tests/speech-api.test.ts`). **No live ElevenLabs request has been made yet.**

## Sources

- TTD WebSocket guide: https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd.md
- TTD WebSocket API reference: https://elevenlabs.io/docs/api-reference/text-to-dialogue/ttd-websocket.md
- TTS vs TTD WebSockets: https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/tts-vs-ttd-websockets.md
- Text to Dialogue HTTP: https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert.md
- Text to Speech HTTP: https://elevenlabs.io/docs/api-reference/text-to-speech/convert.md
- Models: https://elevenlabs.io/docs/overview/models.md
- Voices v2: https://elevenlabs.io/docs/api-reference/voices/search.md
- Zero Retention Mode: https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode.md

## Verified facts

**Text to Dialogue WebSocket** (`tts-dialogue-ws.ts`, the default and the only route for `eleven_v4_turbo`)
- URL: `wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=…&output_format=…`. Also accepted as query params: `language_code`, `sync_alignment`, `apply_text_normalization`, `seed`, `enable_logging`.
- Auth: the `xi-api-key` header, **or** `xi_api_key` in the first message. Node 24's global `WebSocket` cannot set headers, so we send it in the first message. No `ws` package is needed, and the key never goes in the URL.
- First message: `{"voices":["<id>"], "xi_api_key":"…"}`. `voices` is required. `eleven_v4_turbo` allows exactly **one** registered voice; `eleven_v4` allows up to 10. Optional first-message fields: `voice_settings.stability`, `pronunciation_dictionary_locators`.
- Text: `{"inputs":[{"text","voice_id","new_turn"?}], "flush"?: true}`. `flush` is a top-level boolean. The server buffers about 40 characters or 8 words unless flushed.
- Close: `{"close_socket":true}` flushes, sends the remaining audio, sends `{"is_final":true}`, then closes. `{"keep_alive":true}` resets the 20 s inactivity timeout.
- Server frames: `{audio: base64, alignment?, normalized_alignment?}`, `{is_final_audio_for_turn}`, `{is_final: true}`, and errors `{error: "<id e.g. authentication_required>", message, code: <ws close code>, param?}`.
- The key needs the "Text to Speech" permission.
- **Doc discrepancy, unresolved until the live check.** The guide and the models page say `model_id` must start with `eleven_v3` or `eleven_v4` and that v4 Turbo is "available via the Text to Dialogue websocket". The API reference schema still says "must start with `eleven_v3`" (default `eleven_v3_conversational`).

**HTTP** (`tts-http.ts`, used when `ELEVENLABS_TRANSPORT=http` or the model is not a dialogue model)
- `POST https://api.elevenlabs.io/v1/text-to-dialogue?output_format=…` with header `xi-api-key` and body `{inputs:[{text,voice_id}], model_id}`. Optional body fields: `settings{stability,similarity}`, `seed`, `language_code`, `apply_text_normalization`. The models page says `eleven_v4` is available via the Text to Dialogue API.
- `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=…` with body `{text, model_id, voice_settings?}`. Use it for `eleven_flash_v2_5` / `eleven_multilingual_v2`. The docs do **not** list v4 models for this endpoint, so we never send v4 here.
- Both return the audio file (format per `output_format`, default `mp3_44100_128`). Validation errors come back as 422 with `detail[]`.
- `eleven_v4_turbo` has no documented HTTP route, so it is always forced onto the TTD WebSocket.

**Voices:** `GET https://api.elevenlabs.io/v2/voices?page_size≤100&next_page_token=…&include_total_count=false` returns `{voices:[{voice_id,name,description,category,labels,preview_url}], has_more, next_page_token, total_count}`.

**Retention:** `enable_logging` defaults to `true`. `false` turns on Zero Retention Mode and disables history, and the docs say only **enterprise** customers may use it. We do not send it, so do not claim zero retention.

## Behavior summary

- Model routing is in `client.ts` (`routeFor`). The ordinary TTS `stream-input` socket is never used.
- Exactly `exactText` is sent: no trimming, tags, SSML or added words. The full MP3 is collected, checked (non-empty, at most 6 MB, ID3 or MPEG frame sync), and returned as `audio/mpeg`. Audio is never returned if the socket closes before `is_final`.
- The timeout (`ELEVENLABS_TIMEOUT_MS`) and the client's abort both close the socket or abort the fetch.
- Provider errors are classified from status codes and machine identifiers only. Provider messages, the text and the key are never logged or returned.
- `ELEVENLABS_OUTPUT_FORMAT` must be `mp3_*`, otherwise the default `mp3_44100_128` is used.

## Env (names only)

`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` (default `eleven_v4_turbo`), `ELEVENLABS_OUTPUT_FORMAT` (default `mp3_44100_128`), `ELEVENLABS_TIMEOUT_MS` (default 15000), `ELEVENLABS_ALLOWED_VOICE_IDS` (comma list, optional), `ELEVENLABS_TRANSPORT` (`ws` | `http`, default `ws`), `ELEVENLABS_DAILY_CHAR_BUDGET` (default 20000, per process, UTC day), `APP_ACCESS_TOKEN` (required for deployed use).
