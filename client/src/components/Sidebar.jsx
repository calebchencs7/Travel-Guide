import { useEffect, useMemo, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";

function formatKm(value) {
  if (!Number.isFinite(value)) return "-";
  if (value < 1) return `${(value * 1000).toFixed(0)} m`;
  return `${value.toFixed(2)} km`;
}

function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function parseTimeToMinutes(value) {
  if (!value || typeof value !== "string") return null;
  const [hh, mm] = value.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function reorderItemsByDrop(items, draggedId, targetId, position) {
  const next = [...items];
  const fromIndex = next.findIndex((item) => item.id === draggedId);
  if (fromIndex === -1) return next;

  const [moved] = next.splice(fromIndex, 1);
  if (!targetId || position === "end") {
    next.push(moved);
    return next;
  }

  let targetIndex = next.findIndex((item) => item.id === targetId);
  if (targetIndex === -1) {
    next.push(moved);
    return next;
  }
  if (position === "after") {
    targetIndex += 1;
  }
  next.splice(targetIndex, 0, moved);
  return next;
}

const now = new Date();
const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 10);
const MAP_PROVIDER = import.meta.env.VITE_MAP_PROVIDER || "osm";
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "";
const AMAP_SECURITY = import.meta.env.VITE_AMAP_SECURITY || "";
const NOMINATIM_ENDPOINT =
  import.meta.env.VITE_NOMINATIM_ENDPOINT ||
  "https://nominatim.openstreetmap.org/search";

export default function Sidebar({
  places,
  notes,
  folders,
  selectedPlace,
  selectedPlaceId,
  selectedFolderId,
  pendingLatLng,
  mapPickEnabled,
  mode,
  loading,
  error,
  onModeChange,
  onSelectPlace,
  onAddPlace,
  onDeletePlace,
  onMovePlace,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onReorderNotes,
  onClearPending,
  onToggleMapPick,
  onSelectFolder,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder
}) {
  const [workspaceTab, setWorkspaceTab] = useState("folders");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [placeName, setPlaceName] = useState("");

  const [noteDate, setNoteDate] = useState(todayIso);
  const [noteTime, setNoteTime] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [noteContent, setNoteContent] = useState("");

  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteDate, setEditNoteDate] = useState(todayIso);
  const [editNoteTime, setEditNoteTime] = useState("");
  const [editNoteType, setEditNoteType] = useState("note");
  const [editNoteContent, setEditNoteContent] = useState("");

  const [timelineDate, setTimelineDate] = useState("");
  const [draggingTimelineId, setDraggingTimelineId] = useState(null);
  const [draggingTimelineDate, setDraggingTimelineDate] = useState(null);
  const [timelineIndicator, setTimelineIndicator] = useState(null);

  const [folderMenu, setFolderMenu] = useState(null);
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingFolderParentId, setEditingFolderParentId] = useState(null);
  const [editingFolderIsNew, setEditingFolderIsNew] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [draggingFolderId, setDraggingFolderId] = useState(null);
  const [focusedFolderId, setFocusedFolderId] = useState(null);

  const placeById = useMemo(() => {
    const map = new Map();
    places.forEach((place) => map.set(place.id, place));
    return map;
  }, [places]);

  const folderById = useMemo(() => {
    const map = new Map();
    folders.forEach((folder) => map.set(folder.id, folder));
    return map;
  }, [folders]);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    folders.forEach((folder) => {
      const parent = folder.parentId || null;
      if (!map.has(parent)) {
        map.set(parent, []);
      }
      map.get(parent).push(folder);
    });
    map.forEach((items) =>
      items.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
    );
    return map;
  }, [folders]);

  const currentFolderId = selectedFolderId || null;
  const currentFolder = useMemo(
    () => (currentFolderId ? folderById.get(currentFolderId) : null),
    [currentFolderId, folderById]
  );
  const currentChildren = useMemo(
    () => childrenByParent.get(currentFolderId) || [],
    [childrenByParent, currentFolderId]
  );

  const breadcrumbs = useMemo(() => {
    const items = [];
    let current = currentFolder;
    while (current) {
      items.unshift(current);
      current = current.parentId ? folderById.get(current.parentId) : null;
    }
    return items;
  }, [currentFolder, folderById]);

  const folderOptions = useMemo(() => {
    const buildPath = (folder) => {
      const parts = [];
      let current = folder;
      while (current) {
        parts.unshift(current.name);
        current = current.parentId ? folderById.get(current.parentId) : null;
      }
      return parts.join(" / ");
    };
    return folders
      .map((folder) => ({
        id: folder.id,
        label: buildPath(folder)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
  }, [folders, folderById]);

  const selectedNotes = useMemo(() => {
    const filtered = notes.filter((note) => note.placeId === selectedPlaceId);
    return filtered.sort((a, b) => {
      const dateCmp = (b.date || "").localeCompare(a.date || "");
      if (dateCmp !== 0) return dateCmp;

      const aTime = parseTimeToMinutes(a.time);
      const bTime = parseTimeToMinutes(b.time);
      if (aTime !== null && bTime !== null && bTime !== aTime) {
        return bTime - aTime;
      }

      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }, [notes, selectedPlaceId]);

  const timelineNotes = useMemo(() => {
    let items = notes;
    if (timelineDate) {
      items = items.filter((note) => note.date === timelineDate);
    }
    return items;
  }, [notes, timelineDate]);

  const notesByDate = useMemo(() => {
    const grouped = new Map();
    timelineNotes.forEach((note) => {
      if (!grouped.has(note.date)) {
        grouped.set(note.date, []);
      }
      grouped.get(note.date).push(note);
    });

    const entries = Array.from(grouped.entries()).sort((a, b) =>
      b[0].localeCompare(a[0])
    );

    entries.forEach((entry) => {
      entry[1].sort((a, b) => {
        if (Number.isFinite(a.order) && Number.isFinite(b.order)) {
          if (a.order !== b.order) return a.order - b.order;
        }

        const aTime = parseTimeToMinutes(a.time);
        const bTime = parseTimeToMinutes(b.time);
        if (aTime !== null && bTime !== null && aTime !== bTime) {
          return aTime - bTime;
        }
        if (aTime !== null && bTime === null) return -1;
        if (aTime === null && bTime !== null) return 1;

        return (a.createdAt || "").localeCompare(b.createdAt || "");
      });
    });

    return entries;
  }, [timelineNotes]);

  const distanceById = useMemo(() => {
    if (!selectedPlace) return new Map();
    const map = new Map();
    places.forEach((place) => {
      if (place.id !== selectedPlace.id) {
        map.set(place.id, haversineKm(selectedPlace, place));
      }
    });
    return map;
  }, [places, selectedPlace]);

  useEffect(() => {
    if (!folderMenu) return;
    const handleClose = () => setFolderMenu(null);
    window.addEventListener("click", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [folderMenu]);

  useEffect(() => {
    setFocusedFolderId(null);
  }, [currentFolderId]);

  useEffect(() => {
    if (!editingNoteId) return;
    const exists = notes.some((note) => note.id === editingNoteId);
    if (!exists) {
      setEditingNoteId(null);
    }
  }, [editingNoteId, notes]);

  function handleCreateFolder(parentId) {
    const targetParent = parentId ?? currentFolderId;
    if (targetParent !== currentFolderId) {
      onSelectFolder(targetParent);
    }
    setEditingFolderId(`draft-${Date.now()}`);
    setEditingFolderName("");
    setEditingFolderParentId(targetParent || null);
    setEditingFolderIsNew(true);
  }

  function handleStartRenameFolder(folderId) {
    const current = folderById.get(folderId);
    if (!current) return;
    setEditingFolderId(folderId);
    setEditingFolderName(current.name);
    setEditingFolderParentId(null);
    setEditingFolderIsNew(false);
  }

  function handleCancelFolderEdit() {
    setEditingFolderId(null);
    setEditingFolderName("");
    setEditingFolderParentId(null);
    setEditingFolderIsNew(false);
  }

  function handleCommitFolderEdit() {
    if (!editingFolderId) return;
    const trimmed = editingFolderName.trim();
    const current = folderById.get(editingFolderId);

    if (!trimmed) {
      handleCancelFolderEdit();
      return;
    }

    if (editingFolderIsNew) {
      onAddFolder({ name: trimmed, parentId: editingFolderParentId }).then(
        (created) => {
          if (created?.id) {
            onSelectFolder(created.id);
          }
        }
      );
    } else if (current && current.name !== trimmed) {
      onRenameFolder(editingFolderId, trimmed);
    }

    handleCancelFolderEdit();
  }

  function handleDeleteFolderWithConfirm(folderId) {
    const folder = folderById.get(folderId);
    const ok = window.confirm(
      `Delete folder "${folder?.name}"? Subfolders will be removed and places moved to All.`
    );
    if (!ok) return;
    onDeleteFolder(folderId);
  }

  function isDescendantFolder(folderId, targetParentId) {
    if (!targetParentId) return false;
    let currentId = targetParentId;
    while (currentId) {
      if (currentId === folderId) return true;
      const current = folderById.get(currentId);
      currentId = current?.parentId || null;
    }
    return false;
  }

  function renderFoldersList() {
    const nodes = [];

    if (editingFolderIsNew && editingFolderParentId === currentFolderId) {
      nodes.push(
        <div key={`draft-${currentFolderId || "root"}`}>
          <input
            type="text"
            className="folder-item-input"
            placeholder="Folder name"
            value={editingFolderName}
            onChange={(event) => setEditingFolderName(event.target.value)}
            onBlur={handleCommitFolderEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleCommitFolderEdit();
              }
              if (event.key === "Escape") {
                handleCancelFolderEdit();
              }
            }}
            autoFocus
          />
        </div>
      );
    }

    currentChildren.forEach((folder) => {
      const isFocused = focusedFolderId === folder.id;
      const isDragOver = dragOverFolderId === folder.id;

      nodes.push(
        <div key={folder.id}>
          {editingFolderId === folder.id ? (
            <input
              type="text"
              className="folder-item-input"
              value={editingFolderName}
              onChange={(event) => setEditingFolderName(event.target.value)}
              onBlur={handleCommitFolderEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleCommitFolderEdit();
                }
                if (event.key === "Escape") {
                  handleCancelFolderEdit();
                }
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className={isFocused ? "folder-item active" : "folder-item"}
              onClick={() => setFocusedFolderId(folder.id)}
              onDoubleClick={() => onSelectFolder(folder.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setFocusedFolderId(folder.id);
                setFolderMenu({
                  x: event.clientX,
                  y: event.clientY,
                  folderId: folder.id
                });
              }}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", folder.id);
                setDraggingFolderId(folder.id);
              }}
              onDragEnd={() => {
                setDraggingFolderId(null);
                setDragOverFolderId(null);
              }}
              onDragOver={(event) => {
                if (draggingFolderId === folder.id) return;
                event.preventDefault();
                setDragOverFolderId(folder.id);
              }}
              onDragLeave={() => {
                if (dragOverFolderId === folder.id) {
                  setDragOverFolderId(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const draggedId = event.dataTransfer.getData("text/plain");
                setDragOverFolderId(null);
                if (!draggedId || draggedId === folder.id) return;
                if (isDescendantFolder(draggedId, folder.id)) return;
                onMoveFolder(draggedId, folder.id);
              }}
            >
              <span
                className={
                  isDragOver ? "folder-label drag-over" : "folder-label"
                }
              >
                {folder.name}
              </span>
            </button>
          )}
        </div>
      );
    });

    if (nodes.length === 0) {
      return <div className="hint">No subfolders.</div>;
    }
    return nodes;
  }

  async function handleSearch() {
    const query = searchQuery.trim();
    if (!query) return;

    setSearching(true);
    setSearchError("");

    try {
      if (MAP_PROVIDER === "amap") {
        if (!AMAP_KEY) {
          setSearchError("AMap key missing. Set VITE_AMAP_KEY.");
          return;
        }

        if (AMAP_SECURITY) {
          window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY };
        }

        const AMap = await AMapLoader.load({
          key: AMAP_KEY,
          version: "2.0",
          plugins: ["AMap.AutoComplete"]
        });

        const tips = await new Promise((resolve, reject) => {
          const autoComplete = new AMap.AutoComplete({ city: "" });
          autoComplete.search(query, (status, result) => {
            if (status === "complete" && result?.tips) {
              resolve(result.tips);
            } else {
              reject(new Error(result?.info || "AMap search failed"));
            }
          });
        });

        const results = (tips || [])
          .filter((tip) => tip.location)
          .map((tip) => {
            let lng;
            let lat;

            if (typeof tip.location?.getLng === "function") {
              lng = tip.location.getLng();
              lat = tip.location.getLat();
            } else if (typeof tip.location === "string") {
              [lng, lat] = tip.location.split(",").map(Number);
            }

            return {
              id: tip.id || `${tip.name}-${tip.location}`,
              name: [tip.name, tip.district, tip.address]
                .filter(Boolean)
                .join(" · "),
              lat,
              lng
            };
          })
          .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

        setSearchResults(results);
        return;
      }

      const response = await fetch(
        `${NOMINATIM_ENDPOINT}?format=json&addressdetails=1&accept-language=zh-CN&q=${encodeURIComponent(
          query
        )}&limit=5`
      );

      const data = await response.json();
      const results = (data || []).map((item) => ({
        id: String(item.place_id),
        name: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon)
      }));

      setSearchResults(results);
    } catch (err) {
      setSearchError(err.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleAddFromSearch(result) {
    const place = await onAddPlace({
      name: result.name,
      lat: result.lat,
      lng: result.lng,
      folderId: currentFolderId || null
    });

    if (place) {
      setSearchResults([]);
      setSearchQuery("");
    }
  }

  async function handleAddPendingPlace() {
    if (!pendingLatLng) return;
    const name = placeName.trim();
    if (!name) return;

    const place = await onAddPlace({
      name,
      lat: pendingLatLng.lat,
      lng: pendingLatLng.lng,
      folderId: currentFolderId || null
    });

    if (place) {
      setPlaceName("");
    }
  }

  async function handleAddNote() {
    if (!selectedPlaceId) return;
    const content = noteContent.trim();
    if (!content) return;

    const note = await onAddNote({
      placeId: selectedPlaceId,
      date: noteDate,
      time: noteTime || null,
      type: noteType,
      content
    });

    if (note) {
      setNoteContent("");
      setNoteTime("");
    }
  }

  function handleStartEditNote(note) {
    setEditingNoteId(note.id);
    setEditNoteDate(note.date || todayIso);
    setEditNoteTime(note.time || "");
    setEditNoteType(note.type || "note");
    setEditNoteContent(note.content || "");
  }

  function handleCancelEditNote() {
    setEditingNoteId(null);
    setEditNoteDate(todayIso);
    setEditNoteTime("");
    setEditNoteType("note");
    setEditNoteContent("");
  }

  async function handleSaveEditNote() {
    if (!editingNoteId) return;
    const content = editNoteContent.trim();
    if (!content) return;

    const updated = await onUpdateNote(editingNoteId, {
      date: editNoteDate,
      time: editNoteTime || null,
      type: editNoteType,
      content
    });

    if (updated) {
      handleCancelEditNote();
    }
  }

  function clearTimelineDragState() {
    setDraggingTimelineId(null);
    setDraggingTimelineDate(null);
    setTimelineIndicator(null);
  }

  function handleTimelineDrop(date, items) {
    if (!draggingTimelineId || draggingTimelineDate !== date || !timelineIndicator) {
      clearTimelineDragState();
      return;
    }

    const reordered = reorderItemsByDrop(
      items,
      draggingTimelineId,
      timelineIndicator.targetId,
      timelineIndicator.position
    );

    onReorderNotes(date, reordered.map((item) => item.id));
    clearTimelineDragState();
  }

  function renderWorkspaceContent() {
    if (workspaceTab === "folders") {
      return (
        <>
          <div className="folder-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => handleCreateFolder(currentFolderId || null)}
            >
              New Folder
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!currentFolderId}
              onClick={() => onSelectFolder(currentFolder?.parentId || null)}
            >
              Up
            </button>
          </div>
          <div className="folder-hint">
            Double click to enter. Right click for rename/delete.
          </div>
          <div className="folder-breadcrumbs">
            <button
              type="button"
              className={
                currentFolderId ? "folder-crumb" : "folder-crumb active"
              }
              onClick={() => onSelectFolder(null)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverFolderId("root");
              }}
              onDragLeave={() => {
                if (dragOverFolderId === "root") {
                  setDragOverFolderId(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const draggedId = event.dataTransfer.getData("text/plain");
                setDragOverFolderId(null);
                if (!draggedId) return;
                onMoveFolder(draggedId, null);
              }}
            >
              <span
                className={
                  dragOverFolderId === "root"
                    ? "folder-label drag-over"
                    : "folder-label"
                }
              >
                All Places
              </span>
            </button>
            {breadcrumbs.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={
                  folder.id === currentFolderId
                    ? "folder-crumb active"
                    : "folder-crumb"
                }
                onClick={() => onSelectFolder(folder.id)}
              >
                {folder.name}
              </button>
            ))}
          </div>
          <div className="folder-tree">{renderFoldersList()}</div>
        </>
      );
    }

    if (workspaceTab === "search") {
      return (
        <>
          <div className="row">
            <input
              type="text"
              placeholder="Search a city, food street, landmark"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSearch();
                }
              }}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
            >
              {searching ? "Searching" : "Search"}
            </button>
          </div>
          {searchError ? <div className="hint">{searchError}</div> : null}
          {searchResults.length > 0 ? (
            <div className="result-list">
              {searchResults.map((result) => (
                <div key={result.id} className="result-item">
                  <div className="result-name">{result.name}</div>
                  <button type="button" onClick={() => handleAddFromSearch(result)}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      );
    }

    if (workspaceTab === "add") {
      return (
        <>
          <div className="hint">
            {mapPickEnabled
              ? "Click on the map to set coordinates."
              : "Enable pick mode to choose a point on the map."}
          </div>
          <div className="row">
            <input
              type="text"
              placeholder="Place name"
              value={placeName}
              onChange={(event) => setPlaceName(event.target.value)}
            />
            <button
              type="button"
              onClick={handleAddPendingPlace}
              disabled={!pendingLatLng || !placeName.trim()}
            >
              Save
            </button>
          </div>
          <div className="hint">
            {pendingLatLng
              ? `${pendingLatLng.lat.toFixed(4)}, ${pendingLatLng.lng.toFixed(4)}`
              : "No point selected"}
          </div>
          <div className="row">
            <button
              type="button"
              className={mapPickEnabled ? "active" : ""}
              onClick={() => onToggleMapPick(!mapPickEnabled)}
            >
              {mapPickEnabled ? "Cancel pick" : "Pick on map"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={onClearPending}
              disabled={!pendingLatLng}
            >
              Clear point
            </button>
          </div>
        </>
      );
    }

    return (
      places.length === 0 ? (
        <div className="hint">No places yet.</div>
      ) : (
        <div className="place-list compact">
          {places.map((place) => {
            const distance = distanceById.get(place.id);
            return (
              <div
                key={place.id}
                className={
                  place.id === selectedPlaceId ? "place-item active" : "place-item"
                }
              >
                <div className="place-main">
                  <button
                    type="button"
                    className="place-select"
                    onClick={() => onSelectPlace(place.id)}
                  >
                    <div>{place.name}</div>
                    {distance !== undefined ? (
                      <div className="place-distance">{formatKm(distance)}</div>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDeletePlace(place.id)}
                  >
                    Delete
                  </button>
                </div>
                <select
                  className="place-folder-select"
                  value={place.folderId || ""}
                  onChange={(event) =>
                    onMovePlace(place.id, event.target.value || null)
                  }
                >
                  <option value="">Unfiled</option>
                  {folderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )
    );
  }

  function renderNoteCard(note, context) {
    const isEditing = editingNoteId === note.id;

    if (isEditing) {
      return (
        <div key={note.id} className="note-item editing">
          <div className="row">
            <input
              type="date"
              value={editNoteDate}
              onChange={(event) => setEditNoteDate(event.target.value)}
            />
            <input
              type="time"
              value={editNoteTime}
              onChange={(event) => setEditNoteTime(event.target.value)}
            />
            <select
              value={editNoteType}
              onChange={(event) => setEditNoteType(event.target.value)}
            >
              <option value="note">note</option>
              <option value="food">food</option>
            </select>
          </div>
          <textarea
            rows={3}
            value={editNoteContent}
            onChange={(event) => setEditNoteContent(event.target.value)}
          />
          <div className="note-actions">
            <button
              type="button"
              onClick={handleSaveEditNote}
              disabled={!editNoteContent.trim()}
            >
              Save
            </button>
            <button
              type="button"
              className="ghost"
              onClick={handleCancelEditNote}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={note.id} className={context === "timeline" ? "timeline-item" : "note-item"}>
        <div className="note-meta">
          <span>
            {note.date}
            {note.time ? ` ${note.time}` : ""}
          </span>
          <span className="pill">{note.type}</span>
        </div>
        <div className="note-content">{note.content}</div>
        <div className="note-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => handleStartEditNote(note)}
          >
            Edit
          </button>
          {context === "place" ? (
            <button
              type="button"
              className="danger"
              onClick={() => onDeleteNote(note.id)}
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <img
            className="brand-logo"
            src="/logo.png"
            alt="Travel Notes Map logo"
            width="44"
            height="44"
          />
          <div className="brand-text">
            <div className="app-title">Travel Notes Map</div>
            <div className="app-subtitle">
              Plan places, attach notes, track dates.
            </div>
            <div className="mode-toggle">
              <button
                type="button"
                className={mode === "place" ? "active" : ""}
                onClick={() => onModeChange("place")}
              >
                Place View
              </button>
              <button
                type="button"
                className={mode === "timeline" ? "active" : ""}
                onClick={() => onModeChange("timeline")}
              >
                Timeline
              </button>
            </div>
          </div>
        </div>

        {error ? <div className="alert">{error}</div> : null}
        {loading ? <div className="status">Loading...</div> : null}

        {mode === "place" ? (
          <>
            <section className="panel workspace-panel">
              <div className="panel-title">Place Workspace</div>
              <div className="workspace-tabs">
                <button
                  type="button"
                  className={workspaceTab === "folders" ? "active" : ""}
                  onClick={() => setWorkspaceTab("folders")}
                >
                  Folders
                </button>
                <button
                  type="button"
                  className={workspaceTab === "places" ? "active" : ""}
                  onClick={() => setWorkspaceTab("places")}
                >
                  Places
                </button>
                <button
                  type="button"
                  className={workspaceTab === "search" ? "active" : ""}
                  onClick={() => setWorkspaceTab("search")}
                >
                  Search
                </button>
                <button
                  type="button"
                  className={workspaceTab === "add" ? "active" : ""}
                  onClick={() => setWorkspaceTab("add")}
                >
                  Add
                </button>
              </div>
              <div className="workspace-content">{renderWorkspaceContent()}</div>
            </section>

            <section className="panel focus-panel">
              <div className="panel-title">Selected Place</div>
              {selectedPlace ? (
                <>
                  <div className="detail-card">
                    <div className="detail-title">{selectedPlace.name}</div>
                    <div className="detail-sub">
                      {selectedPlace.lat.toFixed(4)}, {selectedPlace.lng.toFixed(4)}
                    </div>
                  </div>

                  <div className="panel-title">Add Note</div>
                  <div className="row">
                    <input
                      type="date"
                      value={noteDate}
                      onChange={(event) => setNoteDate(event.target.value)}
                    />
                    <input
                      type="time"
                      value={noteTime}
                      onChange={(event) => setNoteTime(event.target.value)}
                    />
                    <select
                      value={noteType}
                      onChange={(event) => setNoteType(event.target.value)}
                    >
                      <option value="note">note</option>
                      <option value="food">food</option>
                    </select>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Add a note or food idea"
                    value={noteContent}
                    onChange={(event) => setNoteContent(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={!selectedPlaceId || !noteContent.trim()}
                  >
                    Save note
                  </button>

                  <div className="panel-title">Notes</div>
                  {selectedNotes.length === 0 ? (
                    <div className="hint">No notes for this place.</div>
                  ) : (
                    <div className="note-list">{selectedNotes.map((note) => renderNoteCard(note, "place"))}</div>
                  )}

                  <details className="distance-details">
                    <summary>Distances</summary>
                    {distanceById.size === 0 ? (
                      <div className="hint">Add more places to compare distance.</div>
                    ) : (
                      <div className="distance-list">
                        {Array.from(distanceById.entries())
                          .map(([placeId, distance]) => ({
                            place: placeById.get(placeId),
                            distance
                          }))
                          .sort((a, b) => a.distance - b.distance)
                          .map((item) => (
                            <div key={item.place.id} className="distance-item">
                              <span>{item.place.name}</span>
                              <span>{formatKm(item.distance)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </details>
                </>
              ) : (
                <div className="hint">Select a place from the workspace list.</div>
              )}
            </section>
          </>
        ) : (
          <section className="panel timeline-panel">
            <div className="panel-title">Timeline</div>
            <div className="row">
              <input
                type="date"
                value={timelineDate}
                onChange={(event) => setTimelineDate(event.target.value)}
              />
              <button type="button" onClick={() => setTimelineDate("")}>
                Clear
              </button>
            </div>

            {notesByDate.length === 0 ? (
              <div className="hint">No notes yet.</div>
            ) : (
              <div className="timeline">
                {notesByDate.map(([date, items]) => (
                  <div
                    key={date}
                    className="timeline-day"
                    onDragOver={(event) => {
                      if (!draggingTimelineId || draggingTimelineDate !== date) return;
                      event.preventDefault();
                      if (!timelineIndicator || timelineIndicator.date !== date) {
                        setTimelineIndicator({
                          date,
                          targetId: null,
                          position: "end"
                        });
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleTimelineDrop(date, items);
                    }}
                  >
                    <div className="timeline-date">{date}</div>
                    {items.map((note) => {
                      const isBefore =
                        timelineIndicator?.date === date &&
                        timelineIndicator?.targetId === note.id &&
                        timelineIndicator?.position === "before";
                      const isAfter =
                        timelineIndicator?.date === date &&
                        timelineIndicator?.targetId === note.id &&
                        timelineIndicator?.position === "after";
                      const isDragging = draggingTimelineId === note.id;

                      return (
                        <div
                          key={note.id}
                          className={`timeline-item${isBefore ? " drag-target-before" : ""}${
                            isAfter ? " drag-target-after" : ""
                          }${isDragging ? " dragging" : ""}`}
                          draggable={editingNoteId !== note.id}
                          onDragStart={(event) => {
                            if (editingNoteId === note.id) return;
                            event.dataTransfer.setData("text/plain", note.id);
                            event.dataTransfer.effectAllowed = "move";
                            setDraggingTimelineId(note.id);
                            setDraggingTimelineDate(date);
                          }}
                          onDragEnd={() => {
                            clearTimelineDragState();
                          }}
                          onDragOver={(event) => {
                            if (!draggingTimelineId || draggingTimelineDate !== date) return;
                            if (draggingTimelineId === note.id) return;

                            event.preventDefault();
                            event.stopPropagation();

                            const rect = event.currentTarget.getBoundingClientRect();
                            const position =
                              event.clientY < rect.top + rect.height / 2
                                ? "before"
                                : "after";

                            setTimelineIndicator({
                              date,
                              targetId: note.id,
                              position
                            });
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleTimelineDrop(date, items);
                          }}
                        >
                          <div className="timeline-head">
                            <div className="timeline-place">
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => onSelectPlace(note.placeId)}
                              >
                                {placeById.get(note.placeId)?.name || "Unknown place"}
                              </button>
                            </div>
                            <span className="timeline-drag-hint">Drag to reorder</span>
                          </div>

                          {editingNoteId === note.id ? (
                            <div className="timeline-edit-wrap">
                              {renderNoteCard(note, "timeline")}
                            </div>
                          ) : (
                            <>
                              <div className="timeline-meta">
                                {note.time ? <span className="pill time">{note.time}</span> : null}
                                <span className="pill">{note.type}</span>
                              </div>
                              <div className="note-content">{note.content}</div>
                              <div className="timeline-item-actions">
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => handleStartEditNote(note)}
                                >
                                  Edit
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {timelineIndicator?.date === date &&
                    timelineIndicator?.targetId === null &&
                    timelineIndicator?.position === "end" ? (
                      <div className="timeline-end-indicator">Drop here</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </aside>

      {folderMenu ? (
        <div
          className="context-menu"
          style={{ top: folderMenu.y, left: folderMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              handleCreateFolder(folderMenu.folderId);
              setFolderMenu(null);
            }}
          >
            New Folder
          </button>
          {folderMenu.folderId ? (
            <>
              <button
                type="button"
                onClick={() => {
                  handleStartRenameFolder(folderMenu.folderId);
                  setFolderMenu(null);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  handleDeleteFolderWithConfirm(folderMenu.folderId);
                  setFolderMenu(null);
                }}
                >
                Delete
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
