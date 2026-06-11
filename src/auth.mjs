import crypto from "node:crypto";
import { upstashConfig } from "./state.mjs";

const STATE_TTL_MS = 10 * 60 * 1000;
const RULES_CACHE_MS = 30 * 1000;
const NONCE_COOKIE = "usc_oauth_nonce";

const PROVIDERS = {
  x: {
    label: "X",
    authorizeUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: "tweet.read users.read offline.access",
    pkce: true,
    basicAuth: true,
  },
  twitch: {
    label: "Twitch",
    authorizeUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scopes: "user:read:email",
    pkce: false,
    basicAuth: false,
  },
  kick: {
    label: "Kick",
    authorizeUrl: "https://id.kick.com/oauth/authorize",
    tokenUrl: "https://id.kick.com/oauth/token",
    scopes: "user:read channel:read events:subscribe",
    pkce: true,
    basicAuth: false,
  },
};

export function authProviderStatus(env = process.env) {
  const status = {};
  for (const platform of Object.keys(PROVIDERS)) {
    status[platform] = Boolean(clientId(platform, env) && clientSecret(platform, env) && env.AUTH_SESSION_SECRET);
  }
  return status;
}

export function startAuth(platform, input = {}, env = process.env) {
  const provider = providerFor(platform, env);
  const room = cleanSlug(input.room) || "default";
  const profile = cleanSlug(input.profile);
  if (!profile) throw httpError(400, "profile is required");
  const label = clean(input.label).slice(0, 32) || profile;
  const color = cleanColor(input.color);
  const nonce = crypto.randomBytes(16).toString("base64url");
  const verifier = provider.pkce ? crypto.randomBytes(32).toString("base64url") : "";
  const state = seal(
    { p: platform, r: room, f: profile, l: label, c: color, n: nonce, v: verifier, t: Date.now() },
    sessionSecret(env),
  );

  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", provider.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scopes);
  url.searchParams.set("state", state);
  if (provider.pkce) {
    url.searchParams.set("code_challenge", crypto.createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  }

  return {
    location: url.toString(),
    cookie: `${NONCE_COOKIE}=${nonce}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`,
  };
}

export async function handleCallback(platform, query = {}, cookieHeader = "", env = process.env) {
  const provider = providerFor(platform, env);
  if (query.error) throw httpError(400, `${provider.label} authorization was denied (${query.error})`);

  const payload = open(query.state, sessionSecret(env));
  if (!payload || payload.p !== platform) throw httpError(400, "invalid auth state");
  if (Date.now() - (payload.t || 0) > STATE_TTL_MS) throw httpError(400, "auth session expired, start the connect again");
  const cookieNonce = parseCookie(cookieHeader, NONCE_COOKIE);
  if (cookieNonce && cookieNonce !== payload.n) throw httpError(400, "auth state mismatch");
  if (!query.code) throw httpError(400, "missing authorization code");

  const tokens = await exchangeCode(provider, query.code, payload.v, env);
  const identity = await fetchIdentity(platform, provider, tokens);
  const subscription = platform === "kick" ? await ensureKickSubscription(tokens, identity) : null;

  const connection = {
    platform,
    ...identity,
    scopes: tokens.scope || provider.scopes,
    connectedAt: new Date().toISOString(),
    subscription,
    tokens: seal(
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || "",
        expiresAt: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : 0,
      },
      tokenSecret(env),
    ),
  };

  await connectionsStore(env).saveConnection(payload.r, payload.f, { label: payload.l, color: payload.c }, platform, connection);
  invalidateRulesCache();

  return {
    room: payload.r,
    profile: payload.f,
    platform,
    identity,
    location: `/?room=${encodeURIComponent(payload.r)}&connected=${encodeURIComponent(`${platform}:${payload.f}`)}`,
    clearCookie: `${NONCE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  };
}

export async function addWatcherHost(input = {}, env = process.env) {
  const room = cleanSlug(input.room) || "default";
  const label = clean(input.label).slice(0, 32);
  const profile = cleanSlug(input.profile || label);
  if (!profile) throw httpError(400, "label is required");
  const color = cleanColor(input.color);
  const store = connectionsStore(env);
  const now = new Date().toISOString();
  const results = {};

  await store.saveHost(room, profile, { label: label || profile, color });

  const xHandle = clean(input.x).replace(/^@/, "").slice(0, 32);
  if (xHandle) {
    await store.saveConnection(room, profile, {}, "x", {
      platform: "x",
      mode: "watch",
      username: xHandle,
      displayName: xHandle,
      channel: xHandle,
      connectedAt: now,
    });
    results.x = { ok: true, username: xHandle };
  }

  const twitchChannel = cleanSlug(clean(input.twitch).replace(/^[@#]/, ""));
  if (twitchChannel) {
    await store.saveConnection(room, profile, {}, "twitch", {
      platform: "twitch",
      mode: "watch",
      username: twitchChannel,
      displayName: twitchChannel,
      channel: twitchChannel,
      connectedAt: now,
    });
    results.twitch = { ok: true, channel: twitchChannel };
  }

  const kickSlug = cleanSlug(clean(input.kick).replace(/^[@#]/, ""));
  if (kickSlug) {
    const connection = {
      platform: "kick",
      mode: "watch",
      username: kickSlug,
      displayName: kickSlug,
      channel: kickSlug,
      connectedAt: now,
    };
    try {
      const token = await kickAppToken(env);
      const channel = await kickChannelBySlug(kickSlug, token);
      connection.broadcasterUserId = Number(channel.broadcaster_user_id || 0);
      connection.channel = String(channel.slug || kickSlug);
      connection.subscription = await kickSubscribe(token, connection.broadcasterUserId);
    } catch (error) {
      connection.subscription = { ok: false, error: error?.message || "Kick watch setup failed" };
    }
    await store.saveConnection(room, profile, {}, "kick", connection);
    results.kick = { ok: Boolean(connection.subscription?.ok), ...connection.subscription, channel: connection.channel };
  }

  invalidateRulesCache();
  return { ok: true, room, profile, results };
}

export async function setWatcherEnabled(input = {}, env = process.env) {
  const room = cleanSlug(input.room) || "default";
  const profile = cleanSlug(input.profile);
  const platform = String(input.platform || "").toLowerCase();
  if (!profile || !PROVIDERS[platform]) throw httpError(400, "profile and platform are required");
  const store = connectionsStore(env);
  const doc = await store.read();
  const connection = doc.rooms[room]?.hosts?.[profile]?.connections?.[platform];
  if (!connection) throw httpError(404, "no such watcher connection");
  connection.enabled = Boolean(input.enabled);
  doc.rooms[room].updatedAt = new Date().toISOString();
  await store.write(doc);
  invalidateRulesCache();
  return { ok: true, room, profile, platform, enabled: connection.enabled };
}

export async function dropDisabledMessages(messages, env = process.env) {
  try {
    await identityRules(env);
    const disabled = new Set(rulesCache.disabledKick);
    if (!disabled.size) return messages;
    return messages.filter((message) => !(
      message && message.source === "kick" && disabled.has(String(message.channel || "").toLowerCase())
    ));
  } catch {
    return messages;
  }
}

let kickTokenCache = { token: "", expiresAt: 0 };

async function kickAppToken(env) {
  if (kickTokenCache.token && Date.now() < kickTokenCache.expiresAt - 60_000) return kickTokenCache.token;
  const id = clientId("kick", env);
  const secret = clientSecret("kick", env);
  if (!id || !secret) throw httpError(503, "Kick watch needs KICK_CLIENT_ID and KICK_CLIENT_SECRET");
  const response = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw httpError(502, payload.error_description || `Kick app token failed (${response.status})`);
  }
  kickTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  return kickTokenCache.token;
}

async function kickChannelBySlug(slug, token) {
  const payload = await apiGet(
    `https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`,
    { authorization: `Bearer ${token}` },
    "Kick channel lookup",
  );
  const channel = payload.data?.[0];
  if (!channel) throw httpError(404, `Kick channel "${slug}" not found`);
  return channel;
}

async function kickSubscribe(token, broadcasterUserId) {
  if (!broadcasterUserId) return { ok: false, error: "missing broadcaster id" };
  const response = await fetch("https://api.kick.com/public/v1/events/subscriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      broadcaster_user_id: broadcasterUserId,
      events: [{ name: "chat.message.sent", version: 1 }],
      method: "webhook",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: payload.message || `Kick subscription failed (${response.status})` };
  return { ok: true, events: ["chat.message.sent"] };
}

export function connectionsStore(env = process.env) {
  const key = env.STREAM_CHAT_CONNECTIONS_KEY || "unified-stream-chat:connections";

  return {
    async read() {
      const redis = upstashConfig(env);
      if (redis) {
        const response = await fetch(`${redis.url}/get/${encodeURIComponent(key)}`, {
          headers: { authorization: `Bearer ${redis.token}` },
        });
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          if (payload.result) {
            const doc = typeof payload.result === "string" ? JSON.parse(payload.result) : payload.result;
            if (doc && typeof doc === "object") return { rooms: doc.rooms || {} };
          }
        }
        return { rooms: {} };
      }
      return memoryDoc();
    },

    async write(doc) {
      const redis = upstashConfig(env);
      if (redis) {
        await fetch(`${redis.url}/set/${encodeURIComponent(key)}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${redis.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(doc),
        });
        return;
      }
      globalThis.__uscConnections = doc;
    },

    async saveHost(room, profile, meta = {}) {
      const doc = await this.read();
      const roomDoc = (doc.rooms[room] ||= { hosts: {} });
      const host = (roomDoc.hosts[profile] ||= { label: profile, color: "", connections: {} });
      if (meta.label) host.label = meta.label;
      if (meta.color) host.color = meta.color;
      roomDoc.updatedAt = new Date().toISOString();
      await this.write(doc);
    },

    async saveConnection(room, profile, meta = {}, platform, connection) {
      const doc = await this.read();
      const roomDoc = (doc.rooms[room] ||= { hosts: {} });
      const host = (roomDoc.hosts[profile] ||= { label: profile, color: "", connections: {} });
      if (meta.label) host.label = meta.label;
      if (meta.color) host.color = meta.color;
      host.connections[platform] = connection;
      roomDoc.updatedAt = new Date().toISOString();
      await this.write(doc);
    },

    async removeConnection(room, profile, platform) {
      const doc = await this.read();
      const host = doc.rooms[room]?.hosts?.[profile];
      if (!host) return false;
      if (platform) {
        delete host.connections[platform];
        if (!Object.keys(host.connections).length) delete doc.rooms[room].hosts[profile];
      } else {
        delete doc.rooms[room].hosts[profile];
      }
      doc.rooms[room].updatedAt = new Date().toISOString();
      await this.write(doc);
      invalidateRulesCache();
      return true;
    },

    async publicRoom(room) {
      const doc = await this.read();
      const roomDoc = doc.rooms[cleanSlug(room) || "default"] || { hosts: {} };
      return {
        ok: true,
        room: cleanSlug(room) || "default",
        updatedAt: roomDoc.updatedAt || null,
        hosts: Object.entries(roomDoc.hosts || {}).map(([profile, host]) => ({
          profile,
          label: host.label || profile,
          color: host.color || "",
          connections: Object.fromEntries(
            Object.entries(host.connections || {}).map(([platform, connection]) => [platform, publicConnection(connection)]),
          ),
        })),
      };
    },
  };
}

