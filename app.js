(() => {
  // =======================
  // CONFIG — adjust for your proxy
  // =======================
  const API_BASE = "https://grid-proxy.onrender.com"; // your Render proxy base (no trailing slash)
  const LIVE_PATH = "/api/live";
  const UPC_PATH  = "/api/upcoming"; // ?hours=<N>
  const MATCH_PATH = "/api/match";   // /:id (optional; only if your proxy supports it)

  // UI elements
  const LIST_LIVE = document.getElementById("live");
  const LIST_UP   = document.getElementById("upcoming");
  const REFRESH_SEL = document.getElementById("refreshSel");
  const WIN_SEL     = document.getElementById("winSel");
  const BTN_REF     = document.getElementById("btnRefresh");
  const BTN_REF_UP  = document.getElementById("btnRefreshUp");
  const LAST        = document.getElementById("lastUpdated");
  const LAST_UP     = document.getElementById("lastUpdatedUp");

  // Modal (optional)
  const dlg = document.getElementById("details");
  const dlgBody = document.getElementById("detailsBody");
  const closeBtn = document.getElementById("closeDetails");
  closeBtn?.addEventListener("click", () => dlg.close());

  // =======================
  // Helpers
  // =======================
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }
  function setStamp(el) {
    el.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  }

  function cardHtml(m, live) {
    return `
      <a href="#" class="card ${live ? "live" : ""}" data-id="${m.id}">
        <div class="row event">
          <div>${m.event || "—"} ${m.format ? `• ${m.format}` : ""}</div>
          <div class="${live ? "status" : "time"}">${live ? "LIVE" : (m.localTime || "")}</div>
        </div>
        <div class="row">
          <div class="team">${m.teams?.[0] || "TBD"}</div>
          <div class="score">${m.scores?.[0] ?? ""}</div>
        </div>
        <div class="row">
          <div class="team">${m.teams?.[1] || "TBD"}</div>
          <div class="score">${m.scores?.[1] ?? ""}</div>
        </div>
      </a>
    `;
  }

  function bindCardClicks(container) {
    container.addEventListener("click", async (e) => {
      const a = e.target.closest("a.card");
      if (!a) return;
      e.preventDefault();
      const id = a.getAttribute("data-id");
      if (!id) return;

      // Optional fetch — if your proxy has /api/match/:id
      try {
        const res = await fetch(`${API_BASE}${MATCH_PATH}/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("match fetch failed");
        const data = await res.json();
        showDetails(data);
      } catch {
        // fallback to a minimal detail view using the card text
        showDetailsFromCard(a);
      }
    });
  }

  function showDetails(data) {
    const teams = data.teams || [];
    const scores = data.scores || [];
    const status = data.live ? "LIVE" : (data.time ? fmtTime(data.time) : "");
    dlgBody.innerHTML = `
      <h3>${data.event || "Match"} <span class="badge">${data.format || ""}</span></h3>
      <p class="dim small">${status}</p>
      <div class="grid">
        <div class="card">
          <div class="row"><strong>${teams[0] || "TBD"}</strong><span>${scores[0] ?? ""}</span></div>
        </div>
        <div class="card">
          <div class="row"><strong>${teams[1] || "TBD"}</strong><span>${scores[1] ?? ""}</span></div>
        </div>
      </div>
      ${Array.isArray(data.players) ? `
        <h4>Players</h4>
        <div class="grid">
          ${data.players.map(p => `
            <div class="card">
              <div class="row"><strong>${p.nickname || p.name || "Player"}</strong><span class="dim small">${p.title || ""}</span></div>
            </div>
          `).join("")}
        </div>` : ""}
    `;
    dlg.showModal();
  }

  function showDetailsFromCard(a) {
    const rows = [...a.querySelectorAll(".row")].map(r => r.textContent.trim());
    dlgBody.innerHTML = `
      <h3>${rows[0] || "Match"}</h3>
      <div class="grid">
        <div class="card"><div>${rows[1] || ""}</div></div>
        <div class="card"><div>${rows[2] || ""}</div></div>
      </div>
    `;
    dlg.showModal();
  }

  function renderList(el, items, live = false) {
    if (!items?.length) {
      el.innerHTML = `<div class="empty">${live ? "No live matches right now." : "Nothing scheduled in this window."}</div>`;
      return;
    }
    el.innerHTML = items.map(m => cardHtml(m, live)).join("");
  }

  function normalize(items, live = false) {
    return (items || []).map(x => ({
      id: String(x.id ?? ""),
      event: x.event ?? x.tournament ?? "",
      format: x.formatShort || x.format || "",
      teams: x.teams || [],
      scores: x.scores || ["", ""],
      live,
      time: x.time || x.start || "",
      localTime: x.time ? fmtTime(x.time) : (x.start ? fmtTime(x.start) : "")
    }));
  }

  // =======================
  // Fetch + rate-limit backoff
  // =======================
  let baseInterval = Number(REFRESH_SEL.value) || 30;
  let backoff = 0; // steps: 0..3

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 429) {
      // Too many requests: step backoff up to 3 (x2, x4, x8)
      backoff = Math.min(backoff + 1, 3);
      throw new Error("rate_limited");
    }
    backoff = 0; // reset on success / non-429
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadLive() {
    const data = await fetchJson(`${API_BASE}${LIVE_PATH}`);
    // expected shape: { items: [ { id, event, format, teams, scores, time } ] }
    const list = normalize(data.items, true);
    renderList(LIST_LIVE, list, true);
    setStamp(LAST);
  }

  async function loadUpcoming() {
    const hours = Number(WIN_SEL.value) || 24;
    const data = await fetchJson(`${API_BASE}${UPC_PATH}?hours=${encodeURIComponent(hours)}`);
    const list = normalize(data.items, false);
    // sort by time
    list.sort((a,b) => new Date(a.time) - new Date(b.time));
    renderList(LIST_UP, list, false);
    setStamp(LAST_UP);
  }

  async function loadAll() {
    try {
      await Promise.allSettled([loadLive(), loadUpcoming()]);
    } catch {
      // already handled per-call
    }
  }

  // =======================
  // Scheduler
  // =======================
  let timer;
  function schedule() {
    if (timer) clearInterval(timer);
    const interval = clamp(baseInterval * (2 ** backoff), 10, 300); // 10s..5m
    timer = setInterval(loadAll, interval * 1000);
  }

  // Initial load + wire up UI
  loadAll().finally(schedule);

  REFRESH_SEL.addEventListener("change", () => {
    baseInterval = Number(REFRESH_SEL.value) || 30;
    schedule();
  });
  WIN_SEL.addEventListener("change", () => loadUpcoming());
  BTN_REF.addEventListener("click", () => loadLive());
  BTN_REF_UP.addEventListener("click", () => loadUpcoming());

  // Click handlers for cards (details)
  bindCardClicks(LIST_LIVE);
  bindCardClicks(LIST_UP);
})();
