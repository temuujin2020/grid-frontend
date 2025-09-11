/* =========================
   Lightweight Esports Viewer
   - Loads LIVE & UPCOMING series
   - Click a match to open drawer w/ details, rosters, and live state
   ========================= */

const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const byId = (id) => document.getElementById(id);

const UI = {
  liveList: byId("liveList"),
  upcomingList: byId("upcomingList"),
  lastUpdated: byId("lastUpdated"),
  drawer: byId("drawer"),
  drawerBody: byId("drawerBody"),
  closeDrawer: byId("closeDrawer"),
  scrim: byId("scrim"),
  tabs: $$(".tab"),
  prev: byId("prevPage"),
  next: byId("nextPage"),
  windowSel: byId("window"),
  jsonPaste: byId("jsonPaste"),
  renderJsonBtn: byId("renderJson"),
  saveConn: byId("saveConn"),
  gqlEndpoint: byId("gqlEndpoint"),
  gqlApiKey: byId("gqlApiKey"),
  loadLive: byId("loadLive"),
  loadUpcoming: byId("loadUpcoming"),
};

const STORE = {
  endpoint: localStorage.getItem("gql:endpoint") || "",
  apiKey: localStorage.getItem("gql:token") || "",
  cursors: { startCursor: null, endCursor: null, hasNext: false, hasPrev: false },
  currentTab: "live",
  currentWindowHours: 24,
  lastPayloadType: null, // "live" | "upcoming" | "json"
};

// init form fields
UI.gqlEndpoint.value = STORE.endpoint;
UI.gqlApiKey.value = STORE.apiKey;

/* -------------------------
   Helpers
------------------------- */
const UTIL = {
  iso(dt) { return new Date(dt).toISOString(); },
  fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toUTCString().replace(" GMT", "");
  },
  rel(iso) {
    const d = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.round((d - now) / 60000);
    if (diff === 0) return "now";
    if (diff > 0) return `in ${diff}m`;
    return `${Math.abs(diff)}m ago`;
  },
  boShort(fmt) {
    if (!fmt) return "";
    if (typeof fmt === "string") return fmt.replace("best-of-", "Bo");
    if (fmt?.nameShortened) return fmt.nameShortened;
    return "";
  },
  safeTournament(t) {
    return t?.nameShortened || t?.name || "—";
  },
  teamName(t) {
    return t?.baseInfo?.name || t?.name || "—";
  },
  setUpdated() {
    UI.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  },
  badgeLive() { const s = document.createElement("span"); s.className="badge live"; s.textContent="LIVE"; return s; },
  badgeBo(fmt) { const s = document.createElement("span"); s.className="badge bo"; s.textContent=UTIL.boShort(fmt); return s; },
};

function cardMatch(m, { live } = { live:false }) {
  const el = document.createElement("article");
  el.className = "card match";
  el.setAttribute("role","button");
  el.tabIndex = 0;

  const left = document.createElement("div");
  left.innerHTML = `<div class="time">${live ? "Live" : "Start (UTC)"}</div><div>${UTIL.fmtTime(m.startTimeScheduled)}</div><div class="time">${UTIL.rel(m.startTimeScheduled)}</div>`;

  const right = document.createElement("div");
  const header = document.createElement("div");
  header.style.display="flex"; header.style.gap="8px"; header.style.alignItems="center";
  if (live) header.appendChild(UTIL.badgeLive());
  header.appendChild(UTIL.badgeBo(m.format));
  const tour = document.createElement("div");
  tour.className="tournament";
  tour.textContent = UTIL.safeTournament(m.tournament);
  header.appendChild(tour);

  const teams = document.createElement("div");
  teams.className="teams";
  (m.teams||[]).slice(0,2).forEach((t,i)=>{
    const row = document.createElement("div");
    row.className="team";
    const dot = document.createElement("span"); dot.className="dot"; dot.style.background=i? "#7aa2ff":"#82d173";
    const name = document.createElement("span"); name.className="name"; name.textContent = UTIL.teamName(t);
    const adv = document.createElement("span"); adv.className="adv"; adv.textContent = (t.scoreAdvantage?`Adv ${t.scoreAdvantage}`:"");
    row.append(dot,name,adv); teams.appendChild(row);
  });

  right.append(header,teams);
  el.append(left,right);

  el.addEventListener("click", () => openDrawerForSeries(m));
  el.addEventListener("keydown", (e)=>{ if(e.key==="Enter") openDrawerForSeries(m); });
  return el;
}

