// Relays X livestream chat into the unified feed.
//
// X has no public API for live-broadcast chat, so this opens the broadcast
// page in a real (logged-in) browser and captures chat two ways:
//   1. WebSocket frames (X live chat rides on Periscope-era chat infra)
//   2. DOM fallback: new chat rows observed in the page
//
// Usage:
//   node scripts/x-live-chat-bridge.mjs --url https://x.com/i/broadcasts/XXXX \
//     [--ingest https://unified-stream-chat.vercel.app] [--token ADMIN_TOKEN] \
//     [--label aqua] [--color #151df9] [--debug]
//
// First run: log into X in the opened browser window; the session persists
// in .local/x-chat-profile for next time.

import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));

if (!args.url) {
  console.error("Missing --url <X broadcast or live post URL>");
  process.exit(1);
}

const ingestBase = (args.ingest || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
const profileDir = path.join(root, ".local", "x-chat-profile");
mkdirSync(profileDir, { recursive: true });

const seen = new Set();
let relayed = 0;

console.log(`X live chat bridge`);
console.log(`  broadcast: ${args.url}`);
console.log(`  ingest:    ${ingestBase}/api/ingest`);
if (args.label) console.log(`  tag:       ${args.label} ${args.color || ""}`);

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1380, height: 900 },
  args: ["--disable-blink-features=AutomationControlled"],
});
const page = context.pages()[0] || (await context.newPage());

page.on("websocket", (socket) => {
  if (args.debug) console.log(`[ws] ${socket.url()}`);
  socket.on("framereceived", (frame) => {
    try {
      handlePayload(String(frame.payload));
    } catch {}
  });
});

await page.exposeFunction("uscEmitChat", (message) => {
  if (message && message.text) {
    emit({ author: message.author || "x-viewer", displayName: message.displayName || message.author || "X viewer", text: message.text });
  }
});

await page.goto(args.url, { waitUntil: "domcontentloaded" });
console.log("Page open. If X asks you to log in, do it in this window; chat capture starts automatically.");

await installDomObserver(page);
setInterval(() => installDomObserver(page).catch(() => {}), 15000);

process.on("SIGINT", async () => {
  console.log(`\nStopping. Relayed ${relayed} messages.`);
  await context.close().catch(() => {});
  process.exit(0);
});

function handlePayload(payload) {
  if (!payload.includes("{")) return;
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return;
  }
  for (const candidate of walkChatCandidates(parsed, 0)) {
    emit(candidate);
  }
  if (args.debug && !payload.includes("ping")) {
    console.log(`[frame] ${payload.slice(0, 240)}`);
  }
}

// Periscope-style chat frames nest JSON strings inside `payload`/`body`
// several levels deep; unwrap and look for {body, username|displayName}.
function* walkChatCandidates(node, depth) {
  if (depth > 6 || !node || typeof node !== "object") return;

  const body = node.body;
  if (typeof body === "string" && (node.username || node.displayName || node.user_id)) {
    const text = body.trim();
    if (text) {
      yield {
        author: String(node.username || node.displayName || "x-viewer"),
        displayName: String(node.displayName || node.username || "X viewer"),
        text,
      };
      return;
    }
  }

  for (const value of Object.values(node)) {
    if (typeof value === "string" && value.length > 2 && (value.startsWith("{") || value.startsWith("["))) {
      try {
        yield* walkChatCandidates(JSON.parse(value), depth + 1);
      } catch {}
    } else if (value && typeof value === "object") {
      yield* walkChatCandidates(value, depth + 1);
    }
  }
}

async function installDomObserver(page) {
  await page.evaluate(() => {
    if (window.__uscObserverInstalled) return;

    const candidates = document.querySelectorAll(
      '[data-testid="chat"], [data-testid="messages"], [aria-label*="hat" i], [class*="chat" i]',
    );
    const container = Array.from(candidates).find((node) => node.childElementCount > 0) || null;
    if (!container) return;

    window.__uscObserverInstalled = true;
    const extract = (node) => {
      if (!(node instanceof HTMLElement)) return;
      const text = node.innerText || "";
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return;
      if (lines.length >= 2) {
        window.uscEmitChat({ author: lines[0].slice(0, 60), text: lines.slice(1).join(" ").slice(0, 500) });
      } else {
        window.uscEmitChat({ author: "x-viewer", text: lines[0].slice(0, 500) });
      }
    };

    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(extract);
      }
    }).observe(container, { childList: true, subtree: true });
  });
}

async function emit(candidate) {
  const text = String(candidate.text || "").trim();
  if (!text || text.length < 1) return;
  const author = String(candidate.author || "x-viewer").replace(/^@/, "");
  const key = `${author}:${text}`.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > 2000) seen.delete(seen.values().next().value);

  const message = {
    source: "x",
    id: `xlive-${hash(key)}`,
    author: `@${author}`,
    displayName: candidate.displayName || author,
    text,
    channel: "x live chat",
    createdAt: new Date().toISOString(),
    identityLabel: args.label || "",
    identityColor: args.color || "",
  };

  try {
    const headers = { "content-type": "application/json" };
    if (args.token) headers.authorization = `Bearer ${args.token}`;
    const response = await fetch(`${ingestBase}/api/ingest`, {
      method: "POST",
      headers,
      body: JSON.stringify({ source: "x", message }),
    });
    if (response.ok) {
      relayed += 1;
      console.log(`[chat] ${message.author}: ${text.slice(0, 80)}`);
    } else {
      console.error(`[ingest ${response.status}] ${message.author}: ${text.slice(0, 50)}`);
    }
  } catch (error) {
    console.error(`[ingest error] ${error.message}`);
  }
}

function hash(value) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--debug") parsed.debug = true;
    else if (key.startsWith("--")) parsed[key.slice(2)] = argv[++i];
  }
  return parsed;
}
