import { useEffect, useMemo, useRef, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import {
  MapContainer,
  TileLayer,
  Circle,
  Marker,
  Popup,
  useMap,
  useMapEvents
} from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const DEFAULT_CENTER = [30, 120];
const DEFAULT_ZOOM = 5;
const MIN_FOCUS_ZOOM = 13;
const HIGHLIGHT_RADIUS_METERS = 800;
const HIGHLIGHT_STYLE = {
  strokeColor: "#2a9d8f",
  strokeWeight: 3,
  strokeOpacity: 0.9,
  fillColor: "#2a9d8f",
  fillOpacity: 0.22
};
const HIGHLIGHT_DASH = "6 8";
const MAP_PROVIDER = import.meta.env.VITE_MAP_PROVIDER || "osm";
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "";
const AMAP_SECURITY = import.meta.env.VITE_AMAP_SECURITY || "";

const TILE_PROVIDERS = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors"
  }
};

const tile = TILE_PROVIDERS[MAP_PROVIDER] || TILE_PROVIDERS.osm;
const NOTE_PREVIEW_LIMIT = 3;
const NOTE_TEXT_LIMIT = 48;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildNotesIndex(notes) {
  const map = new Map();
  notes.forEach((note) => {
    if (!map.has(note.placeId)) {
      map.set(note.placeId, []);
    }
    map.get(note.placeId).push(note);
  });
  map.forEach((list) => {
    list.sort((a, b) => {
      const dateCmp = (b.date || "").localeCompare(a.date || "");
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  });
  return map;
}

function truncateText(text, maxLength) {
  const value = String(text || "");
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getNotePreview(notes) {
  return (notes || []).slice(0, NOTE_PREVIEW_LIMIT);
}

const defaultMarkerIcon = L.divIcon({
  className: "custom-marker",
  html: "<span class='marker-dot'></span>",
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const selectedMarkerIcon = L.divIcon({
  className: "custom-marker",
  html: "<span class='marker-dot selected'></span>",
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const pendingMarkerIcon = L.divIcon({
  className: "custom-marker",
  html: "<span class='marker-dot pending'></span>",
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

function MapUpdater({ center, minZoom }) {
  const map = useMap();
  useEffect(() => {
    const currentZoom = map.getZoom();
    if (currentZoom < minZoom) {
      map.setView(center, minZoom, { animate: true });
    } else {
      map.panTo(center, { animate: true });
    }
  }, [center, minZoom, map]);
  return null;
}

function MapClicker({ onMapClick }) {
  const map = useMapEvents({
    click(event) {
      map.closePopup();
      onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    }
  });
  return null;
}

function LeafletView({
  places,
  notes,
  selectedPlaceId,
  pendingLatLng,
  onSelectPlace,
  onMapClick
}) {
  const notesByPlace = useMemo(() => buildNotesIndex(notes), [notes]);
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) || null,
    [places, selectedPlaceId]
  );

  const center = selectedPlace
    ? [selectedPlace.lat, selectedPlace.lng]
    : places.length > 0
    ? [places[0].lat, places[0].lng]
    : DEFAULT_CENTER;

  const initialZoom = selectedPlace ? 12 : places.length > 0 ? 8 : DEFAULT_ZOOM;

  return (
    <div className="map-panel">
      <MapContainer
        center={center}
        zoom={initialZoom}
        scrollWheelZoom
        className="map"
      >
        <MapUpdater center={center} minZoom={MIN_FOCUS_ZOOM} />
        <MapClicker onMapClick={onMapClick} />
        <TileLayer attribution={tile.attribution} url={tile.url} />
        {selectedPlace ? (
          <Circle
            center={[selectedPlace.lat, selectedPlace.lng]}
            radius={HIGHLIGHT_RADIUS_METERS}
            pathOptions={{
              color: HIGHLIGHT_STYLE.strokeColor,
              weight: HIGHLIGHT_STYLE.strokeWeight,
              fillColor: HIGHLIGHT_STYLE.fillColor,
              fillOpacity: HIGHLIGHT_STYLE.fillOpacity,
              dashArray: HIGHLIGHT_DASH
            }}
          />
        ) : null}
        {places.map((place) => (
          <Marker
            key={place.id}
            position={[place.lat, place.lng]}
            icon={
              place.id === selectedPlaceId ? selectedMarkerIcon : defaultMarkerIcon
            }
            zIndexOffset={place.id === selectedPlaceId ? 1000 : 0}
            eventHandlers={{
              click: () => onSelectPlace(place.id),
              mouseover: (event) => {
                event.target.openPopup();
              },
              mouseout: (event) => {
                event.target.closePopup();
              }
            }}
          >
            <Popup>
              <div className="popup">
                <div className="popup-title">{place.name}</div>
                <div className="popup-sub">
                  {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                </div>
                <div className="popup-notes">
                  <div className="popup-notes-title">Notes</div>
                  {getNotePreview(notesByPlace.get(place.id)).length === 0 ? (
                    <div className="popup-note-empty">No notes yet.</div>
                  ) : (
                    <ul className="popup-note-list">
                      {getNotePreview(notesByPlace.get(place.id)).map((note) => (
                        <li key={note.id}>
                          <span className="popup-note-date">
                            {note.date}
                            {note.time ? ` ${note.time}` : ""}
                          </span>
                          <span className="popup-note-text">
                            {truncateText(note.content, NOTE_TEXT_LIMIT)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        {pendingLatLng ? (
          <Marker
            position={[pendingLatLng.lat, pendingLatLng.lng]}
            icon={pendingMarkerIcon}
          >
            <Popup>
              <div className="popup">
                <div className="popup-title">New place</div>
                <div className="popup-sub">
                  {pendingLatLng.lat.toFixed(4)}, {pendingLatLng.lng.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}

function AMapView({
  places,
  notes,
  selectedPlaceId,
  pendingLatLng,
  onSelectPlace,
  onMapClick
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const amapRef = useRef(null);
  const markersRef = useRef(new Map());
  const pendingMarkerRef = useRef(null);
  const highlightRef = useRef({ polygons: [] });
  const infoWindowRef = useRef(null);
  const [error, setError] = useState("");

  const notesByPlace = useMemo(() => buildNotesIndex(notes), [notes]);
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) || null,
    [places, selectedPlaceId]
  );

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) return;
      if (!AMAP_KEY) {
        setError("AMap key missing. Set VITE_AMAP_KEY in client/.env.");
        return;
      }
      try {
        if (AMAP_SECURITY) {
          window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY };
        }
        const AMap = await AMapLoader.load({
          key: AMAP_KEY,
          version: "2.0",
          plugins: ["AMap.DistrictSearch"]
        });
        if (cancelled) return;
        amapRef.current = AMap;

        const initialCenter = selectedPlace
          ? [selectedPlace.lng, selectedPlace.lat]
          : places.length > 0
          ? [places[0].lng, places[0].lat]
          : [DEFAULT_CENTER[1], DEFAULT_CENTER[0]];
        const initialZoom = selectedPlace
          ? 12
          : places.length > 0
          ? 8
          : DEFAULT_ZOOM;

        const map = new AMap.Map(containerRef.current, {
          zoom: initialZoom,
          center: initialCenter,
          viewMode: "2D"
        });
        mapRef.current = map;

        map.on("click", (event) => {
          if (infoWindowRef.current) {
            infoWindowRef.current.close();
          }
          onMapClick({
            lat: event.lnglat.getLat(),
            lng: event.lnglat.getLng()
          });
        });
      } catch (err) {
        setError(err.message || "AMap failed to load.");
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const target = selectedPlace || places[0];
    if (target) {
      const lng = Number(target.lng);
      const lat = Number(target.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      const currentZoom = mapRef.current.getZoom();
      if (currentZoom < MIN_FOCUS_ZOOM) {
        mapRef.current.setZoomAndCenter(MIN_FOCUS_ZOOM, [lng, lat]);
      } else {
        mapRef.current.setCenter([lng, lat]);
      }
    } else {
      mapRef.current.setCenter([DEFAULT_CENTER[1], DEFAULT_CENTER[0]]);
    }
  }, [selectedPlace, places]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();

    const ensureInfoWindow = () => {
      if (!infoWindowRef.current) {
        infoWindowRef.current = new AMap.InfoWindow({
          isCustom: false,
          autoMove: true,
          offset: new AMap.Pixel(0, -18)
        });
      }
      return infoWindowRef.current;
    };

    const buildInfoContent = (place) => {
      const items = getNotePreview(notesByPlace.get(place.id));
      const notesHtml =
        items.length === 0
          ? "<div class='popup-note-empty'>No notes yet.</div>"
          : `<ul class='popup-note-list'>${items
              .map(
                (note) =>
                  `<li><span class='popup-note-date'>${escapeHtml(
                    `${note.date}${note.time ? ` ${note.time}` : ""}`
                  )}</span><span class='popup-note-text'>${escapeHtml(
                    truncateText(note.content, NOTE_TEXT_LIMIT)
                  )}</span></li>`
              )
              .join("")}</ul>`;
      return `
        <div class="popup">
          <div class="popup-title">${escapeHtml(place.name)}</div>
          <div class="popup-sub">${place.lat.toFixed(4)}, ${place.lng.toFixed(
        4
      )}</div>
          <div class="popup-notes">
            <div class="popup-notes-title">Notes</div>
            ${notesHtml}
          </div>
        </div>
      `;
    };

    places.forEach((place) => {
      const isSelected = place.id === selectedPlaceId;
      const marker = new AMap.Marker({
        position: [place.lng, place.lat],
        title: place.name,
        content: `<div class=\"amap-marker-dot${
          isSelected ? " selected" : ""
        }\"></div>`,
        offset: new AMap.Pixel(-8, -8),
        zIndex: isSelected ? 200 : 100
      });
      marker.on("mouseover", () => {
        const infoWindow = ensureInfoWindow();
        infoWindow.setContent(buildInfoContent(place));
        infoWindow.open(map, marker.getPosition());
      });
      marker.on("mouseout", () => {
        if (infoWindowRef.current) {
          infoWindowRef.current.close();
        }
      });
      marker.on("click", () => {
        onSelectPlace(place.id);
      });
      marker.setMap(map);
      markersRef.current.set(place.id, marker);
    });

    if (pendingLatLng) {
      if (pendingMarkerRef.current) {
        pendingMarkerRef.current.setMap(null);
      }
      const marker = new AMap.Marker({
        position: [pendingLatLng.lng, pendingLatLng.lat],
        content: "<div class=\"amap-marker-dot pending\"></div>",
        offset: new AMap.Pixel(-8, -8),
        zIndex: 300
      });
      marker.setMap(map);
      pendingMarkerRef.current = marker;
    } else if (pendingMarkerRef.current) {
      pendingMarkerRef.current.setMap(null);
      pendingMarkerRef.current = null;
    }
  }, [places, pendingLatLng, selectedPlaceId, onSelectPlace, notesByPlace]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap) return;

    let cancelled = false;

    const clearHighlight = () => {
      highlightRef.current.polygons.forEach((polygon) => polygon.setMap(null));
      highlightRef.current.polygons = [];
    };

    clearHighlight();

    if (!selectedPlace) return () => {};

    const lng = Number(selectedPlace.lng);
    const lat = Number(selectedPlace.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return () => {};

    const queryName = (selectedPlace.name || "")
      .split(" · ")[0]
      .trim();
    if (!queryName) return () => {};

    const districtSearch = new AMap.DistrictSearch({
      subdistrict: 0,
      extensions: "all"
    });

    districtSearch.search(queryName, (status, result) => {
      if (cancelled) return;
      const boundaries = result?.districtList?.[0]?.boundaries;
      if (status !== "complete" || !Array.isArray(boundaries)) return;
      if (boundaries.length === 0) return;

      highlightRef.current.polygons = boundaries.map((boundary) => {
        const polygon = new AMap.Polygon({
          path: boundary,
          strokeColor: HIGHLIGHT_STYLE.strokeColor,
          strokeWeight: HIGHLIGHT_STYLE.strokeWeight,
          strokeOpacity: HIGHLIGHT_STYLE.strokeOpacity,
          fillColor: HIGHLIGHT_STYLE.fillColor,
          fillOpacity: HIGHLIGHT_STYLE.fillOpacity
        });
        polygon.setMap(map);
        return polygon;
      });
    });

    return () => {
      cancelled = true;
      highlightRef.current.polygons.forEach((polygon) => polygon.setMap(null));
      highlightRef.current.polygons = [];
    };
  }, [selectedPlace]);

  return (
    <div className="map-panel">
      <div ref={containerRef} className="map" />
      {error ? <div className="map-error">{error}</div> : null}
    </div>
  );
}

export default function MapView(props) {
  if (MAP_PROVIDER === "amap") {
    return <AMapView {...props} />;
  }
  return <LeafletView {...props} />;
}
