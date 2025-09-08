// app.js — safe, non-flicker version
(function () {
  const ROOT = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const LIST_LIVE = document.getElementById("listLive");
  const LIST_UP   = document.getElementById("listUpcoming");
  const LAST      = document.getElementById("lastUpdated");
  const REFRESH_SELECT = document.getElementById("refreshSelect");
  const TEAM_BADGE = document.getElementById("teamBadge");
  const UP_HOURS_SPAN = document.getElementById("upHoursSpan");

  const API_BASE = ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series";
  const urlParams = new URLSearchParams(location.search);

  let refreshMs = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 8000);
  const TEAM_PIN = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UP   = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

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
    if (!LAST) return;
    const noteStr = note ? ` (${note})` : "";
    LAST.textContent = "Last updated: " + new Date().toLocaleTimeString() + noteStr;
  }

  // ---- helpers you may have already had ----
  function normalize(items, isLive) {
    return (items || []).map(it => {
      const teams = Array.isArray(it.teams) ? it.teams : (it.teams || []);
      const names = teams.map(t => (t && t.name) || (t && t.baseInfo && t.baseInfo.name) || "").filter(Boolean);
      return {
        id: String(it.id ?? ""),
        event: (it.event || it.tournament || {}).name || (it.tournament && it.tournament.name) || "",
        format: String((it.format && it.format.id) || it.format || ""),
        time: it.time || it.startTimeScheduled || "",
        teams: names,
        live: !!isLive
      };
    }).filter(x => x.id && x.time);
  }

  function renderCard(m) {
    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");

    const top = document.createElement("div");
    top.className = "card-top";
    top.innerHTML = `
      <span class="pill">${m.event || "—"}</span>
      <span class="pill">BO${m.format || "?"}</span>
      ${m.live ? '<span class="pill live-dot">LIVE</span>' : ""}
    `;

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <div class="time">${new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div class="teams">
        <div>${m.teams[0] || "TBD"}</div>
        <div class="vs">vs</div>
        <div>${m.teams[1] || "TBD"}</div>
      </div>
    `;

    card.appendChild(top);
    card.appendChild(body);
    return card;
  }

  // ---- smooth list renderer (no flicker) ----
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

      let live = normalize(liveRes.items || [], true);
      let upcoming = normalize(upRes.items || [], false);

      if (TEAM_PIN) {
        const pin = TEAM_PIN;
        const score = (a, b) => {
          const ap = a.teams.join(" ").toLowerCase().includes(pin) ? 1 : 0;
          const bp = b.teams.join(" ").toLowerCase().includes(pin) ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return new Date(a.time) - new Date(b.time);
        };
        live.sort(score);
        upcoming.sort((a, b) => new Date(a.time) - new Date(b.time));
      } else {
        live.sort((a, b) => new Date(a.time) - new Date(b.time));
        upcoming.sort((a, b) => new Date(a.time) - new Date(b.time));
      }

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UP > 0) upcoming = upcoming.slice(0, LIMIT_UP);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UP, upcoming, "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (e) {
      if (ctrl.signal.aborted) return; // a newer refresh started
      console.error(e);
      // keep existing DOM; optional toast could go here
    }
  }

  let timer;
  function schedule() {
    if (timer) clearInterval(timer);
    load();
    timer = setInterval(load, refreshMs);
  }

  schedule();
})();
