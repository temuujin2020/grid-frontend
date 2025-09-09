// app.js — clean working version with teams + scores + jitter
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
  const API_BASE = ROOT.dataset.api || "https://grid-proxy.onrender.com/api/series";
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

// --- normalize: turn raw API items into a consistent shape
function normalize(items, isLive) {
  return (items || []).map(it => {
    // team names (robust to either {name} or {baseInfo:{name}})
    const teams = (Array.isArray(it.teams) ? it.teams : (it.teams || []))
      .map(t => t?.name || t?.baseInfo?.name || "TBD");

    // tournament/event name
    const tournament =
      it.event?.name ||
      it.tournament?.name ||
      it.tournament?.baseInfo?.name ||
      "";

    // format => BO3 / BO5 etc
    const fmtRaw = (it.format?.id || it.format || "").toString();
    const formatLabel = fmtRaw ? `BO${fmtRaw}` : "";

    // status/live flag best-effort
    const status = (it.status || (isLive ? "live" : "scheduled")).toLowerCase();
    const live = status === "live" || !!isLive;

    // stage (optional)
    const stage = it.stage?.name || it.stage || "";

    // score (works if API sends something like {home, away} or result fields)
    // if not present, set to null so UI hides it gracefully.
    let score = null;
    const s = it.scores || it.score || it.result || null;
    if (s && (Number.isFinite(s.home) || Number.isFinite(s.away))) {
      score = { home: Number(s.home) || 0, away: Number(s.away) || 0 };
    } else if (Number.isFinite(it.homeScore) || Number.isFinite(it.awayScore)) {
      score = { home: Number(it.homeScore) || 0, away: Number(it.awayScore) || 0 };
    }

    // start time
    const timeISO = it.time || it.startTimeScheduled || "";

    return {
      id: String(it.id ?? ""),
      time: timeISO,
      teams,
      tournament,
      stage,
      formatLabel,
      status,
      live,
      score
    };
  }).filter(x => x.id && x.time);
}

// --- renderCard: builds each match card
function renderCard(m) {
  const card = document.createElement("a");
  card.className = "card" + (m.live ? " live" : "");
  card.href = "#"; // (optional) link to details page if you add one later
  card.setAttribute("aria-label", `${m.teams[0] ?? "TBD"} vs ${m.teams[1] ?? "TBD"}`);

  // TOP: pills (BOx, LIVE), time
  const top = document.createElement("div");
  top.className = "row";

  const leftPills = document.createElement("div");
  leftPills.className = "pills";
  if (m.formatLabel) {
    const pillFmt = document.createElement("span");
    pillFmt.className = "pill";
    pillFmt.textContent = m.formatLabel;
    leftPills.appendChild(pillFmt);
  }
  if (m.live) {
    const pillLive = document.createElement("span");
    pillLive.className = "pill live";
    pillLive.textContent = "LIVE";
    leftPills.appendChild(pillLive);
  }

  const timeEl = document.createElement("div");
  timeEl.className = "time";
  // show local time HH:mm
  const dt = new Date(m.time);
  timeEl.textContent = isNaN(dt) ? "" : dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  top.appendChild(leftPills);
  top.appendChild(timeEl);

  // TITLE: teams (+ score when present)
  const title = document.createElement("div");
  title.className = "teams";

  const t1 = document.createElement("div");
  t1.className = "team";
  t1.textContent = m.teams[0] || "TBD";

  const vs = document.createElement("div");
  vs.className = "vs";
  vs.textContent = "vs";

  const t2 = document.createElement("div");
  t2.className = "team";
  t2.textContent = m.teams[1] || "TBD";

  // score (optional)
  if (m.score && (Number.isFinite(m.score.home) || Number.isFinite(m.score.away))) {
    const score = document.createElement("div");
    score.className = "score";
    score.textContent = `${m.score.home ?? 0} — ${m.score.away ?? 0}`;
    // put score after the teams row
    title.appendChild(t1);
    title.appendChild(vs);
    title.appendChild(t2);
    // score on next line under teams (looks cleaner)
    const scoreWrap = document.createElement("div");
    scoreWrap.className = "score-wrap";
    scoreWrap.appendChild(score);

    const mid = document.createElement("div");
    mid.className = "mid";
    mid.appendChild(title);
    mid.appendChild(scoreWrap);

    // META (tournament + stage)
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [m.tournament, m.stage].filter(Boolean).join(" • ");

    card.appendChild(top);
    card.appendChild(mid);
    card.appendChild(meta);
    return card;
  }

  // no score → simpler layout
  title.appendChild(t1);
  title.appendChild(vs);
  title.appendChild(t2);

  // META (tournament + stage)
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = [m.tournament, m.stage].filter(Boolean).join(" • ");

  card.appendChild(top);
  card.appendChild(title);
  card.appendChild(meta);
  return card;
}


  // ---- Renderer ----
function renderCard(m) {
  const left  = escapeHtml(m.teams?.[0] || "TBD");
  const right = escapeHtml(m.teams?.[1] || "TBD");

  const t = new Date(m.time);
  const when = isNaN(t) ? "" : t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const scoreHtml = (m.live && m.scoreA != null && m.scoreB != null)
    ? `<div class="score-badge">${m.scoreA}&nbsp;–&nbsp;${m.scoreB}</div>`
    : "";

  const livePill = m.live ? `<span class="pill live-dot">LIVE</span>` : "";

  const card = document.createElement("div");
  card.className = "card" + (m.live ? " live" : "");
  card.innerHTML = `
    <div class="card-top">
      <span class="pill">BO${escapeHtml(m.format || "3")}</span>
      ${livePill}
      <span class="time">${escapeHtml(when)}</span>
    </div>
    <div class="card-body">
      <div class="teams">
        <div>${left}</div>
        <div class="vs">vs</div>
        <div>${right}</div>
      </div>
      ${scoreHtml}
      <div class="event">${escapeHtml(m.event || "")}</div>
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



})();
