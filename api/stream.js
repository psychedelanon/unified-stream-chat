import {
  createChatStore,
  fetchXRecent,
  isAuthorized,
  normalizeKickWebhook,
  verifyKickSignature,
} from "../src/state.mjs";

export const config = {
  api: {
    bodyParser: false,
  },
};

const store = globalThis.__unifiedStreamChatStore || createChatStore(process.env);
globalThis.__unifiedStreamChatStore = store;

export default async function handler(request, response) {
  const route = routeFromQuery(request.query);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && route === "/health") {
      return json(response, {
        ok: true,
        service: "unified-stream-chat",
        stats: (await store.state()).stats,
        config: await store.config(),
      });
    }

    if (request.method === "GET" && route === "/config") {
      return json(response, await store.config());
    }

    if (request.method === "GET" && route === "/messages") {
      return json(response, await store.state());
    }

    if (request.method === "GET" && route === "/events") {
      return sse(response, await store.state());
    }

    if (request.method === "POST" && ["/messages", "/ingest"].includes(route)) {
      return await ingest(request, response);
    }

    if (request.method === "DELETE" && route === "/messages") {
      return await clear(request, response);
    }

    if (request.method === "GET" && route === "/x/recent") {
      return await xRecent(request, response);
    }

    if (request.method === "POST" && route === "/kick/webhook") {
      return await kickWebhook(request, response);
    }

    return json(response, { ok: false, error: "not found" }, 404);
  } catch (error) {
    return json(response, { ok: false, error: error?.message || "server error" }, error.status || 500);
  }
}

async function ingest(request, response) {
  if (!isAuthorized(request.headers, process.env)) {
    return json(response, { ok: false, error: "unauthorized" }, 401);
  }
  const body = await readJson(request);
  const state = await store.add(body.messages || body.message || body, { source: body.source });
  return json(response, { ok: true, state });
}

async function clear(request, response) {
  if (!isAuthorized(request.headers, process.env)) {
    return json(response, { ok: false, error: "unauthorized" }, 401);
  }
  const state = await store.clear();
  return json(response, { ok: true, state });
}

async function xRecent(request, response) {
  const result = await fetchXRecent({
    query: queryValue(request.query.query),
    sinceId: queryValue(request.query.since_id),
    maxResults: queryValue(request.query.max_results),
  }, process.env);
  const state = queryValue(request.query.sync) === "0" ? null : await store.add(result.messages, { source: "x" });
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
  return json(response, { ok: true, accepted: messages.length, state });
}

function sse(response, state) {
  response.writeHead(200, {
    ...corsHeaders(),
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
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

function routeFromQuery(query) {
  const raw = queryValue(query.path);
  const clean = raw.replace(/^api\//, "").replace(/^\/+/, "");
  return `/${clean || "messages"}`;
}

function queryValue(value) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-stream-chat-token",
  };
}
