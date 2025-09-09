// app.js — fast first paint + resilient refresh
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

  // ---------- helpers ----------
  function escapeHtml(x) {
    return String(x ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function safeTime(msOrIso) {
    const d = new Date(msOrIso);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async function fetchJSONWithTimeout(url, opts = {}, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal, cache: "no-store" });
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
        <span class="pill">BO—</span>
        <span class="time">--:--</span>
      </div>
      <div class="card-body">
        <div class="teams">
          <div class="shimmer w80"></div>
          <div class="vs">vs</div>
          <div class="shimmer w72"></div>
        </div>
        <div class="shimmer w120 mt8"></div>
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

  // ---------- normalization ----------
  function normOne(it, liveFlag) {
    const teamsArr = Array.isArray(it.teams) ? it.teams : (it.teams || []);
    const names = teamsArr.map(t => t?.name || t?.baseInfo?.name || "").filter(Boolean);

    // Try common score shapes from your proxy (live only)
    const sA = (it.scoreA ?? it.score1 ?? it.seriesScoreA ?? null);
    const sB = (it.scoreB ?? it.score2 ?? it.seriesScoreB ?? null);

    let format = "";
    if (typeof it.format === "string") {
      format = it.format; // e.g. "BO3"
    } else if (it.format?.id) {
      format = `BO${it.format.id}`; // GRID usually exposes 1/2/3/5
    }

    const eventName =
      it.event?.name ||
      it.tournament?.name ||
      it.tournament?.title?.name ||
      "";

    return {
      id: String(it.id ?? ""),
      timeIso: it.time || it.startTimeScheduled || "",
      timeTxt: safeTime(it.time || it.startTimeScheduled),
      event: eventName,
      format,
      teams: [names[0] || "TBD", names[1] || "TBD"],
      live: !!liveFlag,
      scoreA: (sA != null) ? Number(sA) : null,
      scoreB: (sB != null) ? Number(sB) : null
    };
  }

  function normalize(list, liveFlag) {
    return (Array.isArray(list) ? list : [])
      .map(it => normOne(it, liveFlag))
      .filter(x => x.id);
  }

  // ---------- rendering ----------
  function renderCard(m) {
    const left  = escapeHtml(m.teams?.[0] || "TBD");
    const right = escapeHtml(m.teams?.[1] || "TBD");
    const livePill = m.live ? `<span class="pill live-dot">LIVE</span>` : "";
    const scoreHtml = (m.live && m.scoreA != null && m.scoreB != null)
      ? `<div class="score-badge">${m.scoreA}&nbsp;–&nbsp;${m.scoreB}</div>`
      : "";

    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");
    card.innerHTML = `
      <div class="card-top">
        ${m.format ? `<span class="pill">${escapeHtml(m.format)}</span>` : ""}
        ${livePill}
        <span class="time">${escapeHtml(m.timeTxt || "")}</span>
      </div>
      <div class="card-body">
        <div class="teams">
          <div>${left}</div>
          <div class="vs">vs</div>
          <div>${right}</div>
        </div>
        ${scoreHtml}
        <div class="event">${escapeHtml(m.event || "")}</div>
      </div>
    `;
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
      const names = Array.from(card.querySelectorAll(".teams div"))
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

      // Sort (pinned first for live), then by time
      const byTime = (a, b) => new Date(a.timeIso) - new Date(b.timeIso);
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
        // keep current DOM; next scheduled run will retry
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
    showSkeleton();           // paint something immediately
    load().finally(() => {
      const wait = first ? 3000 : nextInterval(); // quick follow-up after first load
      first = false;
      timer = setTimeout(schedule, wait);
    });
  }

  schedule();
})();