function renderSeriesList(target, list, {live}={live:false}) {
  target.innerHTML = "";
  if (!list?.length) {
    const blank = document.createElement("div");
    blank.className="card none";
    blank.textContent = "No matches found.";
    target.appendChild(blank);
    return;
  }
  list.forEach(s => target.appendChild(cardMatch(s, {live})));
}

/* -------------------------
   Drawer (details)
------------------------- */
function openDrawer() {
  UI.drawer.setAttribute("aria-hidden","false");
}
function closeDrawer() {
  UI.drawer.setAttribute("aria-hidden","true");
  UI.drawerBody.innerHTML="";
}
UI.closeDrawer.addEventListener("click", closeDrawer);
UI.scrim.addEventListener("click", closeDrawer);

async function openDrawerForSeries(seriesNode) {
  openDrawer();
  UI.drawerBody.innerHTML = `
    <h2 style="margin:6px 0;">${UTIL.safeTournament(seriesNode.tournament)}</h2>
    <div class="meta"><div>Series ID</div><div>${seriesNode.id}</div></div>
    <div class="meta"><div>Start (UTC)</div><div>${UTIL.fmtTime(seriesNode.startTimeScheduled)} · ${UTIL.rel(seriesNode.startTimeScheduled)}</div></div>
    <div class="meta"><div>Format</div><div>${UTIL.boShort(seriesNode.format) || "—"}</div></div>
    <div class="divider"></div>
    <div id="liveStateBlock"><div class="meta"><div>Live</div><div>Loading…</div></div></div>
    <div class="divider"></div>
    <h3>Teams</h3>
    <div id="teamBlocks"></div>
  `;

  // 1) Live state (best-effort)
  try {
    const state = await GQL.fetchSeriesState(seriesNode.id);
    const liveEl = $("#liveStateBlock", UI.drawerBody);
    if (state?.valid) {
      const label = state.started && !state.finished ? "In progress" : (state.finished ? "Finished" : "Not started");
      liveEl.innerHTML = `
        <div class="meta"><div>Status</div><div>${label}</div></div>
        <div class="meta"><div>Updated</div><div>${UTIL.fmtTime(state.updatedAt)}</div></div>
      `;
    } else {
      liveEl.innerHTML = `<div class="meta"><div>Status</div><div>—</div></div>`;
    }
  } catch (e) {
    $("#liveStateBlock", UI.drawerBody).innerHTML = `<div class="meta"><div>Status</div><div>n/a</div></div>`;
  }

  // 2) Team rosters
  const teamBlocks = $("#teamBlocks", UI.drawerBody);
  for (const t of (seriesNode.teams||[]).slice(0,2)) {
    const teamName = UTIL.teamName(t);
    const wrap = document.createElement("div");
    wrap.className="card";
    wrap.innerHTML = `<h4 style="margin:4px 0 8px;">${teamName}</h4><div class="roster" data-team="${teamName}"><div class="none">Loading roster…</div></div>`;
    teamBlocks.appendChild(wrap);

    // roster by name (API you showed has players(filter:{teamIdFilter:{id}}) where we need ID – we’ll best-effort search by name then use id; fallback to name-only)
    try {
      const teamInfo = await GQL.searchTeamByName(teamName); // returns first match or null
      let roster = [];
      if (teamInfo?.id) {
        roster = await GQL.fetchTeamRoster(teamInfo.id);
      }
      const host = $(`.roster[data-team="${CSS.escape(teamName)}"]`, wrap);
      host.innerHTML = "";
      if (!roster.length) {
        host.innerHTML = `<div class="none">No players found.</div>`;
      } else {
        roster.forEach(p=>{
          const card = document.createElement("div");
          card.className="player";
          card.innerHTML = `
            <div class="nick">${p.nickname || "—"}</div>
            <div class="game">${p.title?.name || ""}</div>
          `;
          host.appendChild(card);
        });
      }
    } catch (err) {
      const host = $(`.roster[data-team="${CSS.escape(teamName)}"]`, wrap);
      host.innerHTML = `<div class="none">Roster unavailable.</div>`;
    }
  }
}

