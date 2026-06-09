import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(root);

const baseUrl = process.argv[2] || process.env.STREAM_CHAT_BASE_URL || "http://127.0.0.1:8787";
const now = Date.now();

const messages = [
  {
    source: "twitch",
    id: `seed-twitch-${now}`,
    author: "twitchviewer",
    displayName: "twitchviewer",
    channel: "bitcoinaqua",
    text: "Twitch chat is live in the unified feed.",
    createdAt: new Date(now).toISOString(),
  },
  {
    source: "x",
    id: `seed-x-${now}`,
    author: "@stream_signal",
    displayName: "Stream Signal",
    channel: "@bitcoinaqua",
    text: "X posts sit beside Twitch and Kick with clean source labels.",
    createdAt: new Date(now + 1000).toISOString(),
    url: "https://x.com/bitcoinaqua",
  },
  {
    source: "kick",
    id: `seed-kick-${now}`,
    author: "kickviewer",
    displayName: "kickviewer",
    channel: "bitcoinaqua",
    text: "Kick webhook messages are ready for the OBS overlay.",
    createdAt: new Date(now + 2000).toISOString(),
  },
];

const headers = { "content-type": "application/json" };
if (process.env.STREAM_CHAT_ADMIN_TOKEN) {
  headers.authorization = `Bearer ${process.env.STREAM_CHAT_ADMIN_TOKEN}`;
}

const response = await fetch(new URL("/api/ingest", baseUrl), {
  method: "POST",
  headers,
  body: JSON.stringify({ messages }),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(payload.error || `seed failed with ${response.status}`);
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  inserted: messages.length,
  stats: payload.state?.stats,
}, null, 2));
