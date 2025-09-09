// app.js — grid-frontend (Safari-safe)
// - No AbortSignal.any()
// - Jittered refresh to avoid sync thundering herd
// - Event name on the LEFT, badges (BOx, LIVE, time) on the RIGHT
// - Team logos (if present) + fallbacks
// - Gentle skeleton on first paint; no flicker on subsequent renders

(function () {
  // ---- DOM ----
  const ROOT          = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const LIST_LIVE     = document.getElementById("listLive");
  const LIST_UP       = document.getElementById("listUpcoming");
  const LAST          = document.getElementById("lastUpdated");
  const REFRESH_SELECT= document.getElementById("refreshSelect");
  const TEAM_BADGE    = document.getElementById("teamBadge");
  const UP_HOURS_SPAN = document.getElementById("upHoursSpan");

  // ---- Config via DOM/data-* or URL ----
  const API_BASE = (ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series").replace(/\/$/, "");
  const urlParams = new URLSearchParams(location.search);

  let refreshMs         = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 15000);
  const TEAM_PIN        = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE      = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UPCOMING  = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS  = Number(urlParams.get("hoursUpcoming") || 24);

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  if (REFRESH_SELECT) {
    // keep dropdown & schedule in sync
    if ([5000,8000,15000,30000].includes(refreshMs)) {
      REFRESH_SELECT.value = String(refreshMs);
    }
    REFRESH_SELECT.addEventListener("change", () => {
      refreshMs = Number(REFRESH_SELECT.value || 15000);
      schedule(); // reschedule with new cadence
    });
  }

  if (TEAM_PIN && TEAM_BADGE) {
    TEAM_BADGE.hidden = false;
    TEAM_BADGE.textContent = `Pinned: ${TEAM_PIN}`;
  }

  // ---- Small helpers ----
  function setLastUpdated(note) {
    const noteStr = note ? ` (${note})` : "";
    LAST && (LAST.textContent = "Last updated: " + new Date().toLocaleTimeString() + noteStr);
  }

  function pad2(n){ return n < 10 ? "0"+n : ""+n; }
  function fmtTime(ts) {
    try {
      const d = new Date(ts);
      if (isNaN(+d)) return "";
      return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    } catch { return ""; }
  }

  function escapeHtml(s=""){
    return String(s)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  // ---- Safari-safe fetch with timeout and optional outer abort mirroring ----
  async function fetchJSONWithTimeout(url, { timeout = 12000, signal: outerSignal } = {}) {
    const ctrl = new AbortController();

    // Mirror caller's signal (if provided)
    if (outerSignal) {
      if (outerSignal.aborted) {
        ctrl.abort(outerSignal.reason);
      } else {
        const onAbort = () => ctrl.abort(outerSignal.reason);
        outerSignal.addEventListener("abort", onAbort, { once: true });
        ctrl.signal.addEventListener("abort", () => {
          outerSignal.removeEventListener("abort", onAbort);
        }, { once: true });
      }
    }

    const t = setTimeout(() => ctrl.abort(new DOMException("Timeout","AbortError")), timeout);

    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // ---- Data normalizer (works with proxy shapes we’ve seen) ----
  function normTeamEntry(t) {
    // team may be Team, TeamRelation, or TeamParticipant.baseInfo
    if (!t) return { name: "", logo: "", short: "" };
    const base = t.baseInfo || t;
    return {
      name: base.name || base.nameShortened || "",
      short: base.nameShortened || "",
      logo: base.logoUrl || ""
    };
  }

  function normalize(items = [], isLive) {
    return items.map(it => {
      // format (BOx)
      let bo = "";
      if (it.format && (it.format.nameShortened || it.format.name)) {
        bo = String(it.format.nameShortened || it.format.name);
      } else if (it.format) {
        bo = String(it.format);
      }

      // event/tournament name
      const eventName = (it.tournament && (it.tournament.nameShortened || it.tournament.name))
                      || (it.event && it.event.name)
                      || "";

      // time (scheduled or provided)
      const when = it.startTimeScheduled || it.time || "";

      // teams (array)
      let teams = [];
      if (Array.isArray(it.teams)) {
        teams = it.teams.map(normTeamEntry);
      } else if (it.teamA || it.teamB) {
        teams = [normTeamEntry(it.teamA), normTeamEntry(it.teamB)];
      }

      // some feeds include “players”, ignore here
      return {
        id: String(it.id || ""),
        event: eventName,
        bo,
        time: when,
        live: !!isLive,
        teams
      };
    }).filter(x => x.id && x.time);
  }

  // ---- Card renderer ----
  function renderCard(m) {
    const hasPin = TEAM_PIN && m.teams.some(t => (t.name || t.short).toLowerCase().includes(TEAM_PIN));
    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "") + (hasPin ? " pinned" : "");

    // Header: event left, badges right
    const header = document.createElement("div");
    header.className = "card-h";
    const left = document.createElement("div");
    left.className = "event";
    left.textContent = m.event || "—";

    const right = document.createElement("div");
    right.className = "badges";
    const bo = document.createElement("span");
    bo.className = "pill";
    bo.textContent = m.bo ? m.bo : "BO?";
    right.appendChild(bo);

    if (m.live) {
      const live = document.createElement("span");
      live.className = "pill live-dot";
      live.textContent = "LIVE";
      right.appendChild(live);
    }

    const time = document.createElement("span");
    time.className = "pill";
    time.textContent = fmtTime(m.time) || "—";
    right.appendChild(time);

    header.appendChild(left);
    header.appendChild(right);

    // Body: two rows with logo + team name
    const body = document.createElement("div");
    body.className = "card-b";

    for (let i = 0; i < 2; i++) {
      const t = m.teams[i] || { name: "TBD", logo: "" };
      const row = document.createElement("div");
      row.className = "team-row";

      const logo = document.createElement("div");
      logo.className = "logo";
      if (t.logo) {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.src = t.logo;
        img.alt = (t.name || "logo");
        // in case of broken logo
        img.onerror = () => { logo.classList.add("logo-fallback"); logo.textContent = ""; };
        logo.appendChild(img);
      } else {
        logo.classList.add("logo-fallback");
      }

      const name = document.createElement("div");
      name.className = "team";
      name.textContent = t.name || "TBD";

      row.appendChild(logo);
      row.appendChild(name);
      body.appendChild(row);
    }

    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  // ---- List renderer (build off-DOM, then swap; adds mild “updating” fade) ----
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

  // ---- First paint skeleton (only once) ----
  function paintSkeleton() {
    // minimal placeholders
    const mk = () => {
      const s = document.createElement("div");
      s.className = "card skeleton";
      s.innerHTML = `
        <div class="card-h"><div class="event sk"></div><div class="badges"><span class="pill sk"></span><span class="pill sk"></span></div></div>
        <div class="card-b"><div class="team-row"><div class="logo sk"></div><div class="team sk"></div></div><div class="team-row"><div class="logo sk"></div><div class="team sk"></div></div></div>
      `;
      return s;
    };
    const frag1 = document.createDocumentFragment();
    const frag2 = document.createDocumentFragment();
    for (let i=0;i<6;i++) frag1.appendChild(mk());
    for (let i=0;i<6;i++) frag2.appendChild(mk());
    LIST_LIVE && LIST_LIVE.replaceChildren(frag1);
    LIST_UP && LIST_UP.replaceChildren(frag2);
  }

  let firstPaintDone = false;
  let inFlightCtrl;

  // ---- Core loader ----
  async function load() {
    // cancel previous tick if still running
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      if (!firstPaintDone) paintSkeleton();

      const [liveRes, upRes] = await Promise.all([
        fetchJSONWithTimeout(`${API_BASE}/live`, { timeout: 15000, signal: ctrl.signal }),
        fetchJSONWithTimeout(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`, { timeout: 15000, signal: ctrl.signal })
      ]);

      // Some proxies return { ok:false, error:"..." }
      if (liveRes && liveRes.ok === false) {
        const msg = tryParseErrorNote(liveRes.error);
        setLastUpdated(msg || "error");
        return;
      }
      if (upRes && upRes.ok === false) {
        const msg = tryParseErrorNote(upRes.error);
        setLastUpdated(msg || "error");
        return;
      }

      let live = normalize((liveRes && liveRes.items) || [], true);
      let upcoming = normalize((upRes && upRes.items) || [], false);

      // Pin weighting (pinned live items first)
      if (TEAM_PIN) {
        const has = (t) => (t.name || t.short).toLowerCase().includes(TEAM_PIN);
        const score = (a, b) => {
          const ap = a.teams.some(has) ? 1 : 0;
          const bp = b.teams.some(has) ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return new Date(a.time) - new Date(b.time);
        };
        live.sort(score);
      } else {
        live.sort((a,b)=> new Date(a.time) - new Date(b.time));
      }
      upcoming.sort((a,b)=> new Date(a.time) - new Date(b.time));

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UPCOMING > 0) upcoming = upcoming.slice(0, LIMIT_UPCOMING);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UP, upcoming, "No upcoming matches in the selected window.");
      setLastUpdated();
      firstPaintDone = true;
    } catch (err) {
      // If we aborted because a newer refresh started, ignore
      if (ctrl.signal.aborted) return;
      console.warn("[load] error:", err);
      setLastUpdated("error");
      // Keep the previous DOM; we’ll try again next tick
    }
  }

  function tryParseErrorNote(raw) {
    try {
      if (!raw) return "";
      // raw may be a stringified JSON, try to find detail
      const s = String(raw);
      if (s.includes("ENHANCE_YOUR_CALM")) return "rate-limited";
      if (s.includes("TOO_MANY_REQUESTS")) return "rate-limited";
      return "";
    } catch { return ""; }
  }

  // ---- Jittered scheduler (avoid sync & limits) ----
  function nextInterval() {
    const floor = Math.max(8000, refreshMs); // never below 8s
    const jitter = Math.floor(Math.random() * 500); // +0–500ms
    return floor + jitter;
  }
  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load(); // immediate
    timer = setTimeout(schedule, nextInterval());
  }

  // kick things off
  schedule();
})();
