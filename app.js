// Matches UI — flicker free, with expandable cards & conditional “lead”
// Uses your Render proxy: /api/series/live and /api/series/upcoming

(function () {
  const ROOT = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const API_BASE = ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series";
  const LIST_LIVE = document.getElementById("listLive");
  const LIST_UP   = document.getElementById("listUpcoming");
  const LAST      = document.getElementById("lastUpdated");
  const REFRESH_SELECT = document.getElementById("refreshSelect");
  const TEAM_BADGE = document.getElementById("teamBadge");
  const UP_HOURS_SPAN = document.getElementById("upHoursSpan");

  const urlParams = new URLSearchParams(location.search);
  const TEAM_PIN = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UP = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);
  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  let refreshMs = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 15000);
  if (REFRESH_SELECT) {
    REFRESH_SELECT.value = String(refreshMs);
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
    if (!LAST) return;
    LAST.textContent =
      "Last updated: " + new Date().toLocaleTimeString() + (note ? ` (${note})` : "");
  }

  // ---------- Robust field helpers ----------
  function pick(...vals) {
    for (const v of vals) if (v != null && v !== "") return v;
    return undefined;
  }
  function asDate(val) {
    const d = val ? new Date(val) : null;
    return isNaN(d?.getTime?.()) ? null : d;
  }
  function fmtTimeLocal(val) {
    const d = asDate(val);
    return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
  }
  function fmtDateLocal(val) {
    const d = asDate(val);
    return d ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "TBD";
  }
  function teamName(t) {
    return pick(t?.name, t?.baseInfo?.name, t?.team?.name, t?.baseInfo?.title?.name) || "TBD";
  }
  function teamLogo(t) {
    return pick(t?.logoUrl, t?.baseInfo?.logoUrl, t?.team?.logoUrl);
  }
  function teamScoreAdvantage(t) {
    const raw = pick(t?.scoreAdvantage, t?.score);
    return Number.isFinite(Number(raw)) ? Number(raw) : 0;
  }
  function formatShort(f) {
    if (!f) return "BO?";
    return pick(f?.nameShortened, f?.name, (f?.id != null ? `Bo${f.id}` : null)) || "BO?";
  }
  function tournamentName(m) {
    return pick(m?.tournament?.name, m?.event?.name, m?.event, m?.tournamentName) || "—";
  }
  function isLive(m) {
    // live list is from /live; upcoming is from /upcoming — but keep a fallback flag
    return !!m._live;
  }

  // Normalize one series-like object into the shape we render
  function normalizeOne(it, liveFlag=false) {
    const teamsArr = Array.isArray(it?.teams) ? it.teams : [];
    const t1 = teamsArr[0] || {};
    const t2 = teamsArr[1] || {};

    const teamA = {
      name: teamName(t1),
      logo: teamLogo(t1),
      lead: teamScoreAdvantage(t1) // show only if > 0
    };
    const teamB = {
      name: teamName(t2),
      logo: teamLogo(t2),
      lead: teamScoreAdvantage(t2)
    };

    return {
      id: String(pick(it?.id, it?.seriesId, crypto.randomUUID())),
      tournament: tournamentName(it),
      formatShort: formatShort(it?.format),
      timeISO: pick(it?.time, it?.startTimeScheduled),
      timeLocal: fmtTimeLocal(pick(it?.time, it?.startTimeScheduled)),
      live: !!liveFlag,
      raw: it,
      teamA, teamB
    };
  }

  function normalize(list, liveFlag=false) {
    return (list || [])
      .map(x => normalizeOne(x, liveFlag))
      .filter(m => m.id && (m.teamA.name || m.teamB.name));
  }

  // ---------- Rendering ----------
  function cardHeaderHTML(m) {
    const left = `
      <span class="pill">${m.tournament}</span>
    `;
    const right = `
      ${m.live ? `<span class="pill live-dot">LIVE</span>` : ""}
      <span class="pill">${m.formatShort}</span>
      <span class="pill">${m.timeLocal}</span>
      ${m.teamA.lead > 0 ? `<span class="pill lead">${m.teamA.name} +${m.teamA.lead}</span>` : ""}
      ${m.teamB.lead > 0 ? `<span class="pill lead">${m.teamB.name} +${m.teamB.lead}</span>` : ""}
    `;
    return `
      <div class="card-top">
        <div class="card-left">${left}</div>
        <div class="card-right">${right}</div>
      </div>
    `;
  }

  function teamHTML(t) {
    const logo = t.logo
      ? `<img class="logo" alt="" loading="lazy" src="${t.logo}">`
      : `<div class="logo" aria-hidden="true"></div>`;
    return `
      <div class="team">
        ${logo}
        <div class="name">${t.name || "TBD"}</div>
      </div>
    `;
  }

  function renderCard(m) {
    const el = document.createElement("article");
    el.className = "card" + (m.live ? " live" : "");
    el.setAttribute("data-id", m.id);

    el.innerHTML = `
      ${cardHeaderHTML(m)}
      <div class="teams">
        ${teamHTML(m.teamA)}
        <div class="vs">vs</div>
        ${teamHTML(m.teamB)}
      </div>
    `;

    // expand on click
    el.addEventListener("click", () => openModal(m));
    return el;
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

  // ---------- Modal ----------
  const MODAL_BACKDROP = document.getElementById("modalBackdrop");
  const MODAL_CLOSE = document.getElementById("modalClose");
  const MODAL_CONTENT = document.getElementById("modalContent");

  function openModal(m) {
    const when = fmtDateLocal(m.timeISO);
    const badges = `
      ${m.live ? `<span class="pill live-dot">LIVE</span>` : ""}
      <span class="pill">${m.formatShort}</span>
      <span class="pill">${when}</span>
      ${m.teamA.lead > 0 ? `<span class="pill lead">${m.teamA.name} +${m.teamA.lead}</span>` : ""}
      ${m.teamB.lead > 0 ? `<span class="pill lead">${m.teamB.name} +${m.teamB.lead}</span>` : ""}
    `;

    MODAL_CONTENT.innerHTML = `
      <div class="modal-header">
        <h3 id="modalTitle">${m.tournament}</h3>
        <div class="modal-badges">${badges}</div>
      </div>

      <div class="modal-teams">
        <div class="modal-team">
          ${m.teamA.logo ? `<img class="logo" alt="" src="${m.teamA.logo}">` : `<div class="logo"></div>`}
          <div class="name">${m.teamA.name}</div>
        </div>
        <div class="modal-vs">vs</div>
        <div class="modal-team" style="justify-content:flex-end;">
          <div class="name" style="text-align:right;">${m.teamB.name}</div>
          ${m.teamB.logo ? `<img class="logo" alt="" src="${m.teamB.logo}">` : `<div class="logo"></div>`}
        </div>
      </div>

      <div class="modal-meta">
        <div><strong>Status:</strong> ${m.live ? "Live" : "Upcoming"}</div>
        <div><strong>Local time:</strong> ${when}</div>
        <div><strong>Format:</strong> ${m.formatShort}</div>
      </div>
    `;

    MODAL_BACKDROP.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    MODAL_BACKDROP.hidden = true;
    document.body.style.overflow = "";
  }
  MODAL_CLOSE.addEventListener("click", closeModal);
  MODAL_BACKDROP.addEventListener("click", (e) => {
    if (e.target === MODAL_BACKDROP) closeModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !MODAL_BACKDROP.hidden) closeModal();
  });

  // ---------- Data load & refresh (with jitter, abort protection) ----------
  let inFlightCtrl;
  async function load() {
    if (inFlightCtrl) inFlightCtrl.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;

    try {
      const [liveRes, upRes] = await Promise.all([
        fetch(`${API_BASE}/live`, { cache: "no-store", signal: ctrl.signal }).then(r => r.json()),
        fetch(`${API_BASE}/upcoming?hours=${encodeURIComponent(UPCOMING_HOURS)}`, { cache: "no-store", signal: ctrl.signal }).then(r => r.json())
      ]);
      if (ctrl.signal.aborted) return;

      let live = normalize(liveRes.items || [], true).map(x => ({...x, _live: true}));
      let upcoming = normalize(upRes.items || [], false);

      // optional pin sort
      if (TEAM_PIN) {
        const pin = TEAM_PIN;
        const score = (a, b) => {
          const ap = (a.teamA.name + " " + a.teamB.name).toLowerCase().includes(pin) ? 1 : 0;
          const bp = (b.teamA.name + " " + b.teamB.name).toLowerCase().includes(pin) ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return (asDate(a.timeISO) ?? 0) - (asDate(b.timeISO) ?? 0);
        };
        live.sort(score);
        upcoming.sort((a, b) => (asDate(a.timeISO) ?? 0) - (asDate(b.timeISO) ?? 0));
      } else {
        live.sort((a, b) => (asDate(a.timeISO) ?? 0) - (asDate(b.timeISO) ?? 0));
        upcoming.sort((a, b) => (asDate(a.timeISO) ?? 0) - (asDate(b.timeISO) ?? 0));
      }

      if (LIMIT_LIVE > 0) live = live.slice(0, LIMIT_LIVE);
      if (LIMIT_UP > 0) upcoming = upcoming.slice(0, LIMIT_UP);

      renderList(LIST_LIVE, live, "No live matches right now.");
      renderList(LIST_UP, upcoming, "No upcoming matches in the selected window.");
      setLastUpdated();
    } catch (e) {
      if (ctrl.signal.aborted) return;
      console.error(e);
      setLastUpdated("error");
      // keep current DOM; could toast if you want
    }
  }

  // enforce a floor & add 0–500ms jitter so tabs don’t synchronize
  function nextInterval() {
    const base = Math.max(8000, refreshMs);
    return base + Math.floor(Math.random() * 500);
  }
  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load();
    timer = setTimeout(schedule, nextInterval());
  }
  schedule();
})();
