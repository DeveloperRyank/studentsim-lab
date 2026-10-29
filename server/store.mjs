import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function blank() {
  return { sessions: [], experiments: [], scenarioRuns: [] };
}

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw);
    return { ...blank(), ...db };
  } catch {
    return blank();
  }
}

let db = load();

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

export const store = {
  list(kind) {
    return db[kind] ?? [];
  },
  get(kind, id) {
    return (db[kind] ?? []).find((x) => x.id === id) ?? null;
  },
  put(kind, record) {
    const arr = db[kind] ?? (db[kind] = []);
    const i = arr.findIndex((x) => x.id === record.id);
    if (i >= 0) arr[i] = record;
    else arr.push(record);
    // keep the file small: cap history
    if (arr.length > 300) arr.splice(0, arr.length - 300);
    persist();
    return record;
  },
  remove(kind, id) {
    db[kind] = (db[kind] ?? []).filter((x) => x.id !== id);
    persist();
  },
};
