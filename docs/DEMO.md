# Demo Recording Guide

Target length: 90 seconds.

## Preflight

```powershell
cd unified-stream-chat
npm run doctor
npm run verify
```

For a deployed app:

```powershell
$env:STREAM_CHAT_BASE_URL = "https://unified-stream-chat.vercel.app"
npm run smoke:live
```

## Recording Flow

1. Open the standalone dashboard.
2. Say: "This is Unified Stream Chat, a reusable Twitch + X + Kick aggregator for any streamer."
3. Click `Seed All`.
4. Point out the three source labels in the single feed.
5. Click `Demo Pulse` for live movement.
6. Open `/overlay`.
7. Say: "This is the transparent OBS browser source."
8. Open `/overlay?layout=rail&position=right&messages=5`.
9. Say: "For broadcast layouts like Market Bubble or BITCOINAQUA, the vertical rail fits beside the hosts without covering the lower-third."
10. Show BITCOINAQUA Sproto Stream consuming the same standalone overlay URL.
11. Close by showing the repo README sections for Quick Start and Production Setup.

## Voiceover Script

> Unified Stream Chat gives streamers one real-time feed for Twitch, X, and Kick. Twitch connects through IRC WebSocket, X uses API recent search with auto-polling, and Kick lands through chat webhooks. Every message keeps a clear source label, and the same live state powers the dashboard and OBS overlay. The overlay can be a lower-third, a vertical side rail, or a compact corner box, so it fits real stream layouts instead of forcing one format. The app is standalone, Docker-ready, token-protected for production, and BITCOINAQUA Sproto Stream shows how any broadcast layout can consume it.

## Shots To Capture

- Dashboard with Twitch, X, and Kick messages visible.
- Source status strip showing source activity.
- OBS `/overlay` lower third at 1920 x 1080.
- OBS `/overlay?layout=rail&position=right&messages=5` vertical rail at 1920 x 1080.
- `npm run doctor` output.
- BITCOINAQUA integration docs or Sproto control surface.

## Submission Copy

Use the answer in `SUBMISSION.md` for the form's "Anything else we should know?" field.
