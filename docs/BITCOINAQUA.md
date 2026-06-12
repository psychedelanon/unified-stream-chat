# BITCOINAQUA Sproto Integration

Unified Stream Chat is standalone. BITCOINAQUA Sproto Stream consumes it as an OBS overlay source.

## Run Standalone Chat

```powershell
cd unified-stream-chat
npm run dev
npm run seed
```

Dashboard:

```text
http://127.0.0.1:8787/
```

OBS overlay:

```text
http://127.0.0.1:8787/overlay
```

Market/talk-show friendly rail:

```text
http://127.0.0.1:8787/overlay?layout=rail&position=right&messages=5
```

## Point Sproto OBS Layout At It

```powershell
$env:SPROTO_CHAT_OVERLAY_URL = "http://127.0.0.1:8787/overlay?layout=rail&position=right&messages=5"
cd ../bitcoinaqua-sproto-stream
node scripts\obs-layout-sproto-gameplay.mjs
```

The Sproto layout script creates or updates the `Unified Chat Feed` browser source and places it over the gameplay scene. Use the rail URL when the lower third is already occupied by title bars, tickers, or sponsor strips.

## Demo Script

1. Show `unified-stream-chat` dashboard and click `Demo Pulse`.
2. Open `http://127.0.0.1:8787/overlay`.
3. Open `http://127.0.0.1:8787/overlay?layout=rail&position=right&messages=5`.
4. Show BITCOINAQUA Sproto control/overlay using the standalone rail URL.
5. Mention that the same standalone product works for any show by adding chat watchers (streamer name + their channels) — no login from the streamers — and dropping the chat-box overlay into OBS.