export async function stampIdentities(messages, env = process.env) {
  try {
    const rules = await identityRules(env);
    if (!rules.length) return messages;
    return messages.map((message) => {
      if (!message || message.identityLabel) return message;
      const haystack = (message.source === "x"
        ? `${message.author} ${message.text}`
        : `${message.author} ${message.channel}`
      ).toLowerCase();
      const matches = rules.filter((rule) => rule.terms.some((term) => haystack.includes(term)));
      const labels = new Set(matches.map((rule) => rule.label));
      if (labels.size !== 1) return message;
      return { ...message, identityLabel: matches[0].label, identityColor: matches[0].color };
    });
  } catch {
    return messages;
  }
}

let rulesCache = { at: 0, rules: [], disabledKick: [] };

async function identityRules(env) {
  if (Date.now() - rulesCache.at < RULES_CACHE_MS) return rulesCache.rules;
  const doc = await connectionsStore(env).read();
  const rules = [];
  const disabledKick = [];
  for (const room of Object.values(doc.rooms || {})) {
    for (const host of Object.values(room.hosts || {})) {
      const terms = new Set();
      for (const [platform, connection] of Object.entries(host.connections || {})) {
        if (connection.enabled === false) {
          if (platform === "kick" && connection.channel) disabledKick.push(String(connection.channel).toLowerCase());
          continue;
        }
        for (const term of [connection.username, connection.channel]) {
          const cleaned = String(term || "").trim().replace(/^[@#]/, "").toLowerCase();
          if (cleaned) terms.add(cleaned);
        }
      }
      if (terms.size) rules.push({ label: host.label, color: host.color || "", terms: Array.from(terms) });
    }
  }
  rulesCache = { at: Date.now(), rules, disabledKick };
  return rules;
}

function invalidateRulesCache() {
  rulesCache = { at: 0, rules: [], disabledKick: [] };
}

async function exchangeCode(provider, code, verifier, env) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: provider.redirectUri,
    client_id: provider.clientId,
  });
  if (provider.pkce && verifier) body.set("code_verifier", verifier);

  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (provider.basicAuth) {
    headers.authorization = `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString("base64")}`;
  } else if (provider.clientSecret) {
    body.set("client_secret", provider.clientSecret);
  }

  const response = await fetch(provider.tokenUrl, { method: "POST", headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw httpError(502, payload.error_description || payload.message || `${provider.label} token exchange failed (${response.status})`);
  }
  return payload;
}

