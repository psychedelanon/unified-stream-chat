import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (existsSync(envPath)) {
  console.log(".env already exists. Leaving it untouched.");
  console.log("Run npm run doctor to check the current setup.");
  process.exit(0);
}

const token = crypto.randomBytes(32).toString("hex");
const template = readFileSync(examplePath, "utf8");
const env = template
  .replace("STREAM_CHAT_ADMIN_TOKEN=", `STREAM_CHAT_ADMIN_TOKEN=${token}`)
  .replace("PUBLIC_BASE_URL=http://127.0.0.1:8787", "PUBLIC_BASE_URL=http://127.0.0.1:8787");

writeFileSync(envPath, env, "utf8");

console.log("Created .env with a generated admin token.");
console.log("Next:");
console.log("  npm run dev");
console.log("  open http://127.0.0.1:8787/");
console.log("  add http://127.0.0.1:8787/overlay as a 1920x1080 OBS browser source");
