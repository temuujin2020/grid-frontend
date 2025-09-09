// app.js — clean working version with teams + scores + jitter
(function () {
  // ---- DOM ----
  const ROOT            = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const LIST_LIVE       = document.getElementById("listLive");
  const LIST_UPCOMING   = document.getElementById("listUpcoming");
  const LAST_UPDATED    = document.getElementById("lastUpdated");
  const REFRESH_SELECT  = document.getElementById("refreshSelect");
  const TEAM_BADGE      = document.getElementById("teamBadge");
  const UP_HOURS_SPAN   = document.getElementById("upHoursSpan");

  // ---- Config / URL params ----
  const API_BASE = ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series";
  const urlParams = new URLSearchParams(location.search);

  let refreshMs = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 15000);
  const TEAM_PIN = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UPCOMING = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  if (REFRESH_SELECT) {
    const cur = String(refreshMs);
    if ([...REFRESH_SELECT.options].some(o => o.value === cur)) {
      REFRESH_SELECT.value = cur;
    }
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
    if (!LAST_UPDATED) return;
    const noteStr = note ? ` (${note})` : "";
    LAST_UPDATED.textContent = "Last updated: " + new Date().toLocaleTimeString() + noteStr;
  }

  // ---- Normalizer ----
  function normalize(items, isLive) {
    return (items || []).map(it => {
      // Teams
      let names = [];
      if (Array.isArray(it.teams)) {
        names = it.teams.map(t =>
          typeof t === "string"
            ? t
            : (t?.name) || (t?.baseInfo?.name) || ""
        ).filter(Boolean);
      }

      // Best-of
      const bestOf =
        it.bestOf ??
        it.format?.bestOf ??
        it.format?.id ??
        (typeof it.format === "number" ? it.format : 3);

      // Time
      const when = it.time || it.startTimeScheduled || it.startTime || "";

      // Event / tournament
      const eventName = it.event?.name || it.tournament?.name || it.tournamentName || "";

      // Scores
      let sA, sB;
      if (it.scores && (it.scores.a != null || it.scores.b != null)) {
        sA = it.scores.a;
        sB = it.scores.b;
      }

      return {
        id: String(it.id ?? ""),
        teams: names,
        event: eventName,
        format: bestOf,
        time: when,
        scoreA: sA,
        scoreB: sB,
        live: !!isLive
      };
    }).filter(x => x.id && x.time);
  }

  // ---- Renderer ----
  function renderCard(m) {
    const left  = escapeHtml(m.teams?.[0] || "TBD");
    const right = escapeHtml(m.teams?.[1] || "TBD");

    const t = new Date(m.time);
    const when = isNaN(t) ? "" : t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const scoreHtml = (m.live && m.scoreA != null && m.scoreB != null)
      ? `<div class="score">${m.scoreA}&nbsp;–&nbsp;${m.scoreB}</div>`
      : "";

    const livePill = m.live ? `<span class="pill live-dot">LIVE</span>` : "";

    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");
    card.innerHTML = `
      <div class="card-top">
        <span class="pill">BO${escapeHtml(m.format || "3")}</span>
        ${livePill}
        <span class="time">${escapeHtml(when)}</span>
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

  // ---- Loader ----
  let inFlightCtrl;
  async function load() {
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      const [liveRes, upRes] = await Promise.all([
        fetch(`${API_BASE}/live?hours=${UPCOMING_HOURS}`, { cache: "no-store", signal: ctrl.signal }).then(r => r.json()),
        fetch(`${API_BASE}/upcoming?hours=${UPCOMING_HOURS}`, { cache: "no-store", signal: ctrl.signal }).then(r => r.json())
      ]);

      if (ctrl.signal.aborted) return;

      let live = normalize(liveRes.items || [], true);
      let upcoming = normalize(upRes.items || [], false);

      // Sort
      live.sort((a, b) => new Date(a.time) - new Date(b.time));
      upcoming.sort((a, b) => new Date(a.time) - new Date(b.time));

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UPCOMING > 0) upcoming = upcoming.slice(0, LIMIT_UPCOMING);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UPCOMING, upcoming, "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error("[load] error:", err);
      setLastUpdated("error");
    }
  }

  // ---- Scheduler ----
  function nextInterval() {
    const floor = 8000;
    const jitter = Math.floor(Math.random() * 500);
    return Math.max(floor, refreshMs) + jitter;
  }

  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load();
    timer = setTimeout(schedule, nextInterval());
  }

  // ---- Utils ----
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---- Start ----
  schedule();
})();
