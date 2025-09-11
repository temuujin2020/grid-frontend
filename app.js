/* Esports Data Preview — paste JSON, auto-detect type, render UI
   Works with:
   - data.allSeries
   - data.organizations / data.organization
   - data.teams / data.team
   - data.players (and team roster result)
   - data.seriesState
   - data.teamStatistics / data.playerStatistics
*/

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const jsonInputEl = $("#jsonInput");
const parseStatusEl = $("#parseStatus");
const detectedTypeEl = $("#detectedType");
const detectedHintEl = $("#detectedHint");

// Pagination tools
const toolsWrap = $("#paginationTools");
const hasNextEl = $("#hasNext");
const hasPrevEl = $("#hasPrev");
const startCursorEl = $("#startCursor");
const endCursorEl = $("#endCursor");
const nextQueryEl = $("#nextQuery");

// Render targets
const secAllSeries = $("#renderAllSeries");
const seriesRowsEl = $("#seriesRows");
const seriesSummaryEl = $("#seriesSummary");

const secOrgs = $("#renderOrganizations");
const orgCardsEl = $("#orgCards");

const secTeams = $("#renderTeams");
const teamCardsEl = $("#teamCards");
const teamsMetaEl = $("#teamsMeta");

const secPlayers = $("#renderPlayers");
const playerCardsEl = $("#playerCards");

const secSeriesState = $("#renderSeriesState");
const liveHeaderEl = $("#liveHeader");
const liveTeamsEl = $("#liveTeams");
const liveGamesEl = $("#liveGames");

const secStats = $("#renderTeamStats");
const statsCardsEl = $("#statsCards");

// Sample loaders
$("#btnSampleSeries")?.addEventListener("click", () => {
  jsonInputEl.value = SAMPLE_ALL_SERIES_JSON;
  parseStatusEl.textContent = "Loaded sample series JSON.";
});

$("#btnSampleTeamStats")?.addEventListener("click", () => {
  jsonInputEl.value = SAMPLE_TEAM_STATS_JSON;
  parseStatusEl.textContent = "Loaded sample team statistics JSON.";
});

$("#btnRender")?.addEventListener("click", () => {
  safeRender();
});

function safeRender() {
  // reset sections
  [secAllSeries, secOrgs, secTeams, secPlayers, secSeriesState, secStats, toolsWrap]
    .forEach(sec => sec.classList.add("hidden"));
  seriesRowsEl.innerHTML = "";
  orgCardsEl.innerHTML = "";
  teamCardsEl.innerHTML = "";
  playerCardsEl.innerHTML = "";
  liveHeaderEl.textContent = "";
  liveTeamsEl.innerHTML = "";
  liveGamesEl.innerHTML = "";
  statsCardsEl.innerHTML = "";
  detectedTypeEl.textContent = "—";

  let obj;
  try {
    obj = JSON.parse(jsonInputEl.value);
  } catch (e) {
    parseStatusEl.textContent = "JSON parse error: " + e.message;
    parseStatusEl.style.color = "var(--danger)";
    return;
  }
  parseStatusEl.textContent = "Parsed OK";
  parseStatusEl.style.color = "var(--muted)";

  detectAndRender(obj);
}

