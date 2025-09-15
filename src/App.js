import React, { useState, useEffect } from 'react';
import './App.css';

const PANDASCORE_API = "https://api.pandascore.co";
const PANDASCORE_TOKEN = process.env.REACT_APP_PANDASCORE_TOKEN;

// Legacy API (keeping as fallback)
const API_BASE = "https://grid-proxy.onrender.com/api/series";
const GRAPHQL_API = "https://api.grid.gg/graphql";

// Team cache to avoid repeated API calls
const teamCache = new Map();

// Known teams with logos and colors (fallback data)
const knownTeams = {
  '1winteam': {
    name: '1win Team',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNmZjAwMDAiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+MTwvdGV4dD4KPC9zdmc+',
    colorPrimary: '#ff0000',
    colorSecondary: '#ffffff',
    source: 'fallback'
  },
  '3dmax': {
    name: '3DMAX',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiMwMDc3ZmYiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TTwvdGV4dD4KPC9zdmc+',
    colorPrimary: '#0077ff',
    colorSecondary: '#ffffff',
    source: 'fallback'
  },
  '9zteam': {
    name: '9z Team',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiMwMDAwMDAiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+OTwvdGV4dD4KPC9zdmc+',
    colorPrimary: '#000000',
    colorSecondary: '#ffffff',
    source: 'fallback'
  },
  'astralis': {
    name: 'Astralis',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNmZjY2MDAiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+QTwvdGV4dD4KPC9zdmc+',
    colorPrimary: '#ff6600',
    colorSecondary: '#ffffff',
    source: 'fallback'
  },
  'bestia': {
    name: 'Bestia',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiM4MDAwODAiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+QjwvdGV4dD4KPC9zdmc+',
    colorPrimary: '#800080',
    colorSecondary: '#ffffff',
    source: 'fallback'
  },
  'cloud9': {
    name: 'Cloud9',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiMwMDk5ZmYiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+QzwvdGV4dD4KPC9zdmc+',
    colorPrimary: '#0099ff',
    colorSecondary: '#ffffff',
    source: 'fallback'
  },
  'faze': {
    name: 'FaZe Clan',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNmZmZmMDAiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMwMDAwMDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5GPC90ZXh0Pgo8L3N2Zz4=',
    colorPrimary: '#ffff00',
    colorSecondary: '#000000',
    source: 'fallback'
  },
  'g2': {
    name: 'G2 Esports',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiMwMDAwMDAiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+RzwvdGV4dD4KPC9zdmc+',
    colorPrimary: '#000000',
    colorSecondary: '#ffffff',
    source: 'fallback'
  },
  'liquid': {
    name: 'Team Liquid',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiMwMDc3ZmYiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TDwvdGV4dD4KPC9zdmc+',
    colorPrimary: '#0077ff',
    colorSecondary: '#ffffff',
    source: 'fallback'
  },
  'navi': {
    name: 'NAVI',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNmZmZmZmYiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMwMDAwMDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5OPC90ZXh0Pgo8L3N2Zz4=',
    colorPrimary: '#ffffff',
    colorSecondary: '#000000',
    source: 'fallback'
  },
  'vitality': {
    name: 'Team Vitality',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNmZjAwMDAiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+VjwvdGV4dD4KPC9zdmc+',
    colorPrimary: '#ff0000',
    colorSecondary: '#ffffff',
    source: 'fallback'
  }
};

