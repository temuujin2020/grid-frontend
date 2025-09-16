# Proxy Server Setup for Esports API

## Problem
The PandaScore API blocks direct requests from GitHub Pages due to CORS (Cross-Origin Resource Sharing) restrictions.

## Solution
Deploy a proxy server on Render.com that handles API calls and serves data to your frontend.

## Setup Steps

### 1. Deploy Proxy Server to Render.com

1. **Create a new Web Service on Render.com**
   - Go to https://render.com
   - Click "New" → "Web Service"
   - Connect your GitHub repository

2. **Configure the Service**
   - **Name**: `esports-proxy` (or any name you prefer)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Root Directory**: Leave empty (or set to current directory)

3. **Set Environment Variables**
   - Go to your Render service settings
   - Add environment variable:
     - **Key**: `PANDASCORE_TOKEN`
     - **Value**: `F9aH4N1Sy6lQcNqQlEgPYnXHzXKfbdPzyGo-8dC6KySNDQVFpDY`

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Note your service URL (e.g., `https://esports-proxy.onrender.com`)

### 2. Update Frontend

1. **Update the proxy URL in your React app**
   ```javascript
   const PROXY_API = "https://your-actual-render-url.onrender.com";
   ```

2. **Deploy updated frontend to GitHub Pages**

## API Endpoints

The proxy server provides these endpoints:

- `GET /api/cs2/live` - CS2 live matches
- `GET /api/cs2/upcoming` - CS2 upcoming matches  
- `GET /api/dota2/live` - DOTA 2 live matches
- `GET /api/dota2/upcoming` - DOTA 2 upcoming matches
- `GET /health` - Health check

## Files to Deploy

Deploy these files to Render.com:
- `proxy-server.js`
- `package-proxy.json` (rename to `package.json`)

## Testing

Test the proxy server:
```bash
curl https://your-render-url.onrender.com/health
curl https://your-render-url.onrender.com/api/cs2/live
```

## Benefits

- ✅ Bypasses CORS restrictions
- ✅ Keeps API token secure on server
- ✅ Handles rate limiting
- ✅ Provides consistent API interface
- ✅ Easy to scale and maintain