function detectAndRender(payload) {
  const d = payload?.data || payload; // tolerate top-level data
  let detected = "Unknown";
  let hint = "";
  let pageInfo = null;

  // 1) Series (matches)
  if (d?.allSeries?.edges?.length) {
    detected = "allSeries";
    renderAllSeries(d.allSeries);
    pageInfo = d.allSeries.pageInfo ?? null;
  }
  // 2) Org(s)
  else if (d?.organizations?.edges?.length || d?.organization) {
    detected = d?.organization ? "organization (single)" : "organizations";
    renderOrganizations(d.organizations?.edges, d.organization);
  }
  // 3) Team(s)
  else if (d?.teams?.edges?.length || d?.team) {
    detected = d?.team ? "team (single)" : "teams";
    renderTeams(d.teams?.edges, d.teams?.totalCount, d.teams?.pageInfo, d.team);
    pageInfo = d.teams?.pageInfo ?? null;
  }
  // 4) Players / roster-like
  else if (d?.players?.edges?.length) {
    detected = "players (list/roster)";
    renderPlayers(d.players.edges);
    pageInfo = d.players?.pageInfo ?? null;
  }
  // 5) Live series state
  else if (d?.seriesState) {
    detected = "seriesState (live)";
    renderSeriesState(d.seriesState);
  }
  // 6) Team / Player statistics aggregation
  else if (d?.teamStatistics || d?.playerStatistics) {
    detected = d?.teamStatistics ? "teamStatistics" : "playerStatistics";
    renderStats(d.teamStatistics || d.playerStatistics);
  }

  // Fill top detector UI
  detectedTypeEl.textContent = detected;
  detectedHintEl.textContent = hint || detectedHintEl.textContent;

  // Pagination tools
  if (pageInfo) {
    toolsWrap.classList.remove("hidden");
    hasNextEl.textContent = String(!!pageInfo.hasNextPage);
    hasPrevEl.textContent = String(!!pageInfo.hasPreviousPage);
    startCursorEl.textContent = pageInfo.startCursor ?? "—";
    endCursorEl.textContent = pageInfo.endCursor ?? "—";
    nextQueryEl.textContent = buildNextQueryTemplate(detected, pageInfo.endCursor);
  } else {
    toolsWrap.classList.add("hidden");
  }
}

/* ---------- Renderers ---------- */

