const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

const PANDASCORE_API = "https://api.pandascore.co";
const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN;

// Proxy endpoint for CS2 matches
app.get('/api/cs2/live', async (req, res) => {
  try {
    const response = await fetch(`${PANDASCORE_API}/csgo/matches/running?token=${PANDASCORE_TOKEN}&per_page=50`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch CS2 live matches' });
  }
});

app.get('/api/cs2/upcoming', async (req, res) => {
  try {
    const response = await fetch(`${PANDASCORE_API}/csgo/matches/upcoming?token=${PANDASCORE_TOKEN}&per_page=50`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch CS2 upcoming matches' });
  }
});

app.get('/api/cs2/past', async (req, res) => {
  try {
    const response = await fetch(`${PANDASCORE_API}/csgo/matches/past?token=${PANDASCORE_TOKEN}&per_page=50`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch CS2 past matches' });
  }
});

// Proxy endpoint for DOTA 2 matches
app.get('/api/dota2/live', async (req, res) => {
  try {
    const response = await fetch(`${PANDASCORE_API}/dota2/matches/running?token=${PANDASCORE_TOKEN}&per_page=50`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch DOTA 2 live matches' });
  }
});

app.get('/api/dota2/upcoming', async (req, res) => {
  try {
    const response = await fetch(`${PANDASCORE_API}/dota2/matches/upcoming?token=${PANDASCORE_TOKEN}&per_page=50`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch DOTA 2 upcoming matches' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});


