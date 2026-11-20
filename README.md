# YouTube Quick Unsubscribe

A Manifest V3 Chrome/Edge extension that adds a one-click **Unsubscribe** button to every channel on YouTube's subscriptions page (`youtube.com/feed/channels`). Also includes a bulk "Unsubscribe from all" feature.

## Features

- **One-click unsubscribe** — Adds an "Unsubscribe" button next to each channel's subscribe button
- **Bulk unsubscribe** — "Unsubscribe from all" bar with two-step confirmation, auto-scroll to load more channels, and pause/stop controls
- **Handles both UI types** — Works with the bell-menu flow and the plain "Subscribed" button flow
- **Safe & gentle** — Sequential processing, automatic retries, rate-limit awareness (backs off after failures), and cleanup of YouTube's shared popup/dialog state

## Installation

### Chrome / Edge / Brave (Developer Mode)

1. Clone or download this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `yt-quick-unsub` folder

## Usage

1. Go to `https://www.youtube.com/feed/channels`
2. **Single channel:** Click the red **Unsubscribe** button next to any channel
3. **Bulk:** Click **Unsubscribe from all** in the bar at the top, then click again to confirm
   - The bar auto-loads more channels as it scrolls
   - Click **Stop** to pause at any time
   - Failed channels get a **Retry** button

## How It Works

The extension injects a content script that:
1. Detects the subscriptions page (`/feed/channels`)
2. Finds each channel's `ytd-subscribe-button-renderer`
3. Adds a custom button that triggers YouTube's native unsubscribe flow (menu → Unsubscribe → confirm dialog)
4. For bulk: scrolls to load more channels, processes sequentially with delays to avoid rate limits

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 config, content script registration |
| `content.js` | Core logic: button injection, unsubscribe automation, bulk runner |
| `content.css` | Styles for buttons and bulk bar |
| `icons/` | Extension icons (16/32/48/128) |

## Privacy

- No data collection, no analytics, no network requests except YouTube's own unsubscribe calls
- Runs entirely in your browser on `youtube.com/feed/channels`

## License

MIT