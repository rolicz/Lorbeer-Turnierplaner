import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { StatsStreakCategory } from "../api/types";
import PlayerStreakChips from "../pages/stats/PlayerStreakChips";

const PLAYER = { id: 1, display_name: "Roli" };

function run(length: number, ongoing = true) {
  return { player: PLAYER, length, start_ts: null, end_ts: null, ongoing };
}

function cat(key: string, current: number, record: number): StatsStreakCategory {
  return {
    key,
    name: key,
    description: "",
    records: record ? [run(record, false)] : [],
    current: current ? [run(current)] : [],
    records_total: record ? 1 : 0,
    current_total: current ? 1 : 0,
  };
}

const ALL_KEYS = ["win_streak", "unbeaten_streak", "scoring_streak", "clean_sheet_streak"] as const;

describe("PlayerStreakChips", () => {
  it("renders one chip per category with current / record", () => {
    const { container } = render(
      <PlayerStreakChips
        categories={[cat("win_streak", 2, 5), cat("unbeaten_streak", 3, 7), cat("scoring_streak", 4, 9), cat("clean_sheet_streak", 0, 2)]}
        globalCategories={[]}
      />,
    );
    for (const k of ALL_KEYS) expect(container.querySelector(`[data-streak="${k}"]`)).toBeTruthy();
    expect(screen.getByText("Win streak")).toBeTruthy();
    expect(container.querySelector('[data-streak="win_streak"]')?.textContent).toContain("2");
    expect(container.querySelector('[data-streak="win_streak"]')?.textContent).toContain("/ 5");
    // A category the API did not return falls back to 0 / 0.
    expect(container.querySelector('[data-streak="clean_sheet_streak"]')?.textContent).toContain("0 / 2");
  });

  it("highlights a chip whose current run equals the global record", () => {
    const { container } = render(
      <PlayerStreakChips
        categories={[cat("win_streak", 6, 6), cat("unbeaten_streak", 3, 8)]}
        globalCategories={[cat("win_streak", 6, 6), cat("unbeaten_streak", 9, 9)]}
      />,
    );
    expect(container.querySelector('[data-streak="win_streak"]')).toHaveClass("border-accent");
    expect(container.querySelector('[data-streak="unbeaten_streak"]')).not.toHaveClass("border-accent");
  });

  it("does not highlight a zero current run even when the global record is zero", () => {
    const { container } = render(
      <PlayerStreakChips categories={[cat("win_streak", 0, 0)]} globalCategories={[cat("win_streak", 0, 0)]} />,
    );
    expect(container.querySelector('[data-streak="win_streak"]')).not.toHaveClass("border-accent");
  });
});
