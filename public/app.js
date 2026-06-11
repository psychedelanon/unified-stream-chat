const params = new URLSearchParams(window.location.search);
const isOverlay = location.pathname.includes("/overlay") || params.get("overlay") === "1";
const app = document.getElementById("app");
const localMessageKey = "unifiedStreamChat.messages";
const overlayOptions = readOverlayOptions();
const identityRules = readIdentityRules();
const roomName = cleanSlug(params.get("room") || localStorage.getItem("unifiedStreamChat.room") || "marketbubble") || "marketbubble";

document.body.classList.toggle("is-overlay", isOverlay);
document.body.dataset.overlayLayout = overlayOptions.layout;
document.body.dataset.overlayPosition = overlayOptions.position;
app.dataset.mode = isOverlay ? "overlay" : "dashboard";
app.dataset.overlayLayout = overlayOptions.layout;

const els = {
  feedList: document.getElementById("feedList"),
  overlayFeedList: document.getElementById("overlayFeedList"),
  loadingState: document.getElementById("loadingState"),
  errorState: document.getElementById("errorState"),
  errorText: document.getElementById("errorText"),
  emptyState: document.getElementById("emptyState"),
  feedMeta: document.getElementById("feedMeta"),
  totalMessages: document.getElementById("totalMessages"),
  countTwitch: document.getElementById("countTwitch"),
  countX: document.getElementById("countX"),
  countKick: document.getElementById("countKick"),
  roomName: document.getElementById("roomName"),
  hostList: document.getElementById("hostList"),
  newHostName: document.getElementById("newHostName"),
  newHostX: document.getElementById("newHostX"),
  newHostTwitch: document.getElementById("newHostTwitch"),
  newHostKick: document.getElementById("newHostKick"),
  newHostColor: document.getElementById("newHostColor"),
  xLiveCommands: document.getElementById("xLiveCommands"),
  adminToken: document.getElementById("adminToken"),
  dashboardUrl: document.getElementById("dashboardUrl"),
  obsUrl: document.getElementById("obsUrl"),
  obsRightRailUrl: document.getElementById("obsRightRailUrl"),
  obsLeftRailUrl: document.getElementById("obsLeftRailUrl"),
  obsCompactUrl: document.getElementById("obsCompactUrl"),
  obsBoxUrl: document.getElementById("obsBoxUrl"),
  boxOverlayLink: document.getElementById("boxOverlayLink"),
  overlayLink: document.getElementById("overlayLink"),
  rightRailLink: document.getElementById("rightRailLink"),
  compactOverlayLink: document.getElementById("compactOverlayLink"),
  pauseFeed: document.getElementById("pauseFeed"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayMeta: document.getElementById("overlayMeta"),
};

const sourceStatus = {
  twitch: { state: "idle", text: "idle" },
  x: { state: "idle", text: "idle" },
  kick: { state: "warn", text: "webhook" },
};

localStorage.removeItem(localMessageKey);

const state = {
  messages: [],
  filter: "all",
  loaded: false,
  paused: false,
  eventSource: null,
  twitchSocket: null,
  demoTimer: null,
  xTimer: null,
  xSyncInFlight: false,
  xNewestId: localStorage.getItem("unifiedStreamChat.xNewestId") || "",
  connections: [],
  connectionRules: [],
  localHosts: readLocalHosts(),
  joinedTwitchChannels: [],
  serverConfig: null,
  xAutoStarted: false,
  xQuery: "",
};

const origin = window.location.origin;
const defaults = {
  adminToken: localStorage.getItem("unifiedStreamChat.adminToken") || "",
};

setValue(els.roomName, roomName);
setValue(els.adminToken, defaults.adminToken);
setValue(els.dashboardUrl, `${origin}/`);
setValue(els.obsUrl, `${origin}/overlay`);
setValue(els.obsRightRailUrl, `${origin}/overlay?layout=rail&position=right&messages=5`);
setValue(els.obsLeftRailUrl, `${origin}/overlay?layout=rail&position=left&messages=5`);
setValue(els.obsCompactUrl, `${origin}/overlay?layout=compact&position=bottom-right&messages=3`);
const boxTitle = roomName.charAt(0).toUpperCase() + roomName.slice(1);
const boxOverlayUrl = `${origin}/overlay?layout=box&title=${encodeURIComponent(boxTitle)}`;
setValue(els.obsBoxUrl, boxOverlayUrl);
if (els.boxOverlayLink) els.boxOverlayLink.href = boxOverlayUrl;
if (els.overlayLink) els.overlayLink.href = boxOverlayUrl;
if (els.rightRailLink) els.rightRailLink.href = `${origin}/overlay?layout=rail&position=right&messages=5`;
if (els.compactOverlayLink) els.compactOverlayLink.href = `${origin}/overlay?layout=compact&position=bottom-right&messages=3`;
setText(els.overlayTitle, overlayOptions.title);

bindDashboard();
connectEvents();
refreshState();
setInterval(refreshState, isOverlay ? 2000 : 3000);
refreshConnections();
setInterval(refreshConnections, isOverlay ? 30000 : 15000);
handleAuthReturn();

function bindDashboard() {
  if (isOverlay) return;

  document.getElementById("addHost")?.addEventListener("click", addHost);
  els.hostList?.addEventListener("click", onWatcherChipClick);
  els.xLiveCommands?.addEventListener("click", onCopyXLiveCommand);
  els.newHostName?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addHost();
  });
  els.roomName?.addEventListener("change", () => {
    localStorage.setItem("unifiedStreamChat.room", currentRoom());
    state.localHosts = readLocalHosts(currentRoom());
    refreshConnections();
  });
  document.getElementById("copyBoxUrl")?.addEventListener("click", async (event) => {
    try {
      await navigator.clipboard.writeText(els.obsBoxUrl?.value || "");
      event.target.textContent = "Copied";
      setTimeout(() => { event.target.textContent = "Copy URL"; }, 1500);
    } catch {
      els.obsBoxUrl?.select();
    }
  });
  document.getElementById("demoPulse")?.addEventListener("click", toggleDemoPulse);
  document.getElementById("demoAll")?.addEventListener("click", seedAll);
  document.getElementById("demoTwitch")?.addEventListener("click", () => injectDemo("twitch"));
  document.getElementById("demoX")?.addEventListener("click", () => injectDemo("x"));
  document.getElementById("demoKick")?.addEventListener("click", () => injectDemo("kick"));
  document.getElementById("clearFeed")?.addEventListener("click", clearFeed);
  document.getElementById("retryState")?.addEventListener("click", refreshState);

  els.pauseFeed?.addEventListener("click", () => {
    state.paused = !state.paused;
    els.pauseFeed.setAttribute("aria-pressed", String(state.paused));
    els.pauseFeed.textContent = state.paused ? "Resume" : "Pause";
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter || "all";
      document.querySelectorAll("[data-filter]").forEach((node) => node.classList.toggle("active", node === button));
      render();
    });
  });

  els.adminToken?.addEventListener("change", () => {
    persistInputs();
    renderXLiveCommands();
  });
}

