// Replace your normalize() and renderCard() with this:

function normalize(items, isLive) {
  return (items || []).map(it => {
    // team names (works with both {teams:[{name}]} and {teams:[{baseInfo:{name}}]})
    const teamsArr = Array.isArray(it.teams) ? it.teams : (it.teams || []);
    const teamNames = teamsArr.map(t =>
      t?.name || t?.baseInfo?.name || ""
    ).filter(Boolean);

    // best-of (try multiple shapes)
    const bestOf =
      it.bestOf ??
      it.format?.bestOf ??
      it.format?.id ??
      (typeof it.format === "number" ? it.format : 3);

    // time (scheduled or actual)
    const when = it.time || it.startTimeScheduled || it.startTime || "";

    // event/tournament name
    const eventName =
      it.event?.name || it.tournament?.name || it.tournamentName || "";

    // ----- scores (try multiple shapes; undefined if not present) -----
    let sA, sB;

    // flat scores
    if (it.scores && (it.scores.a != null || it.scores.b != null)) {
      sA = it.scores.a; sB = it.scores.b;
    }
    // seriesScore: {home, away}
    else if (it.seriesScore && (it.seriesScore.home != null || it.seriesScore.away != null)) {
      sA = it.seriesScore.home; sB = it.seriesScore.away;
    }
    // teams[n].score or teams[n].seriesScore
    else if (teamsArr.length >= 2) {
      const ta = teamsArr[0], tb = teamsArr[1];
      sA = ta?.score ?? ta?.seriesScore;
      sB = tb?.score ?? tb?.seriesScore;
    }

    // coerce to numbers if present
    if (sA != null) sA = Number(sA);
    if (sB != null) sB = Number(sB);

    return {
      id: String(it.id ?? ""),
      time: when,
      event: eventName,
      bestOf: Number(bestOf) || 3,
      teams: [teamNames[0] || "TBD", teamNames[1] || "TBD"],
      scoreA: Number.isFinite(sA) ? sA : undefined,
      scoreB: Number.isFinite(sB) ? sB : undefined,
      live: !!isLive
    };
  }).filter(x => x.id && x.time);
}

function renderCard(m) {
  const card = document.createElement("div");
  card.className = "card" + (m.live ? " live" : "");

  const top = document.createElement("div");
  top.className = "card-top";
  top.innerHTML = `
    <span class="pill">${m.event || "—"}</span>
    <span class="pill">BO${m.bestOf}</span>
    ${m.live ? '<span class="pill live-dot">LIVE</span>' : ""}
  `;

  const body = document.createElement("div");
  body.className = "card-body";

  // time (local)
  const t = new Date(m.time);
  const timeStr = isNaN(+t)
    ? (m.time || "")
    : t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // if we have scores, show them; else show “vs”
  const scoreHtml = (m.scoreA != null && m.scoreB != null)
    ? `<div class="score">${m.scoreA}</div>
       <div class="vs">–</div>
       <div class="score">${m.scoreB}</div>`
    : `<div class="vs">vs</div>`;

  body.innerHTML = `
    <div class="time">${timeStr}</div>
    <div class="teams">
      <div>${m.teams[0]}</div>
      ${scoreHtml}
      <div>${m.teams[1]}</div>
    </div>
  `;

  card.appendChild(top);
  card.appendChild(body);
  return card;
}
