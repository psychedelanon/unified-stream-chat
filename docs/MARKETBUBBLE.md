# Unified Stream Chat — MarketBubble Guide

One feed for all your show's chats. Kick and Twitch chat from every host
lands in a single dashboard and OBS overlay, with each host color-tagged.
Nobody logs into anything — you just tell it which channels to watch.

## Links

| What | URL |
| --- | --- |
| Dashboard | `https://unified-stream-chat.vercel.app/?room=marketbubble` |
| OBS overlay (lower third) | `https://unified-stream-chat.vercel.app/overlay` |
| OBS overlay (side rail) | `https://unified-stream-chat.vercel.app/overlay?layout=rail&position=right&messages=5` |

## One-time setup (2 minutes)

1. Open the dashboard link.
2. Paste the **Admin token** you were given into the Admin token field
   (top-left panel). It saves in your browser — you do this once per device.
   Without it the feed is view-only; with it you can add watchers and clear.
3. Add each host under **Add watcher**:
   - Name (e.g. `Ansem`) and pick their color
   - `@x` — their X handle (e.g. `@blknoiz06`)
   - `twitch` — their Twitch channel name, if they stream there
   - `kick` — their Kick channel name, if they stream there
   - Click **Add Watcher**
4. That's it. Kick chat starts flowing immediately and permanently.

Each watcher row shows X / Twitch / Kick chips. Click a chip to toggle that
platform on or off (dim + struck-through = off).

## During the show

- **Kick**: automatic. Nothing to do, works even with the dashboard closed.
- **Twitch**: keep one dashboard tab open anywhere — that tab relays Twitch
  chat for all watched channels. (A laptop running OBS with the dashboard
  open in a browser tab is enough.)
- **X mentions**: click **Auto X** once. It pulls posts that reply to or
  mention your hosts every 25 seconds. Note: X does not allow any app to
  read the chat inside an X live broadcast through its API — mentions and
  replies are all X offers officially.
- **X live chat** (optional, runs on the operator's PC): the repo includes a
  bridge that opens the live broadcast in a real browser and relays its chat
  into the feed. It is set-and-forget: start it once and leave it running
  minimized — it watches the show's X account, attaches automatically every
  time a broadcast starts, and goes back to waiting when it ends. Nothing to
  do on show day.
  - Start manually: `npm run x-live`
  - Start with Windows: put a shortcut to `scripts\x-live-forever.bat` in
    `shell:startup` (Win+R, type `shell:startup`). It also auto-restarts the
    bridge if it ever crashes.
  - First run only: log into X in the window it opens; the session persists.
  - The account it watches and the host tag live in `.local/x-live.config`.
- The OBS overlay updates by itself. Add it as a Browser Source at
  1920x1080; pick lower-third, rail, or compact via the URLs in the
  dashboard's OBS panel.

## Pause / clean up

- Toggle any host's platform chip off to mute that channel (Kick messages
  stop at the server, not just hidden).
- **Clear Feed** wipes the message history (admin token required).

## If something looks wrong

- **No Kick messages**: check the watcher's Kick chip is green/on and the
  channel name is the exact kick.com slug.
- **No Twitch messages**: is a dashboard tab open? The Twitch status card
  should show the joined channel names.
- **No X messages**: X only shows replies/mentions of the hosts, and only
  while Auto X is on. Check the X query box contains the hosts' handles.
- **"unauthorized" errors**: the Admin token field is empty or wrong.

## Support

Built and operated by @bitcoinaqua — ping him with any issues.
