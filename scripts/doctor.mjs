import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
loadEnv(root);
const env = {
  ...readEnv(envPath),
  ...process.env,
};
const port = env.PORT || "8787";
const baseUrl = env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`;
const checks = [];

check("Node >= 20", Number(process.versions.node.split(".")[0]) >= 20, `current ${process.versions.node}`);
check("package-lock.json present", existsSync(path.join(root, "package-lock.json")));
check(".env file", existsSync(envPath), existsSync(envPath) ? "loaded" : "run npm run setup to create one");
check("admin token configured", Boolean(env.STREAM_CHAT_ADMIN_TOKEN), env.STREAM_CHAT_ADMIN_TOKEN ? "write routes protected" : "recommended before public hosting");
check("PUBLIC_BASE_URL configured", Boolean(env.PUBLIC_BASE_URL), env.PUBLIC_BASE_URL || "recommended for production links");
check("X bearer token", Boolean(env.X_BEARER_TOKEN), env.X_BEARER_TOKEN ? "real X sync enabled" : "optional; required for real X sync");
check("Upstash pair", bothOrNeither(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN), hasEither(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN) ? "durable storage configured" : "memory storage only");
check("Kick public key", Boolean(env.KICK_PUBLIC_KEY), env.KICK_PUBLIC_KEY ? "webhook signatures required" : "optional; enables signature verification");

try {
  const health = await fetch(new URL("/health", baseUrl), { signal: AbortSignal.timeout(3000) });
  check("server health", health.ok, `${baseUrl}/health returned ${health.status}`);
  if (health.ok) {
    const payload = await health.json();
    check("dashboard URL", true, `${baseUrl}/`);
    check("OBS overlay URL", true, `${baseUrl}/overlay`);
    check("messages", true, `${payload.stats?.total ?? 0} total`);
  }
} catch (error) {
  check("server health", false, `not reachable at ${baseUrl}/health (${error.message})`);
}

for (const item of checks) {
  const marker = item.ok ? "OK " : "WARN";
  console.log(`${marker} ${item.name}${item.detail ? ` - ${item.detail}` : ""}`);
}

const failedRequired = checks.some((item) => !item.ok && item.required);
process.exit(failedRequired ? 1 : 0);

function check(name, ok, detail = "", required = false) {
  checks.push({ name, ok, detail, required });
}

function bothOrNeither(left, right) {
  return (Boolean(left) && Boolean(right)) || (!left && !right);
}

function hasEither(left, right) {
  return Boolean(left) || Boolean(right);
}

function readEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  const body = readFileSync(file, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
    out[key] = value;
  }
  return out;
}
