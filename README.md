# 📺 Twitch Channel Keeper

A tiny local browser extension (Chrome / Edge / Brave) that keeps **one** Twitch tab
parked on the first **live** channel in your list. When that channel goes offline, it
jumps to the next live channel — circular, following your list's priority order.

**➡ Install guide (EN / PT-BR): https://GITHUB_USER.github.io/twitch-channel-keeper/**

## Features
- Keeps a single dedicated Twitch tab on a live channel from your list.
- Circular fail-over: current offline → next live one (list order = priority).
- Toolbar **toggle** quick action + editable channel list.
- Opens the tab **focused with sound** (a background tab won't autostart playback).
- Option: **close other Twitch tabs**.
- Option: **open the tab muted** (mutes the browser tab, never the Twitch player).
- UI in **English** and **Português (BR)**.
- Live check via Twitch's public web API — read-only, no login, no API key.

## Install (unpacked)
1. Download [`docs/twitch-keeper.zip`](docs/twitch-keeper.zip) and unzip it to a folder you'll keep.
2. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
3. Enable **Developer mode**, click **Load unpacked**, select the unzipped `twitch-keeper` folder.
4. Pin it, open the popup, toggle ON, edit your channel list, **Save list**.

Full step-by-step (with screenshots-style guidance) on the Pages site above.

## Notes
- Checks liveness ~once per minute (and instantly on toggle / save / check-now).
- Updates are manual: re-download, replace the folder, hit ↻ reload on the card.
- Uses Twitch's public anonymous web endpoint (unofficial). If it ever breaks, switch to
  the official Helix API with your own Client-ID.
- Not affiliated with Twitch. Personal-use helper.
