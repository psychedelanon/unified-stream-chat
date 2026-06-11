# Contest Submission Brief

## Form Fields

- X Handle: `bitcoinaqua`
- Live app: `https://unified-stream-chat.vercel.app`
- GitHub repo: `https://github.com/psychedelanon/unified-stream-chat`

## Demo Flow

1. Open the standalone dashboard and click `Demo Pulse` — instant merged
   Twitch + X + Kick feed with source labels, no setup or login.
2. Show the headline feature, **Chat Watchers**: add a streamer by name,
   color, and channels (X handle / Twitch channel / Kick channel). No OAuth,
   no login from the streamer — Kick chat auto-subscribes via webhooks,
   Twitch joins live IRC, X mentions start polling automatically. Each
   message arrives tagged with the watcher's color, so multi-host shows can
   merge several streamers' chats into one feed and still tell them apart.
3. Toggle a watcher's platform chip off and on — muting is server-side, not
   cosmetic.
4. Open `/overlay` and show the OBS-ready lower third; then
   `/overlay?layout=rail&position=right&messages=5` for the vertical rail.
5. Show BITCOINAQUA Sproto Stream consuming the standalone overlay URL.

## Anything Else We Should Know

Unified Stream Chat is a reusable production-grade streamer utility, not a
one-off overlay. Chat watchers aggregate any streamer's public chats with
zero action from the streamer: Kick `chat.message.sent` webhooks are
auto-subscribed per channel via app-token credentials, Twitch rides the
official IRC WebSocket (multi-channel), and X mentions poll the official
v2 recent-search API. Messages are normalized into one feed with source
labels and per-host colored identity tags, served to dashboard and
transparent OBS overlays (lower third, vertical rail, compact box) over
server-sent events. Production hardening is real: all writes require an
admin token, Kick webhook signatures are RSA-verified, tokens are encrypted
at rest, and state persists in Upstash Redis. For shows that want the chat
inside an X live broadcast (which X exposes through no API), the repo ships
an optional set-and-forget browser bridge that attaches to each broadcast
automatically. The live deployment runs the real MarketBubble show setup;
demo mode works for anyone view-only.
