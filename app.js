/* ============================================================================
   GRID Frontend — Advanced JS (Part 1/3)
   - Bootstrapping, Config, DOM refs
   - Utilities (safe getters, time, BO mapping, logo picking)
   - Skeleton card template
   ============================================================================ */

(() => {
  // ----- DOM roots -----
  const ROOT = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const LIST_LIVE = document.getElementById("listLive");
  const LIST_UP   = document.getElementById("listUpcoming");
  const LAST      = document.getElementById("lastUpdated");
  const REFRESH_SELECT = document.getElementById("refreshSelect");
  const TEAM_BADGE = document.getElementById("teamBadge");
  const UP_HOURS_SPAN = document.getElementById("upHoursSpan");

  // ----- Config -----
  const API_BASE = (ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series").replace(/\/+$/,"");
  const urlParams = new URLSearchParams(location.search);

  // NOTE: you set 30s in HTML; we enforce a sensible floor + jitter later.
  let refreshMs = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 15000);
  let backoffMs = 0; // grows on 429 / ENHANCE_YOUR_CALM
  const TEAM_PIN = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UP   = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  // Wire the refresh selector if present
  if (REFRESH_SELECT) {
    // Prefer data-refresh if it matches one of the options
    const optVal = String(refreshMs);
    if ([...REFRESH_SELECT.options].some(o => o.value === optVal)) {
      REFRESH_SELECT.value = optVal;
    }
    REFRESH_SELECT.addEventListener("change", () => {
      refreshMs = Number(REFRESH_SELECT.value);
      schedule(); // re-arm the timer
    });
  }

  if (TEAM_PIN && TEAM_BADGE) {
    TEAM_BADGE.hidden = false;
    TEAM_BADGE.textContent = `Pinned: ${TEAM_PIN}`;
  }

  const UTIL = (window.__GRID_APP__ && window.__GRID_APP__.UTIL) || {};

// ----- Utilities (namespaced + guarded) -----
UTIL.g = UTIL.g || function g(obj, path, dflt = undefined) {
  try {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj) ?? dflt;
  } catch {
    return dflt;
  }
};

UTIL.clamp = UTIL.clamp || function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
};

UTIL.fmtTime = UTIL.fmtTime || function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "2-digit" });
};

UTIL.relative = UTIL.relative || function relative(iso) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.round((d - now) / 1000);
  const abs = Math.abs(diff);
  const unit = abs >= 3600 ? "h" : abs >= 60 ? "m" : "s";
  const val = unit === "h" ? Math.round(abs / 3600) : unit === "m" ? Math.round(abs / 60) : abs;
  return diff >= 0 ? `in ${val}${unit}` : `${val}${unit} ago`;
};

// Expose the UTIL bag back onto the global for later re-use
window.__GRID_APP__ = window.__GRID_APP__ || {};
window.__GRID_APP__.UTIL = UTIL;

  // ----- Skeletons -----
  const renderSkeletons = (root, count=6) => {
    if (!root) return;
    const frag = document.createDocumentFragment();
    for (let i=0;i<count;i++){
      const c = document.createElement("div");
      c.className = "card skeleton";
      c.style.height = "128px";
      frag.appendChild(c);
    }
    root.replaceChildren(frag);
  };

  // Expose small module namespace to the next parts
  window.__GRID_APP__ = {
    DOM: { ROOT, LIST_LIVE, LIST_UP, LAST },
    CFG: { API_BASE, TEAM_PIN, LIMIT_LIVE, LIMIT_UP, UPCOMING_HOURS },
    STATE: { refreshMs, backoffMs },
    UTIL: { g, clamp, fmtTime, relative, boShort, pickLogo, pickTeamName, safeTournament, setLastUpdated, renderSkeletons }
  };


// ----------------------
// Part 2 — Data + Polling
// ----------------------

