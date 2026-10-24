# iPad Home Screen install

How to run Still Here from the iPad Home Screen as a standalone web app, what changes compared with a Safari tab, and how to fall back. Safari remains the verified path. Standalone mode is **not yet verified on hardware**. Record results in `docs/TEST_RESULTS.md` only after running the test below.

## What the app ships

- `src/app/manifest.ts` is served at `/manifest.webmanifest`. It sets name and short name "Still Here", `display: standalone`, `start_url` and `scope` `/`, and `orientation: any`. The brief is landscape-first, but portrait must keep working on a stand or mount, and iPadOS does not enforce manifest orientation anyway. Background and theme color are the light `--bg` (`#f5f4f0`).
- `src/app/apple-icon.tsx` generates the PNG icons with `next/og`: `/apple-icon/180` (apple-touch-icon), `/apple-icon/192`, `/apple-icon/512` and `/apple-icon/maskable` (512, mark inside the safe zone). It uses the same "SH" mark and accent bar as `icon.svg`.
- `src/app/layout.tsx` metadata sets `appleWebApp` (`capable`, title "Still Here", `statusBarStyle: 'default'`) plus the legacy `apple-mobile-web-app-capable` tag for pre-16.4 iPadOS. `'default'` keeps status-bar text readable on the light theme, where `'black-translucent'` would draw white text over a light background.
- Safe areas are unchanged. The viewport keeps `viewport-fit=cover`, and `.app` in `globals.css` pads with `env(safe-area-inset-*)`. Light and dark `theme-color` meta tags still come from the `viewport` export.

The deployed URL serves these files only after the next deploy. See `docs/DEPLOYMENT.md`.

## Known standalone differences (research, 2026-10-24)

These are leads from public bug reports, not Apple documentation. Verify each on the demo iPad's iPadOS version.

| Area | What to expect in standalone | Source |
| --- | --- | --- |
| Camera (`getUserMedia`) | It has historically been less reliable than in Safari. Reports include a stream that never starts on some devices (iOS 17.4.1 to 17.6.1; one commenter saw it fixed in the iOS 18 beta; the bug is still open) and permission decisions that are not remembered, so the prompt can return on every launch. | [WebKit 185448](https://bugs.webkit.org/show_bug.cgi?id=185448), [WebKit 273938](https://bugs.webkit.org/show_bug.cgi?id=273938), [STRICH KB](https://kb.strich.io/article/29-camera-access-issues-in-ios-pwa), [Apple Community thread](https://discussions.apple.com/thread/256081579) |
| Screen Wake Lock | It failed in Home Screen apps on iOS 16.4 and was fixed in iPadOS 18.4. On older versions, the screen can still auto-lock during hands-free blink use. | [WebKit 254545](https://bugs.webkit.org/show_bug.cgi?id=254545) |
| Audio unlock | The same rule as Safari applies: playback needs a direct tap. Tap **Enable audio** after every launch, because a relaunch is a new page load. Background audio stops when the app is backgrounded. | [WebKit 198277](https://bugs.webkit.org/show_bug.cgi?id=198277) |
| Storage | A Home Screen app has its own storage, separate from Safari. Anything entered in Safari, such as the access code or saved preferences, is not carried over. The access code lives in `sessionStorage`, so after a full close it must be entered again. | Behavior of the app's own code (`docs/DEPLOYMENT.md`, iPad access) |
| Permissions | Camera and microphone prompts are asked again for the Home Screen app, even if Safari already has them. | Same sources as Camera |

## Install

1. On the iPad, open **https://api-production-18038.up.railway.app** in **Safari**. It must be HTTPS: the camera needs a secure context. The laptop's `localhost` and plain-HTTP LAN addresses do not work.
2. Tap **Share** (the square with the up arrow in the toolbar) and choose **Add to Home Screen**. If it is not in the list, scroll down or tap **Edit Actions**.
3. Check the name reads **Still Here**. Leave **Open as Web App** on if iPadOS shows that toggle, then tap **Add**.
4. The **SH** icon appears on the Home Screen. Launch it from there. No Safari address bar means it is running standalone.

## First launch

1. Enter the access code in setup again. Safari's copy does not carry over.
2. Tap **Enable audio** and confirm a test phrase is audible. Check the mute switch, Control Center silence and volume.
3. Start the camera for blink input. Allow the **camera** prompt. Allow the **microphone** prompt when recording is first used.
4. If you tap Don't Allow by mistake, the app shows the permission-denied state. Go to **Settings > Apps > Safari > Camera** (or **Microphone**), set **Ask** or **Allow**, then fully close and reopen the app.

## Fully close and reopen

1. Swipe up from the bottom edge and pause to open the App Switcher. On iPads with a Home button, double-press it.
2. Swipe the **Still Here** card up and off the screen.
3. Tap the Home Screen icon again. This is a fresh page load: tap **Enable audio** and enter the access code again.

## Test step (standalone)

Run this on the demo iPad and record the iPadOS version, date and result in `docs/TEST_RESULTS.md`.

1. Install as above and launch from the Home Screen.
2. Confirm no address bar. The status bar must be readable in light and dark appearance, and no controls may sit under the status bar, rounded corners or home indicator, in landscape and portrait.
3. Enter the access code, then tap **Enable audio** and speak a local phrase. It must be audible.
4. Start the camera. The preview and blink detection must run for at least 2 minutes without freezing, and the screen must not auto-lock.
5. Record one partner message with the microphone.
6. Fully close, reopen and repeat steps 3 and 4. Note whether the camera prompt returns.

Pass means all six steps work. Any camera freeze, missing prompt, or permission loop means the fallback below is used for the demo.

## Fallback: use a Safari tab

If the camera or audio fails in standalone mode, do not debug during the demo:

1. Fully close the Home Screen app.
2. Open Safari and go to **https://api-production-18038.up.railway.app**. This is the path already verified in `docs/DEPLOYMENT.md`.
3. Enter the access code, tap **Enable audio**, and start the camera as usual.
4. Keyboard, switch and local phrases work in both modes, even without the camera.
