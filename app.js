// app.js — fast first paint + resilient refresh (fixed)
(function () {
  const ROOT           = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const LIST_LIVE      = document.getElementById("listLive");
  const LIST_UP        = document.getElementById("listUpcoming");
  const LAST           = document.getElementById("lastUpdated");
  const REFRESH_SELECT = document.getElementById("refreshSelect");
  const TEAM_BADGE     = document.getElementById("teamBadge");
  const UP_HOURS_SPAN  = document.getElementById("upHoursSpan");

  const API_BASE       = (ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series").replace(/\/+$/, "");
  const urlParams      = new URLSearchParams(location.search);

  // Config (URL params > data-* > defaults)
  let   refreshMs      = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 15000);
  const TEAM_PIN       = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE     = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UP       = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  // UI bindings
  if (REFRESH_SELECT) {
    REFRESH_SELECT.value = String(refreshMs);
    REFRESH_SELECT.addEventListener("change", () => {
      refreshMs = Number(REFRESH_SELECT.value);
      schedule();
    });
  }
  if (TEAM_PIN && TEAM_BADGE) {
    TEAM_BADGE.hidden = false;
    TEAM_BADGE.textContent = `Pinned: ${TEAM_PIN}`;
  }

  function setLastUpdated(note) {
    const noteStr = note ? ` (${note})` : "";
    if (LAST) LAST.textContent = "Last updated: " + new Date().toLocaleTimeString() + noteStr;
  }

  // ---------- small utils ----------
  function getTeamName(t) {
    if (!t) return "";
    if (typeof t === "string") return t;
    return (
      t.name ||
      (t.baseInfo && (t.baseInfo.shortName || t.baseInfo.name)) ||
      (t.team && t.team.name) ||
      (t.org && t.org.name) ||
      ""
    );
  }
  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  async function fetchJSONWithTimeout(url, { signal } = {}, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: signal || ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- skeleton (instant first paint) ----------
  function skeletonCard() {
    const d = document.createElement("div");
    d.className = "card skeleton";
    d.innerHTML = `
      <div class="card-top">
        <div class="event shimmer w140"></div>
        <div class="badges">
          <span class="pill shimmer w36"></span>
          <span class="pill shimmer w36"></span>
          <span class="pill shimmer w48"></span>
        </div>
      </div>
      <div class="card-body">
        <div class="teams">
          <div class="shimmer w80"></div>
          <div class="vs">vs</div>
          <div class="shimmer w72"></div>
        </div>
      </div>`;
    return d;
  }
  function showSkeleton() {
    const fill = (root) => {
      if (!root) return;
      root.replaceChildren(skeletonCard(), skeletonCard(), skeletonCard());
    };
    fill(LIST_LIVE);
    fill(LIST_UP);
  }

  // ---------- normalize ----------
  function normalize(items, isLive) {
    return (items || [])
      .map(it => {
        const teamsRaw = Array.isArray(it.teams) ? it.teams : (it.teams || []);
        const names = teamsRaw.map(getTeamName).filter(Boolean);

        const eventName =
          (it.event && it.event.name) ||
          (it.tournament && it.tournament.name) ||
          (it.league && it.league.name) ||
          it.event || it.tournament || "";

        const fmt =
          (it.format && (it.format.id || it.format.bestOf || it.format.maps)) ||
          it.bestOf ||
          it.maps ||
          3;

        const when = it.time || it.startTimeScheduled || it.start || "";

        let scores = null;
        if (Array.isArray(it.scores) && it.scores.length === 2) {
          scores = [it.scores[0] ?? null, it.scores[1] ?? null];
        } else if (it.scoreA != null || it.scoreB != null) {
          scores = [it.scoreA ?? null, it.scoreB ?? null];
        } else if (it.result && Array.isArray(it.result)) {
          scores = [it.result[0] ?? null, it.result[1] ?? null];
        }

        return {
          id: String(it.id ?? ""),
          event: eventName,
          format: fmt,
          time: when,                 // <— keep as ISO string
          teams: [names[0] || "", names[1] || ""],
          scores,
          live: !!isLive
        };
      })
      .filter(r => r.id && (r.teams[0] || r.teams[1] || r.time));
  }

  // ---------- render ----------
  function renderCard(m) {
    const a = escapeHtml(m.teams[0] || "TBD");
    const b = escapeHtml(m.teams[1] || "TBD");
    const scoreHtml = Array.isArray(m.scores)
      ? `<span class="score">${m.scores[0] ?? ""}</span>
         <span class="vs">–</span>
         <span class="score">${m.scores[1] ?? ""}</span>`
      : `<span class="vs">vs</span>`;

    const topRight =
      `<div class="badges">
         <span class="pill">BO${escapeHtml(m.format)}</span>
         ${m.live ? '<span class="pill live-dot">LIVE</span>' : ""}
         <span class="pill time">${escapeHtml(formatTime(m.time))}</span>
       </div>`;

    const topLeft = `<div class="event">${escapeHtml(m.event || "")}</div>`;

    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");
    card.innerHTML = `
      <div class="card-top">
        ${topLeft}
        ${topRight}
      </div>
      <div class="card-body">
        <div class="teams">
          <div class="team">${a}</div>
          ${scoreHtml}
          <div class="team">${b}</div>
        </div>
      </div>`;
    return card;
  }

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

  function applyPinnedHighlight(container, pinLower) {
    if (!container || !pinLower) return;
    const cards = container.querySelectorAll(".card");
    cards.forEach(card => {
      const names = Array.from(card.querySelectorAll(".teams .team"))
        .map(n => n.textContent.toLowerCase())
        .join(" ");
      if (names.includes(pinLower)) card.classList.add("pinned");
    });
  }

  // ---------- data load ----------
  let inFlightCtrl;
  async function load() {
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      const [liveRes, upRes] = await Promise.all([
        fetchJSONWithTimeout(`${API_BASE}/live`, {}, 8000).catch(() => ({ items: [] })),
        fetchJSONWithTimeout(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`, {}, 8000).catch(() => ({ items: [] }))
      ]);
      if (ctrl.signal.aborted) return;

      let live = normalize(liveRes.items || [], true);
      let upcoming = normalize(upRes.items || [], false);

      const byTime = (a, b) => new Date(a.time) - new Date(b.time); // <— fixed

      if (TEAM_PIN) {
        const hasPin = (m) => (m.teams.join(" ").toLowerCase().includes(TEAM_PIN));
        live.sort((a, b) => {
          const ap = hasPin(a) ? 1 : 0, bp = hasPin(b) ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return byTime(a, b);
        });
      } else {
        live.sort(byTime);
      }
      upcoming.sort(byTime);

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UP > 0)   upcoming = upcoming.slice(0, LIMIT_UP);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UP,   upcoming, "No upcoming matches in the selected window.");

      applyPinnedHighlight(LIST_LIVE, TEAM_PIN);
      applyPinnedHighlight(LIST_UP,   TEAM_PIN);

      setLastUpdated();
    } catch (e) {
      if (!ctrl.signal.aborted) {
        console.error("Load error:", e);
      }
    }
  }

  // ---------- scheduler (min 8s + jitter; warm first retry) ----------
  function nextInterval() {
    const floor = Math.max(8000, refreshMs);
    return floor + Math.floor(Math.random() * 500);
  }
  let first = true, timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    showSkeleton();
    load().finally(() => {
      const wait = first ? 3000 : nextInterval();
      first = false;
      timer = setTimeout(schedule, wait);
    });
  }
  schedule();
})();
