/**
 * Pure helpers that turn the cup API's transfer history into reigns, records and
 * per-player totals (unit-tested in `test/cupReigns.test.ts`).
 *
 * Data semantics (`backend/app/services/cup.py`):
 * - `history` is chronological; every item is a **transfer** at one tournament
 *   (`from` → `to`). The very first item is the initial acquire and carries the
 *   sentinel `from = {id: 0, display_name: "—"}` with `streak_duration = 0`.
 * - `streak_duration` on a transfer is the **outgoing** holder's reign length:
 *   the number of qualifying, completed tournaments they took part in while
 *   holding the cup, including the one they won it at.
 * - `streak.tournaments_participated` is the **running** reign of the current
 *   owner, counted the same way (so a fresh win is 1 = zero defenses).
 */
import type { CupHistoryItem, CupOwner, CupResponse } from "../../api/cup.api";

export type PlayerRef = CupOwner;

export type Reign = {
  holder: PlayerRef;
  startTournamentId: number;
  startName: string;
  startDate: string;
  /** The tournament that ended the reign (`null` while it is running). */
  endTournamentId: number | null;
  endDate: string | null;
  /** Tournaments held, including the one the cup was won at. */
  tournaments: number;
  current: boolean;
  /** Previous holder, or `null` when the cup was claimed from nobody. */
  tookFrom: PlayerRef | null;
  lostTo: PlayerRef | null;
};

export type CupRecordEntry = { player: PlayerRef; count: number };

export type CupRecords = {
  /** Most tournaments held in one reign (earliest reign wins a tie). */
  longest: Reign | null;
  /** Every player tied for the most cup wins. */
  mostTitles: CupRecordEntry[];
  /** Every player tied for the most tournaments held (all reigns summed). */
  mostTournamentsHeld: CupRecordEntry[];
  /** The running reign equals the longest ever. */
  currentIsRecord: boolean;
};

export type CupPlayerRow = {
  player: PlayerRef;
  titles: number;
  tournamentsHeld: number;
  longestReign: number;
  daysHeld: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The sentinel "nobody" owner (`id 0` / `—`) becomes `null`. */
function realPlayer(p: CupOwner | null | undefined): PlayerRef | null {
  if (!p || !(p.id > 0)) return null;
  if (!p.display_name || p.display_name === "—") return null;
  return p;
}

/** Local-midnight timestamp of a `YYYY-MM-DD` (or ISO) day string. */
function dayMs(d: string | null | undefined): number | null {
  if (!d) return null;
  const iso = d.length >= 10 ? d.slice(0, 10) : d;
  const t = new Date(`${iso}T00:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

function todayMs(today: Date): number {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

/**
 * One entry per reign, oldest first (same order as `cup.history`). A past
 * reign's length is reported by the transfer that ended it, the running one by
 * `streak.tournaments_participated`.
 */
export function buildReigns(cup: CupResponse | null | undefined): Reign[] {
  const history: CupHistoryItem[] = cup?.history ?? [];
  const running = Math.max(0, cup?.streak?.tournaments_participated ?? 0);
  return history.map((h, i) => {
    const next = history[i + 1];
    return {
      holder: h.to,
      startTournamentId: h.tournament_id,
      startName: h.tournament_name,
      startDate: h.date,
      endTournamentId: next ? next.tournament_id : null,
      endDate: next ? next.date : null,
      tournaments: next ? Math.max(0, next.streak_duration) : running,
      current: !next,
      tookFrom: realPlayer(h.from),
      lostTo: next ? next.to : null,
    };
  });
}

/** Days the cup was held in this reign (a running reign counts up to `today`). */
export function reignDays(reign: Reign, today: Date = new Date()): number {
  const start = dayMs(reign.startDate);
  if (start == null) return 0;
  const end = reign.endDate ? dayMs(reign.endDate) : todayMs(today);
  if (end == null) return 0;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

/** Players tied for the highest value of `valueOf`, by name; empty when nothing counts. */
function leaders(reigns: Reign[], valueOf: (r: Reign) => number): CupRecordEntry[] {
  const byId = new Map<number, CupRecordEntry>();
  for (const r of reigns) {
    const entry = byId.get(r.holder.id);
    if (entry) entry.count += valueOf(r);
    else byId.set(r.holder.id, { player: r.holder, count: valueOf(r) });
  }
  const all = [...byId.values()];
  const max = all.reduce((m, e) => Math.max(m, e.count), 0);
  if (max <= 0) return [];
  return all.filter((e) => e.count === max).sort((a, b) => a.player.display_name.localeCompare(b.player.display_name));
}

export function cupRecords(reigns: Reign[]): CupRecords {
  let longest: Reign | null = null;
  for (const r of reigns) {
    if (r.tournaments > 0 && (!longest || r.tournaments > longest.tournaments)) longest = r;
  }
  const current = reigns.find((r) => r.current) ?? null;
  return {
    longest,
    mostTitles: leaders(reigns, () => 1),
    mostTournamentsHeld: leaders(reigns, (r) => r.tournaments),
    currentIsRecord: !!longest && !!current && current.tournaments >= longest.tournaments,
  };
}

/** One row per player that ever held the cup; default order = tournaments held desc. */
export function perPlayer(reigns: Reign[], today: Date = new Date()): CupPlayerRow[] {
  const byId = new Map<number, CupPlayerRow>();
  for (const r of reigns) {
    const row = byId.get(r.holder.id) ?? { player: r.holder, titles: 0, tournamentsHeld: 0, longestReign: 0, daysHeld: 0 };
    row.titles += 1;
    row.tournamentsHeld += r.tournaments;
    row.longestReign = Math.max(row.longestReign, r.tournaments);
    row.daysHeld += reignDays(r, today);
    byId.set(r.holder.id, row);
  }
  return [...byId.values()].sort(
    (a, b) => b.tournamentsHeld - a.tournamentsHeld || b.titles - a.titles || a.player.display_name.localeCompare(b.player.display_name),
  );
}
