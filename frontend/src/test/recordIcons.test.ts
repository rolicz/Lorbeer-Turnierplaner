import { describe, expect, it } from "vitest";
import { Award, Flame, Goal, Lock, Shield } from "lucide-react";

import { RECORD_ICONS, recordIcon, recordModeLabel } from "../pages/stats/recordIcons";
import type { RecordKey } from "../api/types";

const ALL_KEYS: RecordKey[] = [
  "most_titles",
  "highest_elo",
  "highest_elo_1v1",
  "highest_elo_2v2",
  "most_points",
  "highest_ppm",
  "most_played",
  "most_goals_per_match",
  "win_streak",
  "unbeaten_streak",
  "scoring_streak",
  "clean_sheet_streak",
  "biggest_win",
  "highest_scoring_match",
  "most_goals_one_side",
  "biggest_upset",
];

describe("RECORD_ICONS — the one icon map", () => {
  it("has an icon for every RecordKey", () => {
    for (const key of ALL_KEYS) {
      expect(RECORD_ICONS[key]).toBeDefined();
    }
  });

  it("is distinct for all sixteen, except the three Elo keys sharing one glyph", () => {
    const grouped = new Map<unknown, RecordKey[]>();
    for (const key of ALL_KEYS) {
      const icon = RECORD_ICONS[key];
      grouped.set(icon, [...(grouped.get(icon) ?? []), key]);
    }
    const shared = [...grouped.values()].filter((keys) => keys.length > 1);
    expect(shared).toEqual([["highest_elo", "highest_elo_1v1", "highest_elo_2v2"]]);
  });

  it("keeps the four streak glyphs the app already used before this map existed — pinned so a later cleanup cannot swap them", () => {
    expect(RECORD_ICONS.win_streak).toBe(Flame);
    expect(RECORD_ICONS.unbeaten_streak).toBe(Shield);
    expect(RECORD_ICONS.scoring_streak).toBe(Goal);
    expect(RECORD_ICONS.clean_sheet_streak).toBe(Lock);
  });
});

describe("recordIcon", () => {
  it("resolves a known key to its glyph", () => {
    expect(recordIcon("most_titles")).toBe(RECORD_ICONS.most_titles);
    expect(recordIcon("win_streak")).toBe(Flame);
  });

  it("falls back to Award for a key the frontend does not know (a newer backend)", () => {
    expect(recordIcon("some_future_record")).toBe(Award);
  });
});

describe("recordModeLabel", () => {
  it("labels only the two mode-specific Elo records", () => {
    expect(recordModeLabel("highest_elo_1v1")).toBe("1v1");
    expect(recordModeLabel("highest_elo_2v2")).toBe("2v2");
  });

  it("is empty for every other record, including overall Elo", () => {
    expect(recordModeLabel("highest_elo")).toBe("");
    expect(recordModeLabel("most_titles")).toBe("");
    expect(recordModeLabel("win_streak")).toBe("");
  });
});