function connectEvents() {
  if (!window.EventSource) return;
  try {
    state.eventSource = new EventSource("/api/events");
    state.eventSource.addEventListener("state", (event) => {
      const payload = JSON.parse(event.data);
      mergeMessages(payload.messages || []);
      updateStats();
      state.loaded = true;
      hideTransientStates();
      render();
    });
    state.eventSource.addEventListener("error", () => {
      setTimeout(() => {
        try {
          state.eventSource?.close();
          state.eventSource = null;
          connectEvents();
        } catch {}
      }, 3000);
    });
  } catch {}
}

async function refreshState() {
  try {
    const response = await fetch("/api/messages", { cache: "no-store" });
    if (!response.ok) throw new Error(`messages returned ${response.status}`);
    const payload = await response.json();
    if (payload.config) state.serverConfig = payload.config;
    mergeMessages(payload.messages || []);
    updateStats();
    state.loaded = true;
    hideTransientStates();
    render();
  } catch (error) {
    if (!state.loaded) els.loadingState.hidden = true;
    showError(error.message || "Could not load feed.");
  }
}

function hideTransientStates() {
  if (els.loadingState) els.loadingState.hidden = true;
  if (els.errorState) els.errorState.hidden = true;
}

function mergeMessages(messages) {
  const map = new Map(state.messages.map((message) => [message.id, message]));
  for (const message of messages) map.set(message.id, normalizeLocalMessage(message));
  state.messages = Array.from(map.values()).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).slice(-240);
}

