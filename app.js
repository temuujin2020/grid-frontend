// app.js — single-file frontend for grid-proxy
(function () {
  // ---- DOM ----
  const ROOT           = document.getElementById("matchesRoot");
  if (!ROOT) return;
  const LIST_LIVE      = document.getElementById("listLive");
  const LIST_UPCOMING  = document.getElementById("listUpcoming");
  const LAST           = document.getElementById("lastUpdated");
  const REFRESH_SELECT = document.getElementById("refreshSelect");
  const TEAM_BADGE     = document.getElementById("teamBadge");
  const UP_HOURS_SPAN  = document.getElementById("upHoursSpan");

  // ---- Config / URL params ----
  const API_BASE = ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series";
  const urlParams = new URLSearchParams(location.search);

  let refreshMs       = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 30000); // default 30s
  const TEAM_PIN      = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE    = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UPCOMING= Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS= Number(urlParams.get("hoursUpcoming") || 24);

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  if (REFRESH_SELECT) {
    // If the page offers a dropdown, sync it
    const opt = Array.from(REFRESH_SELECT.options).find(o => Number(o.value) === refreshMs);
    if (opt) REFRESH_SELECT.value = String(refreshMs);
    REFRESH_SELECT.addEventListener("change", () => {
      refreshMs = Number(REFRESH_SELECT.value);
      schedule();
    });
  }
  if (TEAM_PIN && TEAM_BADGE) {
    TEAM_BADGE.hidden = false;
    TEAM_BADGE.textContent = `Pinned: ${TEAM_PIN}`;
  }

  // ---- Utils ----
  function setLastUpdated(note) {
    const noteStr = note ? ` (${note})` : "";
    if (LAST) LAST.textContent = "Last updated: " + new Date().toLocaleTimeString() + noteStr;
  }
  function fmtTimeHHMM(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function fetchJSONWithTimeout(url, { signal } = {}, ms = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, {
        signal: signal ? new AbortSignal.any([signal, ctrl.signal]) : ctrl.signal,
        cache: "no-store",
        credentials: "omit",
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, json };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Robust normalizer (handles varied shapes) ----
  function normalize(items, isLive) {
    const toName = (t) =>
      (t && (
        t.name ||
        t.nameShortened ||
        (t.baseInfo && (t.baseInfo.name || t.baseInfo.nameShortened)) ||
        (t.team && (t.team.name || t.team.nameShortened)) ||
        (t.organization && t.organization.name)
      )) || "TBD";

    const toLogo = (t) =>
      (t && (
        t.logoUrl ||
        (t.baseInfo && t.baseInfo.logoUrl) ||
        (t.team && t.team.logoUrl)
      )) || "";

    return (items || []).map(it => {
      const tour = it.tournament || it.event || {};
      const eventName =
        tour.name ||
        tour.nameShortened ||
        (tour.title && (tour.title.name || tour.title.nameShortened)) ||
        "—";

      const rawTeams = Array.isArray(it.teams) ? it.teams : [];
      const tA = rawTeams[0] || {};
      const tB = rawTeams[1] || {};

      const teamA = {
        name: toName(tA),
        logo: toLogo(tA),
      };
      const teamB = {
        name: toName(tB),
        logo: toLogo(tB),
      };

      const bo =
        (it.format && (it.format.nameShortened || it.format.name || it.format.id)) ||
        it.format || ""; // often "BO3"

      const time =
        it.startTimeScheduled ||
        it.time ||
        "";

      // scores sometimes appear as scores or score; can be {a: , b:} or array, keep flexible
      let scoreA = null, scoreB = null;
      const sc = it.scores || it.score;
      if (sc) {
        if (Array.isArray(sc) && sc.length >= 2) {
          scoreA = sc[0];
          scoreB = sc[1];
        } else if (typeof sc === "object") {
          // common keys – adjust if your proxy returns differently
          scoreA = sc.a ?? sc.home ?? sc.left ?? sc.team1 ?? null;
          scoreB = sc.b ?? sc.away ?? sc.right ?? sc.team2 ?? null;
        }
      }

      return {
        id: String(it.id ?? ""),
        event: eventName,
        format: String(bo || ""),
        time,
        teamA,
        teamB,
        scoreA,
        scoreB,
        live: !!isLive
      };
    }).filter(x => x.id && x.time);
  }

  // ---- Card renderer ----
  function teamRow(tName, tLogo, score) {
    const row = document.createElement("div");
    row.className = "team-row";

    const logo = document.createElement("div");
    logo.className = "logo";
    if (tLogo) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      img.src = tLogo;
      logo.appendChild(img);
    } else {
      // empty box keeps layout aligned
      logo.innerHTML = "";
    }

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = tName || "TBD";

    const scoreEl = document.createElement("div");
    scoreEl.className = "score";
    if (score === null || score === undefined || score === "") {
      scoreEl.textContent = ""; // upcoming or unknown
    } else {
      scoreEl.textContent = String(score);
    }

    row.appendChild(logo);
    row.appendChild(name);
    row.appendChild(scoreEl);
    return row;
  }

  function renderCard(m) {
    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");

    // header
    const head = document.createElement("div");
    head.className = "card-head";

    const left = document.createElement("div");
    left.className = "head-left";
    left.textContent = m.event || "—";

    const right = document.createElement("div");
    right.className = "head-right";

    if (m.format) {
      const pillFormat = document.createElement("span");
      pillFormat.className = "pill";
      pillFormat.textContent = m.format.toUpperCase();
      right.appendChild(pillFormat);
    }
    if (m.live) {
      const pillLive = document.createElement("span");
      pillLive.className = "pill pill-live";
      pillLive.textContent = "LIVE";
      right.appendChild(pillLive);
    }
    {
      const pillTime = document.createElement("span");
      pillTime.className = "pill";
      pillTime.textContent = fmtTimeHHMM(m.time) || "";
      right.appendChild(pillTime);
    }

    head.appendChild(left);
    head.appendChild(right);

    // teams
    const body = document.createElement("div");
    body.className = "card-body";

    body.appendChild(teamRow(m.teamA.name, m.teamA.logo, m.scoreA));
    body.appendChild(teamRow(m.teamB.name, m.teamB.logo, m.scoreB));

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  // ---- Smooth list renderer ----
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

  // ---- Data loader + scheduler ----
  let inFlightCtrl;
  async function load() {
    // cancel any previous in-flight refresh to avoid flicker/races
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      const [liveR, upR] = await Promise.all([
        fetchJSONWithTimeout(`${API_BASE}/live`, { signal: ctrl.signal }, 10000),
        fetchJSONWithTimeout(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`, { signal: ctrl.signal }, 10000),
      ]);

      // Handle responses / rate limits gracefully
      const isRateLimited = (r) =>
        r.json && (r.json.error?.errorDetail === "ENHANCE_YOUR_CALM" || r.json.error?.errorType === "ENHANCE_YOUR_CALM");

      if (isRateLimited(liveR) || isRateLimited(upR)) {
        setLastUpdated("rate-limited");
        return; // keep previous DOM
      }

      const liveItems = normalize(liveR.json?.items || [], true);
      const upItems   = normalize(upR.json?.items || [], false);

      // Sorting
      const byTime = (a, b) => new Date(a.time) - new Date(b.time);

      if (TEAM_PIN) {
        const hasPin = (t) => (t || "").toLowerCase().includes(TEAM_PIN);
        const pinScore = (m) => (hasPin(m.teamA.name) || hasPin(m.teamB.name)) ? 1 : 0;
        liveItems.sort((a, b) => {
          const da = pinScore(a), db = pinScore(b);
          if (da !== db) return db - da;
          return byTime(a, b);
        });
        upItems.sort(byTime);
      } else {
        liveItems.sort(byTime);
        upItems.sort(byTime);
      }

      // limits
      const liveFinal = LIMIT_LIVE > 0 ? liveItems.slice(0, LIMIT_LIVE) : liveItems;
      const upFinal   = LIMIT_UPCOMING > 0 ? upItems.slice(0, LIMIT_UPCOMING) : upItems;

      renderList(LIST_LIVE,     liveFinal, "No live matches right now.");
      renderList(LIST_UPCOMING, upFinal,   "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (err) {
      if (ctrl.signal.aborted) return; // superseded by a newer load
      console.warn("[load] error:", err);
      setLastUpdated("error");
      // keep existing DOM
    }
  }

  // Jittered scheduler (avoids sync+limits)
  function nextInterval() {
    const floor = 8000; // enforce min 8s
    const jitter = Math.floor(Math.random() * 500); // 0–500ms
    return Math.max(floor, refreshMs) + jitter;
  }
  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load(); // immediate
    timer = setTimeout(schedule, nextInterval());
  }

  // kick off
  schedule();
})();
