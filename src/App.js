import React, { useState, useEffect } from 'react';
import './App.css';

// Use PandaScore API through new proxy server
const PROXY_API = "https://esports-proxy.onrender.com";

// Enhanced normalization function with all available API data
const normalizePandaScoreMatch = (match, gameType) => {
  const now = new Date();
  const matchTime = new Date(match.scheduled_at || match.begin_at);
  const isLive = match.live || match.status === 'running';
  const isFinished = match.status === 'finished' || match.isFinished;
  
  // Get detailed team information
  const teams = match.opponents?.map((opponent, index) => {
    const team = opponent.opponent || opponent;
    const result = match.results?.[index];
    
    return {
      id: team.id,
      name: team.name || 'TBD',
      acronym: team.acronym || team.name?.substring(0, 3).toUpperCase() || 'TBD',
      logoUrl: team.image_url || null,
      location: team.location || null,
      slug: team.slug || null,
      score: result?.score || 0,
      winner: result?.winner || false,
      modifiedAt: team.modified_at || null
    };
  }) || [];

  // Get detailed tournament/league information
  const tournament = match.league || match.serie || match.tournament || {};
  const serie = match.serie || {};
  
  const tournamentInfo = {
    id: tournament.id || serie.id,
    name: tournament.name || serie.name || match.name || 'Unknown Tournament',
    logoUrl: tournament.image_url || null,
    slug: tournament.slug || serie.slug,
    url: tournament.url || null,
    year: serie.year || new Date().getFullYear(),
    season: serie.season || null,
    fullName: serie.full_name || tournament.name,
    beginAt: serie.begin_at || null,
    endAt: serie.end_at || null,
    winnerId: serie.winner_id || null,
    winnerType: serie.winner_type || null,
    modifiedAt: tournament.modified_at || serie.modified_at
  };

  // Format time with more detail
  let timeDisplay = '';
  let timeDetail = '';
  
  if (isLive) {
    timeDisplay = 'LIVE';
    timeDetail = 'Match in progress';
  } else if (isFinished) {
    timeDisplay = 'Finished';
    const endTime = new Date(match.end_at || matchTime);
    timeDetail = `Ended ${endTime.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })}`;
  } else {
    const timeDiff = matchTime.getTime() - now.getTime();
    if (timeDiff < 0) {
      timeDisplay = 'Started';
      timeDetail = 'Match has begun';
    } else if (timeDiff < 24 * 60 * 60 * 1000) {
      timeDisplay = `Today ${matchTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })}`;
      timeDetail = `In ${Math.floor(timeDiff / (60 * 60 * 1000))}h ${Math.floor((timeDiff % (60 * 60 * 1000)) / (60 * 1000))}m`;
    } else {
      timeDisplay = matchTime.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      timeDetail = `In ${Math.floor(timeDiff / (24 * 60 * 60 * 1000))} days`;
    }
  }

  // Get detailed scores and game information
  let gameInfo = null;
  if (match.games && match.games.length > 0) {
    gameInfo = {
      totalGames: match.number_of_games || match.games.length,
      completedGames: match.games.filter(game => game.finished).length,
      games: match.games.map(game => ({
        id: game.id,
        position: game.position,
        status: game.status,
        length: game.length,
        finished: game.finished,
        beginAt: game.begin_at,
        endAt: game.end_at,
        complete: game.complete
      }))
    };
  }

  // Get match statistics
  const matchStats = {
    matchType: match.match_type || 'Best of 3',
    numberOfGames: match.number_of_games || 3,
    gameAdvantage: match.game_advantage || null,
    forfeit: match.forfeit || false,
    draw: match.draw || false,
    rescheduled: match.rescheduled || false,
    originalScheduledAt: match.original_scheduled_at || null,
    detailedStats: match.detailed_stats || null,
    live: match.live || false,
    modifiedAt: match.modified_at || null
  };

  return {
    id: match.id,
    gameType,
    teams,
    tournament: tournamentInfo,
    time: timeDisplay,
    timeDetail,
    isLive,
    isFinished,
    gameInfo,
    matchStats,
    streamUrl: match.stream_url || null,
    // Additional metadata
    videogame: match.videogame || { id: gameType === 'CS2' ? 3 : 4, name: gameType, slug: gameType.toLowerCase() },
    leagueId: match.league_id || null,
    name: match.name || null
  };
};

