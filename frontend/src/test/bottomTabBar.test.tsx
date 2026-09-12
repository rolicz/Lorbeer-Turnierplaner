import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { LiveTournamentLite } from "../hooks/useLiveTournament";
import { AuthProvider } from "../auth/AuthContext";
import BottomTabBar from "../ui/shell/BottomTabBar";

// The bar reads the live tournament through the query cache; stub the hook so the
// test needs no QueryClient and no network.
const live = vi.hoisted(() => ({ current: null as LiveTournamentLite | null }));
vi.mock("../hooks/useLiveTournament", () => ({
  useLiveTournament: () => ({ data: live.current }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <BottomTabBar />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("BottomTabBar", () => {
  beforeEach(() => {
    live.current = null;
    localStorage.clear();
  });

  it("shows the five primary destinations for a reader, without Clubs", () => {
    const { getAllByRole, queryByRole } = renderAt("/dashboard");

    const links = getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links.map((l) => l.textContent)).toEqual([
      "Dashboard",
      "Tournaments",
      "Friendlies",
      "Stats",
      "Players",
    ]);
    expect(queryByRole("link", { name: "Clubs" })).toBeNull();
  });

  it("marks the link matching the current path as the current page", () => {
    const { getByRole } = renderAt("/stats");

    expect(getByRole("link", { name: "Stats" })).toHaveAttribute("aria-current", "page");
    expect(getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the owning destination active on detail routes", () => {
    const { getByRole } = renderAt("/profiles/2");

    expect(getByRole("link", { name: "Players" })).toHaveAttribute("aria-current", "page");
  });

  it("points Tournaments at the running tournament and shows the live dot", () => {
    live.current = { id: 19, name: "4. Lorbeerkranzturnier", mode: "2v2", status: "live" };
    const { container, getByRole } = renderAt("/dashboard");

    expect(getByRole("link", { name: "Tournaments" })).toHaveAttribute("href", "/live/19");
    expect(container.querySelector(".live-dot")).not.toBeNull();
    expect(container.querySelector(".live-ping")).not.toBeNull();
  });

  it("has no live dot and the plain link while nothing is live", () => {
    const { container, getByRole } = renderAt("/dashboard");

    expect(getByRole("link", { name: "Tournaments" })).toHaveAttribute("href", "/tournaments");
    expect(container.querySelector(".live-dot")).toBeNull();
  });
});
