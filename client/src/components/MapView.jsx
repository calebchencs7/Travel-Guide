import { useEffect, useMemo, useRef, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import {
  MapContainer,
  TileLayer,
  Circle,
  Polyline,
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
const ROUTE_COLOR = "#e76f51";
const ROUTE_WEIGHT = 5;
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
    .replace(/\"/g, "&quot;")
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

const searchPreviewMarkerIcon = L.divIcon({
  className: "custom-marker",
  html: "<span class='marker-dot preview'></span>",
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

function normalizeRoutePath(routePath) {
  return (routePath || [])
    .map((point) => ({
      lat: Number(point?.lat),
      lng: Number(point?.lng)
    }))
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
    );
}

function MapUpdater({ center, minZoom, routePositions }) {
  const map = useMap();
  useEffect(() => {
    if (routePositions.length > 1) {
      map.fitBounds(routePositions, {
        padding: [64, 64],
        animate: true,
        maxZoom: 13
      });
      return;
    }

    if (routePositions.length === 1) {
      const currentZoom = map.getZoom();
      if (currentZoom < minZoom) {
        map.setView(routePositions[0], minZoom, { animate: true });
      } else {
        map.panTo(routePositions[0], { animate: true });
      }
      return;
    }

    const currentZoom = map.getZoom();
    if (currentZoom < minZoom) {
      map.setView(center, minZoom, { animate: true });
    } else {
      map.panTo(center, { animate: true });
    }
  }, [center, minZoom, map, routePositions]);
  return null;
}

function MapClicker({ onMapClick, onBlankMapClick }) {
  const map = useMapEvents({
    click(event) {
      map.closePopup();
      if (onBlankMapClick) {
        onBlankMapClick();
      }
      onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    }
  });
  return null;
}

function LeafletView({
  places,
  notes,
  selectedPlaceId,
  routePath,
  pendingLatLng,
  searchPreviewPlace,
  onSelectPlace,
  onMapClick
}) {
  const notesByPlace = useMemo(() => buildNotesIndex(notes), [notes]);
  const routePositions = useMemo(
    () => normalizeRoutePath(routePath).map((point) => [point.lat, point.lng]),
    [routePath]
  );
  const [pinnedPopupPlaceId, setPinnedPopupPlaceId] = useState(null);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) || null,
    [places, selectedPlaceId]
  );
  const previewPlace = useMemo(() => {
    if (!searchPreviewPlace) return null;
    const lat = Number(searchPreviewPlace.lat);
    const lng = Number(searchPreviewPlace.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      id: String(searchPreviewPlace.id || "search-preview"),
      name: searchPreviewPlace.name || "Search result",
      lat,
      lng
    };
  }, [searchPreviewPlace]);
  const focusPlace = previewPlace || selectedPlace;

  useEffect(() => {
    if (!pinnedPopupPlaceId) return;
    const exists = places.some((place) => place.id === pinnedPopupPlaceId);
    if (!exists) {
      setPinnedPopupPlaceId(null);
    }
  }, [places, pinnedPopupPlaceId]);

  const center =
    routePositions[0] ||
    (focusPlace
      ? [focusPlace.lat, focusPlace.lng]
      : places.length > 0
      ? [places[0].lat, places[0].lng]
      : DEFAULT_CENTER);

  const initialZoom =
    routePositions.length > 1
      ? 10
      : focusPlace
      ? 12
      : places.length > 0
      ? 8
      : DEFAULT_ZOOM;

  return (
    <div className="map-panel">
      <MapContainer
        center={center}
        zoom={initialZoom}
        scrollWheelZoom
        className="map"
      >
        <MapUpdater
          center={center}
          minZoom={MIN_FOCUS_ZOOM}
          routePositions={routePositions}
        />
        <MapClicker
          onMapClick={onMapClick}
          onBlankMapClick={() => setPinnedPopupPlaceId(null)}
        />
        <TileLayer attribution={tile.attribution} url={tile.url} />
        {routePositions.length > 1 ? (
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: ROUTE_COLOR,
              weight: ROUTE_WEIGHT,
              opacity: 0.82
            }}
          />
        ) : null}
        {focusPlace ? (
          <Circle
            center={[focusPlace.lat, focusPlace.lng]}
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
              click: (event) => {
                setPinnedPopupPlaceId(place.id);
                event.target.openPopup();
                onSelectPlace(place.id);
              },
              mouseover: (event) => {
                if (pinnedPopupPlaceId === place.id) return;
                event.target.openPopup();
              },
              mouseout: (event) => {
                if (pinnedPopupPlaceId === place.id) return;
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
        {previewPlace ? (
          <Marker
            position={[previewPlace.lat, previewPlace.lng]}
            icon={searchPreviewMarkerIcon}
            zIndexOffset={1200}
          >
            <Popup>
              <div className="popup">
                <div className="popup-title">Search preview</div>
                <div className="popup-sub">{previewPlace.name}</div>
                <div className="popup-sub">
                  {previewPlace.lat.toFixed(4)}, {previewPlace.lng.toFixed(4)}
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
  routePath,
  pendingLatLng,
  searchPreviewPlace,
  onSelectPlace,
  onMapClick
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const amapRef = useRef(null);
  const markersRef = useRef(new Map());
  const pendingMarkerRef = useRef(null);
  const previewMarkerRef = useRef(null);
  const highlightRef = useRef({ polygons: [] });
  const infoWindowRef = useRef(null);
  const routePolylineRef = useRef(null);
  const pinnedPopupPlaceIdRef = useRef(null);
  const [error, setError] = useState("");

  const notesByPlace = useMemo(() => buildNotesIndex(notes), [notes]);
  const routePoints = useMemo(() => normalizeRoutePath(routePath), [routePath]);
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) || null,
    [places, selectedPlaceId]
  );
  const previewPlace = useMemo(() => {
    if (!searchPreviewPlace) return null;
    const lat = Number(searchPreviewPlace.lat);
    const lng = Number(searchPreviewPlace.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      id: String(searchPreviewPlace.id || "search-preview"),
      name: searchPreviewPlace.name || "Search result",
      lat,
      lng
    };
  }, [searchPreviewPlace]);

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

        const initialTarget = previewPlace || selectedPlace;
        const initialCenter = initialTarget
          ? [initialTarget.lng, initialTarget.lat]
          : places.length > 0
          ? [places[0].lng, places[0].lat]
          : [DEFAULT_CENTER[1], DEFAULT_CENTER[0]];
        const initialZoom = initialTarget
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
          pinnedPopupPlaceIdRef.current = null;
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
      routePolylineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    if (routePoints.length > 0) return;

    const target = previewPlace || selectedPlace || places[0];
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
  }, [previewPlace, selectedPlace, places, routePoints]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();

    if (
      pinnedPopupPlaceIdRef.current &&
      !places.some((place) => place.id === pinnedPopupPlaceIdRef.current)
    ) {
      pinnedPopupPlaceIdRef.current = null;
    }

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

    const openPlaceInfo = (place, marker) => {
      const infoWindow = ensureInfoWindow();
      infoWindow.setContent(buildInfoContent(place));
      infoWindow.open(map, marker.getPosition());
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
        if (pinnedPopupPlaceIdRef.current === place.id) return;
        openPlaceInfo(place, marker);
      });
      marker.on("mouseout", () => {
        if (pinnedPopupPlaceIdRef.current === place.id) return;
        if (infoWindowRef.current) {
          infoWindowRef.current.close();
        }
      });
      marker.on("click", () => {
        pinnedPopupPlaceIdRef.current = place.id;
        openPlaceInfo(place, marker);
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

    if (previewPlace) {
      if (previewMarkerRef.current) {
        previewMarkerRef.current.setMap(null);
      }
      const marker = new AMap.Marker({
        position: [previewPlace.lng, previewPlace.lat],
        title: previewPlace.name,
        content: "<div class=\"amap-marker-dot preview\"></div>",
        offset: new AMap.Pixel(-8, -8),
        zIndex: 320
      });
      marker.on("mouseover", () => {
        const infoWindow = ensureInfoWindow();
        infoWindow.setContent(`
          <div class="popup">
            <div class="popup-title">Search preview</div>
            <div class="popup-sub">${escapeHtml(previewPlace.name)}</div>
            <div class="popup-sub">${previewPlace.lat.toFixed(
              4
            )}, ${previewPlace.lng.toFixed(4)}</div>
          </div>
        `);
        infoWindow.open(map, marker.getPosition());
      });
      marker.on("mouseout", () => {
        if (infoWindowRef.current) {
          infoWindowRef.current.close();
        }
      });
      marker.setMap(map);
      previewMarkerRef.current = marker;
    } else if (previewMarkerRef.current) {
      previewMarkerRef.current.setMap(null);
      previewMarkerRef.current = null;
    }
  }, [
    places,
    pendingLatLng,
    previewPlace,
    selectedPlaceId,
    onSelectPlace,
    notesByPlace
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap) return;

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    if (routePoints.length === 0) return;

    const path = routePoints.map((point) => [point.lng, point.lat]);
    if (path.length === 1) {
      const currentZoom = map.getZoom();
      if (currentZoom < MIN_FOCUS_ZOOM) {
        map.setZoomAndCenter(MIN_FOCUS_ZOOM, path[0]);
      } else {
        map.setCenter(path[0]);
      }
      return;
    }

    const routeLine = new AMap.Polyline({
      path,
      strokeColor: ROUTE_COLOR,
      strokeWeight: ROUTE_WEIGHT,
      strokeOpacity: 0.82,
      strokeStyle: "solid",
      lineJoin: "round",
      lineCap: "round",
      showDir: true
    });
    routeLine.setMap(map);
    routePolylineRef.current = routeLine;
    map.setFitView([routeLine], false, [72, 72, 72, 72], 13);

    return () => {
      if (routePolylineRef.current === routeLine) {
        routeLine.setMap(null);
        routePolylineRef.current = null;
      }
    };
  }, [routePoints]);

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

    if (previewPlace || !selectedPlace) return () => {};

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
  }, [previewPlace, selectedPlace]);

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