function App() {
  const [liveMatches, setLiveMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Normalize PandaScore match data
  const normalizePandaScoreMatch = (match, gameType) => {
    const team1 = match.opponents?.[0]?.opponent;
    const team2 = match.opponents?.[1]?.opponent;
    
    return {
      id: match.id,
      teams: [
        {
          name: team1?.name || 'TBD',
          logoUrl: team1?.image_url || null,
          acronym: team1?.acronym || '',
          location: team1?.location || ''
        },
        {
          name: team2?.name || 'TBD', 
          logoUrl: team2?.image_url || null,
          acronym: team2?.acronym || '',
          location: team2?.location || ''
        }
      ],
      event: match.league?.name || match.tournament?.name || 'Unknown Tournament',
      serie: match.serie?.name || match.serie?.full_name || '',
      format: match.number_of_games || 3,
      time: match.scheduled_at || match.begin_at || '',
      live: match.status === 'running',
      game: gameType,
      status: match.status,
      streams: match.streams_list || [],
      results: match.results || []
    };
  };

  // Get game type from match data
  const getGameType = (match) => {
    // First check if game type is explicitly provided
    if (match.game) return match.game;
    
    // Check event name for game type keywords
    const eventName = (match.event || '').toLowerCase();
    if (eventName.includes('dota') || eventName.includes('dota2')) return 'DOTA 2';
    if (eventName.includes('cs') || eventName.includes('counter') || eventName.includes('strike')) return 'CS2';
    
    // Check team names as fallback
    const teamNames = [
      ...(match.teams || []).map(t => t.name || ''),
      ...(match.opponents || []).map(o => o.opponent?.name || '')
    ].join(' ').toLowerCase();
    
    if (teamNames.includes('dota')) return 'DOTA 2';
    if (teamNames.includes('cs') || teamNames.includes('counter')) return 'CS2';
    
    // Default to CS2 for unknown
    return 'CS2';
  };

  // Get region flag emoji based on event name
  const getRegionFlag = (event) => {
    const eventName = (event || '').toLowerCase();
    if (eventName.includes('europe') || eventName.includes('eu ')) return '🇪🇺';
    if (eventName.includes('america') || eventName.includes('na ') || eventName.includes('north')) return '🇺🇸';
    if (eventName.includes('asia') || eventName.includes('china') || eventName.includes('korea')) return '🌏';
    if (eventName.includes('oceania') || eventName.includes('oce ')) return '🇦🇺';
    if (eventName.includes('cis') || eventName.includes('russia')) return '🇷🇺';
    if (eventName.includes('brazil') || eventName.includes('br ')) return '🇧🇷';
    return '🌍';
  };

  // Extract tournament series from event name
  const getTournamentSeries = (event) => {
    const eventName = event || '';
    const seasonMatch = eventName.match(/season\s+(\d+)/i);
    const phaseMatch = eventName.match(/phase\s+(\d+)/i);
    const seriesMatch = eventName.match(/series\s+(\d+)/i);
    
    if (seasonMatch) return `Season ${seasonMatch[1]}`;
    if (phaseMatch) return `Phase ${phaseMatch[1]}`;
    if (seriesMatch) return `Series ${seriesMatch[1]}`;
    return null;
  };

  // Format time display
  const formatTime = (timeString) => {
    if (!timeString) return 'TBD';
    
    try {
      const date = new Date(timeString);
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return `Today ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      } else if (diffDays === 1) {
        return `Tomorrow ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      } else if (diffDays === -1) {
        return `Yesterday ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      } else if (diffDays > 1 && diffDays <= 7) {
        return date.toLocaleDateString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      }
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Group matches by tournament and sort by time
  const groupMatchesByTournament = (matches) => {
    const grouped = {};
    matches.forEach(match => {
      const tournament = match.event || 'Unknown Tournament';
      if (!grouped[tournament]) {
        grouped[tournament] = [];
      }
      grouped[tournament].push(match);
    });
    
    // Sort matches within each tournament by time
    Object.keys(grouped).forEach(tournament => {
      grouped[tournament].sort((a, b) => {
        const timeA = new Date(a.time || 0).getTime();
        const timeB = new Date(b.time || 0).getTime();
        return timeA - timeB;
      });
    });
    
    return grouped;
  };

  // Load matches data from PandaScore
  const loadMatches = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!PANDASCORE_TOKEN) {
        throw new Error('PandaScore API token not configured. Please set REACT_APP_PANDASCORE_TOKEN environment variable.');
      }

      console.log('Fetching matches from PandaScore...');
      
      // Fetch CS2 matches
      const [cs2LiveRes, cs2UpcomingRes, dota2LiveRes, dota2UpcomingRes] = await Promise.all([
        fetch(`${PANDASCORE_API}/csgo/matches/running?token=${PANDASCORE_TOKEN}&per_page=50`).then(r => r.json()),
        fetch(`${PANDASCORE_API}/csgo/matches/upcoming?token=${PANDASCORE_TOKEN}&per_page=50`).then(r => r.json()),
        fetch(`${PANDASCORE_API}/dota2/matches/running?token=${PANDASCORE_TOKEN}&per_page=50`).then(r => r.json()),
        fetch(`${PANDASCORE_API}/dota2/matches/upcoming?token=${PANDASCORE_TOKEN}&per_page=50`).then(r => r.json())
      ]);

      // Process and normalize all matches
      const allLiveMatches = [
        ...(cs2LiveRes || []).map(match => normalizePandaScoreMatch(match, 'CS2')),
        ...(dota2LiveRes || []).map(match => normalizePandaScoreMatch(match, 'DOTA 2'))
      ].filter(match => !match.event?.includes('GRID-TEST'));

      const allUpcomingMatches = [
        ...(cs2UpcomingRes || []).map(match => normalizePandaScoreMatch(match, 'CS2')),
        ...(dota2UpcomingRes || []).map(match => normalizePandaScoreMatch(match, 'DOTA 2'))
      ].filter(match => !match.event?.includes('GRID-TEST'));

      setLiveMatches(allLiveMatches);
      setUpcomingMatches(allUpcomingMatches);
      setError(null);
    } catch (err) {
      console.error('Error loading matches:', err);
      setError(err.message);
      setLiveMatches([]);
      setUpcomingMatches([]);
    } finally {
      setLoading(false);
    }
  };

  // Load matches on component mount
  useEffect(() => {
    loadMatches();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  // MatchCard component
  const MatchCard = ({ match }) => {
    const gameType = getGameType(match);
    const regionFlag = getRegionFlag(match.event);
    const tournamentSeries = getTournamentSeries(match.event);
    const formattedTime = formatTime(match.time);

    return (
      <div className="card">
        <div className="card-top">
          <div className="card-top-left">
            <span className="pill game-pill">{gameType}</span>
            {tournamentSeries && <span className="pill series-pill">{tournamentSeries}</span>
          </div>
          <div className="card-top-right">
            {match.status === 'running' && <span className="pill live-dot">LIVE</span>}
            {match.status === 'finished' && <span className="pill finished-pill">FINISHED</span>}
            <span className="time">{formattedTime}</span>
          </div>
        </div>
        
        <div className="teams">
          <div className="team">
            <span className="team-name">{match.teams[0].name}</span>
            {match.teams[0].acronym && <span className="team-acronym">({match.teams[0].acronym})</span>}
          </div>
          <div className="team">
            <span className="team-name">{match.teams[1].name}</span>
            {match.teams[1].acronym && <span className="team-acronym">({match.teams[1].acronym})</span>}
          </div>
        </div>

        {match.results && match.results.length > 0 && (
          <div className="scores">
            <span className="score">{match.results[0]?.score || 0}</span>
            <span className="score-separator">-</span>
            <span className="score">{match.results[1]?.score || 0}</span>
          </div>
        )}

        {match.streams && match.streams.length > 0 && (
          <div className="streams">
            {match.streams.map((stream, index) => (
              <a 
                key={index}
                href={stream.raw_url || stream.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="stream-link"
              >
                📺 {stream.english_name || stream.name || 'Watch'}
              </a>
            ))}
          </div>
        )}

        <div className="card-bottom">
          <span className="region-flag">{regionFlag}</span>
          <span className="event">{match.event}</span>
          {match.serie && <span className="serie-name"> • {match.serie}</span>}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading matches...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">Error loading matches: {error}</div>
      </div>
    );
  }

  const liveGrouped = groupMatchesByTournament(liveMatches);
  const upcomingGrouped = groupMatchesByTournament(upcomingMatches);

  return (
    <div className="app">
      <header className="header">
        <h1>Esports Match Viewer</h1>
        <p>Live and upcoming CS2 & DOTA 2 matches</p>
      </header>

      {Object.keys(liveGrouped).length > 0 && (
        <section className="section">
          <h2>Live Matches</h2>
          {Object.entries(liveGrouped).map(([tournament, matches]) => (
            <div key={tournament} className="tournament-group">
              <h3 className="tournament-header">{tournament}</h3>
              <div className="cards">
                {matches.map(match => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {Object.keys(upcomingGrouped).length > 0 && (
        <section className="section">
          <h2>Upcoming Matches</h2>
          {Object.entries(upcomingGrouped).map(([tournament, matches]) => (
            <div key={tournament} className="tournament-group">
              <h3 className="tournament-header">{tournament}</h3>
              <div className="cards">
                {matches.map(match => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {Object.keys(liveGrouped).length === 0 && Object.keys(upcomingGrouped).length === 0 && (
        <div className="no-matches">
          <h2>No matches found</h2>
          <p>Check back later for live and upcoming matches!</p>
        </div>
      )}
    </div>
  );
}

export default App;