import { describe, expect, it } from "vitest";

import type { CupHistoryItem, CupResponse } from "../api/cup.api";
import { buildReigns, cupRecords, perPlayer, reignDays } from "../pages/stats/cupReigns";

const P = {
  none: { id: 0, display_name: "—" },
  roli: { id: 1, display_name: "Roli" },
  rumpi: { id: 3, display_name: "Rumpi" },
  berni: { id: 4, display_name: "Berni" },
  atzi: { id: 5, display_name: "Atzi" },
};

function transfer(
  tournament_id: number,
  date: string,
  from: { id: number; display_name: string },
  to: { id: number; display_name: string },
  streak_duration: number,
): CupHistoryItem {
  return { tournament_id, tournament_name: `T${tournament_id}`, date, from, to, streak_duration };
}

/** The dev DB's Bauernkranz fold (backend `/cup?key=bauernkranz`, 2026-09-12). */
function bauernkranz(): CupResponse {
  return {
    cup: { key: "bauernkranz", name: "Bauernkranz", since_date: "2026-01-05", eras: [{ since: "2026-07-11", mode: "1v1" }] },
    owner: P.rumpi,
    streak: { tournaments_participated: 1, since: { tournament_id: 19, tournament_name: "T19", date: "2026-09-11" } },
    history: [
      transfer(7, "2026-01-18", P.none, P.berni, 0),
      transfer(11, "2026-03-27", P.berni, P.atzi, 1),
      transfer(14, "2026-04-23", P.atzi, P.rumpi, 2),
      transfer(16, "2026-06-09", P.rumpi, P.roli, 1),
      transfer(19, "2026-09-11", P.roli, P.rumpi, 2),
    ],
  };
}

function empty(): CupResponse {
  return {
    cup: { key: "default", name: "Cup", since_date: null },
    owner: null,
    streak: { tournaments_participated: 0, since: { tournament_id: null, tournament_name: null, date: null } },
    history: [],
  };
}

describe("buildReigns", () => {
  it("turns transfers into reigns, oldest first", () => {
    const reigns = buildReigns(bauernkranz());
    expect(reigns.map((r) => `${r.holder.display_name}×${r.tournaments}`)).toEqual(["Berni×1", "Atzi×2", "Rumpi×1", "Roli×2", "Rumpi×1"]);
  });

  it("reads a past reign's length from the transfer that ended it", () => {
    // History text: "Rumpi took it from Roli … ended Roli's 2-tournament reign".
    const roli = buildReigns(bauernkranz()).find((r) => r.holder.id === P.roli.id);
    expect(roli).toMatchObject({
      tournaments: 2,
      startTournamentId: 16,
      startDate: "2026-06-09",
      endTournamentId: 19,
      endDate: "2026-09-11",
      current: false,
    });
    expect(roli?.tookFrom).toEqual(P.rumpi);
    expect(roli?.lostTo).toEqual(P.rumpi);
  });

  it("takes the running reign from the live streak and leaves it open", () => {
    const last = buildReigns(bauernkranz()).at(-1);
    expect(last).toMatchObject({ current: true, tournaments: 1, endTournamentId: null, endDate: null, lostTo: null });
    expect(last?.holder).toEqual(P.rumpi);
  });

  it("treats the initial acquire as claimed from nobody", () => {
    const first = buildReigns(bauernkranz())[0];
    expect(first.tookFrom).toBeNull();
    expect(first.holder).toEqual(P.berni);
  });

  it("returns nothing for an empty or missing cup", () => {
    expect(buildReigns(empty())).toEqual([]);
    expect(buildReigns(null)).toEqual([]);
    expect(buildReigns(undefined)).toEqual([]);
  });

  it("handles a cup with a single, still-running reign", () => {
    const cup = empty();
    cup.owner = P.berni;
    cup.streak = { tournaments_participated: 3, since: { tournament_id: 7, tournament_name: "T7", date: "2026-01-18" } };
    cup.history = [transfer(7, "2026-01-18", P.none, P.berni, 0)];
    expect(buildReigns(cup)).toEqual([
      {
        holder: P.berni,
        startTournamentId: 7,
        startName: "T7",
        startDate: "2026-01-18",
        endTournamentId: null,
        endDate: null,
        tournaments: 3,
        current: true,
        tookFrom: null,
        lostTo: null,
      },
    ]);
  });
});

describe("reignDays", () => {
  const reigns = buildReigns(bauernkranz());

  it("counts calendar days between start and end", () => {
    const roli = reigns.find((r) => r.holder.id === P.roli.id)!;
    expect(reignDays(roli)).toBe(94); // 2026-06-09 → 2026-09-11
  });

  it("counts a running reign up to today", () => {
    expect(reignDays(reigns.at(-1)!, new Date(2026, 8, 21))).toBe(10); // 2026-09-11 → 2026-09-21
  });

  it("never goes negative and survives a missing date", () => {
    const r = { ...reigns[0], startDate: "2026-05-05", endDate: "2026-01-01" };
    expect(reignDays(r)).toBe(0);
    expect(reignDays({ ...reigns[0], startDate: "" })).toBe(0);
  });
});

describe("cupRecords", () => {
  it("finds the longest reign, the title leaders and the tournament leaders", () => {
    const rec = cupRecords(buildReigns(bauernkranz()));
    // Atzi (×2) and Roli (×2) tie; the earlier reign wins.
    expect(rec.longest?.holder).toEqual(P.atzi);
    expect(rec.longest?.tournaments).toBe(2);
    expect(rec.mostTitles).toEqual([{ player: P.rumpi, count: 2 }]);
    // Atzi 2, Rumpi 1+1, Roli 2 — a three-way tie, listed by name.
    expect(rec.mostTournamentsHeld.map((e) => e.player.display_name)).toEqual(["Atzi", "Roli", "Rumpi"]);
    expect(rec.mostTournamentsHeld.every((e) => e.count === 2)).toBe(true);
    expect(rec.currentIsRecord).toBe(false);
  });

  it("flags a running reign that matches the record", () => {
    const cup = bauernkranz();
    cup.streak.tournaments_participated = 2;
    expect(cupRecords(buildReigns(cup)).currentIsRecord).toBe(true);
  });

  it("is empty for a cup nobody has held", () => {
    expect(cupRecords(buildReigns(empty()))).toEqual({ longest: null, mostTitles: [], mostTournamentsHeld: [], currentIsRecord: false });
  });
});

describe("perPlayer", () => {
  it("aggregates titles, tournaments, longest reign and days held", () => {
    const rows = perPlayer(buildReigns(bauernkranz()), new Date(2026, 8, 12));
    // Atzi, Roli and Rumpi all held 2 tournaments; Rumpi leads on titles (2).
    expect(rows.map((r) => r.player.display_name)).toEqual(["Rumpi", "Atzi", "Roli", "Berni"]);
    expect(rows.find((r) => r.player.id === P.rumpi.id)).toMatchObject({
      titles: 2,
      tournamentsHeld: 2,
      longestReign: 1,
      daysHeld: 47 + 1, // 2026-04-23→2026-06-09 plus the running day
    });
    expect(rows.find((r) => r.player.id === P.berni.id)).toMatchObject({ titles: 1, tournamentsHeld: 1, longestReign: 1, daysHeld: 68 });
  });
});
