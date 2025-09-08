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

 // Smooth renderer: builds off-DOM and swaps in one go
function renderList(root, items, emptyText) {
  const frag = document.createDocumentFragment();

  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyText;
    frag.appendChild(empty);
  } else {
    for (const m of items) {
      frag.appendChild(renderCard(m)); // uses your existing card builder
    }
  }

  // fade while swapping, no hard clear
  root.classList.add("updating");
  requestAnimationFrame(() => {
    root.replaceChildren(frag);
    root.classList.remove("updating");
  });
}

let inFlightCtrl; // keep the latest request so we can cancel it

async function load() {
  // cancel any previous in-flight refresh to avoid races/flicker
  if (inFlightCtrl) inFlightCtrl.abort();
  const ctrl = new AbortController();
  inFlightCtrl = ctrl;

  try {
    const [liveRes, upRes] = await Promise.all([
      fetch(`${API_BASE}/live`, { cache: "no-store", signal: ctrl.signal }).then(r => r.json()),
      fetch(
        `${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`,
        { cache: "no-store", signal: ctrl.signal }
      ).then(r => r.json())
    ]);

    // If this request was aborted because a newer one started, do nothing
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
    // If we aborted on purpose for a newer refresh, ignore the error
    if (ctrl.signal.aborted) return;
    console.error(e);
    // keep the previous content; optionally show a small toast instead
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
