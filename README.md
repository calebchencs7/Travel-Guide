# Travel Notes Map (React + Node.js)

A simple travel planning and note-taking app. Users can pick places on a map, attach notes (including food ideas) by date, review all notes together, and see distances between saved places.

## Features
- Click on the map to set a new place, then save it with a name
- Search places by name (OpenStreetMap Nominatim)
- Add notes by date and type (food or note)
- View notes by place or as a combined timeline
- See distances from the selected place to other saved places

## Structure
- `client/` React + Vite + Leaflet UI
- `server/` Node.js + Express API with JSON storage

## Run locally
1. Start the API
```bash
cd server
npm install
npm run dev
```

2. Start the client
```bash
cd client
npm install
npm run dev
```

The client expects the API at `http://localhost:3001`. You can change it via `VITE_API_BASE`.

## Notes
- Travel places/folders/notes are in `server/data/db.json`.
- The search uses OpenStreetMap Nominatim and may be rate limited.

## Map provider
Default map provider is OpenStreetMap. For better Chinese search in mainland China, you can switch to AMap.

Create `client/.env`:
```bash
VITE_MAP_PROVIDER=amap
VITE_AMAP_KEY=your_amap_key
VITE_AMAP_SECURITY=your_security_js_code
```
