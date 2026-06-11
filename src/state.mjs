import crypto from "node:crypto";

const DEFAULT_MAX_MESSAGES = 240;

export function createChatStore(env = process.env) {
  const maxMessages = clampNumber(env.STREAM_CHAT_MAX_MESSAGES, 50, 1000, DEFAULT_MAX_MESSAGES);
  const key = env.STREAM_CHAT_STATE_KEY || "unified-stream-chat:messages";
  let memory = { messages: [], updatedAt: new Date().toISOString() };

  return {
    async config() {
      return publicConfig(env, maxMessages);
    },

    async state() {
      const stored = await readStored(env, key);
      if (stored) memory = stored;
      const messages = normalizeMessages(memory.messages || []).slice(-maxMessages);
      return {
        messages,
        updatedAt: memory.updatedAt || new Date().toISOString(),
        stats: statsFor(messages),
        config: publicConfig(env, maxMessages),
      };
    },

    async add(input, options = {}) {
      const current = await this.state();
      const incoming = (Array.isArray(input) ? input : [input])
        .map((message) => normalizeMessage(message, options.source))
        .filter(Boolean);

      const byId = new Map(current.messages.map((message) => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);

      const messages = normalizeMessages(Array.from(byId.values())).slice(-maxMessages);
      memory = { messages, updatedAt: new Date().toISOString() };
      await writeStored(env, key, memory);

      return {
        ...memory,
        stats: statsFor(messages),
        config: publicConfig(env, maxMessages),
      };
    },

    async clear() {
      memory = { messages: [], updatedAt: new Date().toISOString() };
      await writeStored(env, key, memory);
      return {
        ...memory,
        stats: statsFor([]),
        config: publicConfig(env, maxMessages),
      };
    },
  };
}

export function publicConfig(env = process.env, maxMessages = DEFAULT_MAX_MESSAGES) {
  const baseUrl = env.PUBLIC_BASE_URL || `http://${env.HOST || "127.0.0.1"}:${env.PORT || 8787}`;
  return {
    id: "unified-stream-chat",
    name: "Unified Stream Chat",
    baseUrl,
    maxMessages,
    durableState: hasUpstash(env),
    writeAuth: Boolean(env.STREAM_CHAT_ADMIN_TOKEN),
    xEnabled: Boolean(env.X_BEARER_TOKEN),
    kickSignatureVerification: Boolean(env.KICK_PUBLIC_KEY),
    connect: {
      x: Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET && env.AUTH_SESSION_SECRET),
      twitch: Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && env.AUTH_SESSION_SECRET),
      kick: Boolean(env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET && env.AUTH_SESSION_SECRET),
    },
    sources: [
      {
        id: "twitch",
        label: "Twitch",
        mode: "browser-irc-websocket",
        setup: "Enter a Twitch channel and click Connect. Anonymous read-only IRC is used by default.",
      },
      {
        id: "x",
        label: "X",
        mode: "server-recent-search",
        setup: "Set X_BEARER_TOKEN, enter a query, then sync once or enable auto-polling.",
      },
      {
        id: "kick",
        label: "Kick",
        mode: "webhook",
        setup: "Subscribe Kick chat.message.sent events to /api/kick/webhook.",
      },
    ],
  };
}

export function normalizeMessage(input, sourceHint = "") {
  if (!input || typeof input !== "object") return null;
  const source = normalizeSource(input.source || sourceHint);
  const text = clean(input.text || input.content || input.body || "");
  if (!source || !text) return null;

  const createdAt = safeIso(input.createdAt || input.timestamp || input.time);
  const author = clean(input.author || input.username || input.user || "viewer");
  const platformId = clean(input.platformId || input.message_id || input.tweet_id || input.id || "");
  const id = clean(input.id || "") || `${source}:${platformId || hash(`${createdAt}:${author}:${text}`)}`;

  return {
    id: id.startsWith(`${source}:`) ? id : `${source}:${id}`,
    source,
    sourceLabel: sourceLabel(source),
    author,
    displayName: clean(input.displayName || input.name || author),
    text,
    channel: clean(input.channel || input.room || input.query || ""),
    createdAt,
    receivedAt: safeIso(input.receivedAt || new Date().toISOString()),
    platformId,
    avatarUrl: clean(input.avatarUrl || input.avatar || ""),
    url: clean(input.url || input.permalink || ""),
    identityLabel: clean(input.identityLabel || input.tag || input.speaker || input.guest || ""),
    identityColor: cleanColor(input.identityColor || input.tagColor || input.color || ""),
    badges: Array.isArray(input.badges) ? input.badges.slice(0, 12) : [],
    metrics: input.metrics && typeof input.metrics === "object" ? input.metrics : {},
  };
}

