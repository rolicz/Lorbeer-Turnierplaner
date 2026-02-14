const LS_KEY = "tp_seen_guestbook_entry_ids_v1";
const EVT = "tp_seen_guestbook_changed_v1";

type SeenIdsMap = Record<string, number[]>; // profile_player_id -> entry ids seen

function safeParse(raw: string | null): SeenIdsMap {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return {};
    const out: SeenIdsMap = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (!Array.isArray(val)) continue;
      const ids = val
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0)
        .map((x) => Math.trunc(x));
      if (ids.length) out[String(k)] = Array.from(new Set(ids)).sort((a, b) => a - b);
    }
    return out;
  } catch {
    return {};
  }
}

function load(): SeenIdsMap {
  if (typeof window === "undefined") return {};
  return safeParse(window.localStorage.getItem(LS_KEY));
}

function save(next: SeenIdsMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota/private mode failures
  }
  try {
    window.dispatchEvent(new Event(EVT));
  } catch {
    // ignore
  }
}

export function getSeenGuestbookEntryIds(profilePlayerId: number): number[] {
  const m = load();
  const arr = m[String(profilePlayerId)] ?? [];
  return Array.isArray(arr) ? arr : [];
}

export function markGuestbookEntrySeen(profilePlayerId: number, entryId: number) {
  if (!Number.isFinite(profilePlayerId) || profilePlayerId <= 0) return;
  if (!Number.isFinite(entryId) || entryId <= 0) return;
  const cur = load();
  const k = String(profilePlayerId);
  const prev = Array.isArray(cur[k]) ? cur[k] : [];
  if (prev.includes(entryId)) return;
  const next = [...prev, Math.trunc(entryId)];
  cur[k] = Array.from(new Set(next)).sort((a, b) => a - b).slice(-1000);
  save(cur);
}

export function subscribeSeenGuestbook(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const onEvt = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY) cb();
  };
  window.addEventListener(EVT, onEvt);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVT, onEvt);
    window.removeEventListener("storage", onStorage);
  };
}
