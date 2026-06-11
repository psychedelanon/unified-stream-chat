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
- **X**: automatic. Posts that reply to or mention your hosts are pulled
  every 25 seconds while the dashboard is open. (X does not allow any app to
  read the chat inside an X live broadcast — replies and mentions are what X
  offers. Viewers replying to the stream announcement post all show up.)
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
- **No X messages**: X only shows replies/mentions of the hosts. Check that
  a host has an X handle set (green X chip on their watcher row).
- **"unauthorized" errors**: the Admin token field is empty or wrong.

## Optional power feature: true X live chat

X's live-broadcast chat is not available to any app through X's official
APIs. For shows that want it anyway, a small helper runs on one PC (the
streaming/OBS machine is perfect) and relays the live chat into the feed
automatically — it attaches itself every time the host goes live.

Two things to know:

- **The hosts never log into anything.** The helper reads the public live
  chat, the same one every viewer sees. Its browser just needs to be signed
  into *some* X account because X blocks logged-out browsing — a burner or
  the show's utility account is perfect.
- One-time on the show PC: run `npm run x-login` once, sign the browser
  into any X account (a burner is perfect), close the window. That session
  is saved permanently.
- Then the exact run command is generated for you: open the dashboard's
  **X Live Chat** panel (bottom-left) and press **Copy** next to the host.
  Paste it into a terminal in the project folder and leave it running — it
  attaches to each broadcast automatically and relays the live chat.

@bitcoinaqua can set this up on the show PC in a few minutes if you'd
rather not touch it.

## Support

Built and operated by @bitcoinaqua — ping him with any issues.