async function fetchIdentity(platform, provider, tokens) {
  if (platform === "x") {
    const data = (await apiGet(
      "https://api.x.com/2/users/me?user.fields=profile_image_url",
      { authorization: `Bearer ${tokens.access_token}` },
      "X profile lookup",
    )).data || {};
    return {
      userId: String(data.id || ""),
      username: String(data.username || ""),
      displayName: String(data.name || data.username || ""),
      avatarUrl: String(data.profile_image_url || ""),
      channel: String(data.username || ""),
    };
  }

  if (platform === "twitch") {
    const data = (await apiGet(
      "https://api.twitch.tv/helix/users",
      { authorization: `Bearer ${tokens.access_token}`, "client-id": provider.clientId },
      "Twitch profile lookup",
    )).data?.[0] || {};
    return {
      userId: String(data.id || ""),
      username: String(data.login || ""),
      displayName: String(data.display_name || data.login || ""),
      avatarUrl: String(data.profile_image_url || ""),
      channel: String(data.login || ""),
    };
  }

  const user = (await apiGet(
    "https://api.kick.com/public/v1/users",
    { authorization: `Bearer ${tokens.access_token}` },
    "Kick profile lookup",
  )).data?.[0] || {};
  const channel = (await apiGet(
    "https://api.kick.com/public/v1/channels",
    { authorization: `Bearer ${tokens.access_token}` },
    "Kick channel lookup",
  )).data?.[0] || {};
  return {
    userId: String(user.user_id || ""),
    username: String(user.name || ""),
    displayName: String(user.name || ""),
    avatarUrl: String(user.profile_picture || ""),
    channel: String(channel.slug || ""),
    broadcasterUserId: Number(channel.broadcaster_user_id || user.user_id || 0),
  };
}

