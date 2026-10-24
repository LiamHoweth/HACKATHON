# Deck screenshots

Fresh captures of the current app (working tree at `0d1f9d1`, which includes `2e0954b` / `demo-freeze` UI). All are 2732x2048 PNG: a 1366x1024 iPad-landscape viewport at deviceScaleFactor 2, dark mode.

| File | Shows |
|---|---|
| `01-launch.png` | Setup, top of page: the "Ready when you are" launch card (Touch to choose, Speaks as soon as you choose, Live AI suggestions, Natural voice) and the Start session button. |
| `02-board.png` | Board after the partner asks "Are you coming to dinner tonight?": "Yeah, I'm down for dinner tonight." / "Not tonight, thanks.", the "Other ways to answer…" card (What time?, Who's coming?, Decide later, Where at?), None of these, the action row and the chat bubble. Header reads "Suggestions: Live AI". |
| `02-board-highlight.png` | Same board with the yellow scan highlight on the first reply. **Simulated** (see below). |
| `03-paths.png` | The "Other ways to answer" screen: four live direction cards with descriptions, Something else, Back. |
| `04-branch.png` | After choosing "What time?": breadcrumb "Other ways › What time?" and three live replies. |
| `05-speaking.png` | Speaking screen after choosing "What time is dinner tonight?": spoken text, "Speaking now", Stop speaking, and the chat bubble marked "Speaking now". |
| `06-howyourday.png` | Partner then asks "How was your day?": "Pretty good. How was yours?" / "Not great, honestly." plus Other ways (Just okay, Talk later, Keep it private, Dinner plans); the earlier reply shows as Spoken. |

## How they were made

- Headless Chrome driven over the DevTools Protocol against the local dev server (`http://localhost:3000/?demo=1`).
- Setup: Touch access, **Live AI** (real suggestions from the server's configured model; cloud consent was preselected by `?demo=1`, and no access code field appeared on localhost), "Speak as soon as I choose" and "Show other ways to answer" on. Audio was unlocked with a real click on "Enable audio & test voice". The whole run made 6 `POST /api/replies` calls.
- Live AI output differs from run to run, so recapturing will give different wording.
- The "Type or record instead" disclosure was collapsed by script before each in-session shot, so the right panel shows just the chat.
- Partner lines were typed into the Conversation panel ("Type or record instead") and sent; replies were chosen with clicks.
- `/api/speech` was intercepted in the browser and answered with a 6-second silent WAV, so the speaking state is real app behavior but **no ElevenLabs request was made** and no voice audio exists.
- Injected CSS hid the Next.js dev indicator (`nextjs-portal`) and the partner panel's hands-free listening section (`.partner-body .listen`). Headless Chrome has no microphone, so that section only showed a headless-only "Listening stopped / Microphone permission was not given" warning. On the iPad with mic permission it shows the listening status instead.
- **Simulated highlight:** in Touch mode there is no scan highlight, so `02-board-highlight.png` adds the app's own `is-blink-scan` class to the first `.candidate` by script. The styling is the app's real highlight; the state was not reached by eyebrow or blink input.
- No access code was entered or shown. No camera, eyebrow or blink tracking appears in any shot.
