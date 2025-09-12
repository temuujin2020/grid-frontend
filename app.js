(() => {
  // ========= CONFIG =========
  const API_ORIGIN = "https://grid-proxy.onrender.com"; // your Render URL
  const ROUTE_PATTERNS = [
    p => `${API_ORIGIN}${p}`,      // "/live", "/upcoming"
    p => `${API_ORIGIN}/api${p}`,  // "/api/live"
    p => `${API_ORIGIN}/v1${p}`,   // "/v1/live"
  ];

  const refreshSel = document.getElementById("refreshSel");
  const refreshBtn = document.getElementById("refreshBtn");
  const upWinSel   = document.getElementById("winSel");
  const upRefresh  = document.getElementById("forceUpcoming");
  const winLabel   = document.getElementById("winLabel");
  const lastUpdatedEl = document.getElementById("lastUpdated");

  const LIST_LIVE = document.getElementById("liveList");
  const LIST_UP   = document.getElementById("upList");

  const DRAWER = document.getElementById("drawer");
  const DRAWER_CLOSE = document.getElementById("drawerClose");
  const DRAWER_BODY  = document.getElementById("drawerBody");

  let POLL_MS = parseInt(refreshSel.value, 10);
  let UPCOMING_HOURS = parseInt(upWinSel.value, 10);

  // ========= HELPERS =========
  function setLastUpdated() {
    const s = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
    lastUpdatedEl.textContent = `Last updated: ${s}`;
  }

  async function fetchJSONMulti(pathWithQuery, init={}) {
    let lastErr;
    for (const build of ROUTE_PATTERNS) {
      const url = build(pathWithQuery);
      try {
        const res = await fetch(url, { cache:"no-store", ...init });
        if (res.ok) return await res.json();
        if (res.status !== 404) {
          const txt = await res.text().catch(()=>"");
          throw new Error(`HTTP ${res.status} ${url} ${txt? "- "+txt:""}`);
        }
        lastErr = new Error(`404 at ${url}`);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("All API routes failed");
  }

  function normalize(items, live=false) {
    const out = [];
    for (const it of items || []) {
      const t = it.time || it.startTime || it.startTimeScheduled || null;
      out.push({
        id: it.id || it.seriesId || crypto.randomUUID(),
        event: it.event || it.tournament || it.tournamentName || it.tournament?.nameShortened || "",
        format: it.format?.nameShortened || it.formatShort || it.format || "",
        teams: it.teams || it.teamNames || [
          it.team1 || it.teamA || it.teams?.[0]?.baseInfo?.name || "TBD",
          it.team2 || it.teamB || it.teams?.[1]?.baseInfo?.name || "TBD"
        ],
        scores: it.scores || it.score || ["", ""],
        time: t,
        live
      });
    }
    return out;
  }

  function card(match) {
    const a = document.createElement("article");
    a.className = `card${match.live ? " live":""}`;
    a.setAttribute("role","button");
    a.tabIndex = 0;

    const left = document.createElement("div");
    left.className = "left";
    const right = document.createElement("div");
    right.className = "right";

    left.innerHTML = `
      <div class="row event">${match.event || "—"} ${match.format ? "• "+match.format : ""}</div>
      <div class="row">
        <div class="team">${(match.teams?.[0] ?? "TBD")}</div>
        <div class="score">${(match.scores?.[0] ?? "")}</div>
      </div>
      <div class="row">
        <div class="team">${(match.teams?.[1] ?? "TBD")}</div>
        <div class="score">${(match.scores?.[1] ?? "")}</div>
      </div>
    `;

    const status = match.live ? "LIVE" :
      (match.time ? new Date(match.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "");
    right.innerHTML = `<div class="status">${status}</div>`;

    a.appendChild(left);
    a.appendChild(right);

    a.addEventListener("click", () => openDrawer(match));
    a.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(match); } });

    return a;
  }

  function renderList(el, items, emptyMsg) {
    el.innerHTML = "";
    if (!items?.length) {
      el.innerHTML = `<div class="empty">${emptyMsg}</div>`;
      return;
    }
    for (const m of items) el.appendChild(card(m));
  }

  function openDrawer(m) {
    DRAWER_BODY.innerHTML = `
      <h2>${m.event || "Match"}</h2>
      <div class="kv"><div class="k">Status</div><div>${m.live ? "LIVE" : "Scheduled"}</div></div>
      <div class="kv"><div class="k">Format</div><div>${m.format || "—"}</div></div>
      <div class="kv"><div class="k">When</div><div>${m.time ? new Date(m.time).toLocaleString() : "—"}</div></div>
      <hr style="border:0;border-top:1px solid var(--border);margin:10px 0;">
      <div class="kv"><div class="k">Team A</div><div>${m.teams?.[0] ?? "TBD"} ${m.scores?.[0] ?? ""}</div></div>
      <div class="kv"><div class="k">Team B</div><div>${m.teams?.[1] ?? "TBD"} ${m.scores?.[1] ?? ""}</div></div>
      <p class="muted" style="margin-top:12px">More details (rosters, live maps) can be added once those API fields are available in the proxy.</p>
    `;
    DRAWER.classList.add("open");
  }
  function closeDrawer(){ DRAWER.classList.remove("open"); }
  DRAWER_CLOSE.addEventListener("click", closeDrawer);
  DRAWER.addEventListener("click", (e)=>{ if(e.target===DRAWER) closeDrawer(); });

  // ========= LOAD =========
  async function load() {
    try {
      const [liveRes, upRes] = await Promise.all([
        fetchJSONMulti(`/live`),
        fetchJSONMulti(`/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`)
      ]);

      let live = normalize(liveRes.items || liveRes.data || [], true);
      let up   = normalize(upRes.items || upRes.data || [], false);

      // sort by soonest
      const byTime = (a,b) => new Date(a.time||0) - new Date(b.time||0);
      live.sort(byTime);
      up.sort(byTime);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UP, up, "Nothing scheduled in this window.");

      setLastUpdated();
    } catch (e) {
      console.error(e);
      LIST_LIVE.innerHTML = `<div class="empty">Couldn’t load matches.</div>`;
      LIST_UP.innerHTML   = `<div class="empty">Couldn’t load matches.</div>`;
    }
  }

  // ========= POLLING =========
  let timer;
  function startPolling(){
    if (timer) clearInterval(timer);
    timer = setInterval(load, POLL_MS);
  }

  refreshSel.addEventListener("change", () => {
    POLL_MS = parseInt(refreshSel.value,10);
    startPolling();
  });
  refreshBtn.addEventListener("click", load);

  upWinSel.addEventListener("change", () => {
    UPCOMING_HOURS = parseInt(upWinSel.value,10);
    winLabel.textContent = `${UPCOMING_HOURS}h`;
    load();
  });
  upRefresh.addEventListener("click", load);

  // kick it off
  load();
  startPolling();
})();