// Small fetch helper with no-store and simple JSON guard
async function getJSON(url, signal) {
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) {
    // surface a concise error (e.g., 429 Enhance Your Calm)
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} on ${url}${text ? ` — ${text.slice(0,140)}` : ""}`);
  }
  return res.json();
}

// Map any format to { name, nameShortened }
function normFormat(fmt) {
  if (!fmt) return { name: "", nameShortened: "" };
  if (typeof fmt === "string") {
    const short = fmt.replace(/best-of-/i, "Bo");
    return { name: fmt, nameShortened: short };
  }
  return {
    name: fmt.name || "",
    nameShortened: fmt.nameShortened || (fmt.name ? fmt.name.replace(/best-of-/i, "Bo") : "")
  };
}

// Normalize a single series item from REST into the shape used by Part 3
function normalizeItem(it, isLive) {
  // tournament/name+logo: tolerate several shapes
  const tour = it.tournament || it.event || {};
  const tournament = {
    name: tour.name || "",
    logoUrl: tour.logoUrl || tour.logo || ""
  };

  // start time: support startTimeScheduled or time
  const time = it.startTimeScheduled || it.time || "";

  // format
  const format = normFormat(it.format);

  // teams array: support { teams:[ { baseInfo:{name,logoUrl} } ] } OR { teams:[{name,logoUrl}] }
  const teamsRaw = Array.isArray(it.teams) ? it.teams : [];
  const teams = teamsRaw.map((t) => {
    const base = t.baseInfo || t;
    const score = Number(
      (t.score ?? t.seriesScore ?? t.scoreAdvantage ?? 0)
    ) || 0;
    return {
      name: base?.name || "",
      logo: base?.logoUrl || base?.logo || "",
      score
    };
  });

  return {
    id: String(it.id ?? ""),
    live: !!isLive,
    tournament,
    format,
    time,
    teams
  };
}

// Sort helpers
function byTimeAsc(a, b)  { return new Date(a.time) - new Date(b.time); }
function pinTeamFirst(pin) {
  const pinLC = (pin || "").toLowerCase();
  return (a, b) => {
    const aHit = a.teams.some(t => t.name.toLowerCase().includes(pinLC)) ? 1 : 0;
    const bHit = b.teams.some(t => t.name.toLowerCase().includes(pinLC)) ? 1 : 0;
    if (aHit !== bHit) return bHit - aHit;
    return byTimeAsc(a, b);
  };
}

// State + polling
let inFlightCtrl = null;
let timerId = null;

// enforce a lower bound + jitter so tabs don’t synchronize
refreshMs = Math.max(8000, Number(refreshMs || 0));
function nextInterval() {
  return Number(refreshMs) + Math.floor(Math.random() * 500);
}

async function load() {
  // cancel an older in-flight fetch if any
  if (inFlightCtrl) inFlightCtrl.abort();
  const ctrl = new AbortController();
  inFlightCtrl = ctrl;

  try {
    // REST endpoints exposed by your Render proxy
    const liveUrl = `${API_BASE}/live`;
    const upUrl   = `${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`;

    const [liveRes, upRes] = await Promise.all([
      getJSON(liveUrl, ctrl.signal),
      getJSON(upUrl, ctrl.signal)
    ]);

    if (ctrl.signal.aborted) return;

    const liveItems = (liveRes?.items || []).map(x => normalizeItem(x, true));
    const upItems   = (upRes?.items || []).map(x => normalizeItem(x, false));

    // sort (pin first if TEAM_PIN present)
    if (TEAM_PIN) {
      liveItems.sort(pinTeamFirst(TEAM_PIN));
      upItems.sort(byTimeAsc);
    } else {
      liveItems.sort(byTimeAsc);
      upItems.sort(byTimeAsc);
    }

    // optional trimming by limits (if Part 1 defined these)
    const liveView = LIMIT_LIVE > 0 ? liveItems.slice(0, LIMIT_LIVE) : liveItems;
    const upView   = LIMIT_UP   > 0 ? upItems.slice(0, LIMIT_UP)   : upItems;

    // render — renderList is defined in Part 3
    renderList(LIST_LIVE, liveView,   "No live matches right now.");
    renderList(LIST_UP,   upView,     "No upcoming matches in the selected window.");

    setLastUpdated?.();
  } catch (err) {
    if (ctrl.signal.aborted) return; // a newer refresh started—ignore
    console.error("[load] fetch failed:", err.message || err);
    // keep prior DOM; you could surface a small toast if desired
  }
}

function schedule() {
  if (timerId) clearTimeout(timerId);
  load();
  timerId = setTimeout(schedule, nextInterval());
}

// Allow user-driven refresh change via <select>
if (REFRESH_SELECT) {
  REFRESH_SELECT.addEventListener("change", () => {
    refreshMs = Math.max(8000, Number(REFRESH_SELECT.value || refreshMs));
    schedule();
  });
}

// kick things off
schedule();

// ----------------------
// Part 3 — Render UI + Details Modal
// ----------------------

// ---------- small formatters (define-once) ----------
if (!UTIL.fmtTime) {
  UTIL.fmtTime = function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    // e.g. "Wed, 14:05" in user's locale
    return d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  };
}

if (!UTIL.fmtRel) {
  UTIL.fmtRel = function fmtRel(iso) {
    if (!iso) return "";
    const d   = new Date(iso).getTime();
    const now = Date.now();
    const ms  = d - now;
    const abs = Math.abs(ms);
    const mins = Math.round(abs / 60000);
    if (mins < 1)  return "now";
    const hrs  = Math.floor(mins / 60);
    const rem  = mins % 60;
    const sign = ms >= 0 ? "in " : "";
    const tail = ms < 0 ? " ago" : "";
    if (hrs >= 1) return `${sign}${hrs}h ${rem}m${tail}`;
    return `${sign}${mins}m${tail}`;
  };
}

if (!UTIL.fmtBO) {
  UTIL.fmtBO = function fmtBO(format) {
    const s = (format?.nameShortened || format?.name || "").toLowerCase();
    if (s.includes("bo1")) return "BO1";
    if (s.includes("bo2")) return "BO2";
    if (s.includes("bo3")) return "BO3";
    if (s.includes("bo5")) return "BO5";
    if (s.includes("bo7")) return "BO7";
    if (s.includes("score-after")) return (format.nameShortened || s).toUpperCase();
    return (format?.nameShortened || format?.name || "BO?").toUpperCase();
  };
}

// ---------- list renderer ----------
function renderList(root, items, emptyText) {
  if (!root) return;
  const frag = document.createDocumentFragment();

  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyText;
    frag.appendChild(empty);
  } else {
    for (const m of items) frag.appendChild(renderCard(m));
  }

  root.classList.add("updating");
  requestAnimationFrame(() => {
    root.replaceChildren(frag);
    root.classList.remove("updating");
  });
}

// ---------- card builder ----------
function renderCard(m) {
  const tournamentName = safe(m.tournament?.name);
  const tournamentLogo = safe(m.tournament?.logoUrl);
  const isLive = !!m.live;
  const bo = fmtBO(m.format);
  const timeLabel = UTIL.fmtTime(m.time);
  const rel = fmtRel(m.time);
  const showInlineScore = hasScore(m.teams);

  const a = document.createElement("article");
  a.className = `card${isLive ? " live" : ""}`;
  a.tabIndex = 0; // for keyboard focus
  a.setAttribute("role", "button");
  a.setAttribute("aria-label", `Open details for ${tournamentName} ${teamLine(m.teams)}`);

  // header
  const header = document.createElement("div");
  header.className = "card-top";

  const left = document.createElement("div");
  left.className = "left";
  if (tournamentLogo) {
    const logo = document.createElement("img");
    logo.className = "event-logo";
    logo.src = tournamentLogo;
    logo.alt = `${tournamentName} logo`;
    logo.loading = "lazy";
    left.appendChild(logo);
  }
  const ev = document.createElement("span");
  ev.className = "pill";
  ev.textContent = tournamentName || "—";
  left.appendChild(ev);

  const right = document.createElement("div");
  right.className = "right";

  if (bo) {
    const boEl = document.createElement("span");
    boEl.className = "pill";
    boEl.textContent = bo.toUpperCase();
    right.appendChild(boEl);
  }
  if (isLive) {
    const liveEl = document.createElement("span");
    liveEl.className = "pill live-dot";
    liveEl.textContent = "LIVE";
    right.appendChild(liveEl);
  }
  if (timeLabel) {
    const timeEl = document.createElement("span");
    timeEl.className = "pill";
    timeEl.textContent = `${timeLabel} · ${rel}`;
    right.appendChild(timeEl);
  }

  header.appendChild(left);
  header.appendChild(right);

  // body — teams
  const body = document.createElement("div");
  body.className = "card-body";

  const teamsWrap = document.createElement("div");
  teamsWrap.className = "teams";

  const [t1, t2] = normalizeTeamsPair(m.teams);

  teamsWrap.appendChild(teamCell(t1, showInlineScore));
  teamsWrap.appendChild(vsCell());
  teamsWrap.appendChild(teamCell(t2, showInlineScore));

  body.appendChild(teamsWrap);

  a.appendChild(header);
  a.appendChild(body);

  // open modal on click/enter/space
  a.addEventListener("click", () => openDetailsModal(m, a));
  a.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetailsModal(m, a);
    }
  });

  return a;
}

function teamLine(teams) {
  const [a, b] = normalizeTeamsPair(teams);
  return `${a.name || "TBD"} vs ${b.name || "TBD"}`;
}

function normalizeTeamsPair(teams) {
  const t1 = teams?.[0] || {};
  const t2 = teams?.[1] || {};
  return [
    { name: safe(t1.name), logo: safe(t1.logo), score: Number(t1.score || 0) },
    { name: safe(t2.name), logo: safe(t2.logo), score: Number(t2.score || 0) }
  ];
}

function teamCell(t, showScore) {
  const cell = document.createElement("div");
  cell.className = "team";

  const row = document.createElement("div");
  row.className = "row";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.alignItems = "center";
  left.style.gap = "8px";

  if (t.logo) {
    const img = document.createElement("img");
    img.className = "team-logo";
    img.src = t.logo;
    img.alt = `${t.name} logo`;
    img.loading = "lazy";
    left.appendChild(img);
  }

  const name = document.createElement("div");
  name.className = "team-name";
  name.textContent = t.name || "TBD";
  left.appendChild(name);

  const right = document.createElement("div");
  right.className = "score";
  right.textContent = showScore ? String(t.score) : ""; // hide if 0

  row.appendChild(left);
  row.appendChild(right);
  cell.appendChild(row);

  return cell;
}

function vsCell() {
  const el = document.createElement("div");
  el.className = "vs";
  el.textContent = "vs";
  return el;
}

// ---------- modal (expandable details) ----------
let activeModal = null;
let restoreFocusEl = null;

function openDetailsModal(m, openerEl) {
  closeModal(); // just in case

  restoreFocusEl = openerEl || null;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  const dialog = document.createElement("div");
  dialog.className = "modal";
  dialog.setAttribute("role", "document");

  // header row (tournament + status)
  const head = document.createElement("div");
  head.className = "modal-head";

  const left = document.createElement("div");
  left.className = "left";
  if (m.tournament?.logoUrl) {
    const logo = document.createElement("img");
    logo.className = "event-logo";
    logo.src = m.tournament.logoUrl;
    logo.alt = `${m.tournament.name} logo`;
    left.appendChild(logo);
  }
  const title = document.createElement("div");
  title.className = "event-title";
  title.textContent = m.tournament?.name || "—";
  left.appendChild(title);

  const right = document.createElement("div");
  right.className = "right";
  if (fmtBO(m.format)) {
    const boEl = document.createElement("span");
    boEl.className = "pill";
    boEl.textContent = fmtBO(m.format).toUpperCase();
    right.appendChild(boEl);
  }
  if (m.live) {
    const liveEl = document.createElement("span");
    liveEl.className = "pill live-dot";
    liveEl.textContent = "LIVE";
    right.appendChild(liveEl);
  }
  if (m.time) {
    const when = document.createElement("span");
    when.className = "pill";
    when.textContent = `${UTIL.fmtTime(m.time)} · ${fmtRel(m.time)}`;
    right.appendChild(when);
  }

  head.appendChild(left);
  head.appendChild(right);

  // teams block (bigger)
  const teams = document.createElement("div");
  teams.className = "modal-teams";

  const [t1, t2] = normalizeTeamsPair(m.teams);
  const showScore = hasScore(m.teams);

  const t1El = bigTeamBlock(t1, showScore);
  const sep = document.createElement("div");
  sep.className = "modal-vs";
  sep.textContent = "vs";
  const t2El = bigTeamBlock(t2, showScore);

  teams.appendChild(t1El);
  teams.appendChild(sep);
  teams.appendChild(t2El);

  // meta/info
  const meta = document.createElement("div");
  meta.className = "modal-meta";

  const grid = document.createElement("div");
  grid.className = "meta-grid";

  grid.appendChild(metaRow("Status", m.live ? "Live" : "Upcoming"));
  grid.appendChild(metaRow("Scheduled", m.time ? new Date(m.time).toLocaleString() : "—"));
  grid.appendChild(metaRow("Format", fmtBO(m.format) || "—"));
  grid.appendChild(metaRow("Series ID", m.id || "—"));

  meta.appendChild(grid);

  // close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML = "✕";
  closeBtn.addEventListener("click", closeModal);

  dialog.appendChild(closeBtn);
  dialog.appendChild(head);
  dialog.appendChild(teams);
  dialog.appendChild(meta);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // focus + esc
  activeModal = overlay;
  closeBtn.focus();
  document.addEventListener("keydown", onEscToClose);
}

function bigTeamBlock(t, showScore) {
  const wrap = document.createElement("div");
  wrap.className = "team big";

  const img = document.createElement("img");
  img.className = "team-logo";
  img.src = t.logo || "";
  img.alt = `${t.name || "TBD"} logo`;
  img.loading = "lazy";

  const name = document.createElement("div");
  name.className = "team-name";
  name.textContent = t.name || "TBD";

  const score = document.createElement("div");
  score.className = "score big";
  score.textContent = showScore ? String(t.score) : ""; // hide if 0

  wrap.appendChild(img);
  wrap.appendChild(name);
  wrap.appendChild(score);
  return wrap;
}

function metaRow(label, value) {
  const row = document.createElement("div");
  row.className = "meta-row";
  const l = document.createElement("div");
  l.className = "meta-label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "meta-value";
  v.textContent = value;
  row.appendChild(l);
  row.appendChild(v);
  return row;
}

function onEscToClose(e) {
  if (e.key === "Escape") {
    closeModal();
  }
}

function closeModal() {
  if (!activeModal) return;
  document.removeEventListener("keydown", onEscToClose);
  activeModal.remove();
  activeModal = null;
  if (restoreFocusEl) {
    restoreFocusEl.focus();
    restoreFocusEl = null;
  }
}
