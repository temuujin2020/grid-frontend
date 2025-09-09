// app.js — Safari-safe fetch + robust normalizer + tidy cards
(function () {
  const ROOT = document.getElementById("matchesRoot");
  if (!ROOT) return;

  // ---- DOM ----
  const LIST_LIVE = document.getElementById("listLive");
  const LIST_UP   = document.getElementById("listUpcoming");
  const LAST      = document.getElementById("lastUpdated");
  const REFRESH   = document.getElementById("refreshSelect");
  const TEAM_BADGE= document.getElementById("teamBadge");
  const UP_SPAN   = document.getElementById("upHoursSpan");

  // ---- Config from HTML data-* ----
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

  // ---- Small utils ----
  const pad2 = (n)=> String(n).padStart(2,"0");
  const tHHMM = (dOrStr)=>{
    const d = typeof dOrStr === "string" ? new Date(dOrStr) : dOrStr;
    if (Number.isNaN(d.getTime())) return "--:--";
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  function setLastUpdated(note) {
    const extra = note ? ` (${note})` : "";
    if (LAST) LAST.textContent = "Last updated: " + new Date().toLocaleTimeString() + extra;
  }

  // ---- Safari-safe fetch with timeout ----
  async function fetchJSONWithTimeout(url, { timeout = 12000, signal } = {}) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  // ---- Normalizer (robust to varying shapes) ----
  function readTeamName(x) {
    if (!x) return "";
    if (typeof x === "string") return x;
    if (x.name) return x.name;
    if (x.baseInfo && x.baseInfo.name) return x.baseInfo.name;
    return "";
  }
  function readTeamLogo(x) {
    if (!x) return "";
    if (x.logoUrl) return x.logoUrl;
    if (x.baseInfo && x.baseInfo.logoUrl) return x.baseInfo.logoUrl;
    return "";
  }
  function readEvent(item) {
    // event/tournament/title fallbacks
    return (
      (item.event && item.event.name) ||
      (item.tournament && (item.tournament.name || item.tournament.title && item.tournament.title.name)) ||
      (item.title && item.title.name) ||
      ""
    );
  }
  function readFormat(item) {
    const f = item.format;
    if (!f) return "";
    if (typeof f === "string") return f.toUpperCase().startsWith("BO") ? f.toUpperCase() : `BO${f}`;
    if (typeof f === "number") return `BO${f}`;
    if (f.nameShortened) return f.nameShortened.toUpperCase();
    if (f.name) return f.name.toUpperCase();
    if (f.id) return `BO${f.id}`;
    return "";
  }

  function normalize(items, isLive) {
    return (items || []).map((it) => {
      const teamsRaw = Array.isArray(it.teams) ? it.teams : (it.teams || []);
      const nameA = readTeamName(teamsRaw[0]) || "TBD";
      const nameB = readTeamName(teamsRaw[1]) || "TBD";
      const logoA = readTeamLogo(teamsRaw[0]);
      const logoB = readTeamLogo(teamsRaw[1]);

      const event = readEvent(it);
      const when  = it.time || it.startTimeScheduled || it.start || it.startTime || "";
      const fmt   = readFormat(it);

      return {
        id: String(it.id ?? `${event}-${when}-${nameA}-${nameB}`),
        event,
        format: fmt || "",
        time: when,
        live: !!isLive,
        teams: [nameA, nameB],
        logos: [logoA, logoB],
      };
    }).filter(x => x.id && x.time);
  }

  // ---- Rendering ----
  function logoImg(src) {
    if (!src) return "";
    const esc = String(src).replace(/"/g, "&quot;");
    return `<img src="${esc}" alt="" loading="lazy">`;
  }

  function renderCard(m) {
    const topLeft  = m.event || "—";
    const boPill   = m.format ? `<span class="pill">${m.format}</span>` : "";
    const livePill = m.live ? `<span class="pill live-dot">LIVE</span>` : "";
    const timePill = `<span class="pill">${tHHMM(m.time)}</span>`;

    return html(`
      <div class="card${m.live ? " live" : ""}">
        <div class="card-top">
          <div class="event" title="${escapeHtml(topLeft)}">${escapeHtml(topLeft)}</div>
          <div class="badges">${boPill}${livePill}${timePill}</div>
        </div>

        <div class="teams">
          <div class="team-row">
            <div class="team-logo">${logoImg(m.logos[0])}</div>
            <div class="team-name">${escapeHtml(m.teams[0] || "TBD")}</div>
          </div>
          <div class="team-row">
            <div class="team-logo">${logoImg(m.logos[1])}</div>
            <div class="team-name">${escapeHtml(m.teams[1] || "TBD")}</div>
          </div>
        </div>
      </div>
    `);
  }

  function html(s){ const tpl = document.createElement("template"); tpl.innerHTML = s.trim(); return tpl.content.firstElementChild; }

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

  // ---- Load + schedule ----
  let inFlightCtrl;

  async function load() {
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      // first paint a quick skeleton so the page feels alive
      paintSkeleton();

      const [liveRes, upRes] = await Promise.all([
        fetchJSONWithTimeout(`${API_BASE}/live`, { signal: ctrl.signal, timeout: 12000 }),
        fetchJSONWithTimeout(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`, { signal: ctrl.signal, timeout: 12000 })
      ]);

      if (ctrl.signal.aborted) return;

      // Proxy contract: { ok:boolean, items:[...] } — be forgiving.
      if (liveRes?.error === "ENHANCE_YOUR_CALM" || upRes?.error === "ENHANCE_YOUR_CALM") {
        setLastUpdated("rate-limited");
        return;
      }

      let live = normalize(liveRes?.items || [], true);
      let upcoming = normalize(upRes?.items || [], false);

      // Sorting
      const byTime = (a,b)=> new Date(a.time) - new Date(b.time);
      live.sort(byTime); upcoming.sort(byTime);

      // Optional pin
      if (TEAM_PIN) {
        const pin = TEAM_PIN;
        const pinScore = (m)=> m.teams.join(" ").toLowerCase().includes(pin) ? 1 : 0;
        live.sort((a,b)=> pinScore(b)-pinScore(a) || byTime(a,b));
        upcoming.sort(byTime);
      }

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UP   > 0) upcoming = upcoming.slice(0, LIMIT_UP);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UP, upcoming, "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.warn("[load] error:", err);
      setLastUpdated("error");
      // keep previous DOM
    }
  }

  // Skeleton paint (very light)
  function paintSkeleton() {
    const skel = (n=4)=>{
      const frag = document.createDocumentFragment();
      for (let i=0;i<n;i++) {
        const el = html(`
          <div class="skel" aria-hidden="true">
            <div class="shine"></div>
            <div class="card-top" style="padding:12px">
              <div class="bar" style="width:40%;height:12px"></div>
              <div class="row">
                <div class="bar" style="width:42px"></div>
                <div class="bar" style="width:42px"></div>
                <div class="bar" style="width:44px"></div>
              </div>
            </div>
            <div class="teams" style="padding:0 12px 12px">
              <div class="team-row"><div class="bar" style="width:28px;height:28px"></div><div class="bar" style="flex:1;height:12px"></div></div>
              <div class="team-row"><div class="bar" style="width:28px;height:28px"></div><div class="bar" style="flex:1;height:12px"></div></div>
            </div>
          </div>`);
        frag.appendChild(el);
      }
      return frag;
    };
    if (LIST_LIVE && LIST_LIVE.children.length === 0) LIST_LIVE.replaceChildren(skel(4));
    if (LIST_UP   && LIST_UP.children.length   === 0) LIST_UP.replaceChildren(skel(3));
  }

  // Jitter the interval (avoid sync storms + rate limits)
  function nextInterval() {
    const floor = 8000; // minimum refresh
    const jitter = Math.floor(Math.random() * 500);
    return Math.max(floor, refreshMs) + jitter;
  }
  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load();
    timer = setTimeout(schedule, nextInterval());
  }

  function escapeHtml(s="") {
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  // go
  schedule();
})();
