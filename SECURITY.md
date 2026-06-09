# Security

## Secrets

Never commit `.env`, `X_BEARER_TOKEN`, `STREAM_CHAT_ADMIN_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`, or private keys.

## Public Deployments

Set `STREAM_CHAT_ADMIN_TOKEN` before exposing the app. Public read endpoints are intentionally open so OBS can load the overlay, but write endpoints are protected when the token is configured.

Kick webhook writes do not require `STREAM_CHAT_ADMIN_TOKEN` because Kick needs to call them directly. Set `KICK_PUBLIC_KEY` to require Kick signature verification in production.

## Reporting

Open a private issue or contact the maintainer before publicly disclosing a vulnerability.
