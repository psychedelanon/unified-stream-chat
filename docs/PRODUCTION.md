# Production Guide

Unified Stream Chat runs as a single Node service and static frontend. It can be hosted on a VPS, Render, Railway, Fly.io, or any Docker host.

## Environment

```text
HOST=0.0.0.0
PORT=8787
PUBLIC_BASE_URL=https://chat.yourdomain.com
STREAM_CHAT_ADMIN_TOKEN=<long-random-token>
X_BEARER_TOKEN=<x-api-bearer-token>
UPSTASH_REDIS_REST_URL=<optional>
UPSTASH_REDIS_REST_TOKEN=<optional>
KICK_PUBLIC_KEY=<optional>
```

## Persistence

Without Redis, the app uses process memory. That is fine for local demos and one-machine shows.

Use Upstash Redis REST for production hosting, deploy previews, or multiple instances. The app stores one compact JSON state object under `STREAM_CHAT_STATE_KEY`.

## Security

- Set `STREAM_CHAT_ADMIN_TOKEN` before exposing the dashboard publicly.
- Set `X_BEARER_TOKEN` on the server, not in the browser.
- Set `KICK_PUBLIC_KEY` to require Kick webhook signature verification.
- Do not put tokens in OBS URLs.

## Health Check

```text
GET /health
```

Returns current stats and configuration flags without exposing secrets.

## Setup Check

```bash
npm run doctor
```

The doctor command checks Node, `.env`, token posture, optional integration vars, server health, dashboard URL, and OBS overlay URL.
