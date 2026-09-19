import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import RecordBadges from "../pages/profile/RecordBadges";
import type { StatsRecord } from "../api/types";

const ROLI = { id: 1, display_name: "Roli" };
const BERNI = { id: 2, display_name: "Berni" };

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
    explainer: "",
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

describe("RecordBadges", () => {
  it("renders one chip per held record, in payload order, with no tie count", () => {
    const records = [
      rec("most_titles", "title", [{ id: 1 }]),
      rec("highest_elo_1v1", "elo", [{ id: 1 }]),
      rec("win_streak", "streak", [{ id: 1, ongoing: true }]),
    ];
    const { container } = renderBadges(1, records);

    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);

    const titles = container.querySelector('a[data-record="most_titles"]');
    const elo = container.querySelector('a[data-record="highest_elo_1v1"]');
    const streak = container.querySelector('a[data-record="win_streak"]');
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

    // The href is the backend's `path`, untouched.
    expect(titles).toHaveAttribute("href", "/stats?view=overview&sub=records&record=most_titles");
    expect(elo).toHaveAttribute("href", "/stats?view=overview&sub=records&record=highest_elo_1v1");
    expect(streak).toHaveAttribute("href", "/stats?view=overview&sub=records&record=win_streak");

    // Every aria-label names the record and where it opens.
    expect(titles).toHaveAttribute("aria-label", "Most tournament wins: record holder. Open in Stats");
    expect(streak).toHaveAttribute("aria-label", "Win streak: record holder, current run. Open in Stats");

    // Never a link inside a link (N4) — the stand-in avatar button sits above the band.
    expect(document.querySelectorAll("a a").length).toBe(0);
  });

  it("renders nothing for a player who holds no record — no empty strip", () => {
    const records = [rec("most_titles", "title", [{ id: 1 }])];
    const { container } = renderBadges(2, records);
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("[data-record-badges]")).toBeNull();
  });
});
