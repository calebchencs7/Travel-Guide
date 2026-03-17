import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView.jsx";
import Sidebar from "./components/Sidebar.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && data.error ? data.error : "Request failed";
    throw new Error(message);
  }
  return data;
}

export default function App() {
  const [places, setPlaces] = useState([]);
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [pendingLatLng, setPendingLatLng] = useState(null);
  const [mapPickEnabled, setMapPickEnabled] = useState(false);
  const [mode, setMode] = useState("place");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mapPickEnabledRef = useRef(mapPickEnabled);

  useEffect(() => {
    mapPickEnabledRef.current = mapPickEnabled;
  }, [mapPickEnabled]);

  const visiblePlaces = useMemo(() => {
    if (!selectedFolderId) return places;
    return places.filter((place) => place.folderId === selectedFolderId);
  }, [places, selectedFolderId]);

  const visiblePlaceIds = useMemo(
    () => new Set(visiblePlaces.map((place) => place.id)),
    [visiblePlaces]
  );

  const visibleNotes = useMemo(() => {
    if (!selectedFolderId) return notes;
    return notes.filter((note) => visiblePlaceIds.has(note.placeId));
  }, [notes, selectedFolderId, visiblePlaceIds]);

  const selectedPlace = useMemo(
    () => visiblePlaces.find((place) => place.id === selectedPlaceId) || null,
    [visiblePlaces, selectedPlaceId]
  );

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [placesData, notesData, foldersData] = await Promise.all([
        requestJson(`${API_BASE}/api/places`),
        requestJson(`${API_BASE}/api/notes`),
        requestJson(`${API_BASE}/api/folders`)
      ]);
      setPlaces(placesData);
      setNotes(notesData);
      setFolders(foldersData);
      if (!selectedPlaceId && placesData.length > 0) {
        setSelectedPlaceId(placesData[0].id);
      }
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedFolderId && !folders.some((f) => f.id === selectedFolderId)) {
      setSelectedFolderId(null);
    }
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (!selectedFolderId) return;
    if (!selectedPlaceId || !visiblePlaceIds.has(selectedPlaceId)) {
      setSelectedPlaceId(visiblePlaces[0]?.id || null);
    }
  }, [selectedFolderId, visiblePlaces, visiblePlaceIds, selectedPlaceId]);

  async function handleAddPlace({ name, lat, lng, folderId }) {
    setLoading(true);
    setError("");
    try {
      const place = await requestJson(`${API_BASE}/api/places`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lat, lng, folderId })
      });
      setPlaces((prev) => [...prev, place]);
      setSelectedPlaceId(place.id);
      setPendingLatLng(null);
      return place;
    } catch (err) {
      setError(err.message || "Failed to add place");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePlace(id) {
    setLoading(true);
    setError("");
    try {
      await requestJson(`${API_BASE}/api/places/${id}`, { method: "DELETE" });
      setPlaces((prev) => prev.filter((place) => place.id !== id));
      setNotes((prev) => prev.filter((note) => note.placeId !== id));
      if (selectedPlaceId === id) {
        const remaining = places.filter((place) => place.id !== id);
        setSelectedPlaceId(remaining[0]?.id || null);
      }
    } catch (err) {
      setError(err.message || "Failed to delete place");
    } finally {
      setLoading(false);
    }
  }

  async function handleMovePlace(id, folderId) {
    setLoading(true);
    setError("");
    try {
      const place = await requestJson(`${API_BASE}/api/places/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId })
      });
      setPlaces((prev) =>
        prev.map((item) => (item.id === place.id ? place : item))
      );
    } catch (err) {
      setError(err.message || "Failed to move place");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddFolder({ name, parentId }) {
    setLoading(true);
    setError("");
    try {
      const folder = await requestJson(`${API_BASE}/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId })
      });
      setFolders((prev) => [...prev, folder]);
      return folder;
    } catch (err) {
      setError(err.message || "Failed to create folder");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleRenameFolder(id, name) {
    setLoading(true);
    setError("");
    try {
      const folder = await requestJson(`${API_BASE}/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      setFolders((prev) =>
        prev.map((item) => (item.id === folder.id ? folder : item))
      );
    } catch (err) {
      setError(err.message || "Failed to rename folder");
    } finally {
      setLoading(false);
    }
  }

  async function handleMoveFolder(id, parentId) {
    setLoading(true);
    setError("");
    try {
      const folder = await requestJson(`${API_BASE}/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId })
      });
      setFolders((prev) =>
        prev.map((item) => (item.id === folder.id ? folder : item))
      );
    } catch (err) {
      setError(err.message || "Failed to move folder");
    } finally {
      setLoading(false);
    }
  }

  function collectFolderIds(items, rootId) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      items.forEach((folder) => {
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
      });
    }
    return ids;
  }

  async function handleDeleteFolder(id) {
    setLoading(true);
    setError("");
    try {
      await requestJson(`${API_BASE}/api/folders/${id}`, { method: "DELETE" });
      const toDelete = collectFolderIds(folders, id);
      setFolders((prev) => prev.filter((folder) => !toDelete.has(folder.id)));
      setPlaces((prev) =>
        prev.map((place) =>
          toDelete.has(place.folderId) ? { ...place, folderId: null } : place
        )
      );
      if (selectedFolderId && toDelete.has(selectedFolderId)) {
        setSelectedFolderId(null);
      }
    } catch (err) {
      setError(err.message || "Failed to delete folder");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddNote({ placeId, date, time, type, content }) {
    setLoading(true);
    setError("");
    try {
      const note = await requestJson(`${API_BASE}/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId, date, time, type, content })
      });
      setNotes((prev) => [note, ...prev]);
      return note;
    } catch (err) {
      setError(err.message || "Failed to add note");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteNote(id) {
    setLoading(true);
    setError("");
    try {
      await requestJson(`${API_BASE}/api/notes/${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((note) => note.id !== id));
    } catch (err) {
      setError(err.message || "Failed to delete note");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateNote(id, updates) {
    setLoading(true);
    setError("");
    try {
      const note = await requestJson(`${API_BASE}/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      setNotes((prev) =>
        prev.map((item) => (item.id === note.id ? note : item))
      );
      return note;
    } catch (err) {
      const message =
        err.message === "Request failed"
          ? "Failed to update note. Please restart server and try again."
          : err.message || "Failed to update note";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleReorderNotes(date, orderedIds) {
    const orderMap = new Map();
    orderedIds.forEach((id, index) => {
      orderMap.set(id, index);
    });

    setNotes((prev) =>
      prev.map((note) =>
        note.date === date && orderMap.has(note.id)
          ? { ...note, order: orderMap.get(note.id) }
          : note
      )
    );

    try {
      await Promise.all(
        orderedIds.map((id, index) =>
          requestJson(`${API_BASE}/api/notes/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: index })
          })
        )
      );
    } catch (err) {
      setError(err.message || "Failed to reorder notes");
    }
  }

  const handleMapClick = useCallback((latlng) => {
    if (!mapPickEnabledRef.current) return;
    setPendingLatLng(latlng);
    setMapPickEnabled(false);
  }, []);

  return (
    <div className="app">
      <Sidebar
        places={visiblePlaces}
        notes={visibleNotes}
        folders={folders}
        selectedPlace={selectedPlace}
        selectedPlaceId={selectedPlaceId}
        selectedFolderId={selectedFolderId}
        pendingLatLng={pendingLatLng}
        mapPickEnabled={mapPickEnabled}
        mode={mode}
        loading={loading}
        error={error}
        onModeChange={setMode}
        onSelectPlace={setSelectedPlaceId}
        onAddPlace={handleAddPlace}
        onDeletePlace={handleDeletePlace}
        onMovePlace={handleMovePlace}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        onUpdateNote={handleUpdateNote}
        onReorderNotes={handleReorderNotes}
        onClearPending={() => setPendingLatLng(null)}
        onToggleMapPick={setMapPickEnabled}
        onSelectFolder={setSelectedFolderId}
        onAddFolder={handleAddFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveFolder={handleMoveFolder}
      />
      <MapView
        places={visiblePlaces}
        notes={visibleNotes}
        selectedPlaceId={selectedPlaceId}
        pendingLatLng={pendingLatLng}
        onSelectPlace={setSelectedPlaceId}
        onMapClick={handleMapClick}
      />
    </div>
  );
}