function updateStats() {
  const stats = statsFromMessages(state.messages);
  setText(els.totalMessages, String(stats.total));
  setText(els.countTwitch, String(stats.bySource.twitch || 0));
  setText(els.countX, String(stats.bySource.x || 0));
  setText(els.countKick, String(stats.bySource.kick || 0));
  setText(els.feedMeta, `${stats.total} messages`);
  for (const source of ["twitch", "x", "kick"]) {
    const count = stats.bySource[source] || 0;
    if (count > 0 && sourceStatus[source]?.state !== "live") {
      sourceStatus[source] = { state: "live", text: `${count} seen` };
    }
  }
}

function render() {
  renderStatuses();
  if (state.paused && !isOverlay) return;

  const filtered = state.messages.filter((message) => state.filter === "all" || message.source === state.filter);
  const newest = filtered.slice().reverse();

  if (els.emptyState) els.emptyState.hidden = newest.length > 0 || !state.loaded;
  if (els.feedList) els.feedList.innerHTML = newest.slice(0, 120).map(renderMessage).join("");

  // The box layout reads like a real chat: oldest to newest, newest at the
  // bottom, auto-scrolled. Other layouts show newest first.
  const recent = state.messages.slice(-overlayOptions.limit);
  const overlayMessages = overlayOptions.layout === "box" ? recent : recent.reverse();
  if (els.overlayFeedList) {
    els.overlayFeedList.innerHTML = overlayMessages.length ? overlayMessages.map(renderOverlayMessage).join("") : renderOverlayPlaceholder();
    if (overlayOptions.layout === "box") els.overlayFeedList.scrollTop = els.overlayFeedList.scrollHeight;
  }
  if (els.overlayMeta) els.overlayMeta.textContent = overlayMetaText(state.messages.length);
}

function renderStatuses() {
  for (const [source, status] of Object.entries(sourceStatus)) {
    const node = document.getElementById(`status-${source}`);
    if (!node) continue;
    node.dataset.state = status.state;
    const label = node.querySelector("em");
    if (label) label.textContent = status.text;
  }
}

function renderMessage(message) {
  const identityTag = renderIdentityTag(message);
  return `
    <li class="message ${escapeAttr(message.source)}">
      <span class="source-label">${escapeHtml(labelFor(message.source))}</span>
      <div class="message-main">
        <div class="message-meta">
          <strong class="message-author">${escapeHtml(message.displayName || message.author)}</strong>
          ${identityTag}
          <span class="message-channel">${escapeHtml(message.channel || "")}</span>
        </div>
        <p class="message-text">${linkify(message.text)}</p>
      </div>
      <time class="message-time" datetime="${escapeAttr(message.createdAt)}">${formatTime(message.createdAt)}</time>
    </li>
  `;
}

function renderOverlayMessage(message) {
  const identityTag = renderIdentityTag(message, "overlay-identity-tag");
  return `
    <li class="overlay-message ${escapeAttr(message.source)}">
      <span class="source-label">${escapeHtml(labelFor(message.source))}</span>
      <div>
        <strong>${escapeHtml(message.displayName || message.author)}${identityTag}</strong>
        <p>${escapeHtml(message.text)}</p>
      </div>
    </li>
  `;
}

function renderOverlayPlaceholder() {
  return `
    <li class="overlay-message twitch">
      <span class="source-label">LIVE</span>
      <div>
        <strong>standing by</strong>
        <p>Waiting for Twitch, X, or Kick.</p>
      </div>
    </li>
  `;
}

