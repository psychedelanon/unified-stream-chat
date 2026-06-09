# Publish And Submit Checklist

These steps leave the local machine. Run them only when ready to publish.

## 1. Create Public GitHub Repo

Recommended repo name:

```text
unified-stream-chat
```

Push:

```powershell
cd C:\Users\mgmay\Code\unified-stream-chat
git remote add origin https://github.com/psychedelanon/unified-stream-chat.git
git push -u origin main
```

After pushing, open the repo in an incognito/private browser and confirm it is public.

## 2. Deploy Live App

Fastest production-friendly path: Render Blueprint using `render.yaml`.

Required env:

```text
HOST=0.0.0.0
PUBLIC_BASE_URL=https://your-live-app.example
STREAM_CHAT_ADMIN_TOKEN=<generated secret>
```

Optional env:

```text
X_BEARER_TOKEN=<real X API bearer>
UPSTASH_REDIS_REST_URL=<durable state>
UPSTASH_REDIS_REST_TOKEN=<durable state>
KICK_PUBLIC_KEY=<webhook signature verification>
```

Smoke-test the deployed app:

```powershell
$env:STREAM_CHAT_BASE_URL = "https://your-live-app.example"
npm run smoke:live
```

To smoke-test source labels with a protected deployment:

```powershell
$env:STREAM_CHAT_BASE_URL = "https://your-live-app.example"
$env:LIVE_SMOKE_SEED = "1"
$env:STREAM_CHAT_ADMIN_TOKEN = "<generated secret>"
npm run smoke:live
```

## 3. Record Loom Or YouTube

Use `docs/DEMO.md`.

Show:

- standalone dashboard
- source-labeled Twitch + X + Kick feed
- OBS lower-third overlay
- OBS vertical rail overlay for broadcast layouts with existing lower thirds
- BITCOINAQUA Sproto integration
- production setup docs

## 4. Submit Form

- X Handle: `bitcoinaqua`
- Loom/YouTube Video Link: `<recording URL>`
- GitHub Repo Link: `https://github.com/psychedelanon/unified-stream-chat`
- Anything else: use `SUBMISSION.md`
