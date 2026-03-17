import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFile = path.join(__dirname, "data", "db.json");

const adapter = new JSONFile(dbFile);
const emptyDbData = () => ({ places: [], notes: [], folders: [] });
const db = new Low(adapter, emptyDbData());

async function initDb() {
  try {
    await db.read();
  } catch (error) {
    if (error instanceof SyntaxError) {
      db.data = emptyDbData();
      await db.write();
      return;
    }
    throw error;
  }

  const current =
    db.data && typeof db.data === "object" && !Array.isArray(db.data)
      ? db.data
      : {};
  db.data = { ...emptyDbData(), ...current };
  if (!Array.isArray(db.data.places)) {
    db.data.places = [];
  }
  if (!Array.isArray(db.data.notes)) {
    db.data.notes = [];
  }
  if (!Array.isArray(db.data.folders)) {
    db.data.folders = [];
  }

  await db.write();
}

await initDb();

async function save() {
  await db.write();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/places", (_req, res) => {
  res.json(db.data.places);
});

app.post("/api/places", async (req, res) => {
  const { name, lat, lng, folderId } = req.body || {};
  const trimmed = typeof name === "string" ? name.trim() : "";
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const folderExists = folderId
    ? db.data.folders.some((folder) => folder.id === folderId)
    : false;

  if (!trimmed || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ error: "name, lat, lng required" });
  }

  const place = {
    id: nanoid(),
    name: trimmed,
    lat: latNum,
    lng: lngNum,
    folderId: folderExists ? folderId : null,
    createdAt: new Date().toISOString()
  };

  db.data.places.push(place);
  await save();
  res.status(201).json(place);
});

app.delete("/api/places/:id", async (req, res) => {
  const { id } = req.params;
  const before = db.data.places.length;
  db.data.places = db.data.places.filter((p) => p.id !== id);
  db.data.notes = db.data.notes.filter((n) => n.placeId !== id);

  if (db.data.places.length === before) {
    return res.status(404).json({ error: "place not found" });
  }

  await save();
  res.json({ ok: true });
});

app.patch("/api/places/:id", async (req, res) => {
  const { id } = req.params;
  const { folderId } = req.body || {};
  const place = db.data.places.find((p) => p.id === id);

  if (!place) {
    return res.status(404).json({ error: "place not found" });
  }

  if (folderId === null || folderId === "") {
    place.folderId = null;
  } else if (folderId) {
    const folderExists = db.data.folders.some((f) => f.id === folderId);
    if (!folderExists) {
      return res.status(400).json({ error: "folder not found" });
    }
    place.folderId = folderId;
  }

  await save();
  res.json(place);
});

app.get("/api/folders", (_req, res) => {
  res.json(db.data.folders);
});

app.post("/api/folders", async (req, res) => {
  const { name, parentId } = req.body || {};
  const trimmed = typeof name === "string" ? name.trim() : "";

  if (!trimmed) {
    return res.status(400).json({ error: "name required" });
  }

  if (parentId) {
    const parentExists = db.data.folders.some((folder) => folder.id === parentId);
    if (!parentExists) {
      return res.status(400).json({ error: "parent folder not found" });
    }
  }

  const folder = {
    id: nanoid(),
    name: trimmed,
    parentId: parentId || null,
    createdAt: new Date().toISOString()
  };

  db.data.folders.push(folder);
  await save();
  res.status(201).json(folder);
});

app.patch("/api/folders/:id", async (req, res) => {
  const { id } = req.params;
  const { name, parentId } = req.body || {};
  const trimmed = typeof name === "string" ? name.trim() : "";
  const folder = db.data.folders.find((item) => item.id === id);
  if (!folder) {
    return res.status(404).json({ error: "folder not found" });
  }

  if (typeof name === "string") {
    if (!trimmed) {
      return res.status(400).json({ error: "name required" });
    }
    folder.name = trimmed;
  }

  if (parentId !== undefined) {
    if (parentId === id) {
      return res.status(400).json({ error: "folder cannot be its own parent" });
    }
    if (parentId) {
      const parent = db.data.folders.find((item) => item.id === parentId);
      if (!parent) {
        return res.status(400).json({ error: "parent folder not found" });
      }
      let currentId = parentId;
      while (currentId) {
        if (currentId === id) {
          return res
            .status(400)
            .json({ error: "cannot move folder into its descendant" });
        }
        const current = db.data.folders.find((item) => item.id === currentId);
        currentId = current?.parentId || null;
      }
      folder.parentId = parentId;
    } else {
      folder.parentId = null;
    }
  }

  await save();
  res.json(folder);
});