// Enhanced team logo component with fallback
const TeamLogo = ({ team, size = 32, className = '' }) => {
  const [imageError, setImageError] = useState(false);
  
  const getFallbackLogo = (teamName) => {
    const teamKey = teamName?.toLowerCase().replace(/\s+/g, '') || 'unknown';
    return `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiM2NjY2NjYiLz4KPHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+VDwvdGV4dD4KPC9zdmc+`;
  };

  const logoUrl = team.logoUrl && !imageError ? team.logoUrl : getFallbackLogo(team.name);

  return (
    <img
      src={logoUrl}
      alt={`${team.name} logo`}
      className={`team-logo ${className}`}
      style={{ width: size, height: size, borderRadius: '50%' }}
      onError={() => setImageError(true)}
    />
  );
};

// Enhanced match card component with all information
const MatchCard = ({ match, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const getStatusColor = () => {
    if (match.isLive) return '#ff4444';
    if (match.isFinished) return '#44ff44';
    return '#4444ff';
  };

  const getStatusIcon = () => {
    if (match.isLive) return '🔴';
    if (match.isFinished) return '✅';
    return '⏰';
  };

  return (
    <div 
      className={`match-card ${match.isLive ? 'live' : ''} ${match.isFinished ? 'finished' : ''} ${isExpanded ? 'expanded' : ''}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Header with tournament info */}
      <div className="match-header">
        <div className="tournament-info">
          {match.tournament.logoUrl && (
            <img 
              src={match.tournament.logoUrl} 
              alt={match.tournament.name}
              className="tournament-logo"
            />
          )}
          <div className="tournament-details">
            <h3 className="tournament-name">{match.tournament.name}</h3>
            {match.tournament.season && (
              <span className="tournament-season">{match.tournament.season}</span>
            )}
          </div>
        </div>
        <div className="match-status">
          <span className="status-icon">{getStatusIcon()}</span>
          <span className="status-text" style={{ color: getStatusColor() }}>
            {match.time}
          </span>
        </div>
      </div>

      {/* Teams section */}
      <div className="teams-section">
        {match.teams.map((team, teamIndex) => (
          <div key={team.id || teamIndex} className={`team ${team.winner ? 'winner' : ''}`}>
            <TeamLogo team={team} size={40} />
            <div className="team-info">
              <div className="team-name">{team.name}</div>
              {team.acronym && team.acronym !== team.name && (
                <div className="team-acronym">{team.acronym}</div>
              )}
              {team.location && (
                <div className="team-location">📍 {team.location}</div>
              )}
            </div>
            {match.isLive || match.isFinished ? (
              <div className="team-score">{team.score}</div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Match details */}
      <div className="match-details">
        <div className="match-format">
          <span className="format-badge">{match.matchStats.matchType}</span>
          {match.gameInfo && (
            <span className="games-progress">
              {match.gameInfo.completedGames}/{match.gameInfo.totalGames} games
            </span>
          )}
        </div>
        
        {match.timeDetail && (
          <div className="time-detail">{match.timeDetail}</div>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="expanded-details">
          <div className="detail-section">
            <h4>Tournament Information</h4>
            <p><strong>League:</strong> {match.tournament.name}</p>
            {match.tournament.fullName && (
              <p><strong>Full Name:</strong> {match.tournament.fullName}</p>
            )}
            {match.tournament.year && (
              <p><strong>Year:</strong> {match.tournament.year}</p>
            )}
            {match.tournament.beginAt && (
              <p><strong>Tournament Start:</strong> {new Date(match.tournament.beginAt).toLocaleDateString()}</p>
            )}
          </div>

          {match.gameInfo && (
            <div className="detail-section">
              <h4>Game Details</h4>
              <p><strong>Format:</strong> {match.matchStats.matchType}</p>
              <p><strong>Total Games:</strong> {match.gameInfo.totalGames}</p>
              <p><strong>Completed:</strong> {match.gameInfo.completedGames}</p>
              {match.matchStats.gameAdvantage && (
                <p><strong>Game Advantage:</strong> {match.matchStats.gameAdvantage}</p>
              )}
            </div>
          )}

          <div className="detail-section">
            <h4>Match Information</h4>
            <p><strong>Match ID:</strong> {match.id}</p>
            <p><strong>Game:</strong> {match.gameType}</p>
            {match.matchStats.rescheduled && (
              <p><strong>Status:</strong> Rescheduled</p>
            )}
            {match.matchStats.forfeit && (
              <p><strong>Status:</strong> Forfeit</p>
            )}
            {match.matchStats.draw && (
              <p><strong>Status:</strong> Draw</p>
            )}
          </div>

          {match.teams.map((team, teamIndex) => (
            <div key={team.id || teamIndex} className="detail-section">
              <h4>Team {teamIndex + 1}: {team.name}</h4>
              <p><strong>Acronym:</strong> {team.acronym}</p>
              {team.location && <p><strong>Location:</strong> {team.location}</p>}
              <p><strong>Team ID:</strong> {team.id}</p>
              {team.slug && <p><strong>Slug:</strong> {team.slug}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Expand/collapse indicator */}
      <div className="expand-indicator">
        {isExpanded ? '▼' : '▶'}
      </div>
    </div>
  );
};

// Main App component
function App() {
  const [liveMatches, setLiveMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGame, setSelectedGame] = useState('all');

  // Load matches data from PandaScore
  const loadMatches = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Fetching matches from proxy server...');
      
      // Fetch CS2 matches
      const [cs2LiveRes, cs2UpcomingRes, dota2LiveRes, dota2UpcomingRes] = await Promise.all([
        fetch(`${PROXY_API}/api/cs2/live`).then(r => r.json()),
        fetch(`${PROXY_API}/api/cs2/upcoming`).then(r => r.json()),
        fetch(`${PROXY_API}/api/dota2/live`).then(r => r.json()),
        fetch(`${PROXY_API}/api/dota2/upcoming`).then(r => r.json())
      ]);

      // Process and normalize all matches
      const allLiveMatches = [
        ...(cs2LiveRes || []).map(match => normalizePandaScoreMatch(match, 'CS2')),
        ...(dota2LiveRes || []).map(match => normalizePandaScoreMatch(match, 'DOTA 2'))
      ].filter(match => !match.tournament.name?.includes('GRID-TEST'));

      const allUpcomingMatches = [
        ...(cs2UpcomingRes || []).map(match => normalizePandaScoreMatch(match, 'CS2')),
        ...(dota2UpcomingRes || []).map(match => normalizePandaScoreMatch(match, 'DOTA 2'))
      ].filter(match => !match.tournament.name?.includes('GRID-TEST'));

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

  useEffect(() => {
    loadMatches();
    const interval = setInterval(loadMatches, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const filteredLiveMatches = selectedGame === 'all' 
    ? liveMatches 
    : liveMatches.filter(match => match.gameType === selectedGame);

  const filteredUpcomingMatches = selectedGame === 'all' 
    ? upcomingMatches 
    : upcomingMatches.filter(match => match.gameType === selectedGame);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading esports matches...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">
          <h2>Error Loading Matches</h2>
          <p>{error}</p>
          <button onClick={loadMatches} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎮 Esports Match Center</h1>
        <p>Live and upcoming esports matches with detailed information</p>
        
        <div className="game-filter">
          <button 
            className={selectedGame === 'all' ? 'active' : ''}
            onClick={() => setSelectedGame('all')}
          >
            All Games
          </button>
          <button 
            className={selectedGame === 'CS2' ? 'active' : ''}
            onClick={() => setSelectedGame('CS2')}
          >
            CS2
          </button>
          <button 
            className={selectedGame === 'DOTA 2' ? 'active' : ''}
            onClick={() => setSelectedGame('DOTA 2')}
          >
            DOTA 2
          </button>
        </div>
      </header>

      <main className="app-main">
        {filteredLiveMatches.length > 0 && (
          <section className="matches-section">
            <h2 className="section-title">
              🔴 Live Matches ({filteredLiveMatches.length})
            </h2>
            <div className="matches-grid">
              {filteredLiveMatches.map((match, index) => (
                <MatchCard key={match.id} match={match} index={index} />
              ))}
            </div>
          </section>
        )}

        {filteredUpcomingMatches.length > 0 && (
          <section className="matches-section">
            <h2 className="section-title">
              ⏰ Upcoming Matches ({filteredUpcomingMatches.length})
            </h2>
            <div className="matches-grid">
              {filteredUpcomingMatches.map((match, index) => (
                <MatchCard key={match.id} match={match} index={index} />
              ))}
            </div>
          </section>
        )}

        {filteredLiveMatches.length === 0 && filteredUpcomingMatches.length === 0 && (
          <div className="no-matches">
            <h2>No matches available</h2>
            <p>Check back later for upcoming matches!</p>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Data provided by <a href="https://pandascore.co" target="_blank" rel="noopener noreferrer">PandaScore</a></p>
        <p>Last updated: {new Date().toLocaleTimeString()}</p>
      </footer>
    </div>
  );
}

export default App;
