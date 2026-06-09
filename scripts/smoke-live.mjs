import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadEnv } from "../src/env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(root);

const baseUrl = process.argv[2] || process.env.STREAM_CHAT_BASE_URL || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:8787";
const shouldSeed = process.env.LIVE_SMOKE_SEED === "1";
const outDir = path.resolve(root, ".local", "live-smoke");
mkdirSync(outDir, { recursive: true });

if (shouldSeed) {
  await seedLive();
}

const health = await jsonFetch("/health");
assert(health.ok, "health did not return ok=true");
assert(health.service === "unified-stream-chat", "unexpected health service");

const messages = await jsonFetch("/api/messages");
assert(messages.config?.id === "unified-stream-chat", "messages config is missing");
if (shouldSeed) {
  assert(messages.stats?.bySource?.twitch > 0, "seeded Twitch message missing");
  assert(messages.stats?.bySource?.x > 0, "seeded X message missing");
  assert(messages.stats?.bySource?.kick > 0, "seeded Kick message missing");
}

const browser = await chromium.launch({ headless: true });
const checks = [];

try {
  await capture("dashboard", "/", { width: 1280, height: 900 });
  await capture("overlay", "/overlay", { width: 1920, height: 1080 });
  await capture("overlay-rail", "/overlay?layout=rail&position=right&messages=5", { width: 1920, height: 1080 });
} finally {
  await browser.close();
}

const consoleProblems = checks.flatMap((check) => check.messages.map((message) => `${check.name}: ${message}`));
assert(consoleProblems.length === 0, consoleProblems.join("\n"));

const dashboard = checks.find((check) => check.name === "dashboard");
const overlay = checks.find((check) => check.name === "overlay");
const railOverlay = checks.find((check) => check.name === "overlay-rail");
assert(dashboard.metrics.title === "Unified Stream Chat", "dashboard title mismatch");
assert(dashboard.metrics.bodyWidth <= dashboard.metrics.viewportWidth, "dashboard has horizontal overflow");
assert(overlay.metrics.mode === "overlay", "overlay mode did not activate");
assert(overlay.metrics.overlayCard?.width > 1500, "overlay card is not OBS-width");
assert(railOverlay.metrics.mode === "overlay", "rail overlay mode did not activate");
assert(railOverlay.metrics.overlayLayout === "rail", "rail overlay layout mismatch");
assert(railOverlay.metrics.overlayCard?.width >= 360 && railOverlay.metrics.overlayCard?.width <= 430, "rail overlay is not sidebar-width");

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  health: {
    writeAuth: health.config?.writeAuth,
    durableState: health.config?.durableState,
    xEnabled: health.config?.xEnabled,
    kickSignatureVerification: health.config?.kickSignatureVerification,
  },
  stats: messages.stats,
  screenshots: outDir,
  checks,
}, null, 2));

async function seedLive() {
  const token = process.env.STREAM_CHAT_ADMIN_TOKEN || "";
  const now = Date.now();
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const body = {
    messages: [
      {
        source: "twitch",
        id: `live-smoke-twitch-${now}`,
        displayName: "live-smoke",
        author: "live-smoke",
        channel: "demo",
        text: "Live smoke Twitch label.",
        createdAt: new Date(now).toISOString(),
      },
      {
        source: "x",
        id: `live-smoke-x-${now}`,
        displayName: "Live Smoke",
        author: "@live_smoke",
        channel: "@demo",
        text: "Live smoke X label.",
        createdAt: new Date(now + 1000).toISOString(),
      },
      {
        source: "kick",
        id: `live-smoke-kick-${now}`,
        displayName: "live-smoke",
        author: "live-smoke",
        channel: "demo",
        text: "Live smoke Kick label.",
        createdAt: new Date(now + 2000).toISOString(),
      },
    ],
  };

  const response = await fetch(new URL("/api/ingest", baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `live seed returned ${response.status}`);
}

async function capture(name, pathname, viewport) {
  const page = await browser.newPage({ viewport });
  const messages = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
  await page.goto(new URL(pathname, baseUrl).href, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1200);

  const metrics = await page.evaluate(() => {
    const app = document.querySelector(".app-shell");
    const overlayCard = document.querySelector(".overlay-card");
    return {
      title: document.title,
      mode: app?.getAttribute("data-mode") || "missing",
      overlayLayout: app?.getAttribute("data-overlay-layout") || "missing",
      feedItems: document.querySelectorAll(".message").length,
      overlayItems: document.querySelectorAll(".overlay-message").length,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      bodyHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
      overlayCard: overlayCard ? overlayCard.getBoundingClientRect().toJSON() : null,
    };
  });

  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: false,
    animations: "disabled",
    timeout: 120000,
  });
  await page.close();
  checks.push({ name, viewport, metrics, messages });
}

async function jsonFetch(pathname) {
  const response = await fetch(new URL(pathname, baseUrl), { signal: AbortSignal.timeout(12000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${pathname} returned ${response.status}`);
  return payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