/* -------------------------
   GraphQL (network)
------------------------- */
const GQL = {
  async call(query, variables = {}) {
    if (!STORE.endpoint) throw new Error("Missing GraphQL endpoint");
    const headers = {"Content-Type":"application/json"};
    if (STORE.apiKey) headers["Authorization"] = STORE.apiKey;
    const res = await fetch(STORE.endpoint, {
      method:"POST",
      headers,
      body: JSON.stringify({ query, variables })
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map(e=>e.message).join("; "));
    return json.data;
  },

  // allSeries within time window (UTC)
  async fetchLiveAndUpcoming(hours) {
    // Window: now .. now+hours
    const now = new Date();
    const end = new Date(now.getTime() + hours*3600*1000);
    const gte = now.toISOString();
    const lte = end.toISOString();

    const query = `
      query GetAllSeriesWindow($gte:String!,$lte:String!,$after:Cursor) {
        allSeries(
          filter:{ startTimeScheduled:{ gte:$gte, lte:$lte } }
          orderBy: StartTimeScheduled
          after: $after
          first: 40
        ){
          totalCount
          pageInfo{ hasPreviousPage hasNextPage startCursor endCursor }
          edges{
            cursor
            node{
              id
              startTimeScheduled
              title{ nameShortened }
              tournament{ nameShortened }
              format{ name nameShortened }
              teams{ baseInfo{ name } scoreAdvantage }
            }
          }
        }
      }`;
    const data = await this.call(query, { gte, lte, after: null });
    const list = (data?.allSeries?.edges||[]).map(e=>e.node);
    const nowMs = Date.now();
    const live = list.filter(s => new Date(s.startTimeScheduled).getTime() <= nowMs); // rough heuristic
    const upcoming = list.filter(s => new Date(s.startTimeScheduled).getTime() > nowMs);

    STORE.cursors = {
      startCursor: data?.allSeries?.pageInfo?.startCursor || null,
      endCursor: data?.allSeries?.pageInfo?.endCursor || null,
      hasNext: !!data?.allSeries?.pageInfo?.hasNextPage,
      hasPrev: !!data?.allSeries?.pageInfo?.hasPreviousPage,
    };
    return { live, upcoming };
  },

  async fetchSeriesState(seriesId){
    const q = `
      query GetSeriesState($id:ID!){
        seriesState(id:$id){
          valid updatedAt format started finished
          teams{ name won }
          games(filter:{ started:true, finished:false }){
            sequenceNumber
            teams{ name players{ name kills deaths netWorth money position{ x y } } }
          }
        }
      }`;
    const data = await this.call(q, { id: String(seriesId) });
    return data?.seriesState;
  },

  // Used to find ID for the roster call when we only have a name
  async searchTeamByName(name){
    const q = `
      query FindTeam($name:String!){
        teams(first:1, filter:{ name:{ equals:$name } }){
          edges{ node{ id name } }
        }
      }`;
    try{
      const data = await this.call(q, { name });
      return data?.teams?.edges?.[0]?.node || null;
    }catch{ return null; }
  },

  async fetchTeamRoster(teamId){
    const q = `
      query GetTeamRoster($id:ID!){
        players(filter:{ teamIdFilter:{ id:$id } }){
          edges{ node{ id nickname title{ name } } }
          pageInfo{ hasNextPage }
        }
      }`;
    const data = await this.call(q, { id: String(teamId) });
    return (data?.players?.edges||[]).map(e=>e.node);
  }
};

/* -------------------------
   Loaders
------------------------- */
async function loadWindowIntoUI() {
  try{
    const hours = Number(UI.windowSel.value);
    STORE.currentWindowHours = hours;
    const { live, upcoming } = await GQL.fetchLiveAndUpcoming(hours);
    renderSeriesList(UI.liveList, live, {live:true});
    renderSeriesList(UI.upcomingList, upcoming, {live:false});
    UTIL.setUpdated();
    UI.next.disabled = !STORE.cursors.hasNext;
    UI.prev.disabled = !STORE.cursors.hasPrev;
  }catch(err){
    console.error(err);
    UI.liveList.innerHTML = `<div class="card none">Error: ${err.message}</div>`;
    UI.upcomingList.innerHTML = "";
  }
}

/* -------------------------
   Pagination buttons (optional, wired to endCursor/startCursor if you later extend)
------------------------- */
UI.next.addEventListener("click", () => {
  // Implementation note:
  // This basic build fetches the first page for the time window.
  // If you want true cursor pagination, keep endCursor in STORE and
  // pass $after:endCursor on subsequent GQL.fetchLiveAndUpcoming calls.
  alert("For brevity, next/prev are stubs. If you want, I’ll wire them to use endCursor/startCursor next.");
});

/* -------------------------
   Tabs
------------------------- */
UI.tabs.forEach(t=>{
  t.addEventListener("click", ()=>{
    UI.tabs.forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    STORE.currentTab = t.dataset.tab;
    $$(".tab-pane").forEach(p=>p.classList.remove("active"));
    (STORE.currentTab === "live" ? UI.liveList : UI.upcomingList).classList.add("active");
  });
});

/* -------------------------
   JSON Paste mode
------------------------- */
UI.renderJsonBtn.addEventListener("click", ()=>{
  let json;
  try{
    json = JSON.parse(UI.jsonPaste.value || "{}");
  }catch(e){
    alert("Invalid JSON"); return;
  }
  // detect allSeries shape
  const series = json?.data?.allSeries?.edges?.map(e=>e.node) ?? [];
  if (series.length){
    const nowMs = Date.now();
    const live = series.filter(s => new Date(s.startTimeScheduled).getTime() <= nowMs);
    const upcoming = series.filter(s => new Date(s.startTimeScheduled).getTime() > nowMs);
    renderSeriesList(UI.liveList, live, {live:true});
    renderSeriesList(UI.upcomingList, upcoming, {live:false});
    UTIL.setUpdated();
    STORE.lastPayloadType = "json";
    return;
  }
  alert("Paste an allSeries payload.");
});

/* -------------------------
   Connection bar
------------------------- */
UI.saveConn.addEventListener("click", ()=>{
  STORE.endpoint = UI.gqlEndpoint.value.trim();
  STORE.apiKey = UI.gqlApiKey.value.trim();
  localStorage.setItem("gql:endpoint", STORE.endpoint);
  localStorage.setItem("gql:token", STORE.apiKey);
  loadWindowIntoUI();
});
UI.loadLive.addEventListener("click", ()=>{ STORE.currentTab="live"; loadWindowIntoUI(); });
UI.loadUpcoming.addEventListener("click", ()=>{ STORE.currentTab="upcoming"; loadWindowIntoUI(); });

/* -------------------------
   Boot
------------------------- */
(async function boot(){
  if (STORE.endpoint) {
    await loadWindowIntoUI();
  } else {
    UI.liveList.innerHTML = `<div class="card none">Set your GraphQL endpoint above, then click “Load Live”.</div>`;
  }
})();
