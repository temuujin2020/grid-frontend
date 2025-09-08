cd ~/Documents/grid-frontend
cp app.js app.js.bak

# Overwrite app.js with a clean, working version
cat > app.js <<'EOF'
// app.js — full single-file script (clean restore)
(function () {
  // ---- DOM ----
  const ROOT = document.getElementById("matchesRoot");
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

  // refresh (ms) — prefer ?refresh=..., else data-refresh, fallback 15000
  let refreshMs = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 15000);

  // other optional params
  const TEAM_PIN       = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE     = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UPCOMING = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  if (TEAM_PIN && TEAM_BADGE) {
    TEAM_BADGE.hidden = false;
    TEAM_BADGE.textContent = `Pinned: ${TEAM_PIN}`;
  }

  if (REFRESH_SELECT) {
    REFRESH_SELECT.value = String(refreshMs);
    REFRESH_SELECT.addEventListener("change", () => {
      refreshMs = Number(REFRESH_SELECT.value);
      schedule();
    });
  }

  // ---- Helpers ----
  function setLastUpdated(note) {
    if (!LAST_UPDATED) return;
    const suffix = note ? ` (${note})` : "";
    LAST_UPDATED.textContent = `Last updated: ${new Date().toLocaleTimeString()}${suffix}`;
  }

  function renderCard(m) {
    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");

    const top = document.createElement("div");
    top.className = "row";
    top.innerHTML = `
      <span class="pill">${m.event || "—"}</span>
      <span class="pill">BO${m.format || "?"}</span>
      ${m.live ? '<span class="pill status">LIVE</span>' : ""}
    `;

    const time = new Date(m.time);
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="event">${isNaN(time) ? "" : time.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</div>
      <div class="row">
        <div class="team">${m.teams[0] || "TBD"}</div>
        <div class="vs">vs</div>
        <div class="team">${m.teams[1] || "TBD"}</div>
      </div>
    `;

    card.appendChild(top);
    card.appendChild(body);
    return card;
  }

  // map server items → UI model
  function normalize(items, isLive) {
    return (items || [])
      .map(it => {
        const t = Array.isArray(it.teams) ? it.teams : (it.teams || []);
        const names = t.map(x => x?.name || x?.baseInfo?.name || "").filter(Boolean);
        return {
          id: String(it.id ?? ""),
          event: it.event?.name || it.tournament?.name || "",
          format: String(it.format?.id || it.format || ""),
          time: it.time || it.startTimeScheduled || "",
          teams: names,
          live: !!isLive
        };
      })
      .filter(x => x.id && x.time);
  }

  // smooth, no-flicker swap
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

      let live = normalize(liveRes.items || [], true);
      let upcoming = normalize(upRes.items || [], false);

      if (TEAM_PIN) {
        const pin = TEAM_PIN;
        const hasPin = teams => teams.join(" ").toLowerCase().includes(pin) ? 1 : 0;
        live.sort((a, b) => hasPin(b.teams) - hasPin(a.teams) || new Date(a.time) - new Date(b.time));
        upcoming.sort((a, b) => new Date(a.time) - new Date(b.time));
      } else {
        live.sort((a, b) => new Date(a.time) - new Date(b.time));
        upcoming.sort((a, b) => new Date(a.time) - new Date(b.time));
      }

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UPCOMING > 0) upcoming = upcoming.slice(0, LIMIT_UPCOMING);

      renderList(LIST_LIVE,     live,     "No live matches right now.");
      renderList(LIST_UPCOMING, upcoming, "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error(err);
      setLastUpdated("error");
    }
  }

  // ---- Jittered scheduler (no setInterval) ----
  function nextInterval() {
    const floor = 8000;
    const jitter = Math.floor(Math.random() * 500);
    return Math.max(floor, refreshMs) + jitter;
  }

  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load(); // run now
    timer = setTimeout(schedule, nextInterval());
  }

  // start
  schedule();
})();