async function connectTwitch(watchChannels = []) {
  const channels = Array.from(new Set(watchChannels.map(cleanChannel).filter(Boolean)));
  if (!channels.length) {
    if (state.twitchSocket) {
      state.twitchSocket.close();
      state.twitchSocket = null;
      setSourceStatus("twitch", "idle", "idle");
    }
    return;
  }

  if (state.twitchSocket) {
    state.twitchSocket.close();
    state.twitchSocket = null;
  }

  setSourceStatus("twitch", "warn", "connecting");
  const nick = `justinfan${Math.floor(Math.random() * 90000) + 10000}`;
  const socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  state.twitchSocket = socket;
  state.joinedTwitchChannels = channels;

  socket.addEventListener("open", () => {
    socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    socket.send("PASS SCHMOOPIIE");
    socket.send(`NICK ${nick}`);
    socket.send(`JOIN ${channels.map((channel) => `#${channel}`).join(",")}`);
    setSourceStatus("twitch", "live", channels.join(", "));
  });

  socket.addEventListener("message", (event) => {
    const lines = String(event.data || "").split("\r\n").filter(Boolean);
    for (const line of lines) {
      if (line.startsWith("PING")) {
        socket.send(line.replace("PING", "PONG"));
        continue;
      }
      const message = parseTwitchLine(line, channels[0]);
      if (message) ingestMessage(message);
    }
  });

  socket.addEventListener("close", () => {
    if (state.twitchSocket === socket) setSourceStatus("twitch", "warn", "closed");
  });

  socket.addEventListener("error", () => setSourceStatus("twitch", "error", "error"));
}

async function refreshConnections() {
  try {
    const response = await fetch(`/api/connections?room=${encodeURIComponent(currentRoom())}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    state.connections = payload.hosts || [];
    state.connectionRules = rulesFromConnections(state.connections);
    if (!isOverlay) {
      renderHosts();
      autoWireSources();
    }
  } catch {}
}

function rulesFromConnections(hosts) {
  return hosts.map((host) => {
    const terms = new Set();
    for (const connection of Object.values(host.connections || {})) {
      if (connection.enabled === false) continue;
      for (const term of [connection.username, connection.channel]) {
        const cleaned = String(term || "").trim().replace(/^[@#]/, "").toLowerCase();
        if (cleaned) terms.add(cleaned);
      }
    }
    return terms.size ? { label: host.label, color: cleanColor(host.color), terms: Array.from(terms) } : null;
  }).filter(Boolean);
}

function renderHosts() {
  if (!els.hostList) return;
  const serverProfiles = new Set(state.connections.map((host) => host.profile));
  const pending = state.localHosts.filter((host) => !serverProfiles.has(host.profile));
  const hosts = [...state.connections, ...pending];
  els.hostList.innerHTML = hosts.length
    ? hosts.map(renderHostRow).join("")
    : `<p class="note">No watchers yet. Add a streamer below with the channels to watch.</p>`;
}

function renderHostRow(host) {
  const chips = ["x", "twitch", "kick"].map((platform) => {
    const connection = host.connections?.[platform];
    if (connection) {
      const enabled = connection.enabled !== false;
      const handle = connection.username || connection.channel || "";
      const title = `${labelFor(platform)} ${handle}: click to turn ${enabled ? "off" : "on"}`;
      return `<button type="button" class="connect-chip toggle ${platform}${enabled ? " on" : " off"}" data-toggle="${platform}" data-profile="${escapeAttr(host.profile)}" data-enabled="${enabled ? "1" : "0"}" title="${escapeAttr(title)}">${escapeHtml(labelFor(platform))}</button>`;
    }
    return `<button type="button" class="connect-chip add ${platform}" data-add="${platform}" data-profile="${escapeAttr(host.profile)}" data-label="${escapeAttr(host.label)}" data-color="${escapeAttr(host.color || "")}" title="${escapeAttr(`Watch a ${labelFor(platform)} channel for ${host.label}`)}">${escapeHtml(labelFor(platform))} +</button>`;
  }).join("");
  const dotStyle = host.color ? ` style="--identity-color: ${escapeAttr(host.color)}"` : "";
  return `
    <div class="host-row">
      <span class="host-dot"${dotStyle}></span>
      <strong class="host-name">${escapeHtml(host.label)}</strong>
      <span class="host-chips">${chips}</span>
    </div>
  `;
}

async function onWatcherChipClick(event) {
  const target = event.target.closest("button[data-toggle], button[data-add]");
  if (!target) return;
  const profile = target.dataset.profile;
  try {
    if (target.dataset.toggle) {
      target.disabled = true;
      await postJson("/api/hosts/toggle", {
        room: currentRoom(),
        profile,
        platform: target.dataset.toggle,
        enabled: target.dataset.enabled !== "1",
      });
    } else {
      const platform = target.dataset.add;
      const kind = platform === "x" ? "handle" : "channel";
      const handle = window.prompt(`${labelFor(platform)} ${kind} for ${target.dataset.label}:`);
      if (!handle?.trim()) return;
      await postJson("/api/hosts", {
        room: currentRoom(),
        profile,
        label: target.dataset.label,
        color: target.dataset.color,
        [platform]: handle.trim(),
      });
    }
    await refreshConnections();
  } catch (error) {
    showError(error.message || "Watcher update failed.");
  } finally {
    target.disabled = false;
  }
}

async function postJson(path, body) {
  const headers = { "content-type": "application/json" };
  const token = els.adminToken?.value?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `${path} returned ${response.status}`);
  return payload;
}

async function addHost() {
  const name = String(els.newHostName?.value || "").trim().slice(0, 32);
  const profile = cleanSlug(name);
  if (!profile) return;
  const color = cleanColor(els.newHostColor?.value || "") || "#f97316";
  const body = {
    room: currentRoom(),
    profile,
    label: name,
    color,
    x: String(els.newHostX?.value || "").trim(),
    twitch: String(els.newHostTwitch?.value || "").trim(),
    kick: String(els.newHostKick?.value || "").trim(),
  };

  const button = document.getElementById("addHost");
  if (button) {
    button.disabled = true;
    button.textContent = "Adding";
  }
  try {
    const headers = { "content-type": "application/json" };
    const token = els.adminToken?.value?.trim();
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch("/api/hosts", { method: "POST", headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || `hosts returned ${response.status}`);
    [els.newHostName, els.newHostX, els.newHostTwitch, els.newHostKick].forEach((input) => {
      if (input) input.value = "";
    });
    const kickResult = payload.results?.kick;
    if (kickResult && !kickResult.ok) showError(`Kick watch issue: ${kickResult.error || "subscription failed"}`);
    await refreshConnections();
  } catch (error) {
    showError(error.message || "Could not save host.");
    state.localHosts = [
      ...state.localHosts.filter((host) => host.profile !== profile),
      { profile, label: name, color, connections: {} },
    ];
    writeLocalHosts();
    renderHosts();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Add Host";
    }
  }
}

function autoWireSources() {
  const twitchChannels = state.connections
    .filter((host) => host.connections?.twitch?.enabled !== false)
    .map((host) => cleanChannel(host.connections?.twitch?.channel || ""))
    .filter(Boolean);
  const previous = state.watcherTwitchChannels || [];
  if (twitchChannels.join() !== previous.join() && (twitchChannels.length || previous.length)) {
    state.watcherTwitchChannels = twitchChannels;
    connectTwitch(twitchChannels);
  }

  const xHandles = state.connections
    .filter((host) => host.connections?.x?.enabled !== false)
    .map((host) => String(host.connections?.x?.username || "").trim())
    .filter(Boolean);
  state.xQuery = xHandles.length
    ? `(${xHandles.map((handle) => `to:${handle} OR @${handle}`).join(" OR ")}) -is:retweet`
    : "";

  // X polling starts itself once a watched handle exists; no clicks needed.
  if (xHandles.length && state.serverConfig?.xEnabled && !state.xTimer && !state.xAutoStarted) {
    state.xAutoStarted = true;
    syncX();
    state.xTimer = setInterval(syncX, 25000);
  }
  if (!xHandles.length && state.xTimer) {
    clearInterval(state.xTimer);
    state.xTimer = null;
    state.xAutoStarted = false;
    setSourceStatus("x", "idle", "idle");
  }

  renderXLiveCommands();
}

function renderXLiveCommands() {
  if (!els.xLiveCommands) return;
  const hosts = state.connections.filter((host) => host.connections?.x?.username && host.connections.x.enabled !== false);
  if (!hosts.length) {
    els.xLiveCommands.innerHTML = `<p class="note">Add a watcher with an X handle to generate its command.</p>`;
    return;
  }
  els.xLiveCommands.innerHTML = hosts.map((host) => `
    <div class="xlive-row">
      <code class="xlive-cmd">${escapeHtml(xLiveCommandFor(host))}</code>
      <button type="button" data-copy-xlive="${escapeAttr(host.profile)}">Copy</button>
    </div>
  `).join("");
}

function xLiveCommandFor(host) {
  const handle = String(host.connections?.x?.username || "").replace(/^@/, "");
  const token = els.adminToken?.value?.trim();
  const parts = [
    "npm run x-live --",
    `--user ${handle}`,
    `--label "${host.label}"`,
  ];
  if (host.color) parts.push(`--color "${host.color}"`);
  parts.push(`--ingest ${origin}`);
  if (token) parts.push(`--token ${token}`);
  return parts.join(" ");
}

async function onCopyXLiveCommand(event) {
  const button = event.target.closest("button[data-copy-xlive]");
  if (!button) return;
  const host = state.connections.find((candidate) => candidate.profile === button.dataset.copyXlive);
  if (!host) return;
  try {
    await navigator.clipboard.writeText(xLiveCommandFor(host));
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = "Copy"; }, 1500);
  } catch {
    button.textContent = "Select + copy manually";
  }
}

function handleAuthReturn() {
  if (isOverlay) return;
  const connected = params.get("connected");
  const authError = params.get("auth_error");
  if (!connected && !authError) return;
  if (connected) {
    const [platform, profile] = connected.split(":");
    setSourceStatus(platform, "live", `${profile} linked`);
    setText(els.feedMeta, `${labelFor(platform)} connected for ${profile}`);
  }
  if (authError) showError(authError);
  const url = new URL(window.location.href);
  url.searchParams.delete("connected");
  url.searchParams.delete("auth_error");
  history.replaceState(null, "", url.toString());
}

function currentRoom() {
  return cleanSlug(els.roomName?.value || "") || roomName;
}

function readLocalHosts(room = roomName) {
  try {
    const parsed = JSON.parse(localStorage.getItem(`unifiedStreamChat.hosts.${room}`) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalHosts() {
  try {
    localStorage.setItem(`unifiedStreamChat.hosts.${currentRoom()}`, JSON.stringify(state.localHosts.slice(0, 12)));
  } catch {}
}

function cleanSlug(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
}

async function syncX() {
  if (state.xSyncInFlight) return;
  const query = state.xQuery.trim();
  if (!query) return;
  state.xSyncInFlight = true;
  setSourceStatus("x", "warn", "syncing");

  const url = new URL("/api/x/recent", origin);
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", "20");
  if (state.xNewestId) url.searchParams.set("since_id", state.xNewestId);

  try {
    const headers = {};
    const token = els.adminToken?.value?.trim();
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(url, { cache: "no-store", headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `X returned ${response.status}`);
    if (payload.meta?.newest_id) {
      state.xNewestId = payload.meta.newest_id;
      localStorage.setItem("unifiedStreamChat.xNewestId", state.xNewestId);
    }
    mergeMessages(payload.messages || []);
    setSourceStatus("x", "live", `${payload.messages?.length || 0} new`);
    updateStats();
    render();
  } catch (error) {
    setSourceStatus("x", "error", "needs token");
    showError(error.message || "X sync failed.");
  } finally {
    state.xSyncInFlight = false;
  }
}

function toggleDemoPulse() {
  const button = document.getElementById("demoPulse");
  if (state.demoTimer) {
    clearInterval(state.demoTimer);
    state.demoTimer = null;
    button?.setAttribute("aria-pressed", "false");
    return;
  }
  let index = 0;
  const sources = ["twitch", "x", "kick"];
  state.demoTimer = setInterval(() => {
    injectDemo(sources[index % sources.length]);
    index += 1;
  }, 1450);
  button?.setAttribute("aria-pressed", "true");
  sources.forEach((source) => setSourceStatus(source, "live", "demo"));
  seedAll();
}

function seedAll() {
  ["twitch", "x", "kick"].forEach((source) => injectDemo(source));
}

function injectDemo(source) {
  const samples = {
    twitch: [
      "Twitch chat is flowing into one stream-ready feed.",
      "Source labels make this way easier to read on air.",
      "OBS overlay looks clean over gameplay.",
    ],
    x: [
      "X posts are landing beside Twitch and Kick in real time.",
      "This is the missing chat layer for multi-platform streams.",
      "Auto-polling X while stream chat keeps moving.",
    ],
    kick: [
      "Kick webhook message received by the unified feed.",
      "Kick chat is ready for the OBS lower third.",
      "One feed, three platforms, clean labels.",
    ],
  };
  const list = samples[source] || samples.twitch;
  const author = source === "x" ? "@stream_signal" : source === "kick" ? "kickviewer" : "twitchviewer";
  const firstWatched = state.connections[0]?.connections?.[source]?.channel || "demo";
  ingestMessage({
    source,
    id: `demo-${source}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    author,
    displayName: author,
    channel: firstWatched,
    text: list[Math.floor(Math.random() * list.length)],
    createdAt: new Date().toISOString(),
  });
}

async function ingestMessage(message) {
  mergeMessages([normalizeLocalMessage(message)]);
  updateStats();
  render();

  try {
    const headers = { "content-type": "application/json" };
    const token = els.adminToken?.value?.trim();
    if (token) headers.authorization = `Bearer ${token}`;
    await fetch("/api/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify({ source: message.source, message }),
    });
  } catch {}
}

