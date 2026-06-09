import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadEnv(root = process.cwd()) {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return {};

  const loaded = {};
  const body = readFileSync(file, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
    loaded[key] = value;
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return loaded;
}
