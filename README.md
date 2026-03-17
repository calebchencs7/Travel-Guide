# Travel Notes Map

Travel planning app with map-based places, folder organization, dated notes, and a timeline view.

## What It Supports
- Place management: add places from search or by clicking the map, select place, delete place
- Folder workspace: create nested folders, rename/delete folders, drag folder into another folder, move place to a folder
- Folder delete behavior: deleting a folder also deletes its subfolders and moves affected places to unfiled
- Place search: provider-based search
- `osm` mode: OpenStreetMap Nominatim search
- `amap` mode: AMap AutoComplete search
- Notes: add/edit/delete notes with `date`, optional `time`, and `type` (`note` or `food`)
- Timeline mode: group notes by day and drag to reorder notes within the same day
- Distance helper: show distance from current selected place to other visible places
- Map rendering: `osm` mode uses Leaflet + OpenStreetMap tiles, `amap` mode uses AMap JS API + AMap markers

## Tech Stack
- Client: React + Vite
- Map libs: Leaflet (`osm`) and AMap JS API (`amap`)
- Server: Node.js + Express
- Storage: LowDB JSON file (`server/data/db.json`)

## Project Structure
- `client/` frontend app
- `server/` backend API and JSON data storage

## Run Locally
1. Start backend
```bash
cd server
npm install
npm run dev
```

2. Start frontend (new terminal)
```bash
cd client
npm install
npm run dev
```

3. Open the Vite URL (usually `http://localhost:5173`)

Default API base is `http://localhost:3001`. Override with `VITE_API_BASE`.

## Client Environment Variables
Create `client/.env` if needed:

```bash
VITE_API_BASE=http://localhost:3001
VITE_MAP_PROVIDER=amap
# You can get a free amap key and security code at https://console.amap.com/dev/index
VITE_AMAP_KEY=
VITE_AMAP_SECURITY=
VITE_NOMINATIM_ENDPOINT=https://nominatim.openstreetmap.org/search
```

- `VITE_MAP_PROVIDER`: `osm` or `amap` (default is `osm`)
- `VITE_AMAP_KEY`: required when `VITE_MAP_PROVIDER=amap`
- `VITE_AMAP_SECURITY`: optional AMap JS API security code
- `VITE_NOMINATIM_ENDPOINT`: optional custom Nominatim endpoint for `osm` mode

## Backend API
- `GET /api/health`
- `GET/POST/PATCH/DELETE /api/places`
- `GET/POST/PATCH/DELETE /api/notes`
- `GET/POST/PATCH/DELETE /api/folders`

## Data File
- Stored at `server/data/db.json`
- Schema root keys: `places`, `notes`, `folders`
- Server startup normalizes missing keys and recreates safe defaults if JSON is malformed