async function clearFeed() {
  try {
    const headers = { "content-type": "application/json" };
    const token = els.adminToken?.value?.trim();
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch("/api/messages", { method: "DELETE", headers });
    if (response.status === 401) {
      state.messages = [];
      updateStats();
      render();
      showError("Cleared locally. Enter the admin token to clear the shared feed.");
      return;
    }
    if (!response.ok) throw new Error(`clear returned ${response.status}`);
    state.messages = [];
    updateStats();
    render();
  } catch (error) {
    showError(error.message || "Could not clear feed.");
  }
}

function parseTwitchLine(line, fallbackChannel) {
  let rest = line;
  const tags = {};
  if (rest.startsWith("@")) {
    const end = rest.indexOf(" ");
    const rawTags = rest.slice(1, end).split(";");
    for (const rawTag of rawTags) {
      const [key, value = ""] = rawTag.split("=");
      tags[key] = value.replace(/\\s/g, " ");
    }
    rest = rest.slice(end + 1);
  }

  const match = rest.match(/^:([^!]+)![^ ]+ PRIVMSG #([^ ]+) :([\s\S]+)$/);
  if (!match) return null;

  return {
    source: "twitch",
    id: tags.id || `${match[2]}-${Date.now()}-${Math.random()}`,
    platformId: tags.id || "",
    author: match[1],
    displayName: tags["display-name"] || match[1],
    text: match[3],
    channel: match[2] || fallbackChannel,
    createdAt: tags["tmi-sent-ts"] ? new Date(Number(tags["tmi-sent-ts"])).toISOString() : new Date().toISOString(),
    badges: tags.badges ? tags.badges.split(",").filter(Boolean) : [],
  };
}

function normalizeLocalMessage(message) {
  const source = message.source || "twitch";
  const createdAt = message.createdAt || new Date().toISOString();
  const normalized = {
    id: message.id?.startsWith(`${source}:`) ? message.id : `${source}:${message.id || Date.now()}`,
    source,
    sourceLabel: labelFor(source),
    author: message.author || "viewer",
    displayName: message.displayName || message.author || "viewer",
    text: message.text || "",
    channel: message.channel || "",
    createdAt,
    receivedAt: message.receivedAt || new Date().toISOString(),
    url: message.url || "",
    identityLabel: message.identityLabel || message.tag || message.speaker || message.guest || "",
    identityColor: cleanColor(message.identityColor || message.tagColor || message.color || ""),
  };
  return applyIdentityRule(normalized);
}

function persistInputs() {
  localStorage.setItem("unifiedStreamChat.adminToken", els.adminToken?.value || "");
}

function statsFromMessages(messages) {
  const bySource = { twitch: 0, x: 0, kick: 0 };
  for (const message of messages) {
    if (bySource[message.source] !== undefined) bySource[message.source] += 1;
  }
  return { total: messages.length, bySource };
}

function setSourceStatus(source, statusState, text) {
  sourceStatus[source] = { state: statusState, text };
  renderStatuses();
}

function showError(message) {
  if (!els.errorState) return;
  els.errorText.textContent = message;
  els.errorState.hidden = false;
}

function labelFor(source) {
  if (source === "x") return "X";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function renderIdentityTag(message, className = "identity-tag") {
  if (!message.identityLabel) return "";
  const style = message.identityColor ? ` style="--identity-color: ${escapeAttr(message.identityColor)}"` : "";
  return `<span class="${className}"${style}>${escapeHtml(message.identityLabel)}</span>`;
}

function readIdentityRules() {
  return params.getAll("tag").map((raw) => {
    const parts = String(raw || "").split("|").map((part) => part.trim());
    const label = parts[0] || "";
    const color = cleanColor(parts[1] || "");
    const terms = String(parts[2] || label)
      .split(",")
      .map((term) => term.trim().replace(/^[@#]/, "").toLowerCase())
      .filter(Boolean);
    return label && terms.length ? { label, color, terms } : null;
  }).filter(Boolean).slice(0, 12);
}

function applyIdentityRule(message) {
  const rules = identityRules.concat(state?.connectionRules || []);
  if (message.identityLabel || !rules.length) return message;
  const haystack = [message.author, message.displayName, message.channel, message.text].join(" ").toLowerCase();
  const rule = rules.find((candidate) => candidate.terms.some((term) => haystack.includes(term)));
  if (!rule) return message;
  return {
    ...message,
    identityLabel: rule.label,
    identityColor: rule.color,
  };
}

function readOverlayOptions() {
  const layout = readEnum(params.get("layout"), ["lower", "rail", "compact", "box"], "lower");
  const defaultLimit = layout === "box" ? 14 : layout === "rail" ? 5 : layout === "compact" ? 3 : 2;
  const maxLimit = layout === "box" ? 30 : 8;
  return {
    layout,
    position: readEnum(params.get("position"), ["left", "right", "bottom-left", "bottom-right"], layout === "rail" ? "right" : "bottom-right"),
    limit: clamp(Number(params.get("messages") || defaultLimit), 1, maxLimit, defaultLimit),
    title: (params.get("title") || "Unified Chat").slice(0, 32),
  };
}

function readEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function clamp(value, min, max, fallback = min) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function overlayMetaText(total) {
  const layoutLabel = overlayOptions.layout === "box" ? "Chat box"
    : overlayOptions.layout === "rail" ? "Vertical rail"
    : overlayOptions.layout === "compact" ? "Compact box"
    : "Lower third";
  return `${layoutLabel} - ${total} total`;
}

function cleanChannel(value) {
  return String(value || "").trim().replace(/^[@#]/, "").toLowerCase();
}

function cleanColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function linkify(text) {
  return escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`);
}

function setText(node, value) {
  if (node) node.textContent = value;
}

function setValue(node, value) {
  if (node) node.value = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
