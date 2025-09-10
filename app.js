/* =====================================================================
   GRID Frontend – Minimal, Operable JS (single fetch per cycle)
   - Single in-flight request guard + cache
   - Utilities namespaced under UTIL (no shadowing)
   - Renders Live + Upcoming, collapsible cards, details modal
   - Shows "leading" only if > 0
   ===================================================================== */
(() => {
  // ------- DOM roots -------
  const ROOT          = document.getElementById("matchesRoot");
  const LIST_LIVE     = document.getElementById("listLive");
  const LIST_UP       = document.getElementById("listUpcoming");
  const LAST          = document.getElementById("lastUpdated");
  const REFRESH_SELECT= document.getElementById("refreshSelect");
  const TEAM_BADGE    = document.getElementById("teamBadge");
  const UP_HOURS_SPAN = document.getElementById("upHoursSpan");

  if (!ROOT || !LIST_LIVE || !LIST_UP) return;

  // ------- Config -------
  const API_BASE = (ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series").replace(/\/+$/, "");
  const urlParams = new URLSearchParams(location.search);

  // sensible defaults + URL overrides
  let refreshMs      = Number(urlParams.get("refresh")) || Number(ROOT.dataset.refresh) || 15000;
  const TEAM_PIN     = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE   = Number(urlParams.get("limitLive"))    || 8;
  const LIMIT_UP     = Number(urlParams.get("limitUpcoming")) || 8;
  const UPC_HOURS    = Number(urlParams.get("hoursUpcoming")) || 24;

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPC_HOURS);

  // Hook refresh selector (if present)
  if (REFRESH_SELECT) {
    const optVal = String(refreshMs);
    const found  = [...REFRESH_SELECT.options].some(o => o.value === optVal);
    if (found) REFRESH_SELECT.value = optVal;
    REFRESH_SELECT.addEventListener("change", () => {
      refreshMs = Number(REFRESH_SELECT.value) || 15000;
      schedule();  // rearm
    });
  }

  // Team pin badge (optional)
  if (TEAM_PIN && TEAM_BADGE) {
    TEAM_BADGE.hidden = false;
    TEAM_BADGE.textContent = `Pinned: ${TEAM_PIN}`;
  }

  // ------- UTIL (single namespace; never re-declare) -------
  const UTIL = {
    g(obj, path, dflt = undefined) {
      try { return path.split(".").reduce((o,k)=>(o==null?o:o[k]), obj) ?? dflt; }
      catch { return dflt; }
    },
    clamp(n, min, max){ return Math.max(min, Math.min(max, n)); },
    fmtTime(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      return sameDay
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "2-digit" });
    },
    fmtRel(iso) {
      if (!iso) return "";
      const d = new Date(iso).getTime();
      const now = Date.now();
      const diff = Math.round((d - now)/1000);
      const abs = Math.abs(diff);
      const unit = abs>=3600 ? "h" : abs>=60 ? "m" : "s";
      const val = unit==="h" ? Math.round(abs/3600) : unit==="m" ? Math.round(abs/60) : abs;
      const s = `${val}${unit}`;
      return diff >= 0 ? `in ${s}` : `${s} ago`;
    },
    fmtBO(format) {
      const s = (String(format?.nameShortened || format?.name || "")).toLowerCase();
      if (!s) return "";
      if (s.includes("bo1")) return "BO1";
      if (s.includes("bo2")) return "BO2";
      if (s.includes("bo3")) return "BO3";
      if (s.includes("bo5")) return "BO5";
      if (s.includes("bo7")) return "BO7";
      if (s.includes("score-after")) return (format.nameShortened || s).toUpperCase();
      return (format.name || format.nameShortened || "").toUpperCase();
    },
    pickTeamName(t) {
      return (t?.baseInfo?.name || t?.name || "TBD").trim();
    },
    pickLogo(t) {
      const raw = t?.baseInfo?.logoUrl || t?.logoUrl || "";
      if (!raw) return "https://cdn.grid.gg/assets/team-logos/generic";
      // many CDN items are id-only; if it already looks like a URL, keep it
      if (/^https?:\/\//i.test(raw)) return raw;
      return `https://cdn.grid.gg/assets/team-logos/${raw}`;
    },
    tournamentSafe(series) {
      const tn = series?.tournament?.nameShortened || series?.tournament?.name || "";
      const tl = series?.tournament?.logoUrl || "https://cdn.grid.gg/assets/tournament-logos/generic";
      return { name: tn, logoUrl: tl };
    },
    clone(value) {
      // simple, safe clone for our data (no functions/cycles)
      try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
    }
  };

  // ------- Cache & request guard -------
  const STATE = {
    cache: null,            // last full normalized payload
    cacheAt: 0,             // timestamp
    inflight: null,         // in-flight promise to prevent duplicate pull
    aborter: null           // AbortController
  };

  const ENDPOINTS = {
    live:      `${API_BASE}/live?limit=${encodeURIComponent(LIMIT_LIVE)}`,
    upcoming:  `${API_BASE}/upcoming?hours=${encodeURIComponent(UPC_HOURS)}&limit=${encodeURIComponent(LIMIT_UP)}`
  };

  // Normalizer: map API node -> lightweight match object used by UI
  function normalizeSeriesNode(node) {
    const tA = (node?.teams?.[0]) ?? null;
    const tB = (node?.teams?.[1]) ?? null;
    const seriesType = String(node?.type || "").toUpperCase();
    const live = seriesType === "ESPORTS" || seriesType === "COMPETITIVE" || seriesType === "SCRIM" || !!node?.streams?.length; // fallback heuristic

    return {
      id: String(node?.id || ""),
      time: node?.startTimeScheduled || null,
      format: node?.format || null,
      tournament: UTIL.tournamentSafe(node),
      live,
      teams: [
        tA ? {
          name: UTIL.pickTeamName(tA),
          logo: UTIL.pickLogo(tA),
          // show advantage only if > 0
          advantage: Math.max(0, Number(tA?.scoreAdvantage || 0))
        } : { name: "TBD", logo: UTIL.pickLogo(null), advantage: 0 },
        tB ? {
          name: UTIL.pickTeamName(tB),
          logo: UTIL.pickLogo(tB),
          advantage: Math.max(0, Number(tB?.scoreAdvantage || 0))
        } : { name: "TBD", logo: UTIL.pickLogo(null), advantage: 0 }
      ]
    };
  }

  function normalizePayload(liveList, upList) {
    const live = (liveList || []).map(normalizeSeriesNode);
    const upcoming = (upList || []).map(normalizeSeriesNode)
      .sort((a,b)=> new Date(a.time) - new Date(b.time));
    return { live, upcoming };
  }

  // Single fetch per cycle with guard
  async function fetchOnce() {
    if (STATE.inflight) return STATE.inflight; // prevent duplicate pulls

    // Allow re-use of a fresh cache if a render only is requested
    STATE.aborter?.abort();
    STATE.aborter = new AbortController();

    STATE.inflight = (async () => {
      try {
        // NOTE: Replace these with your real GraphQL/REST calls as needed
        // Here we assume two HTTP endpoints returning { data: [Series] } lists
        const [a, b] = await Promise.all([
          fetch(ENDPOINTS.live, { signal: STATE.aborter.signal }).then(r => r.json()),
          fetch(ENDPOINTS.upcoming, { signal: STATE.aborter.signal }).then(r => r.json())
        ]);

        const liveData = a?.data || a?.live || [];
        const upData   = b?.data || b?.upcoming || [];

        const normalized = normalizePayload(liveData, upData);
        STATE.cache = normalized;        // keep original (we’ll clone on use)
        STATE.cacheAt = Date.now();

        setLastUpdated(STATE.cacheAt);
        return normalized;
      } finally {
        STATE.inflight = null;
      }
    })();

    return STATE.inflight;
  }

  function setLastUpdated(ts) {
    if (!LAST) return;
    const d = new Date(ts);
    LAST.textContent = `Last updated: ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  }

  // ------- Rendering -------
  function renderAll(fromCacheOnly = false) {
    // Pull a CLONE so we never mutate the original cache
    let data = STATE.cache ? UTIL.clone(STATE.cache) : null;

    const apply = (payload) => {
      if (!payload) return;
      renderList(LIST_LIVE, payload.live, "No live matches");
      renderList(LIST_UP,   payload.upcoming, "No upcoming matches");
    };

    if (fromCacheOnly && data) {
      apply(data);
      return;
    }

    fetchOnce().then(apply).catch(() => {
      // keep UI as-is on failure, but update timestamp to show error state (optional)
    });
  }

  function renderList(root, items, emptyText) {
    if (!root) return;
    root.innerHTML = "";

    if (!items || items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = emptyText;
      root.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(m => frag.appendChild(card(m)));
    root.appendChild(frag);
  }

  function card(m) {
    const el = document.createElement("article");
    el.className = "match-card";
    el.tabIndex = 0;

    // header
    const head = document.createElement("div");
    head.className = "match-head";

    const title = document.createElement("div");
    title.className = "match-title";
    title.textContent = UTIL.g(m, "tournament.name", "—");

    const pillWrap = document.createElement("div");
    pillWrap.className = "match-pills";

    const bo = UTIL.fmtBO(m.format);
    if (bo) {
      const b = document.createElement("span");
      b.className = "pill";
      b.textContent = bo;
      pillWrap.appendChild(b);
    }

    const livePill = document.createElement("span");
    livePill.className = m.live ? "pill live" : "pill";
    livePill.textContent = m.live ? "LIVE" : "UPCOMING";
    pillWrap.appendChild(livePill);

    const when = document.createElement("span");
    when.className = "pill soft";
    const timeText = UTIL.fmtTime(m.time);
    const relText  = UTIL.fmtRel(m.time);
    when.textContent = timeText ? `${timeText}${relText ? " · " + relText : ""}` : (relText || "—");
    pillWrap.appendChild(when);

    head.appendChild(title);
    head.appendChild(pillWrap);

    // body
    const body = document.createElement("div");
    body.className = "match-body";

    body.appendChild(teamRow(m.teams?.[0]));
    body.appendChild(teamRow(m.teams?.[1]));

    // collapse target
    const collapse = document.createElement("div");
    collapse.className = "collapse";
    // (lazy) fill on open in modal; here we keep the card compact

    el.appendChild(head);
    el.appendChild(body);
    el.appendChild(collapse);

    // click -> open modal with details (use cache data)
    el.addEventListener("click", () => openModal(m));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openModal(m); });

    return el;
  }

  function teamRow(t) {
    const row = document.createElement("div");
    row.className = "team-row";

    const left = document.createElement("div");
    left.className = "team-left";

    const logo = document.createElement("img");
    logo.className = "team-logo";
    logo.alt = (t?.name || "Team") + " logo";
    logo.loading = "lazy";
    logo.decoding = "async";
    logo.src = UTIL.pickLogo(t);

    const name = document.createElement("div");
    name.className = "team-name";
    name.textContent = UTIL.pickTeamName(t);

    left.appendChild(logo);
    left.appendChild(name);

    const right = document.createElement("div");
    right.className = "team-right";

    // Only show advantage badge if > 0
    const adv = Number(t?.advantage || 0);
    if (adv > 0) {
      const b = document.createElement("span");
      b.className = "pill soft";
      b.textContent = `+${adv}`;
      right.appendChild(b);
    }

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  // ------- Modal -------
  let activeModal = null;
  let restoreFocusEl = null;

  function openModal(m) {
    closeModal();

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.role = "dialog";
    modal.ariaModal = "true";

    const sheet = document.createElement("div");
    sheet.className = "modal-sheet";

    const top = document.createElement("div");
    top.className = "modal-top";

    const h = document.createElement("h3");
    h.textContent = UTIL.g(m, "tournament.name", "Match details");

    const x = document.createElement("button");
    x.className = "btn-close";
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.textContent = "×";
    x.addEventListener("click", closeModal);

    top.appendChild(h);
    top.appendChild(x);

    const info = document.createElement("div");
    info.className = "modal-info";

    info.appendChild(metaRow("When", `${UTIL.fmtTime(m.time)} (${UTIL.fmtRel(m.time)})`));
    const bo = UTIL.fmtBO(m.format);
    if (bo) info.appendChild(metaRow("Format", bo));
    info.appendChild(metaRow("Tournament", UTIL.g(m, "tournament.name", "—")));

    const teams = document.createElement("div");
    teams.className = "modal-teams";
    teams.appendChild(teamRow(m.teams?.[0]));
    teams.appendChild(teamRow(m.teams?.[1]));

    sheet.appendChild(top);
    sheet.appendChild(info);
    sheet.appendChild(teams);

    modal.appendChild(sheet);
    document.body.appendChild(modal);

    activeModal = modal;
    restoreFocusEl = document.activeElement;
    document.addEventListener("keydown", onEscToClose);
    x.focus();
  }

  function metaRow(k, v) {
    const row = document.createElement("div");
    row.className = "meta-row";
    const key = document.createElement("div");
    key.className = "meta-key";
    key.textContent = k;
    const val = document.createElement("div");
    val.className = "meta-val";
    val.textContent = v;
    row.appendChild(key);
    row.appendChild(val);
    return row;
  }

  function onEscToClose(e) {
    if (e.key === "Escape") closeModal();
  }

  function closeModal() {
    if (!activeModal) return;
    document.removeEventListener("keydown", onEscToClose);
    activeModal.remove();
    activeModal = null;
    if (restoreFocusEl) {
      restoreFocusEl.focus?.();
      restoreFocusEl = null;
    }
  }

  // ------- Scheduler (single pull per tick) -------
  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // fetch & render; no duplicate pulls thanks to guard
      fetchOnce().then(() => renderAll(true)).finally(schedule);
    }, refreshMs);
  }

  // Initial paint
  renderAll(false);
  schedule();
})();
