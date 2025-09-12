// app.js — teams + scores + jitter + logos
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
  const API_BASE = ROOT.dataset.api || "https://api.grid.gg/graphql";
  const urlParams = new URLSearchParams(location.search);

  let refreshMs = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 15000);
  const TEAM_PIN = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UPCOMING = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  if (REFRESH_SELECT) {
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

  // ---- Normalizer ----
  function pullTeamFields(team) {
    if (!team) return {};
    const base = team.baseInfo || team; // API sometimes nests under baseInfo
    return {
      name: base?.name || "",
      logoUrl: base?.logoUrl || base?.logo || "",
      colorPrimary: base?.colorPrimary || "",
      colorSecondary: base?.colorSecondary || "",
      scoreAdvantage: team?.scoreAdvantage || 0
    };
  }

  function normalize(items, isLive) {
    return (items || []).map(it => {
      const tA = pullTeamFields(it.teams?.[0]);
      const tB = pullTeamFields(it.teams?.[1]);

      const bestOf = it.format?.nameShortened?.replace(/\D/g, "") || // "Bo3" -> "3"
                    it.format?.name?.replace(/\D/g, "") || 
                    3;

      const when = it.startTimeScheduled || it.time || it.startTime || "";
      const eventName = it.tournament?.nameShortened || it.tournament?.name || it.event?.name || it.tournamentName || "";
      const gameTitle = it.title?.nameShortened || "";

      // For now, we don't have live scores in this API structure
      // but we can show score advantages
      let sA, sB;
      if (isLive) {
        sA = tA.scoreAdvantage || 0;
        sB = tB.scoreAdvantage || 0;
      }

      return {
        id: String(it.id ?? ""),
        teams: [tA, tB],
        event: eventName,
        gameTitle: gameTitle,
        tournamentLogo: it.tournament?.logoUrl || "",
        format: bestOf,
        time: when,
        scoreA: sA,
        scoreB: sB,
        live: !!isLive
      };
    }).filter(x => x.id && x.time);
  }

  // ---- Renderer helpers ----
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initials(name) {
    const n = (name || "").trim();
    if (!n) return "?";
    const parts = n.split(/\s+/);
    const first = parts[0]?.[0] || "";
    const last  = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  function teamBlock(team, side) {
    const nm = escapeHtml(team?.name || "TBD");
    const badge = `<span class="team-badge" aria-hidden="true">${initials(nm)}</span>`;
    let img = "";

    const colorAttr = team?.colorPrimary ? ` data-color="${escapeHtml(team.colorPrimary)}"` : "";

    if (team?.logoUrl) {
      const safe = String(team.logoUrl);
      img = `<img class="team-logo" loading="lazy" src="${safe}"
                 alt="${nm} logo"
                 onerror="this.replaceWith(document.createElement('span')); this.previousSibling?.classList?.add('team-badge');">`;
    }

    // Show image if present, otherwise badge with initials
    const media = team?.logoUrl ? img : badge;

    return `
      <div class="team ${side}"${colorAttr}>
        ${media}
        <span class="team-name">${nm}</span>
      </div>
    `;
  }

  // ---- Renderer ----
  function renderCard(m) {
    const left  = teamBlock(m.teams?.[0], "left");
    const right = teamBlock(m.teams?.[1], "right");

    const t = new Date(m.time);
    const when = isNaN(t) ? "" : t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const scoreHtml = (m.live && m.scoreA != null && m.scoreB != null)
      ? `<div class="score">${m.scoreA}&nbsp;–&nbsp;${m.scoreB}</div>`
      : "";

    const livePill = m.live ? `<span class="pill live-dot">LIVE</span>` : "";
    const gamePill = m.gameTitle ? `<span class="pill game-pill">${escapeHtml(m.gameTitle.toUpperCase())}</span>` : "";

    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");
    card.innerHTML = `
      <div class="card-top">
        <div class="card-top-left">
          ${gamePill}
          <span class="pill">BO${escapeHtml(m.format || "3")}</span>
        </div>
        <div class="card-top-right">
          ${livePill}
          <span class="time">${escapeHtml(when)}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="teams">
          ${left}
          <div class="vs">vs</div>
          ${right}
        </div>
        ${scoreHtml}
        <div class="event">
          ${m.tournamentLogo ? `<img class="tournament-logo" src="${m.tournamentLogo}" alt="" onerror="this.style.display='none'">` : ""}
          <span>${escapeHtml(m.event || "")}</span>
        </div>
      </div>
    `;
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

  // ---- GraphQL Queries ----
  const GRAPHQL_QUERY = `
    query GetSeries($first: Int, $after: String) {
      allSeries(first: $first, after: $after) {
        totalCount
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        edges {
          cursor
          node {
            id
            title {
              nameShortened
            }
            tournament {
              id
              name
              nameShortened
              logoUrl
            }
            startTimeScheduled
            format {
              name
              nameShortened
            }
            teams {
              baseInfo {
                name
                logoUrl
                colorPrimary
                colorSecondary
              }
              scoreAdvantage
            }
          }
        }
      }
    }
  `;

  // ---- Loader ----
  let inFlightCtrl;
  async function load() {
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: GRAPHQL_QUERY,
          variables: {
            first: 50, // Get more matches at once
            after: null
          }
        }),
        cache: "no-store",
        signal: ctrl.signal
      });

      if (ctrl.signal.aborted) return;

      const result = await response.json();
      
      if (result.errors) {
        console.error("GraphQL errors:", result.errors);
        setLastUpdated("error");
        return;
      }

      const allMatches = result.data.allSeries.edges.map(edge => edge.node);
      
      // Separate live and upcoming matches
      const now = new Date();
      const live = [];
      const upcoming = [];
      
      allMatches.forEach(match => {
        const matchTime = new Date(match.startTimeScheduled);
        const timeDiff = matchTime - now;
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        
        if (hoursDiff <= 0 && hoursDiff >= -4) { // Live if started within last 4 hours
          live.push(match);
        } else if (hoursDiff > 0 && hoursDiff <= UPCOMING_HOURS) { // Upcoming within specified hours
          upcoming.push(match);
        }
      });

      let liveNormalized = normalize(live, true);
      let upcomingNormalized = normalize(upcoming, false);

      // Sort
      liveNormalized.sort((a, b) => new Date(a.time) - new Date(b.time));
      upcomingNormalized.sort((a, b) => new Date(a.time) - new Date(b.time));

      if (LIMIT_LIVE > 0) liveNormalized = liveNormalized.slice(0, LIMIT_LIVE);
      if (LIMIT_UPCOMING > 0) upcomingNormalized = upcomingNormalized.slice(0, LIMIT_UPCOMING);

      renderList(LIST_LIVE, liveNormalized, "No live matches right now.");
      renderList(LIST_UPCOMING, upcomingNormalized, "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error("[load] error:", err);
      setLastUpdated("error");
    }
  }

  // ---- Scheduler ----
  function nextInterval() {
    const floor = 8000;
    const jitter = Math.floor(Math.random() * 500);
    return Math.max(floor, refreshMs) + jitter;
  }

  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load();
    timer = setTimeout(schedule, nextInterval());
  }

  // ---- Start ----
  schedule();
})();
