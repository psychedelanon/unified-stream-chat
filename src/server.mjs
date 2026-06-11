import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.mjs";
import {
  createChatStore,
  fetchXRecent,
  isAuthorized,
  normalizeKickWebhook,
  verifyKickSignature,
} from "./state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(root);
const publicDir = path.join(root, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8787);
const store = createChatStore(process.env);
const clients = new Set();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, {
        ok: true,
        service: "unified-stream-chat",
        stats: (await store.state()).stats,
        config: await store.config(),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/config") {
      return json(response, await store.config());
    }

    if (request.method === "GET" && url.pathname === "/api/messages") {
      return json(response, await store.state());
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      return await sse(request, response);
    }

    if (request.method === "POST" && ["/api/messages", "/api/ingest"].includes(url.pathname)) {
      return await ingest(request, response);
    }

    if (request.method === "DELETE" && url.pathname === "/api/messages") {
      return await clear(request, response);
    }

    if (request.method === "GET" && url.pathname === "/api/x/recent") {
      return await xRecent(request, response, url);
    }

    if (request.method === "POST" && url.pathname === "/api/kick/webhook") {
      return await kickWebhook(request, response);
    }

    return asset(request, response, url.pathname);
  } catch (error) {
    return json(response, { ok: false, error: error?.message || "server error" }, error.status || 500);
  }
});

server.listen(port, host, () => {
  const base = `http://${host}:${port}`;
  console.log(`Unified Stream Chat: ${base}`);
  console.log(`Dashboard:           ${base}/`);
  console.log(`OBS overlay:         ${base}/overlay`);
  console.log(`Kick webhook:        ${base}/api/kick/webhook`);
});

async function ingest(request, response) {
  if (!isAuthorized(request.headers, process.env)) {
    return json(response, { ok: false, error: "unauthorized" }, 401);
  }
  const body = await readJson(request);
  const state = await store.add(body.messages || body.message || body, { source: body.source });
  broadcast({ type: "state", state });
  return json(response, { ok: true, state });
}

async function clear(request, response) {
  if (!isAuthorized(request.headers, process.env)) {
    return json(response, { ok: false, error: "unauthorized" }, 401);
  }
  const state = await store.clear();
  broadcast({ type: "state", state });
  return json(response, { ok: true, state });
}

async function xRecent(request, response, url) {
  const result = await fetchXRecent({
    query: url.searchParams.get("query"),
    sinceId: url.searchParams.get("since_id"),
    maxResults: url.searchParams.get("max_results"),
  }, process.env);
  const state = url.searchParams.get("sync") === "0" ? null : await store.add(result.messages, { source: "x" });
  if (state) broadcast({ type: "state", state });
  return json(response, { ...result, state });
}

async function kickWebhook(request, response) {
  const rawBody = await readBody(request);
  if (!verifyKickSignature(rawBody, request.headers, process.env)) {
    return json(response, { ok: false, error: "invalid Kick signature" }, 401);
  }
  const body = rawBody.trim() ? JSON.parse(rawBody) : {};
  const messages = normalizeKickWebhook(body, request.headers);
  if (!messages.length) return json(response, { ok: true, accepted: 0 }, 202);

  const state = await store.add(messages, { source: "kick" });
  broadcast({ type: "state", state });
  return json(response, { ok: true, accepted: messages.length, state });
}

async function sse(_request, response) {
  response.writeHead(200, {
    ...corsHeaders(),
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  response.write(`event: state\ndata: ${JSON.stringify(await store.state())}\n\n`);
  clients.add(response);
  response.on("close", () => clients.delete(response));
}

function broadcast(event) {
  const data = `event: ${event.type}\ndata: ${JSON.stringify(event.state)}\n\n`;
  for (const client of clients) {
    try {
      client.write(data);
    } catch {
      clients.delete(client);
    }
  }
}

function asset(request, response, pathname) {
  let filePath = pathname;
  if (filePath === "/" || filePath === "/overlay") filePath = "/index.html";
  if (filePath.endsWith("/")) filePath += "index.html";

  const resolved = path.resolve(publicDir, `.${decodeURIComponent(filePath)}`);
  if (!resolved.startsWith(publicDir) || !existsSync(resolved) || !statSync(resolved).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", ...corsHeaders() });
    response.end("not found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes[path.extname(resolved)] || "application/octet-stream",
    "cache-control": "no-store",
    ...corsHeaders(),
  });
  createReadStream(resolved).pipe(response);
}

function json(response, payload, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(),
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function readJson(request) {
  return readBody(request).then((body) => {
    if (!body.trim()) return {};
    return JSON.parse(body);
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 512) reject(Object.assign(new Error("request too large"), { status: 413 }));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-stream-chat-token",
  };
}