async function ensureKickSubscription(tokens, identity) {
  try {
    const response = await fetch("https://api.kick.com/public/v1/events/subscriptions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        broadcaster_user_id: identity.broadcasterUserId || undefined,
        events: [{ name: "chat.message.sent", version: 1 }],
        method: "webhook",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: payload.message || `Kick subscription failed (${response.status})` };
    }
    return { ok: true, events: ["chat.message.sent"] };
  } catch (error) {
    return { ok: false, error: error?.message || "Kick subscription failed" };
  }
}

async function apiGet(url, headers, label) {
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(502, payload.error_description || payload.message || payload.detail || `${label} failed (${response.status})`);
  }
  return payload;
}

function publicConnection(connection = {}) {
  return {
    platform: connection.platform,
    mode: connection.mode || "oauth",
    enabled: connection.enabled !== false,
    username: connection.username || "",
    displayName: connection.displayName || "",
    channel: connection.channel || "",
    avatarUrl: connection.avatarUrl || "",
    broadcasterUserId: connection.broadcasterUserId || undefined,
    connectedAt: connection.connectedAt || "",
    subscription: connection.subscription ? { ok: Boolean(connection.subscription.ok) } : undefined,
  };
}

function providerFor(platform, env) {
  const provider = PROVIDERS[platform];
  if (!provider) throw httpError(404, `unknown platform: ${platform}`);
  const id = clientId(platform, env);
  const secret = clientSecret(platform, env);
  if (!id || !secret) {
    throw httpError(503, `${provider.label} connect is not configured (set ${platform.toUpperCase()}_CLIENT_ID and ${platform.toUpperCase()}_CLIENT_SECRET)`);
  }
  return {
    ...provider,
    clientId: id,
    clientSecret: secret,
    redirectUri: redirectUri(platform, env),
  };
}

function clientId(platform, env) {
  return String(env[`${platform.toUpperCase()}_CLIENT_ID`] || "").trim();
}

function clientSecret(platform, env) {
  return String(env[`${platform.toUpperCase()}_CLIENT_SECRET`] || "").trim();
}

function redirectUri(platform, env) {
  const explicit = String(env[`${platform.toUpperCase()}_REDIRECT_URI`] || "").trim();
  if (explicit) return explicit;
  const base = String(env.PUBLIC_BASE_URL || `http://${env.HOST || "127.0.0.1"}:${env.PORT || 8787}`).replace(/\/+$/, "");
  return `${base}/api/auth/${platform}/callback`;
}

function sessionSecret(env) {
  const secret = String(env.AUTH_SESSION_SECRET || "").trim();
  if (!secret) throw httpError(503, "AUTH_SESSION_SECRET is not configured");
  return secret;
}

function tokenSecret(env) {
  return String(env.TOKEN_ENCRYPTION_KEY || "").trim() || sessionSecret(env);
}

function seal(value, secret) {
  const key = crypto.createHash("sha256").update(String(secret)).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function open(blob, secret) {
  try {
    const key = crypto.createHash("sha256").update(String(secret)).digest();
    const raw = Buffer.from(String(blob || ""), "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

function memoryDoc() {
  return (globalThis.__uscConnections ||= { rooms: {} });
}

function parseCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanSlug(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
}

function cleanColor(value) {
  const color = clean(value);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
