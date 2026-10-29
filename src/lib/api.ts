// Thin client for the local API with a localStorage fallback so the app works
// even if the micro-server is not running (e.g. frontend-only dev). The API is
// authoritative when reachable; localStorage keeps the prototype usable offline.

const KEY = "studentsim-lab-local";

type Collections = "sessions" | "experiments" | "scenarioRuns";

function readLocal(): Record<Collections, unknown[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return { sessions: [], experiments: [], scenarioRuns: [] };
  }
}
function writeLocal(data: Record<Collections, unknown[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

let apiReachable: boolean | null = null;

export async function checkHealth(): Promise<{ ok: boolean; llm: { configured: boolean; model: string | null } }> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error();
    const data = await res.json();
    apiReachable = true;
    return data;
  } catch {
    apiReachable = false;
    return { ok: false, llm: { configured: false, model: null } };
  }
}

export async function listRecords<T>(kind: Collections): Promise<T[]> {
  if (apiReachable !== false) {
    try {
      const res = await fetch(`/api/${kind}`);
      if (res.ok) return (await res.json()) as T[];
    } catch {
      apiReachable = false;
    }
  }
  return (readLocal()[kind] ?? []) as T[];
}

export async function saveRecord<T extends { id: string }>(kind: Collections, rec: T): Promise<T> {
  if (apiReachable !== false) {
    try {
      const res = await fetch(`/api/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rec),
      });
      if (res.ok) {
        await refreshLocalMirror(kind, rec);
        return rec;
      }
    } catch {
      apiReachable = false;
    }
  }
  const data = readLocal();
  const arr = (data[kind] ?? []) as T[];
  const i = arr.findIndex((x) => x.id === rec.id);
  if (i >= 0) arr[i] = rec;
  else arr.push(rec);
  data[kind] = arr.slice(-300);
  writeLocal(data);
  return rec;
}

async function refreshLocalMirror(kind: Collections, rec: { id: string }) {
  const data = readLocal();
  const arr = (data[kind] ?? []) as { id: string }[];
  const i = arr.findIndex((x) => x.id === rec.id);
  if (i >= 0) arr[i] = rec;
  else arr.push(rec);
  data[kind] = arr.slice(-300);
  writeLocal(data);
}

export async function deleteRecord(kind: Collections, id: string): Promise<void> {
  try {
    await fetch(`/api/${kind}/${id}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
  const data = readLocal();
  data[kind] = ((data[kind] ?? []) as { id: string }[]).filter((x) => x.id !== id);
  writeLocal(data);
}

/** Server-side LLM narration. Returns null when unavailable so callers use the template fallback. */
export async function requestNarration(input: {
  persona: string;
  question: string;
  answer: string;
  correct: boolean;
  misconceptionLabel?: string | null;
  observableExplanation?: string;
}): Promise<string | null> {
  if (apiReachable === false) return null;
  try {
    const res = await fetch("/api/llm/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (data?.ok && typeof data.text === "string") return data.text;
    return null;
  } catch {
    return null;
  }
}
