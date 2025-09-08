// app.js — clean working version
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
    // If the current refresh isn't in the dropdown, don't force it
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

  // ---- Normalizer (makes mixed payloads consistent) ----
  function normalize(items, isLive) {
    return (items || []).map(it => {
      // teams — handles {teams:[{name}]} or {teams:[{baseInfo:{name}}]}
      const teamsArr = Array.isArray(it.teams) ? it.teams : (it.teams || []);
      const teamNames = teamsArr.map(t => t?.name || t?.baseInfo?.name || "").filter(Boolean);

      // best-of — try multiple shapes
      const bestOf =
        it.bestOf ??
        it.format?.bestOf ??
        it.format?.id ??
        (typeof it.format === "number" ? it.format : 3);

      // time
      const when = it.time || it.startTimeScheduled || it.startTime || "";

      // event / tournament label
      const eventName = it.event?.name || it.tournament?.name || it.tournamentName || "";

      // attempt to read scores if present
      let sA, sB;
      if (it.scores && (it.scores.a != null || it.scores.b != null)) {
        sA = it.scores.a; sB = it.scores.b;
      } else if (it.seriesScore && (it.seriesScore.home != null || it.seriesScore.away != null)) {
        sA = it.seriesScore.home; sB = it.seriesScore.away;
      } else if (teamsArr.length >= 2) {
        const ta = teamsArr[0], tb = teamsArr[1];
        sA = ta?.score ?? ta?.seriesScore;
        sB = tb?.score ?? tb?.seriesScore;
      }
      if (sA != null) sA = Number(sA);
      if (sB != null) sB = Number(sB);

      return {
        id: String(it.id ?? ""),
        time: when,
        event: eventName || "—",
        bestOf: Number(bestOf) || 3,
        teams: [teamNames[0] || "TBD", teamNames[1] || "TBD"],
        scoreA: Number.isFinite(sA) ? sA : undefined,
        scoreB: Number.isFinite(sB) ? sB : undefined,
        live: !!isLive
      };
    }).filter(x => x.id && x.time);
  }

  // ---- Card renderer ----
  function renderCard(m) {
    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");

    const top = document.createElement("div");
    top.className = "card-top";
    top.innerHTML = `
      <span class="pill">${escapeHtml(m.event)}</span>
      <span class="pill">BO${m.bestOf}</span>
      ${m.live ? '<span class="pill live-dot">LIVE</span>' : ""}
    `;

    const body = document.createElement("div");
    body.className = "card-body";

    const t = new Date(m.time);
    const timeStr = isNaN(+t)
      ? (m.time || "")
      : t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const scoreHtml = (m.scoreA != null && m.scoreB != null)
      ? `<div class="score">${m.scoreA}</div>
         <div class="vs">–</div>
         <div class="score">${m.scoreB}</div>`
      : `<div class="vs">vs</div>`;

    body.innerHTML = `
      <div class="time">${timeStr}</div>
      <div class="teams">
        <div>${escapeHtml(m.teams[0])}</div>
        ${scoreHtml}
        <div>${escapeHtml(m.teams[1])}</div>
      </div>
    `;

    card.appendChild(top);
    card.appendChild(body);
    return card;
  }

  // ---- Smooth list renderer (no flicker) ----
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

  // ---- Fetch + render ----
  let inFlightCtrl;

  async function load() {
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      const [liveRes, upRes] = await Promise.all([
        fetch(`${API_BASE}/live`, { cache: "no-store", signal: ctrl.signal }).then(r => r.json()),
        fetch(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`, { cache: "no-store", signal: ctrl.signal }).then(r => r.json())
      ]);

      if (ctrl.signal.aborted) return;

      // If rate-limited, keep current UI and try later
      if (liveRes?.error === "ENHANCE_YOUR_CALM" || upRes?.error === "ENHANCE_YOUR_CALM") {
        setLastUpdated("rate-limited");
        return;
      }

      let live = normalize(liveRes.items || [], true);
      let upcoming = normalize(upRes.items || [], false);

      // pin sorting & time sorting
      const hasPin = (names) => TEAM_PIN ? names.join(" ").toLowerCase().includes(TEAM_PIN) : false;
      live.sort((a, b) => {
        const ap = hasPin(a.teams) ? 1 : 0, bp = hasPin(b.teams) ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return new Date(a.time) - new Date(b.time);
      });
      upcoming.sort((a, b) => new Date(a.time) - new Date(b.time));

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UPCOMING > 0) upcoming = upcoming.slice(0, LIMIT_UPCOMING);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UPCOMING, upcoming, "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.warn("[load] error:", err);
      setLastUpdated("error");
      // Keep previous DOM; will retry next tick
    }
  }

  // ---- Jittered scheduler (avoids sync & limits) ----
  function nextInterval() {
    const floor = 8000; // enforce a floor
    const jitter = Math.floor(Math.random() * 500);
    return Math.max(floor, refreshMs) + jitter;
  }

  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load(); // immediate
    timer = setTimeout(schedule, nextInterval());
  }

  // ---- Utils ----
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // start
  schedule();
})();
