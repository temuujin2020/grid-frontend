// app.js — logos, live scores, polished header, jittered refresh
(function () {
  // ---- DOM + config ----
  const ROOT = document.getElementById("matchesRoot");
  if (!ROOT) return;

  const LIST_LIVE = document.getElementById("listLive");
  const LIST_UP   = document.getElementById("listUpcoming");
  const LAST      = document.getElementById("lastUpdated");
  const REFRESH_SELECT = document.getElementById("refreshSelect");
  const TEAM_BADGE = document.getElementById("teamBadge");
  const UP_HOURS_SPAN = document.getElementById("upHoursSpan");

  const API_BASE = ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series";
  const urlParams = new URLSearchParams(location.search);

  let refreshMs = Number(urlParams.get("refresh") || ROOT.dataset.refresh || 15000);
  const TEAM_PIN = (urlParams.get("team") || "").trim().toLowerCase();
  const LIMIT_LIVE = Number(urlParams.get("limitLive") || 0);
  const LIMIT_UP   = Number(urlParams.get("limitUpcoming") || 0);
  const UPCOMING_HOURS = Number(urlParams.get("hoursUpcoming") || 24);

  if (UP_HOURS_SPAN) UP_HOURS_SPAN.textContent = String(UPCOMING_HOURS);

  if (REFRESH_SELECT) {
    // If the page provides preset options, reflect current
    if ([...REFRESH_SELECT.options].some(o => o.value === String(refreshMs))) {
      REFRESH_SELECT.value = String(refreshMs);
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
    if (!LAST) return;
    LAST.textContent =
      "Last updated: " + new Date().toLocaleTimeString() + (note ? ` (${note})` : "");
  }

  // ---------- Robust field helpers (PLACEHOLDER BLOCK YOU ASKED ABOUT) ----------
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
  function teamName(t) {
    return pick(
      t?.name,
      t?.baseInfo?.name,
      t?.team?.name,
      t?.baseInfo?.title?.name
    ) || "TBD";
  }
  function teamLogo(t) {
    return pick(
      t?.logoUrl,
      t?.baseInfo?.logoUrl,
      t?.team?.logoUrl
    ); // may be undefined; renderer should handle fallback
  }
  function teamScore(t) {
    const raw = pick(
      t?.score,
      t?.scoreAdvantage,
      t?.stats?.score
    );
    return Number.isFinite(Number(raw)) ? Number(raw) : 0;
  }
  function formatShort(f) {
    if (!f) return "BO?";
    return pick(
      f?.nameShortened,
      f?.name,
      (f?.id != null ? `BO${f.id}` : null)
    ) || "BO?";
  }
  function tournamentName(m) {
    return pick(
      m?.tournament?.name,
      m?.event?.name,
      m?.event,
      m?.tournamentName
    ) || "—";
  }
  function liftTeams(m) {
    // Accept arrays of strings, objects with name, or TeamParticipant shapes
    const arr = Array.isArray(m?.teams) ? m.teams : [];
    if (arr.length >= 2) {
      return [
        { name: teamName(arr[0]), logo: teamLogo(arr[0]), score: teamScore(arr[0]) },
        { name: teamName(arr[1]), logo: teamLogo(arr[1]), score: teamScore(arr[1]) },
      ];
    }
    // Fallback for flat fields
    if (typeof m?.team1 === "string" || typeof m?.team2 === "string") {
      return [
        { name: m.team1 || "TBD", score: 0 },
        { name: m.team2 || "TBD", score: 0 },
      ];
    }
    return [
      { name: "TBD", score: 0 },
      { name: "TBD", score: 0 },
    ];
  }

  // ---------- Normalizer ----------
  function normalize(raw, isLive) {
    return (raw || [])
      .map(m => {
        const teams = liftTeams(m);
        return {
          id: String(m?.id ?? ""),
          tournament: tournamentName(m),
          format: formatShort(m?.format),
          time: m?.time || m?.startTimeScheduled || "",
          live: !!isLive,
          teams,
        };
      })
      .filter(x => x.id && x.time);
  }

  // ---------- Rendering ----------
  function renderCard(m) {
    const card = document.createElement("div");
    card.className = "card" + (m.live ? " live" : "");

    // Header
    const head = document.createElement("div");
    head.className = "card-header";
    head.innerHTML = `
      <div class="left">
        <span class="pill event">${m.tournament || "—"}</span>
      </div>
      <div class="right">
        <span class="pill">${m.format || "BO?"}</span>
        <span class="pill time">${fmtTimeLocal(m.time)}</span>
        ${m.live ? '<span class="pill live-dot">LIVE</span>' : ""}
      </div>
    `;

    // Body with two rows
    const body = document.createElement("div");
    body.className = "card-body";

    const rows = m.teams.map((t, idx) => {
      const row = document.createElement("div");
      row.className = "team-row";

      const img = document.createElement("img");
      img.className = "logo";
      if (t.logo) {
        img.src = t.logo;
        img.alt = t.name + " logo";
      } else {
        img.alt = "";
        img.style.visibility = "hidden";
      }

      const name = document.createElement("div");
      name.className = "team";
      name.textContent = t.name || "TBD";

      const score = document.createElement("div");
      score.className = "score";
      score.textContent = m.live ? String(t.score ?? 0) : "";

      row.appendChild(img);
      row.appendChild(name);
      row.appendChild(score);
      return row;
    });

    rows.forEach(r => body.appendChild(r));

    card.appendChild(head);
    card.appendChild(body);
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

  // ---------- Data load + schedule ----------
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

      let live = normalize(liveRes.items || [], true);
      let upcoming = normalize(upRes.items || [], false);

      // Optional pin: push pinned team to the top
      if (TEAM_PIN) {
        const pin = TEAM_PIN;
        const hasPin = t => (t.teams || []).some(x => (x.name || "").toLowerCase().includes(pin));
        live.sort((a, b) => Number(hasPin(b)) - Number(hasPin(a)) || (asDate(a.time) - asDate(b.time)));
        upcoming.sort((a, b) => asDate(a.time) - asDate(b.time));
      } else {
        live.sort((a, b) => asDate(a.time) - asDate(b.time));
        upcoming.sort((a, b) => asDate(a.time) - asDate(b.time));
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
      // keep current DOM; transient failure will be retried on next tick
    }
  }

  // Enforce a floor & add small jitter to avoid synchronized bursts
  function nextInterval() {
    const floor = Math.max(8000, Number(refreshMs) || 15000);
    return floor + Math.floor(Math.random() * 500);
  }
  let timer;
  function schedule() {
    if (timer) clearTimeout(timer);
    load();
    timer = setTimeout(schedule, nextInterval());
  }

  schedule();
})();
