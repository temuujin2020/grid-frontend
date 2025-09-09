// app.js — show event on left; badges (BO/LIVE/time) on right; team logos + names
(function () {
  const ROOT            = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const LIST_LIVE       = document.getElementById("listLive");
  const LIST_UP         = document.getElementById("listUpcoming");
  const LAST            = document.getElementById("lastUpdated");
  const REFRESH_SELECT  = document.getElementById("refreshSelect");
  const TEAM_BADGE      = document.getElementById("teamBadge");
  const UP_HOURS_SPAN   = document.getElementById("upHoursSpan");

  const API_BASE        = ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series";
  const urlParams       = new URLSearchParams(location.search);

  // config
  let refreshMs         = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 15000);
  const TEAM_PIN        = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE      = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UP        = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS  = Number(urlParams.get("hoursUpcoming") || 24);

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

  // ---------- utilities ----------
  function safe(x, d = "") { return x == null ? d : x; }
  function toTime(t) {
    try {
      return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  // Normalize backend objects into a simple shape we can render
  function normalize(items, isLive) {
    return (items || []).map(it => {
      // tournament/event
      const eventName =
        safe(it.event && it.event.name) ||
        safe(it.tournament && it.tournament.name) ||
        "";

      // format (prefer nameShortened like BO3; otherwise id)
      const format =
        safe(it.format && it.format.nameShortened) ||
        safe(it.format && it.format.name) ||
        safe(it.format && it.format.id) ||
        "";

      // teams with logos
      const teamsRaw = Array.isArray(it.teams) ? it.teams : (it.teams || []);
      const teams = teamsRaw.map(t => {
        const base = t && t.baseInfo || {};
        return {
          id: String(safe(base.id)),
          name: safe(base.name, "TBD"),
          logoUrl: safe(base.logoUrl, "")
        };
      });

      return {
        id: String(safe(it.id)),
        event: eventName,
        format,
        time: safe(it.time || it.startTimeScheduled, ""),
        teams,
        live: !!isLive
      };
    }).filter(x => x.id && x.time);
  }

  // ---------- rendering ----------
  function renderCard(m) {
    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");

    const top = document.createElement("div");
    top.className = "card-top";
    const bo = m.format ? `BO${m.format}` : "—";
    const timeStr = m.time ? toTime(m.time) : "—";
    top.innerHTML = `
      <div class="event" title="${m.event || ""}">${m.event || "—"}</div>
      <div class="badges">
        <span class="pill">${bo}</span>
        ${m.live ? '<span class="pill live-dot">LIVE</span>' : ""}
        <span class="pill">${timeStr}</span>
      </div>
    `;

    const teams = document.createElement("div");
    teams.className = "teams";

    (m.teams || []).forEach(t => {
      const row = document.createElement("div");
      row.className = "team-row";
      row.innerHTML = `
        <div class="team-logo">${t.logoUrl ? `<img src="${t.logoUrl}" alt="">` : ""}</div>
        <div class="team-name">${t.name || "TBD"}</div>
      `;
      teams.appendChild(row);
    });

    card.appendChild(top);
    card.appendChild(teams);
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

  // ---------- fetch ----------
  async function fetchJSONWithTimeout(url, opts = {}, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      return await res.json();
    } finally { clearTimeout(id); }
  }

  let inFlightCtrl;

  async function load() {
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      const [liveRes, upRes] = await Promise.all([
        fetchJSONWithTimeout(`${API_BASE}/live`, { cache: "no-store", signal: ctrl.signal }),
        fetchJSONWithTimeout(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`, { cache: "no-store", signal: ctrl.signal })
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
      if (ctrl.signal.aborted) return;
      console.error(e);
    }
  }

  // ---------- refresh with jitter ----------
  function nextInterval() {
    return refreshMs + Math.floor(Math.random() * 500);
  }
  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load();
    timer = setTimeout(schedule, nextInterval());
  }
  schedule();
})();
