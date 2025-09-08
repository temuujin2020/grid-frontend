let inFlightCtrl;
let pauseUntil = 0; // epoch ms while we back off politely

async function safeFetchJson(url, signal) {
  const r = await fetch(url, { cache: "no-store", signal });
  // 200 OK with { ok:false, error: ... } is how the proxy surfaces upstream issues
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body?.error?.includes("ENHANCE_YOUR_CALM")) {
    // back off for ~60s
    pauseUntil = Date.now() + 60_000;
    throw new Error("rate-limited");
  }
  return body;
}

async function load() {
  // honor backoff window
  if (Date.now() < pauseUntil) return;

  if (inFlightCtrl) inFlightCtrl.abort();
  const ctrl = new AbortController();
  inFlightCtrl = ctrl;

  try {
    // SEQUENTIAL: avoid two concurrent upstream calls per tick
    const liveRes = await safeFetchJson(`${API_BASE}/live`, ctrl.signal);
    const upRes   = await safeFetchJson(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`, ctrl.signal);

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
    // If we hit rate-limit, we already set pauseUntil; show a tiny note in the timestamp
    setLastUpdated("rate-limited, retrying soon");
    // Keep previous DOM; do nothing else
  }
}

// enforce a floor & add 0–500ms jitter so tabs don’t synchronize
refreshMs = Math.max(8000, refreshMs);
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
