import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadEnv } from "../src/env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(root);
const baseUrl = process.env.STREAM_CHAT_BASE_URL || "http://127.0.0.1:8787";
const outDir = path.resolve(root, ".local", "verification");
mkdirSync(outDir, { recursive: true });

if (process.env.STREAM_CHAT_VERIFY_SEED !== "0") {
  await import("./seed-demo.mjs");
}

const state = await jsonFetch("/api/messages");
assert(state.stats?.bySource?.twitch > 0, "missing Twitch messages");
assert(state.stats?.bySource?.x > 0, "missing X messages");
assert(state.stats?.bySource?.kick > 0, "missing Kick messages");

const browser = await chromium.launch({ headless: true });
const checks = [];

try {
  await capture("dashboard-1280", "/", { width: 1280, height: 900 });
  await capture("dashboard-375", "/", { width: 375, height: 900 });
  await capture("overlay-1920", "/overlay", { width: 1920, height: 1080 });
  await capture("overlay-rail-1920", "/overlay?layout=rail&position=right&messages=5", { width: 1920, height: 1080 });
} finally {
  await browser.close();
}

const consoleProblems = checks.flatMap((check) => check.messages.map((message) => `${check.name}: ${message}`));
assert(consoleProblems.length === 0, consoleProblems.join("\n"));

const desktop = checks.find((check) => check.name === "dashboard-1280");
const mobile = checks.find((check) => check.name === "dashboard-375");
const overlay = checks.find((check) => check.name === "overlay-1920");
const railOverlay = checks.find((check) => check.name === "overlay-rail-1920");

assert(desktop.metrics.feedItems >= 3, "desktop feed did not render messages");
assert(mobile.metrics.feedItems >= 3, "mobile feed did not render messages");
assert(desktop.metrics.bodyWidth <= desktop.metrics.viewportWidth, "desktop has horizontal overflow");
assert(mobile.metrics.bodyWidth <= mobile.metrics.viewportWidth, "mobile has horizontal overflow");
assert(overlay.metrics.mode === "overlay", "overlay did not enter overlay mode");
assert(overlay.metrics.overlayItems >= 2, "overlay did not render latest messages");
assert(overlay.metrics.overlayCard.width > 1500, "overlay card is not full-width enough for OBS");
assert(railOverlay.metrics.mode === "overlay", "rail overlay did not enter overlay mode");
assert(railOverlay.metrics.overlayLayout === "rail", "rail overlay did not keep rail layout");
assert(railOverlay.metrics.overlayItems >= 3, "rail overlay did not render multiple messages");
assert(railOverlay.metrics.overlayCard.width >= 360 && railOverlay.metrics.overlayCard.width <= 430, "rail overlay width is not sidebar-sized");
assert(railOverlay.metrics.overlayCard.height >= 800, "rail overlay is not tall enough for a vertical stream box");

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  screenshots: outDir,
  stats: state.stats,
  checks,
}, null, 2));
process.exit(0);

async function capture(name, pathname, viewport) {
  const page = await browser.newPage({ viewport });
  const messages = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
  await page.goto(new URL(pathname, baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);

  const metrics = await page.evaluate(() => {
    const app = document.querySelector(".app-shell");
    const overlayCard = document.querySelector(".overlay-card");
    const visibleStateBlocks = Array.from(document.querySelectorAll(".state-block"))
      .filter((node) => !node.hidden && getComputedStyle(node).display !== "none").length;
    return {
      title: document.title,
      mode: app?.getAttribute("data-mode") || "missing",
      overlayLayout: app?.getAttribute("data-overlay-layout") || "missing",
      feedItems: document.querySelectorAll(".message").length,
      overlayItems: document.querySelectorAll(".overlay-message").length,
      visibleStateBlocks,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      bodyHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
      overlayCard: overlayCard ? overlayCard.getBoundingClientRect().toJSON() : null,
    };
  });

  assert(metrics.visibleStateBlocks === 0, `${name} still shows loading/error/empty state while messages exist`);
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
  const response = await fetch(new URL(pathname, baseUrl));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${pathname} returned ${response.status}`);
  return payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
