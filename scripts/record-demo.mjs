// Records a captioned ~75s demo video of the live app with Playwright.
// Usage: node scripts/record-demo.mjs [baseUrl]
// Output: .local/demo-video/*.webm (1080p, YouTube-ready)
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.argv[2] || process.env.STREAM_CHAT_BASE_URL || "https://unified-stream-chat.vercel.app";
const outDir = path.join(root, ".local", "demo-video");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();

async function caption(text, position = "bottom") {
  await page.evaluate(({ t, position }) => {
    let el = document.getElementById("__demo-caption");
    if (el) el.remove();
    {
      el = document.createElement("div");
      el.id = "__demo-caption";
      el.style.cssText = [
        "position:fixed", "left:50%", position === "top" ? "top:40px" : "bottom:40px", "transform:translateX(-50%)",
        "z-index:99999", "background:rgba(5,7,12,0.88)", "color:#4ee6c2",
        "border:1px solid rgba(78,230,194,0.5)", "border-radius:10px",
        "padding:14px 26px", "font:600 26px/1.3 'Segoe UI',system-ui,sans-serif",
        "letter-spacing:0.2px", "box-shadow:0 6px 30px rgba(0,0,0,0.6)",
        "max-width:72%", "text-align:center", "pointer-events:none",
      ].join(";");
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, { t: text, position });
}

async function clickIf(selector) {
  const el = page.locator(selector).first();
  if (await el.count()) await el.click().catch(() => null);
}

// Never linger on an empty feed: after a filter click, hold until messages render.
async function waitForFeed() {
  await page.waitForFunction(
    () => document.querySelectorAll("#feedList li").length > 0,
    null,
    { timeout: 8000 },
  ).catch(() => null);
}

let shot = 0;
async function snap(name) {
  shot += 1;
  await page.screenshot({ path: path.join(outDir, `scene-${String(shot).padStart(2, "0")}-${name}.png`) }).catch(() => null);
}

const wait = (ms) => page.waitForTimeout(ms);

// 1. Dashboard intro
await page.goto(baseUrl, { waitUntil: "load" });
await caption("Unified Stream Chat - Twitch + X + Kick in ONE real-time feed");
await wait(5000);
await snap("intro");

// 2. Seed + live movement
await caption("Seeding all three sources into the unified feed...");
await clickIf("#demoAll");
await waitForFeed();
await wait(2500);
await caption("Demo Pulse - live messages flowing with clear source labels");
await clickIf("#demoPulse");
await wait(6000);
await snap("pulse");

// 3. Source filters (pulse paused so renders never race the filter view)
await clickIf("#demoPulse");
await caption("Every message is source-labeled - filter by platform instantly");
await clickIf('[data-filter="twitch"]');
await waitForFeed();
await wait(2200);
await snap("filter-twitch");
await clickIf('[data-filter="x"]');
await waitForFeed();
await wait(2200);
await clickIf('[data-filter="kick"]');
await waitForFeed();
await wait(2200);
await snap("filter-kick");
await clickIf('[data-filter="all"]');
await waitForFeed();
await wait(2000);

// 4. OBS URL panel
await caption("Copy-ready OBS browser-source URLs - lower third, rails, compact box");
await page.evaluate(() => {
  const el = document.querySelector("aside") || document.body;
  el.scrollIntoView({ block: "end" });
});
await wait(4500);
await snap("obs-panel");

// 5. Lower-third overlay
await page.goto(`${baseUrl}/overlay`, { waitUntil: "load" });
await caption("Transparent OBS overlay - lower third at 1920x1080", "top");
await wait(5500);
await snap("overlay-lower-third");

// 6. Vertical rail (the broadcast-layout fit)
await page.goto(`${baseUrl}/overlay?layout=rail&position=right&messages=5`, { waitUntil: "load" });
await caption("Vertical rail - sits beside hosts, never covers an existing lower-third", "top");
await wait(6500);
await snap("overlay-rail");

// 7. Compact corner box
await page.goto(`${baseUrl}/overlay?layout=compact&position=bottom-right&messages=3`, { waitUntil: "load" });
await caption("Compact corner box - a layout for every real stream", "top");
await wait(5000);
await snap("overlay-compact");

// 8. Close on the dashboard
await page.goto(baseUrl, { waitUntil: "load" });
await caption("Standalone. Docker-ready. Token-protected. github.com/psychedelanon/unified-stream-chat");
await wait(6000);
await snap("close");

await context.close();
await browser.close();
console.log(JSON.stringify({ ok: true, outDir }, null, 2));
