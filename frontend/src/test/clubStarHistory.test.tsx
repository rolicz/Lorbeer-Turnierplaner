/**
 * R4 — the read-only history shown next to every star editor.
 *
 * What is pinned here is the wording, because the wording is the honesty of the
 * feature: a day that was measured says "since", a day reconstructed from a
 * production backup says "by" and explains itself.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { ClubStarHistory as ClubStarHistoryPayload } from "../api/types";

const getClubStarHistory = vi.fn<(id: number) => Promise<ClubStarHistoryPayload>>();
vi.mock("../api/clubs.api", () => ({ getClubStarHistory: (id: number) => getClubStarHistory(id) }));

import ClubStarHistory from "../ui/ClubStarHistory";

function renderHistory() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ClubStarHistory clubId={7} />
    </QueryClientProvider>,
  );
}

describe("ClubStarHistory", () => {
  it("reads newest first, marks the current row and dates a measured change with 'since'", async () => {
    getClubStarHistory.mockResolvedValue({
      club_id: 7,
      current_stars: 4,
      entries: [
        { stars: 3, valid_from: "2026-03-28", changed_at: "2026-03-28T00:00:00", source: "seed" },
        { stars: 4, valid_from: "2026-09-12", changed_at: "2026-09-12T10:00:00", source: "live" },
      ],
    });

    const { container } = renderHistory();
    await waitFor(() => expect(screen.getAllByText(/since/).length).toBeGreaterThan(0));

    const rows = Array.from(container.querySelectorAll(".list-divided > div"));
    expect(rows).toHaveLength(2);
    // Newest first, and the top row is the one in force.
    expect(rows[0].textContent).toContain("4★");
    expect(rows[0].textContent).toContain("now");
    expect(rows[1].textContent).toContain("3★");
    expect(rows[0].textContent).toMatch(/since/);
    expect(container.textContent).not.toMatch(/production backup/);
  });

  it("says 'by' for a recovered day and explains that the date is an upper bound", async () => {
    getClubStarHistory.mockResolvedValue({
      club_id: 7,
      current_stars: 2.5,
      entries: [
        { stars: 2, valid_from: "2026-03-28", changed_at: "2026-09-15T00:00:00", source: "recovered" },
        { stars: 2.5, valid_from: "2026-05-31", changed_at: "2026-09-15T00:00:00", source: "recovered" },
      ],
    });

    const { container } = renderHistory();
    await waitFor(() => expect(screen.getAllByText(/^by /).length).toBe(2));

    expect(container.textContent).toMatch(/on or before that day/);
    expect(container.textContent).not.toMatch(/since/);
  });

  it("says so when one rating is all there is", async () => {
    getClubStarHistory.mockResolvedValue({
      club_id: 7,
      current_stars: 3,
      entries: [{ stars: 3, valid_from: "2026-09-15", changed_at: "2026-09-15T00:00:00", source: "seed" }],
    });

    const { container } = renderHistory();
    await waitFor(() => expect(screen.getByText(/only rating on record/)).toBeTruthy());

    expect(container.querySelectorAll(".list-divided > div")).toHaveLength(1);
  });
});
