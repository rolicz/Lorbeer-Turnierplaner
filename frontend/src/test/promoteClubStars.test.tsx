/**
 * L12 — "Make this rating global": a site admin's one control, shown only when the
 * server says the group's rating is not the global one, and it answers the new history.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { ClubStarHistory as ClubStarHistoryPayload } from "../api/types";

const getClubStarHistory = vi.fn<(id: number) => Promise<ClubStarHistoryPayload>>();
const promoteClubStars = vi.fn<(id: number) => Promise<ClubStarHistoryPayload>>();
vi.mock("../api/clubs.api", () => ({
  getClubStarHistory: (id: number) => getClubStarHistory(id),
  promoteClubStars: (id: number) => promoteClubStars(id),
}));

import PromoteClubStars from "../pages/clubs/PromoteClubStars";

const groupOnly: ClubStarHistoryPayload = {
  club_id: 7,
  current_stars: 4.5,
  current_is_global: false,
  entries: [
    { stars: 3, valid_from: "2026-03-28", changed_at: "2026-03-28T00:00:00", source: "seed", scope: "global" },
    { stars: 4.5, valid_from: "2026-09-12", changed_at: "2026-09-12T10:00:00", source: "live", scope: "group" },
  ],
};

function renderControl(isAdmin: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PromoteClubStars clubId={7} isAdmin={isAdmin} />
    </QueryClientProvider>,
  );
}

describe("PromoteClubStars", () => {
  it("offers the promotion to a site admin when the group's rating is its own, and hides it once global", async () => {
    getClubStarHistory.mockResolvedValue(groupOnly);
    promoteClubStars.mockResolvedValue({
      ...groupOnly,
      current_is_global: true,
      entries: [...groupOnly.entries, { ...groupOnly.entries[1], valid_from: "2026-09-23", scope: "global" }],
    });

    renderControl(true);
    const button = await screen.findByRole("button", { name: /make this rating global/i });
    expect(screen.getByText("Applies from today for every group.")).toBeTruthy();

    fireEvent.click(button);
    await waitFor(() => expect(promoteClubStars).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByRole("button", { name: /make this rating global/i })).toBeNull());
  });

  it("renders nothing for anyone but a site admin, and nothing when the rating is already global", async () => {
    getClubStarHistory.mockResolvedValue(groupOnly);
    const { container } = renderControl(false);
    expect(container.textContent).toBe("");

    getClubStarHistory.mockResolvedValue({ ...groupOnly, current_is_global: true });
    const second = renderControl(true);
    await waitFor(() => expect(getClubStarHistory).toHaveBeenCalled());
    expect(second.container.querySelector("button")).toBeNull();
  });
});
