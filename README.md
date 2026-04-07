# SSG Lab — Live Sync Server

## Deploy FREE in 2 minutes on Railway

1. Go to https://railway.app → sign in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Upload this folder OR paste these files into a new GitHub repo
4. Railway auto-detects Node.js and deploys
5. Click your deployment → **"Settings"** → **"Generate Domain"**
6. Copy the URL (e.g. `https://ssg-sync-xxxx.railway.app`)
7. Paste that URL into the drawing tool's **"Live Sync"** panel

## Endpoints
- `GET /`        → health check
- `GET /state`   → current drawing state (JSON) — Claude reads this
- `POST /state`  → update state via REST
- `ws://`        → WebSocket connection for drawing tool

## Local test
```bash
npm install
npm start
# Server runs on http://localhost:8765
```
