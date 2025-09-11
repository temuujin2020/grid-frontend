// --- config (no secrets) ---
const ENDPOINT = localStorage.getItem('GRID_PROXY_URL') || ''; // set via localStorage
const LIVE_SLOT = document.getElementById('liveSlot');
const ERR = document.getElementById('error');
const REFRESH = document.getElementById('refreshBtn');

// Time window we scan to find a currently-running series (UTC)
const PAST_MINUTES = 120;   // 2h back (catch already-started)
const FUTURE_MINUTES = 360; // 6h forward

// --- GraphQL bits ---
const Q_ALL_SERIES = `
query LiveWindow($gte: DateTime!, $lte: DateTime!, $first: Int!) {
  allSeries(
    filter:{ startTimeScheduled:{ gte: $gte, lte: $lte } }
    orderBy: StartTimeScheduled
    first: $first
  ){
    edges{
      node{
        id
        startTimeScheduled
        title{ nameShortened }
        tournament{ nameShortened }
        format{ nameShortened }
        teams{ baseInfo{ name } }
      }
    }
  }
}`;

const Q_SERIES_STATE = `
query SeriesState($id: ID!){
  seriesState(id:$id){
    valid
    started
    finished
    format
    teams{ name won }
  }
}`;

async function gql(query, variables) {
  if (!ENDPOINT) throw new Error('Missing GraphQL proxy endpoint (set localStorage.GRID_PROXY_URL)');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map(e=>e.message).join(' • '));
  return json.data;
}

function isoUTC(minShift=0){
  const d = new Date();
  d.setMinutes(d.getMinutes()+minShift);
  return d.toISOString();
}

// --- main: find first LIVE series ---
async function loadOneLive() {
  showError('');
  setCard(loadingCard('Looking for a live match…'));

  try {
    // 1) Get a small window of series
    const vars = { gte: isoUTC(-PAST_MINUTES), lte: isoUTC(FUTURE_MINUTES), first: 40 };
    const data = await gql(Q_ALL_SERIES, vars);
    const series = data?.allSeries?.edges?.map(e=>e.node) ?? [];

    // 2) Probe their seriesState in order until we find one live
    for (const s of series) {
      const stData = await gql(Q_SERIES_STATE, { id: s.id });
      const st = stData?.seriesState;
      if (st && st.valid && st.started && !st.finished) {
        renderLiveCard(s, st);
        return;
      }
    }

    // No live found
    setCard(emptyCard('No live match right now.'));
  } catch (err) {
    showError(err.message || 'Failed to load live match');
    setCard(emptyCard('Could not load live match.'));
  }
}

// --- rendering helpers ---
function setCard(el){
  LIVE_SLOT.innerHTML = '';
  LIVE_SLOT.appendChild(el);
}
function loadingCard(text){
  const d = document.createElement('div');
  d.className = 'card ghost';
  d.textContent = text;
  return d;
}
function emptyCard(text){
  const d = document.createElement('div');
  d.className = 'card ghost';
  d.textContent = text;
  return d;
}
function showError(msg){
  if (!msg){ ERR.classList.add('hidden'); ERR.textContent=''; return; }
  ERR.classList.remove('hidden'); ERR.textContent = `Error: ${msg}`;
}

function renderLiveCard(s, st){
  const card = document.createElement('article');
  card.className = 'card live';

  const left = document.createElement('div');
  left.className = 'left';
  left.innerHTML = `
    <span class="badge">LIVE</span>
    <div>
      <div class="title">${escapeHTML(s.title?.nameShortened || '—')} • ${escapeHTML(s.format?.nameShortened || '')}</div>
      <div class="meta">${escapeHTML(s.tournament?.nameShortened || '')} • Started: ${new Date(s.startTimeScheduled).toUTCString()}</div>
      <div class="teams">${s.teams?.map(t=>`<span class="team">${escapeHTML(t.baseInfo?.name||'')}</span>`).join('')}</div>
    </div>
  `;
  card.appendChild(left);

  // click = small inline details of seriesState (winner flags)
  card.addEventListener('click', () => {
    const winners = (st.teams||[]).filter(t=>t.won).map(t=>t.name).join(', ');
    alert(
`Match is LIVE
Format: ${st.format}
Winner(s) so far: ${winners || '—'}`
    );
  });

  setCard(card);
}

function escapeHTML(s){ return (s??'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// wire up
REFRESH.addEventListener('click', loadOneLive);
loadOneLive();
