import type { StatsPlayerMatchesTournament } from "../../api/types";

export function groupFriendlyTournamentsByDate(
  tournaments: StatsPlayerMatchesTournament[]
): StatsPlayerMatchesTournament[] {
  if (!tournaments.length) return tournaments;

  const friendliesByDate = new Map<string, StatsPlayerMatchesTournament[]>();
  for (const t of tournaments) {
    if (String(t.status) !== "friendly") continue;
    const key = String(t.date || "");
    const arr = friendliesByDate.get(key) ?? [];
    arr.push(t);
    friendliesByDate.set(key, arr);
  }
  if (!friendliesByDate.size) return tournaments;

  const emittedDates = new Set<string>();
  const out: StatsPlayerMatchesTournament[] = [];

  for (const t of tournaments) {
    if (String(t.status) !== "friendly") {
      out.push(t);
      continue;
    }

    const dateKey = String(t.date || "");
    if (emittedDates.has(dateKey)) continue;
    emittedDates.add(dateKey);

    const groupRows = friendliesByDate.get(dateKey) ?? [];
    const matches = groupRows.flatMap((row) => row.matches ?? []);
    const groupMode: "1v1" | "2v2" = groupRows.every((row) => row.mode === "2v2") ? "2v2" : "1v1";

    const dateDigits = Number.parseInt(dateKey.replace(/-/g, ""), 10);
    const groupId =
      Number.isFinite(dateDigits) && dateDigits > 0
        ? -(4_000_000 + dateDigits)
        : groupRows.length
          ? Math.min(...groupRows.map((row) => Number(row.id || 0)))
          : Number(t.id || 0);

    out.push({
      id: groupId,
      name: "Friendlies",
      date: dateKey,
      mode: groupMode,
      status: "friendly",
      matches,
    });
  }

  return out;
}