function collectFolderIds(rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    db.data.folders.forEach((folder) => {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    });
  }
  return ids;
}

app.delete("/api/folders/:id", async (req, res) => {
  const { id } = req.params;
  const exists = db.data.folders.some((folder) => folder.id === id);
  if (!exists) {
    return res.status(404).json({ error: "folder not found" });
  }

  const toDelete = collectFolderIds(id);
  db.data.folders = db.data.folders.filter((folder) => !toDelete.has(folder.id));
  db.data.places = db.data.places.map((place) =>
    toDelete.has(place.folderId) ? { ...place, folderId: null } : place
  );

  await save();
  res.json({ ok: true });
});

app.get("/api/notes", (req, res) => {
  const { placeId, date } = req.query;
  let notes = db.data.notes;

  if (placeId) {
    notes = notes.filter((n) => n.placeId === placeId);
  }
  if (date) {
    notes = notes.filter((n) => n.date === date);
  }

  res.json(notes);
});

app.post("/api/notes", async (req, res) => {
  const { placeId, date, type, content, time, order } = req.body || {};
  const placeExists = db.data.places.some((p) => p.id === placeId);
  const trimmed = typeof content === "string" ? content.trim() : "";
  const normalizedType = type === "food" ? "food" : "note";
  const normalizedTime =
    typeof time === "string" && /^\d{2}:\d{2}$/.test(time) ? time : null;
  const orderNum = Number(order);
  const hasOrder = Number.isFinite(orderNum);

  if (!placeId || !placeExists) {
    return res.status(400).json({ error: "valid placeId required" });
  }
  if (!date || typeof date !== "string") {
    return res.status(400).json({ error: "date required" });
  }
  if (!trimmed) {
    return res.status(400).json({ error: "content required" });
  }

  let nextOrder = null;
  if (hasOrder) {
    nextOrder = orderNum;
  } else {
    const sameDateOrders = db.data.notes
      .filter((n) => n.date === date && Number.isFinite(n.order))
      .map((n) => n.order);
    nextOrder =
      sameDateOrders.length > 0 ? Math.max(...sameDateOrders) + 1 : 0;
  }

  const note = {
    id: nanoid(),
    placeId,
    date,
    type: normalizedType,
    content: trimmed,
    time: normalizedTime,
    order: nextOrder,
    createdAt: new Date().toISOString()
  };

  db.data.notes.push(note);
  await save();
  res.status(201).json(note);
});

app.patch("/api/notes/:id", async (req, res) => {
  const { id } = req.params;
  const { date, type, content, time, order } = req.body || {};
  const note = db.data.notes.find((n) => n.id === id);

  if (!note) {
    return res.status(404).json({ error: "note not found" });
  }

  if (typeof date === "string") {
    note.date = date;
  }
  if (typeof type === "string") {
    note.type = type === "food" ? "food" : "note";
  }
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) {
      return res.status(400).json({ error: "content required" });
    }
    note.content = trimmed;
  }
  if (time !== undefined) {
    note.time =
      typeof time === "string" && /^\d{2}:\d{2}$/.test(time) ? time : null;
  }
  if (order !== undefined) {
    const orderNum = Number(order);
    if (!Number.isFinite(orderNum)) {
      return res.status(400).json({ error: "order must be a number" });
    }
    note.order = orderNum;
  }

  await save();
  res.json(note);
});

app.delete("/api/notes/:id", async (req, res) => {
  const { id } = req.params;
  const before = db.data.notes.length;
  db.data.notes = db.data.notes.filter((n) => n.id !== id);

  if (db.data.notes.length === before) {
    return res.status(404).json({ error: "note not found" });
  }

  await save();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