function renderAllSeries(node) {
  secAllSeries.classList.remove("hidden");
  const total = node.totalCount ?? node.edges.length;
  seriesSummaryEl.textContent = `Total in window: ${total} • Showing ${node.edges.length}`;

  const frag = document.createDocumentFragment();
  node.edges.forEach(({ node: n }) => {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div class="cell">${fmtUTC(n.startTimeScheduled)}</div>
      <div class="cell">${safe(n.title?.nameShortened)}</div>
      <div class="cell">${safe(n.tournament?.nameShortened || n.tournament?.name || "—")}</div>
      <div class="cell"><span class="badge">${safe(n.format?.nameShortened || n.format?.name || "—")}</span></div>
      <div class="cell">
        ${renderTeamChipsInline(n.teams)}
      </div>
    `;
    frag.appendChild(row);
  });
  seriesRowsEl.appendChild(frag);
}

function renderOrganizations(edges, single) {
  secOrgs.classList.remove("hidden");
  const items = single ? [{ node: single }] : edges || [];
  if (!items.length) {
    orgCardsEl.innerHTML = `<div class="muted">No organizations.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach(({ node }) => {
    const teams = (node.teams || []).map(t => t?.name).filter(Boolean);
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="label">Organization</div>
      <div class="value">${safe(node.name)} <span class="badge mono">#${node.id}</span></div>
      <div class="label" style="margin-top:8px;">Teams (${teams.length})</div>
      <div class="value small">${teams.length ? teams.join(", ") : "—"}</div>
    `;
    frag.appendChild(el);
  });
  orgCardsEl.appendChild(frag);
}

function renderTeams(edges, totalCount, pageInfo, single) {
  secTeams.classList.remove("hidden");
  if (single) {
    teamsMetaEl.textContent = `Single team`;
    edges = [{ node: single }];
  } else {
    teamsMetaEl.textContent = `Total: ${totalCount ?? edges.length} • Showing: ${edges.length}`;
  }
  const frag = document.createDocumentFragment();
  edges.forEach(({ node }) => {
    const { id, name, colorPrimary, colorSecondary, logoUrl } = node;
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div style="display:flex; gap:12px; align-items:center;">
        <img src="${safe(logoUrl)}" alt="" width="36" height="36" style="border-radius:8px; border:1px solid var(--border); background:#0b142a;" onerror="this.style.display='none'"/>
        <div>
          <div class="value">${safe(name)}</div>
          <div class="muted mono">#${id}</div>
        </div>
        <div style="margin-left:auto; display:flex; gap:8px;">
          <span class="teamchip"><span class="teamcolors" style="background:${safe(colorPrimary)}"></span> ${safe(colorPrimary)}</span>
          <span class="teamchip"><span class="teamcolors" style="background:${safe(colorSecondary)}"></span> ${safe(colorSecondary)}</span>
        </div>
      </div>
    `;
    frag.appendChild(el);
  });
  teamCardsEl.appendChild(frag);
}

function renderPlayers(edges) {
  secPlayers.classList.remove("hidden");
  const frag = document.createDocumentFragment();
  edges.forEach(({ node }) => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="value">${safe(node.nickname || node.name || "Unknown")}</div>
      <div class="muted">Title: ${safe(node.title?.name || "—")}</div>
      <div class="mono muted">ID: ${safe(node.id)}</div>
    `;
    frag.appendChild(el);
  });
  playerCardsEl.appendChild(frag);
}

function renderSeriesState(state) {
  secSeriesState.classList.remove("hidden");
  liveHeaderEl.textContent = `Valid: ${state.valid} • Started: ${state.started} • Finished: ${state.finished} • Format: ${state.format} • Updated: ${fmtUTC(state.updatedAt)}`;

  const teamFrag = document.createDocumentFragment();
  (state.teams || []).forEach(t => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="value">${safe(t.name)}</div>
      <div class="muted">Won series: ${t.won ? "Yes" : "No"}</div>
    `;
    teamFrag.appendChild(el);
  });
  liveTeamsEl.appendChild(teamFrag);

  if (!state.games?.length) {
    liveGamesEl.innerHTML = `<div class="muted" style="margin-top:8px;">No live games reported (empty array).</div>`;
    return;
  }

  const gamesFrag = document.createDocumentFragment();
  state.games.forEach(g => {
    const wrap = document.createElement("div");
    wrap.className = "card";
    const teamsHtml = (g.teams || []).map(tm => {
      const players = (tm.players || []).map(p => {
        return `<li class="mono small">${safe(p.name)} — K:${p.kills} D:${p.deaths} Net:${p.netWorth} $:${p.money} (${p.position?.x ?? "-"}, ${p.position?.y ?? "-"})</li>`;
      }).join("");
      return `
        <div>
          <div class="value">${safe(tm.name)}</div>
          <ul>${players}</ul>
        </div>
      `;
    }).join("");
    wrap.innerHTML = `
      <div class="label">Game</div>
      <div class="value">Sequence #${g.sequenceNumber}</div>
      <div style="margin-top:8px">${teamsHtml}</div>
    `;
    gamesFrag.appendChild(wrap);
  });
  liveGamesEl.appendChild(gamesFrag);
}

function renderStats(node) {
  secStats.classList.remove("hidden");
  // The object can be teamStatistics OR playerStatistics with same shape
  statsCardsEl.appendChild(buildStatsCard(node));
}

function buildStatsCard(s) {
  const wrap = document.createElement("div");
  wrap.className = "card";

  const win = summarizeWins(s?.game?.wins);
  const rounds = (s?.segment || []).find(seg => seg.type === 'round');

  wrap.innerHTML = `
    <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
      <div>
        <div class="label">Entity ID</div>
        <div class="value">#${safe(s?.id) ?? "—"}</div>
      </div>
      <div class="badge">Record: ${win.wins}-${win.losses} • ${win.winrate}%</div>
    </div>

    <div class="grid grid-2" style="margin-top:12px;">
      <div class="stat">
        <div class="label">Series Played</div>
        <div class="value">${s?.series?.count ?? 0}</div>
      </div>
      <div class="stat">
        <div class="label">Games Played</div>
        <div class="value">${s?.game?.count ?? 0}</div>
      </div>
      <div class="stat">
        <div class="label">Kills / series (avg)</div>
        <div class="value">${fmtNum(s?.series?.kills?.avg)}</div>
      </div>
      <div class="stat">
        <div class="label">Kills (min–max)</div>
        <div class="value">${safe(s?.series?.kills?.min ?? 0)}–${safe(s?.series?.kills?.max ?? 0)}</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:12px;">
      <div class="stat">
        <div class="label">Rounds (last window)</div>
        <div class="value">${safe(rounds?.count ?? 0)}</div>
      </div>
      <div class="stat">
        <div class="label">Deaths / round</div>
        <div class="value">${fmtNum(rounds?.deaths?.avg)}</div>
      </div>
    </div>
  `;
  return wrap;
}

/* ---------- Helpers ---------- */

function renderTeamChipsInline(teams) {
  if (!Array.isArray(teams) || teams.length === 0) return "—";
  return teams.map(t => {
    const n = safe(t?.baseInfo?.name || "—");
    const c1 = safe(t?.baseInfo?.colorPrimary || "#334155");
    const c2 = safe(t?.baseInfo?.colorSecondary || "#0ea5e9");
    return `<span class="teamchip"><span class="teamcolors" style="background:${c1}"></span><span class="teamcolors" style="background:${c2}"></span> ${n}</span>`;
  }).join(" ");
}

function summarizeWins(winsArray) {
  const win = winsArray?.find(w => w.value === true) || { count: 0, percentage: 0, streak: { current: 0, min: 0, max: 0 } };
  const loss = winsArray?.find(w => w.value === false) || { count: 0 };
  return {
    wins: win.count,
    losses: loss.count,
    winrate: win.percentage ?? 0,
    currentStreak: win.streak?.current ?? 0,
    maxWinStreak: win.streak?.max ?? 0
  };
}

function buildNextQueryTemplate(kind, endCursor) {
  const cursor = endCursor ? endCursor.replace(/"/g, '\\"') : "";
  switch (kind) {
    case "allSeries":
      return `query GetAllSeriesInNext24Hours($after: Cursor) {
  allSeries(
    filter:{
      startTimeScheduled:{
        gte: "2024-04-24T15:00:07+02:00"
        lte: "2024-04-25T15:00:07+02:00"
      }
    }
    orderBy: StartTimeScheduled
    after: $after
  ) {
    totalCount
    pageInfo { hasPreviousPage hasNextPage startCursor endCursor }
    edges { cursor node { id title { nameShortened } tournament { nameShortened } startTimeScheduled format { nameShortened } teams { baseInfo { name } } } }
  }
}
# Variables:
{ "after": "${cursor}" }`;
    case "teams":
      return `query GetTeams($after: Cursor) {
  teams(first: 5, after: $after) {
    totalCount
    pageInfo { hasPreviousPage hasNextPage startCursor endCursor }
    edges { cursor node { id name colorPrimary colorSecondary logoUrl } }
  }
}
# Variables:
{ "after": "${cursor}" }`;
    default:
      return `// Pagination template not available for "${kind}".`;
  }
}

function fmtUTC(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toISOString().replace(".000Z","Z");
  } catch { return iso; }
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "0";
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v.toFixed(3).replace(/\.?0+$/,"") : "0";
}

function safe(v) {
  if (v == null) return "";
  return String(v);
}

/* ---------- Samples (from your messages) ---------- */

const SAMPLE_ALL_SERIES_JSON = `{
  "data": {
    "allSeries": {
      "totalCount": 20,
      "pageInfo": {
        "hasPreviousPage": false,
        "hasNextPage": true,
        "startCursor": "JAMWBQMj...",
        "endCursor": "JAMWBQMj..."
      },
      "edges": [
        {
          "node": {
            "id": "2658003",
            "title": { "nameShortened": "cs2" },
            "tournament": { "nameShortened": "YaLLa Compass Spring" },
            "startTimeScheduled": "2024-04-24T13:45:00Z",
            "format": { "name": "best-of-3", "nameShortened": "Bo3" },
            "teams": [
              { "baseInfo": { "name": "Passion UA" } },
              { "baseInfo": { "name": "Permitta" } }
            ]
          }
        }
      ]
    }
  }
}`;

const SAMPLE_TEAM_STATS_JSON = `{
  "data": {
    "teamStatistics": {
      "id": "83",
      "aggregationSeriesIds": ["2819031","2819028","2819025"],
      "series": { "count": 9, "kills": { "sum": 2096, "min": 156, "max": 276, "avg": 232.88888888888889 } },
      "game": {
        "count": 25,
        "wins": [
          { "value": false, "count": 8, "percentage": 32, "streak": { "min": 1, "max": 2, "current": 0 } },
          { "value": true, "count": 17, "percentage": 68, "streak": { "min": 1, "max": 4, "current": 1 } }
        ]
      },
      "segment": [{ "type": "round", "count": 566, "deaths": { "sum": 1905, "min": 0, "max": 5, "avg": 3.3657243816254416 } }]
    }
  }
}`;
