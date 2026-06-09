# Contest Submission Brief

## Form Fields

- X Handle: `bitcoinaqua`
- Live app: `https://unified-stream-chat.vercel.app`
- GitHub repo: `https://github.com/psychedelanon/unified-stream-chat`

## Demo Flow

1. Open the standalone dashboard.
2. Click `Seed All` or `Demo Pulse`.
3. Show Twitch, X, and Kick messages in one feed with visible source labels.
4. Open `/overlay` and show the OBS-ready lower third.
5. Open `/overlay?layout=rail&position=right&messages=5` and show the vertical chat box for broadcast layouts with an existing lower-third.
6. Show BITCOINAQUA Sproto Stream consuming the standalone overlay URL.

## Anything Else We Should Know

Unified Stream Chat is a reusable production-ready streamer utility, not a one-off overlay. It supports Twitch IRC WebSocket, X API recent search with auto-polling, Kick chat webhooks, source labels, server-sent event updates, optional admin auth, optional Upstash persistence, Docker hosting, a live smoke-test command, and transparent OBS overlays in lower-third, vertical rail, and compact box formats. BITCOINAQUA Sproto Stream is included as a proof integration that consumes the same standalone overlay URL.
