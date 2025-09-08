(async function () {
  const ROOT = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const LIST_LIVE = document.getElementById("listLive");
  const LIST_UP   = document.getElementById("listUpcoming");
  const LAST      = document.getElementById("lastUpdated");
  const REFRESH_SELECT = document.getElementById("refreshSelect");
  const TEAM_BADGE = document.getElementById("teamBadge");
  const UP_HOURS_SPAN = document.getElementById("upHoursSpan");

  const API_BASE = "https://grid-proxy.onrender.com/api/series";
  const urlParams = new URLSearchParams(location.search);

  let refreshMs = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 8000);
  const TEAM_PIN = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UP = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);
  UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  REFRESH_SELECT.value = String(refreshMs);
  REFRESH_SELECT.addEventListener("change", () => {
    refreshMs = Number(REFRESH_SELECT.value);
    schedule();
  });
  if (TEAM_PIN) {
    TEAM_BADGE.hidden = false;
    TEAM_BADGE.textContent = `Pinned: ${TEAM_PIN}`;
  }

  function setLastUpdated(note) {
    const noteStr = note ? ` (${note})` : "";
    LAST.textContent = "Last updated: " + new Date().toLocaleTimeString() + noteStr;
  }

  function renderList(container, matches, emptyMsg) {
    container.innerHTML = "";
    if (!matches.length) {
      container.innerHTML = `<div class="empty">${emptyMsg}</div>`;
      return;
    }
    for (const m of matches) {
      const a = document.createElement("a");
      a.className = "card" + (m.live ? " live" : "");
      a.href = `https://grid.gg/series/${encodeURIComponent(m.id)}`;
      a.target = "_blank";
      a.rel = "noopener";

      const left = document.createElement("div");
      const right = document.createElement("div");

      left.innerHTML = `
        <div class="row event">${m.event || "—"} ${m.format ? "• BO" + m.format : ""}</div>
        <div class="row">
          <div class="team">${m.teams?.[0] || "TBD"}</div>
          <div class="score">${m.scores?.[0] ?? ""}</div>
        </div>
        <div class="row">
          <div class="team">${m.teams?.[1] || "TBD"}</div>
          <div class="score">${m.scores?.[1] ?? ""}</div>
        </div>
      `;
      right.innerHTML = `<div class="status">${m.live ? "LIVE" : (m.localTime || "")}</div>`;

      a.appendChild(left);
      a.appendChild(right);
      container.appendChild(a);
    }
  }

  function normalize(items, liveFlag = false) {
    const out = [];
    for (const it of items) {
      const localTime = it.time ? new Date(it.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      out.push({
        id: it.id,
        event: it.event,
        format: it.format,
        teams: it.teams,
        scores: it.scores || ["", ""],
        live: !!liveFlag,
        time: it.time,
        localTime
      });
    }
    return out;
  }

  async function load() {
    try {
      const [liveRes, upRes] = await Promise.all([
        fetch(`${API_BASE}/live`, { cache: "no-store" }).then(r => r.json()),
        fetch(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`, { cache: "no-store" }).then(r => r.json())
      ]);

      let live = normalize(liveRes.items || [], true);
      let upcoming = normalize(upRes.items || [], false);

      if (TEAM_PIN) {
        const pin = TEAM_PIN;
        const score = (a,b) => {
          const ap = (a.teams.join(" ").toLowerCase().includes(pin)) ? 1 : 0;
          const bp = (b.teams.join(" ").toLowerCase().includes(pin)) ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return (new Date(a.time) - new Date(b.time));
        };
        live.sort(score);
        upcoming.sort((a,b) => new Date(a.time) - new Date(b.time));
      } else {
        live.sort((a,b) => new Date(a.time) - new Date(b.time));
        upcoming.sort((a,b) => new Date(a.time) - new Date(b.time));
      }

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UP > 0) upcoming = upcoming.slice(0, LIMIT_UP);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UP, upcoming, "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (e) {
      console.error(e);
      LIST_LIVE.innerHTML = '<div class="empty">Couldn’t load matches.</div>';
      LIST_UP.innerHTML = '<div class="empty">Couldn’t load matches.</div>';
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
