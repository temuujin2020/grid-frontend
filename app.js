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
          logoUrl: safe(base.logoUrl, "")   // <- will be used in UI
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
    const card = document.createElement("a");
    card.className = "card" + (m.live ? " live" : "");
    card.href = "javascript:void(0)";

    // header: event (left) + badges (right)
    const header = document.createElement("div");
    header.className = "card-header";

    const left = document.createElement("div");
    left.className = "card-left";
    left.textContent = m.event || "—";

    const right = document.createElement("div");
    right.className = "card-right";
    // badges: BO?, LIVE?, time
    if (m.format) {
      const bo = document.createElement("span");
      bo.className = "pill";
      bo.textContent = m.format.toString().toUpperCase().startsWith("BO") ? m.format : `BO${m.format}`;
      right.appendChild(bo);
    }
    if (m.live) {
      const liveDot = document.createElement("span");
      liveDot.className = "pill live-dot";
      liveDot.textContent = "LIVE";
      right.appendChild(liveDot);
    }
    const timePill = document.createElement("span");
    timePill.className = "pill soft";
    timePill.textContent = toTime(m.time);
    right.appendChild(timePill);

    header.appendChild(left);
    header.appendChild(right);

    // body: two team rows with logos
    const body = document.createElement("div");
    body.className = "card-body";

    const tA = m.teams[0] || { name: "TBD", logoUrl: "" };
    const tB = m.teams[1] || { name: "TBD", logoUrl: "" };
    body.appendChild(teamRow(tA));
    body.appendChild(vsRow());
    body.appendChild(teamRow(tB));

    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  function teamRow(team) {
    const row = document.createElement("div");
    row.className = "team-row";

    const left = document.createElement("div");
    left.className = "team-left";

    const img = document.createElement("img");
    img.className = "team-logo";
    img.alt = team.name || "team";
    if (team.logoUrl) img.src = team.logoUrl;
    else img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="; // tiny transparent px fallback

    const name = document.createElement("span");
    name.className = "team-name";
    name.textContent = team.name || "TBD";

    left.appendChild(img);
    left.appendChild(name);

    row.appendChild(left);
    return row;
  }

  function vsRow() {
    const r = document.createElement("div");
    r.className = "vs-row";
    r.textContent = "vs";
    return r;
  }

  // swap helper with subtle fade (no flicker)
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

  // ---------- data loop ----------
  let inFlightCtrl;

  async function load() {
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      const [liveRes, upRes] = await Promise.all([
        fetch(`${API_BASE}/live`,              { cache: "no-store", signal: ctrl.signal }).then(r => r.json()),
        fetch(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`,
              { cache: "no-store", signal: ctrl.signal }).then(r => r.json())
      ]);
      if (ctrl.signal.aborted) return;

      let live = normalize(liveRes.items || [], true);
      let upcoming = normalize(upRes.items || [], false);

      // sort/pin
      const byStart = (a,b) => new Date(a.time) - new Date(b.time);
      if (TEAM_PIN) {
        const pin = TEAM_PIN;
        const withPinFirst = (a,b) => {
          const ap = a.teams.map(t => t.name.toLowerCase()).join(" ").includes(pin) ? 1 : 0;
          const bp = b.teams.map(t => t.name.toLowerCase()).join(" ").includes(pin) ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return byStart(a,b);
        };
        live.sort(withPinFirst);
        upcoming.sort(byStart);
      } else {
        live.sort(byStart);
        upcoming.sort(byStart);
      }

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UP   > 0) upcoming = upcoming.slice(0, LIMIT_UP);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UP,   upcoming, "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (e) {
      if (ctrl.signal.aborted) return; // new refresh took over
      console.error(e);
    }
  }

  // jittered, non-synchronized scheduler (Render/GRID friendly)
  refreshMs = Math.max(15000, refreshMs);
  function nextInterval() { return refreshMs + Math.floor(Math.random() * 500); }

  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load();
    timer = setTimeout(schedule, nextInterval());
  }

  // paint skeleton once so page feels instant
  function paintSkeleton() {
    const makeSkel = () => {
      const ph = document.createElement("div");
      ph.className = "card skeleton";
      ph.innerHTML = `
        <div class="card-header">
          <div class="card-left skeleton-bar" style="width: 40%"></div>
          <div class="card-right">
            <span class="pill skeleton-bar" style="width:48px"></span>
            <span class="pill skeleton-bar" style="width:38px"></span>
            <span class="pill skeleton-bar" style="width:52px"></span>
          </div>
        </div>
        <div class="card-body">
          <div class="team-row">
            <div class="team-left">
              <div class="team-logo skeleton-circle"></div>
              <div class="team-name skeleton-bar" style="width: 60%"></div>
            </div>
          </div>
          <div class="vs-row">vs</div>
          <div class="team-row">
            <div class="team-left">
              <div class="team-logo skeleton-circle"></div>
              <div class="team-name skeleton-bar" style="width: 50%"></div>
            </div>
          </div>
        </div>`;
      return ph;
    };

    if (LIST_LIVE) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 3; i++) frag.appendChild(makeSkel());
      LIST_LIVE.replaceChildren(frag);
    }
    if (LIST_UP) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 6; i++) frag.appendChild(makeSkel());
      LIST_UP.replaceChildren(frag);
    }
  }

  paintSkeleton();
  schedule();
})();
