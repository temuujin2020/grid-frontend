// app.js — Safari-safe fetch + robust normalizer + logos + scores
(function () {
  const ROOT = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const LIST_LIVE = document.getElementById("listLive");
  const LIST_UP   = document.getElementById("listUpcoming");
  const LAST      = document.getElementById("lastUpdated");
  const REFRESH   = document.getElementById("refreshSelect");
  const TEAM_BADGE= document.getElementById("teamBadge");
  const UP_SPAN   = document.getElementById("upHoursSpan");

  const API_BASE = ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series";
  const urlParams = new URLSearchParams(location.search);

  let refreshMs = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 30000);
  const TEAM_PIN = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UP   = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);
  if (UP_SPAN) UP_SPAN.textContent = String(UPCOMING_HOURS);

  if (REFRESH) {
    REFRESH.value = String(refreshMs);
    REFRESH.addEventListener("change", () => {
      refreshMs = Number(REFRESH.value);
      schedule();
    });
  }
  if (TEAM_PIN && TEAM_BADGE) {
    TEAM_BADGE.hidden = false;
    TEAM_BADGE.textContent = `Pinned: ${TEAM_PIN}`;
  }

  const pad2 = n => String(n).padStart(2, "0");
  const tHHMM = dOrStr => {
    const d = new Date(dOrStr);
    return Number.isNaN(d.getTime()) ? "--:--" : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  function setLastUpdated(note) {
    if (LAST) LAST.textContent =
      "Last updated: " + new Date().toLocaleTimeString() + (note ? ` (${note})` : "");
  }

  // ---- Normalizers ----
  const readTeamName = t =>
    (t && (t.name || (t.baseInfo && t.baseInfo.name))) || "TBD";
  const readTeamLogo = t =>
    (t && (t.logoUrl || (t.baseInfo && t.baseInfo.logoUrl))) || "";
  const readEvent = s =>
    (s.tournament && (s.tournament.name || (s.tournament.title && s.tournament.title.name))) ||
    (s.title && s.title.name) ||
    "—";

  function normalize(series, isLive) {
    return (series || []).map(s => {
      const teams = (s.teams || []).map(t => ({
        name: readTeamName(t),
        logo: readTeamLogo(t),
        score: t.scoreAdvantage || 0,
      }));
      return {
        id: String(s.id),
        event: readEvent(s),
        format: s.format && (s.format.nameShortened || s.format.name) || "",
        time: s.startTimeScheduled,
        teams,
        live: isLive
      };
    });
  }

  // ---- Renderer ----
  function renderCard(m) {
    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");

    const top = document.createElement("div");
    top.className = "card-top";
    top.innerHTML = `
      <div class="event">${m.event}</div>
      <div class="badges">
        <span class="pill">BO${m.format || "?"}</span>
        ${m.live ? '<span class="pill live-dot">LIVE</span>' : ""}
        <span class="pill">${tHHMM(m.time)}</span>
      </div>
    `;

    const teams = document.createElement("div");
    teams.className = "teams";
    for (const t of m.teams) {
      const row = document.createElement("div");
      row.className = "team-row";
      row.innerHTML = `
        <div class="team-logo">${t.logo ? `<img src="${t.logo}" alt="${t.name}">` : ""}</div>
        <div class="team-name">${t.name} <span class="score">${t.score}</span></div>
      `;
      teams.appendChild(row);
    }

    card.appendChild(top);
    card.appendChild(teams);
    return card;
  }

  function renderList(root, items, emptyText) {
    if (!root) return;
    const frag = document.createDocumentFragment();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = emptyText;
      frag.appendChild(empty);
    } else {
      items.forEach(m => frag.appendChild(renderCard(m)));
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
        fetch(`${API_BASE}/live`, { signal: ctrl.signal }).then(r => r.json()),
        fetch(`${API_BASE}/upcoming?hours=${UPCOMING_HOURS}`, { signal: ctrl.signal }).then(r => r.json())
      ]);
      if (ctrl.signal.aborted) return;
      let live = normalize(liveRes.items || [], true);
      let upcoming = normalize(upRes.items || [], false);

      if (TEAM_PIN) {
        const pin = TEAM_PIN;
        live.sort((a,b)=>b.teams.some(t=>t.name.toLowerCase().includes(pin)) - a.teams.some(t=>t.name.toLowerCase().includes(pin)));
        upcoming.sort((a,b)=>new Date(a.time)-new Date(b.time));
      }

      if (LIMIT_LIVE) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UP) upcoming = upcoming.slice(0, LIMIT_UP);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UP, upcoming, "No upcoming matches in window.");
      setLastUpdated();
    } catch(e){ if(!ctrl.signal.aborted) console.error(e); }
  }

  // ---- Scheduler with jitter ----
  function nextInterval(){ return Math.max(8000, refreshMs) + Math.random()*500; }
  let timer;
  function schedule(){
    if (timer) clearTimeout(timer);
    load();
    timer = setTimeout(schedule, nextInterval());
  }
  schedule();
})();
