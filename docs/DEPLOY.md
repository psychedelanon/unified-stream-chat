# Deployment

Unified Stream Chat is a long-running Node service. Prefer Docker, Render, Railway, Fly.io, or a VPS over serverless function hosts because the app uses server-sent events for low-latency dashboard and OBS updates.

## Render

This repo includes `render.yaml`.

1. Push the repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Set `PUBLIC_BASE_URL` to the deployed URL after the first deploy.
4. Add optional `X_BEARER_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `KICK_PUBLIC_KEY`.
5. Open `/` for the dashboard and `/overlay` for OBS.

## Railway

1. Create a new Railway project from the GitHub repo.
2. Set start command: `npm start`.
3. Add environment variables from `.env.example`.
4. Set `HOST=0.0.0.0`.
5. Use the generated public domain as `PUBLIC_BASE_URL`.

## Docker Host

```bash
npm run setup
docker compose up -d --build
```

## VPS

```bash
git clone https://github.com/YOUR_ORG/unified-stream-chat.git
cd unified-stream-chat
npm ci --omit=dev
npm run setup
npm start
```

Put Caddy, nginx, or a platform proxy in front of the app for HTTPS.

## Production Checklist

- Set `STREAM_CHAT_ADMIN_TOKEN`.
- Set `PUBLIC_BASE_URL` to the public HTTPS URL.
- Add Upstash Redis REST vars if the host can restart or scale horizontally.
- Add `X_BEARER_TOKEN` for real X sync.
- Add `KICK_PUBLIC_KEY` before accepting production Kick webhooks.
- Run `npm run doctor` after deploy.
