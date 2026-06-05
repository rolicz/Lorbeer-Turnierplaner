import { describe, it, expect } from "vitest";
import { normalizeTeamRivalryForFocus, pct } from "../pages/stats/h2hHelpers";
import type { StatsH2HTeamRivalry } from "../api/types";

describe("pct", () => {
  it("formats a ratio as a rounded percent", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.333)).toBe("33%");
    expect(pct(1)).toBe("100%");
  });
  it("returns 0% for non-finite", () => {
    expect(pct(NaN)).toBe("0%");
    expect(pct(Infinity)).toBe("0%");
  });
});

function rivalry(): StatsH2HTeamRivalry {
  return {
    team1: [{ id: 1, display_name: "A" }, { id: 2, display_name: "B" }],
    team2: [{ id: 3, display_name: "C" }, { id: 4, display_name: "D" }],
    played: 5,
    team1_wins: 3,
    draws: 1,
    team2_wins: 1,
    team1_gf: 10,
    team1_ga: 6,
    team2_gf: 6,
    team2_ga: 10,
    win_share_team1: 0.75,
    rivalry_score: 2,
    dominance_score: 1,
  };
}

describe("normalizeTeamRivalryForFocus", () => {
  it("returns the rivalry unchanged when no focus", () => {
    const r = rivalry();
    expect(normalizeTeamRivalryForFocus(r, null)).toBe(r);
  });

  it("returns unchanged when focus is already on team1", () => {
    const r = rivalry();
    expect(normalizeTeamRivalryForFocus(r, 1)).toBe(r);
  });

  it("swaps teams so the focused player's team becomes team1", () => {
    const r = rivalry();
    const out = normalizeTeamRivalryForFocus(r, 3);
    expect(out.team1.map((p) => p.id)).toEqual([3, 4]);
    expect(out.team2.map((p) => p.id)).toEqual([1, 2]);
    expect(out.team1_wins).toBe(1); // was team2_wins
    expect(out.team2_wins).toBe(3);
    expect(out.team1_gf).toBe(6);
    expect(out.win_share_team1).toBeCloseTo(1 / 4); // team2_wins / total wins
  });

  it("returns unchanged when focus player is in neither team", () => {
    const r = rivalry();
    expect(normalizeTeamRivalryForFocus(r, 99)).toBe(r);
  });
});
