import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import RecordBadges from "../pages/profile/RecordBadges";
import type { StatsRecord } from "../api/types";

const ROLI = { id: 1, display_name: "Roli" };
const BERNI = { id: 2, display_name: "Berni" };

const EXPLAINERS: Record<string, string> = {
  most_titles: "Tournaments won, with each player's most recent title.",
  highest_elo_1v1: "Highest Elo rating in 1v1.",
  win_streak: "Consecutive wins.",
};

function rec(key: StatsRecord["key"], group: StatsRecord["group"], holderIds: { id: number; ongoing?: boolean }[]): StatsRecord {
  return {
    key,
    group,
    label:
      key === "win_streak"
        ? "Win streak"
        : key === "highest_elo_1v1"
          ? "Highest Elo (1v1)"
          : "Most tournament wins",
    explainer: EXPLAINERS[key] ?? "",
    path: `/stats?view=overview&sub=records&record=${key}`,
    value: 5,
    holders: holderIds.map((h) => ({
      player: h.id === 1 ? ROLI : BERNI,
      ongoing: !!h.ongoing,
    })),
    leaders: [],
    matches: [],
  };
}

function renderBadges(playerId: number, records: StatsRecord[]) {
  return render(
    <MemoryRouter>
      <div>
        <button type="button">avatar</button>
        <RecordBadges playerId={playerId} records={records} />
      </div>
    </MemoryRouter>,
  );
}

const THREE = [
  rec("most_titles", "title", [{ id: 1 }]),
  rec("highest_elo_1v1", "elo", [{ id: 1 }]),
  rec("win_streak", "streak", [{ id: 1, ongoing: true }]),
];

describe("RecordBadges", () => {
  it("renders one chip per held record, in payload order, with no tie count", () => {
    const { container } = renderBadges(1, THREE);

    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);

    // The band is buttons, not links (M8): a glyph cannot say what it means, so a chip opens
    // the legend instead of navigating — and there is no `<a>` in the band to nest at all.
    expect(container.querySelectorAll("[data-record-badges] a")).toHaveLength(0);
    const titles = container.querySelector('button[data-record="most_titles"]');
    const elo = container.querySelector('button[data-record="highest_elo_1v1"]');
    const streak = container.querySelector('button[data-record="win_streak"]');
    expect(titles).toBeTruthy();
    expect(elo).toBeTruthy();
    expect(streak).toBeTruthy();

    // Only the ongoing streak carries `data-ongoing` and the accent border.
    expect(titles).not.toHaveAttribute("data-ongoing");
    expect(elo).not.toHaveAttribute("data-ongoing");
    expect(streak).toHaveAttribute("data-ongoing", "true");
    expect(titles?.className).not.toContain("border-accent");
    expect(elo?.className).not.toContain("border-accent");
    expect(streak?.className).toContain("border-accent");

    // The mode label is a mode, not a count — only the Elo chip carries text.
    expect(titles?.textContent).toBe("");
    expect(elo?.textContent).toBe("1v1");
    expect(streak?.textContent).toBe("");

    // Every aria-label names the record and what the chip does.
    expect(titles).toHaveAttribute("aria-label", "Most tournament wins: record holder. Show what the badges mean");
    expect(streak).toHaveAttribute(
      "aria-label",
      "Win streak: record holder, current run. Show what the badges mean",
    );

    // Never a link inside a link (N4) — the stand-in avatar button sits above the band.
    expect(document.querySelectorAll("a a").length).toBe(0);
  });

  it("opens the legend from any chip: only the held records, label + explainer, the row navigates", () => {
    const { container } = renderBadges(1, THREE);
    expect(container.querySelector("[data-records-held]")).toBeNull();

    // Any chip opens it — the last one here, to prove it is not the first chip's job alone.
    fireEvent.click(container.querySelector('button[data-record="win_streak"]') as HTMLElement);

    const sheet = document.querySelector("[data-records-held]") as HTMLElement;
    expect(sheet).toBeTruthy();
    expect(screen.getByText("Records held")).toBeTruthy();

    // One row per held record, in payload order, and nothing this player does not hold.
    const rows = sheet.querySelectorAll("a[href]");
    expect(rows).toHaveLength(3);
    expect(sheet.querySelector("[data-record='most_titles']")).toBeTruthy();
    expect(sheet.textContent).toContain("Most tournament wins");
    expect(sheet.textContent).toContain("Tournaments won, with each player's most recent title.");
    expect(sheet.textContent).toContain("Highest Elo (1v1)");
    expect(sheet.textContent).toContain("Consecutive wins.");

    // The row's href is the backend's `path`, untouched — the frontend builds no record href.
    expect(rows[0]).toHaveAttribute("href", "/stats?view=overview&sub=records&record=most_titles");
    expect(rows[1]).toHaveAttribute("href", "/stats?view=overview&sub=records&record=highest_elo_1v1");
    expect(rows[2]).toHaveAttribute("href", "/stats?view=overview&sub=records&record=win_streak");
    expect(rows[2]).toHaveAttribute("aria-label", "Win streak: record holder, current run. Open in Stats");

    // The ongoing run keeps its accent marking in the sheet, and says the word.
    expect((sheet.querySelector("[data-record='win_streak']") as HTMLElement).className).toContain("border-accent");
    expect((sheet.querySelector("[data-record='most_titles']") as HTMLElement).className).not.toContain("border-accent");
    expect(sheet.textContent).toContain("current");

    expect(document.querySelectorAll("a a").length).toBe(0);
  });

  it("renders nothing for a player who holds no record — no empty strip", () => {
    const records = [rec("most_titles", "title", [{ id: 1 }])];
    const { container } = renderBadges(2, records);
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("[data-record-badges]")).toBeNull();
  });
});
