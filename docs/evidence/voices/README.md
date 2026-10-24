# Young-adult voice candidates (2026-10-24)

Goal: a casual, college-age spoken voice for Still Here, to match the restyled reply suggestions.

Method: `GET https://api.elevenlabs.io/v1/voices` listed 21 account voices (all premade). Five were synthesized once each with the app's own path: Text-to-Dialogue WebSocket, model `eleven_v4_turbo`, `mp3_44100_128`, one registered voice per socket, no tags. Line: "Yeah, I'm down. What time works for you?" (40 chars each, 200 chars total). All five were accepted by `eleven_v4_turbo` and returned valid MP3 (ID3 + MPEG L3, 44.1 kHz, 41-44 KB, about 2.6-2.8 s).

| File | Voice | voice_id | Labels (age / gender / accent / use_case / descriptive) |
|---|---|---|---|
| will-bIHbv24MWmeRgasZH58o.mp3 | Will - Relaxed Optimist | `bIHbv24MWmeRgasZH58o` | young / male / american / conversational / chill |
| jessica-cgSgspJ2msm6clMCkdW9.mp3 | Jessica - Playful, Bright, Warm | `cgSgspJ2msm6clMCkdW9` | young / female / american / conversational / cute |
| liam-TX3LPaxmHKxFdv7VOQHJ.mp3 | Liam - Energetic, Social Media Creator | `TX3LPaxmHKxFdv7VOQHJ` | young / male / american / social_media / confident |
| laura-FGY2WhTYpPnrIDTdsKH5.mp3 | Laura - Enthusiast, Quirky Attitude | `FGY2WhTYpPnrIDTdsKH5` | young / female / american / social_media / sassy |
| chris-baseline-iP95p4xoKVk53GoZ742B.mp3 | Chris - Charming, Down-to-Earth (current default, for comparison) | `iP95p4xoKVk53GoZ742B` | middle_aged / male / american / conversational / casual |

## Recommendation

1. **Will** `bIHbv24MWmeRgasZH58o` (male-presenting): young, conversational, "chill". Best match for a relaxed college-student register. Proposed new default.
2. **Jessica** `cgSgspJ2msm6clMCkdW9` (female-presenting): young, conversational, warm and bright. Proposed second voice.
3. Backup if one of the above sounds off: **Liam** (male, more upbeat/creator-like) or **Laura** (female, sassier/quirkier). Both are social_media-labeled, so they may read as more performative than casual.

Suggested Railway env (IDs are not secrets; the default is automatically added to the allowed list):

```
ELEVENLABS_VOICE_ID=bIHbv24MWmeRgasZH58o
ELEVENLABS_ALLOWED_VOICE_IDS=cgSgspJ2msm6clMCkdW9,iP95p4xoKVk53GoZ742B
```

(The second line keeps Chris as a fallback picker option; drop River/Alice, which are middle_aged-labeled.)

## Limits

- Ranking is from ElevenLabs labels only. **No human has listened to these samples yet** (humanListening: not reviewed); an agent cannot judge perceived age. Play the five MP3s before switching.
- The premade library has no voice labeled younger than "young" (roughly 20s-30s). None is explicitly 18-24. A Voice Library or designed voice could get closer but was not tried (extra cost and a new, unlisted voice id).
- `eleven_v4_turbo` allows one registered voice per socket; the app already sends exactly one, so switching voices needs no code change.
- One sample per voice, one line: this checks accept/valid-MP3, not consistency across lines.
