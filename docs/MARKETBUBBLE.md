# Unified Stream Chat — MarketBubble Guide

One feed for all your show's chats. Kick and Twitch chat from every host
lands in a single dashboard and OBS overlay, with each host color-tagged.
Nobody logs into anything — you just tell it which channels to watch.

## Links

| What | URL |
| --- | --- |
| Dashboard | `https://unified-stream-chat.vercel.app/?room=marketbubble` |
| **OBS chat box** (recommended) | `https://unified-stream-chat.vercel.app/overlay?layout=box&title=MarketBubble` |
| OBS lower third | `https://unified-stream-chat.vercel.app/overlay` |
| OBS side rail | `https://unified-stream-chat.vercel.app/overlay?layout=rail&position=right&messages=5` |

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
- **X**: the in-stream live-broadcast chat, relayed by the bridge running on
  the show PC (one-time setup below). It attaches to each broadcast on its
  own — nothing to do during the show once it's running. We pull the actual
  live chat, not mentions or replies.
- The OBS overlay updates by itself. Add the **chat box** as a Browser
  Source (copy its URL from the dashboard's OBS Overlays panel, or use the
  link in the table above) and size it to your scene — it's a clean
  scrolling chat box with each host in their own color. Lower-third and rail
  layouts are there too if you prefer them.

## Pause / clean up

- Toggle any host's platform chip off to mute that channel (Kick messages
  stop at the server, not just hidden).
- **Clear Feed** wipes the message history (admin token required).

## If something looks wrong

- **No Kick messages**: check the watcher's Kick chip is green/on and the
  channel name is the exact kick.com slug.
- **No Twitch messages**: is a dashboard tab open? The Twitch status card
  should show the joined channel names.
- **No X messages**: the X live-chat bridge must be running on the show PC
  (see X Live Chat below) and the host must be live on X. Check the host has
  an X handle set (green X chip on their watcher row).
- **"unauthorized" errors**: the Admin token field is empty or wrong.

## X Live Chat setup (one-time, on the show PC)

X's live-broadcast chat is not available to any app through X's official
APIs, so a small helper runs on one PC (the streaming/OBS machine is perfect)
and relays the live chat into the feed automatically — it attaches itself
every time a host goes live.

**The hosts never log into anything.** The helper reads the public live chat,
the same one every viewer sees. Its browser just needs to be signed into
*some* X account because X blocks logged-out browsing — a burner or the
show's utility account is perfect.

1. On the show PC, in the project folder, run `npm run x-login` once, sign
   the browser into any X account, and close the window. That session is
   saved permanently.
2. In the dashboard's **X Live Chat Setup** panel (left column), press
   **Copy** next to each host. Paste the command into a terminal and leave it
   running — it attaches to each broadcast automatically and relays the chat.

@bitcoinaqua can set this up on the show PC in a few minutes if you'd
rather not touch it.

## Support

Built and operated by @bitcoinaqua — ping him with any issues.
