/* =========================================================================
   Simple Live & Upcoming page (token-less frontend, uses your Render proxy)
   ========================================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- Config (no secrets) -------------------------------------------------
const DEFAULT_PROXY = "https://grid-proxy.onrender.com"; // your Render app
let PROXY_BASE = localStorage.getItem("proxyBase") || DEFAULT_PROXY;

// Save/load proxy (just the base URL, never a token)
const proxyInput = $("#proxyInput");
const saveProxyBtn = $("#saveProxyBtn");
if (proxyInput) proxyInput.value = PROXY_BASE;
if (saveProxyBtn) {
  saveProxyBtn.addEventListener("click", () => {
    const v = (proxyInput.value || "").trim().replace(/\/+$/, "");
    if (!v) return;
    PROXY_BASE = v;
    localStorage.setItem("proxyBase", PROXY_BASE);
    toast("Proxy URL saved");
    refreshAll();
  });
}

// ---- Small helpers -------------------------------------------------------
const fmtTime = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toUTCString().replace(":00 GMT", " UTC");
  } catch { return iso; }
};
const relFromNow = (iso) => {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  const unit = abs >= 3600 ? "h" : abs >= 60 ? "m" : "s";
  const val = unit === "h" ? Math.round(abs / 3600)
            : unit === "m" ? Math.round(abs / 60)
            : abs;
  return diff >= 0 ? `in ${val}${unit}` : `${val}${unit} ago`;
};
const boShort = (format) => {
  if (!format) return "";
  if (typeof format === "string") return format.replace("best-of-", "Bo");
  if (format.nameShortened) return format.nameShortened;
  if (format.name) return format.name.replace("best-of-", "Bo");
  return "";
};
const teamName = (t) => t?.baseInfo?.name || t?.name || "—";
const logo = (t) => t?.baseInfo?.logoUrl || t?.logoUrl || "https://cdn.grid.gg/assets/team-logos/generic";

// Normalize various shapes → simple match object the UI understands
function normalizeSeriesNode(node, live=false){
  if (!node) return null;
  return {
    id: node.id,
    live,
    title: node.title?.nameShortened || "",
    tournament: node.tournament?.nameShortened || node.tournament?.name || "",
    time: node.startTimeScheduled,
    format: node.format,
    teams: (node.teams || []).map(x => ({
      name: teamName(x),
      logo: logo(x),
      advantage: x.scoreAdvantage ?? 0
    })),
  };
}
function normalizeList(payload, live=false){
  // Accept: {data:{allSeries:{edges:[{node}]}}} OR {matches:[...]} OR [...]
  if (Array.isArray(payload)) return payload.map(n => normalizeSeriesNode(n, live)).filter(Boolean);
  if (payload?.matches) return payload.matches.map(n => normalizeSeriesNode(n, live)).filter(Boolean);
  const edges = payload?.data?.allSeries?.edges || [];
  return edges.map(e => normalizeSeriesNode(e.node, live)).filter(Boolean);
}

// ---- Fetchers (against your proxy) --------------------------------------
async function api(path){
  const url = `${PROXY_BASE}${path}`;
  const r = await fetch(url, { headers: { "Content-Type":"application/json" }});
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Expect the proxy to expose these read-only routes
// - GET /api/series/live?hours=6
// - GET /api/series/upcoming?hours=24
// - GET /api/series/:id/details
async function fetchLive(hours=6){
  try {
    const raw = await api(`/api/series/live?hours=${encodeURIComponent(hours)}`);
    return normalizeList(raw, true);
  } catch (e){
    console.error("fetchLive error", e);
    return [];
  }
}
async function fetchUpcoming(hours=24){
  try {
    const raw = await api(`/api/series/upcoming?hours=${encodeURIComponent(hours)}`);
    return normalizeList(raw, false);
  } catch (e){
    console.error("fetchUpcoming error", e);
    return [];
  }
}
async function fetchDetails(id){
  try {
    const raw = await api(`/api/series/${encodeURIComponent(id)}/details`);
    // Let’s keep the shape flexible; render function will probe fields.
    return raw?.data || raw;
  } catch (e){
    console.error("fetchDetails error", e);
    return null;
  }
}

// ---- Rendering -----------------------------------------------------------
const liveGrid = $("#liveGrid");
const upcomingGrid = $("#upcomingGrid");
const liveLast = $("#liveLastUpdated");
const upcomingLast = $("#upcomingLastUpdated");

function emptyCard(msg){
  const d = document.createElement("div");
  d.className = "empty";
  d.textContent = msg;
  return d;
}

function matchCard(m){
  const el = document.createElement("article");
  el.className = `card ${m.live ? "card--live" : ""}`;
  el.setAttribute("data-id", m.id);

  const title = m.title || (m.live ? "Live" : "Match");
  const bo = boShort(m.format);
  const time = m.live ? "Live now" : `${fmtTime(m.time)} · ${relFromNow(m.time)}`;

  el.innerHTML = `
    <div class="card__head">
      <div class="card__title">
        <span class="badge ${m.live ? "badge--live":""}">${m.live ? "LIVE" : "UPCOMING"}</span>
        <strong>${title}</strong>
      </div>
      <div class="bo">${bo || ""}</div>
    </div>
    <div class="card__time">${time}</div>
    <div class="card__teams">
      ${m.teams.slice(0,2).map(t => `
        <div class="team-row">
          <img class="team-logo" alt="" src="${logo(t)}" />
          <div class="team-name">${teamName(t)}</div>
        </div>
      `).join("")}
    </div>
    <div class="card__cta">
      <a class="link" role="button">View details →</a>
    </div>
  `;

  el.addEventListener("click", () => openDrawerForMatch(m));
  return el;
}

function renderGrid(target, list, emptyText){
  target.innerHTML = "";
  if (!list.length){
    target.appendChild(emptyCard(emptyText));
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach(m => frag.appendChild(matchCard(m)));
  target.appendChild(frag);
}

function setStamp(el){
  if (!el) return;
  el.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

// ---- Drawer (details) ----------------------------------------------------
const drawer = $("#drawer");
const drawerBody = $("#drawerBody");
const drawerClose = $("#drawerClose");
const drawerBackdrop = $("#drawerBackdrop");
drawerClose.addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);

function openDrawer(){
  drawer.setAttribute("data-open","true");
  drawer.setAttribute("aria-hidden","false");
}
function closeDrawer(){
  drawer.removeAttribute("data-open");
  drawer.setAttribute("aria-hidden","true");
  drawerBody.innerHTML = "";
}

async function openDrawerForMatch(m){
  openDrawer();
  drawerBody.innerHTML = `<div class="empty">Loading…</div>`;
  const details = await fetchDetails(m.id);

  // Try to find a canonical series object in details
  const series = details?.series || details?.data?.series || m;
  const state  = details?.seriesState || details?.data?.seriesState;
  const teams  = series?.teams || m.teams || [];
  const fmt    = boShort(series?.format || m.format);

  const meta = (label, value) => `
    <dt>${label}</dt><dd>${value || "—"}</dd>
  `;

  const rosterBlock = (side) => {
    const players =
      side?.players ||
      side?.baseInfo?.players ||
      []; // flexible

    if (!players?.length) return `<small>No roster available</small>`;

    return `
      <ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">
        ${players.slice(0,10).map(p => `
          <li>${p.nickname || p.name || "Player"}
            ${p.kills != null ? `<small> · ${p.kills}/${p.deaths ?? 0} K/D</small>` : "" }
          </li>`).join("")}
      </ul>
    `;
  };

  const liveBadge = m.live ? `<span class="badge badge--live">LIVE</span>` : "";

  drawerBody.innerHTML = `
    <h3 style="margin:0 0 4px 0;display:flex;gap:8px;align-items:center">
      ${liveBadge}
      ${series?.tournament?.nameShortened || series?.tournament?.name || "Match"}
    </h3>
    <small>${fmt || ""}</small>

    <dl class="meta">
      ${meta("Start", m.live ? "Live now" : `${fmtTime(series?.startTimeScheduled || m.time)} (${relFromNow(series?.startTimeScheduled || m.time)})`)}
      ${meta("Game", series?.title?.nameShortened || m.title || "")}
    </dl>

    <div class="divider"></div>

    <div class="roster">
      <div>
        <h4>${teamName(teams[0])}</h4>
        ${rosterBlock(teams[0])}
      </div>
      <div>
        <h4>${teamName(teams[1])}</h4>
        ${rosterBlock(teams[1])}
      </div>
    </div>

    ${state ? `
      <div class="divider"></div>
      <h4>Live State</h4>
      <dl class="meta">
        ${meta("Format", state.format)}
        ${meta("Started", String(!!state.started))}
        ${meta("Finished", String(!!state.finished))}
        ${meta("Updated", state.updatedAt ? `${fmtTime(state.updatedAt)} (${relFromNow(state.updatedAt)})` : "—")}
      </dl>
    ` : ""}
  `;
}

// ---- Polling / Controls --------------------------------------------------
const refreshLiveBtn = $("#refreshLiveBtn");
const refreshUpcomingBtn = $("#refreshUpcomingBtn");
const upcomingWindow = $("#upcomingWindow");

let liveTimer = null;
let upcTimer  = null;

async function loadLive(){
  const list = await fetchLive(6);
  renderGrid(liveGrid, list, "No live matches right now.");
  setStamp(liveLast);
}
async function loadUpcoming(){
  const hours = parseInt(upcomingWindow.value || "24", 10);
  const list  = await fetchUpcoming(hours);
  renderGrid(upcomingGrid, list, "Nothing scheduled in this window.");
  setStamp(upcomingLast);
}
function refreshAll(){
  loadLive();
  loadUpcoming();
}
refreshLiveBtn.addEventListener("click", loadLive);
refreshUpcomingBtn.addEventListener("click", loadUpcoming);
upcomingWindow.addEventListener("change", loadUpcoming);

// Auto-refresh: live every 20s, upcoming every 90s
function startPolling(){
  clearInterval(liveTimer); clearInterval(upcTimer);
  liveTimer = setInterval(loadLive, 20_000);
  upcTimer  = setInterval(loadUpcoming, 90_000);
}

// Minimal toast
function toast(msg){
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
    background:#0e1520;border:1px solid var(--ring);padding:8px 12px;border-radius:10px;
    color:var(--text);box-shadow:${getComputedStyle(document.documentElement).getPropertyValue('--shadow')};
    z-index:9999;
  `;
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 1600);
}

// ---- Boot ----------------------------------------------------------------
refreshAll();
startPolling();
