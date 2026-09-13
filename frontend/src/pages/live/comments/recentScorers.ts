/**
 * Scorer names typed into the goal entry, per tournament (T3).
 *
 * The scorer of a goal is the *footballer in the game* (Haaland, Mbeumo), never
 * one of the humans at the console, so the app has no list to suggest from. The
 * only defensible source is what was typed before in this very tournament —
 * kept in this browser, newest first.
 */

const KEY_PREFIX = "comment_scorers_v1:";
const MAX = 20;

function key(tournamentId: number) {
  return `${KEY_PREFIX}${tournamentId}`;
}

/** Scorer names used in this tournament, newest first (per browser). */
export function readRecentScorers(tournamentId: number): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(key(tournamentId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => String(v ?? "").trim())
      .filter((v) => v.length > 0)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function rememberScorer(tournamentId: number, name: string) {
  try {
    if (typeof window === "undefined") return;
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const next = [trimmed, ...readRecentScorers(tournamentId).filter((v) => v.toLowerCase() !== lower)].slice(0, MAX);
    window.localStorage.setItem(key(tournamentId), JSON.stringify(next));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}