export function normalizeKickWebhook(body = {}, headers = {}) {
  const eventType = headerValue(headers, "kick-event-type");
  if (eventType && eventType !== "chat.message.sent") return [];

  const payload = body && typeof body === "object" ? body : {};
  const sender = payload.sender || {};
  const broadcaster = payload.broadcaster || {};
  const content = payload.content || payload.message || "";
  if (!content) return [];

  return [
    normalizeMessage({
      id: payload.message_id || headerValue(headers, "kick-event-message-id"),
      platformId: payload.message_id,
      source: "kick",
      author: sender.username || sender.channel_slug || "kick-user",
      displayName: sender.username || "Kick user",
      avatarUrl: sender.profile_picture || "",
      text: content,
      createdAt: payload.created_at || headerValue(headers, "kick-event-message-timestamp") || new Date().toISOString(),
      channel: broadcaster.channel_slug || broadcaster.username || "",
      badges: sender.identity?.badges || [],
    }),
  ];
}

export async function fetchXRecent({ query, sinceId, maxResults } = {}, env = process.env) {
  const bearer = String(env.X_BEARER_TOKEN || "").trim();
  if (!bearer) {
    const error = new Error("X_BEARER_TOKEN is not configured");
    error.status = 401;
    throw error;
  }

  const searchQuery = String(query || "").trim();
  if (!searchQuery) {
    const error = new Error("query is required");
    error.status = 400;
    throw error;
  }

  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", searchQuery);
  url.searchParams.set("max_results", String(clampNumber(maxResults, 10, 100, 20)));
  url.searchParams.set("tweet.fields", "author_id,conversation_id,created_at,public_metrics");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "name,profile_image_url,username,verified");
  if (sinceId) url.searchParams.set("since_id", sinceId);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${bearer}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.title || payload.detail || `X API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const users = new Map((payload.includes?.users || []).map((user) => [user.id, user]));
  const messages = (payload.data || []).map((post) => {
    const user = users.get(post.author_id) || {};
    return normalizeMessage({
      id: post.id,
      platformId: post.id,
      source: "x",
      author: user.username ? `@${user.username}` : "X user",
      displayName: user.name || user.username || "X user",
      avatarUrl: user.profile_image_url || "",
      text: post.text,
      createdAt: post.created_at || new Date().toISOString(),
      channel: searchQuery,
      url: user.username ? `https://x.com/${user.username}/status/${post.id}` : `https://x.com/i/web/status/${post.id}`,
      metrics: post.public_metrics || {},
    });
  }).filter(Boolean);

  return {
    ok: true,
    query: searchQuery,
    messages,
    meta: payload.meta || {},
  };
}

export function isAuthorized(headers = {}, env = process.env) {
  const token = String(env.STREAM_CHAT_ADMIN_TOKEN || "").trim();
  if (!token) return true;
  const authorization = headerValue(headers, "authorization");
  const bearer = authorization.replace(/^Bearer\s+/i, "").trim();
  const custom = headerValue(headers, "x-stream-chat-token").trim();
  return timingSafeEqual(bearer, token) || timingSafeEqual(custom, token);
}

export function verifyKickSignature(rawBody, headers = {}, env = process.env) {
  const publicKey = String(env.KICK_PUBLIC_KEY || "").trim();
  if (!publicKey) return true;

  const signature = headerValue(headers, "kick-event-signature");
  const messageId = headerValue(headers, "kick-event-message-id");
  const timestamp = headerValue(headers, "kick-event-message-timestamp");
  if (!signature || !messageId || !timestamp) return false;

  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${messageId}.${timestamp}.${rawBody}`);
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

function normalizeMessages(messages) {
  return messages
    .map((message) => normalizeMessage(message))
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function statsFor(messages) {
  const bySource = { twitch: 0, x: 0, kick: 0 };
  for (const message of messages) {
    if (bySource[message.source] !== undefined) bySource[message.source] += 1;
  }
  return {
    total: messages.length,
    bySource,
    latestAt: messages.at(-1)?.createdAt || null,
  };
}

async function readStored(env, key) {
  const redis = upstashConfig(env);
  if (!redis) return null;
  const response = await fetch(`${redis.url}/get/${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${redis.token}` },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  if (!payload.result) return null;
  return typeof payload.result === "string" ? JSON.parse(payload.result) : payload.result;
}

async function writeStored(env, key, value) {
  const redis = upstashConfig(env);
  if (!redis) return;
  await fetch(`${redis.url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${redis.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(value),
  });
}

function hasUpstash(env) {
  return Boolean(upstashConfig(env));
}

export function upstashConfig(env = process.env) {
  const url = String(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").trim();
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

function normalizeSource(source) {
  const value = String(source || "").trim().toLowerCase();
  if (["twitter", "tweet", "post", "x"].includes(value)) return "x";
  if (["twitch", "kick"].includes(value)) return value;
  return "";
}

function sourceLabel(source) {
  if (source === "x") return "X";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanColor(value) {
  const color = clean(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function safeIso(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  return Array.isArray(direct) ? String(direct[0] || "") : String(direct || "");
}
