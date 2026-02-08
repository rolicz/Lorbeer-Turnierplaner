const LS_KEY = "tp_seen_comment_ids_v1";
const EVT = "tp_seen_comments_changed_v1";

type SeenIdsMap = Record<string, number[]>; // tournament_id -> comment ids seen

function safeParse(raw: string | null): SeenIdsMap {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as any;
    if (!v || typeof v !== "object") return {};
    const out: SeenIdsMap = {};
    for (const [k, val] of Object.entries(v)) {
      if (!Array.isArray(val)) continue;
      const ids = (val as any[])
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
    // ignore quota / private mode failures
  }
  try {
    window.dispatchEvent(new Event(EVT));
  } catch {
    // ignore
  }
}

export function getSeenCommentIds(tournamentId: number): number[] {
  const m = load();
  const arr = m[String(tournamentId)] ?? [];
  return Array.isArray(arr) ? arr : [];
}

export function isCommentSeen(tournamentId: number, commentId: number): boolean {
  const ids = getSeenCommentIds(tournamentId);
  return ids.includes(commentId);
}

export function markCommentSeen(tournamentId: number, commentId: number) {
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) return;
  if (!Number.isFinite(commentId) || commentId <= 0) return;
  const cur = load();
  const k = String(tournamentId);
  const prev = Array.isArray(cur[k]) ? (cur[k] as number[]) : [];
  if (prev.includes(commentId)) return;
  const next = [...prev, Math.trunc(commentId)];
  // Keep bounded: you won't have many, but avoid unbounded growth.
  cur[k] = Array.from(new Set(next)).sort((a, b) => a - b).slice(-500);
  save(cur);
}

export function subscribeSeenComments(cb: () => void) {
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

