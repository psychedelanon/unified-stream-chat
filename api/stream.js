import {
  createChatStore,
  fetchXRecent,
  isAuthorized,
  normalizeKickWebhook,
  verifyKickSignature,
} from "../src/state.mjs";
import {
  addWatcherHost,
  connectionsStore,
  dropDisabledMessages,
  handleCallback,
  setWatcherEnabled,
  stampIdentities,
  startAuth,
} from "../src/auth.mjs";

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

    if (request.method === "GET" && /^\/auth\/[a-z]+\/(start|callback)$/.test(route)) {
      return await auth(request, response, route);
    }

    if (request.method === "GET" && route === "/connections") {
      return json(response, await connectionsStore(process.env).publicRoom(queryValue(request.query.room)));
    }

    if (request.method === "POST" && route === "/hosts") {
      if (!isAuthorized(request.headers, process.env)) {
        return json(response, { ok: false, error: "unauthorized" }, 401);
      }
      return json(response, await addWatcherHost(await readJson(request), process.env));
    }

    if (request.method === "POST" && route === "/hosts/toggle") {
      if (!isAuthorized(request.headers, process.env)) {
        return json(response, { ok: false, error: "unauthorized" }, 401);
      }
      return json(response, await setWatcherEnabled(await readJson(request), process.env));
    }

    if (request.method === "DELETE" && route === "/connections") {
      return await disconnect(request, response);
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
  const raw = body.messages || body.message || body;
  const stamped = await stampIdentities(Array.isArray(raw) ? raw : [raw], process.env);
  const state = await store.add(stamped, { source: body.source });
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
  result.messages = await stampIdentities(result.messages, process.env);
  const wantSync = queryValue(request.query.sync) !== "0" && isAuthorized(request.headers, process.env);
  const state = wantSync ? await store.add(result.messages, { source: "x" }) : null;
  return json(response, { ...result, state });
}

async function auth(request, response, route) {
  const [, , platform, action] = route.split("/");
  try {
    if (action === "start") {
      const started = startAuth(platform, {
        room: queryValue(request.query.room),
        profile: queryValue(request.query.profile),
        label: queryValue(request.query.label),
        color: queryValue(request.query.color),
      }, process.env);
      return redirect(response, started.location, started.cookie);
    }
    const result = await handleCallback(platform, {
      code: queryValue(request.query.code),
      state: queryValue(request.query.state),
      error: queryValue(request.query.error),
    }, String(request.headers.cookie || ""), process.env);
    return redirect(response, result.location, result.clearCookie);
  } catch (error) {
    return redirect(response, `/?auth_error=${encodeURIComponent(error?.message || "auth failed")}`);
  }
}

async function disconnect(request, response) {
  if (!isAuthorized(request.headers, process.env)) {
    return json(response, { ok: false, error: "unauthorized" }, 401);
  }
  const removed = await connectionsStore(process.env).removeConnection(
    queryValue(request.query.room) || "default",
    queryValue(request.query.profile),
    queryValue(request.query.platform),
  );
  return json(response, { ok: true, removed });
}

async function kickWebhook(request, response) {
  const rawBody = await readBody(request);
  if (!verifyKickSignature(rawBody, request.headers, process.env)) {
    return json(response, { ok: false, error: "invalid Kick signature" }, 401);
  }
  const body = rawBody.trim() ? JSON.parse(rawBody) : {};
  const incoming = await dropDisabledMessages(normalizeKickWebhook(body, request.headers), process.env);
  const messages = await stampIdentities(incoming, process.env);
  if (!messages.length) return json(response, { ok: true, accepted: 0 }, 202);

  const state = await store.add(messages, { source: "kick" });
  return json(response, { ok: true, accepted: messages.length, state });
}

function redirect(response, location, cookie) {
  const headers = { location, "cache-control": "no-store", ...corsHeaders() };
  if (cookie) headers["set-cookie"] = cookie;
  response.writeHead(302, headers);
  response.end();
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
