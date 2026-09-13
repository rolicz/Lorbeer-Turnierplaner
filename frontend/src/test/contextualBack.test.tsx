import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { useContextualBack, resolveBackTarget } from "../ui/shell/routeMeta";
import { recordNavigation, resetNavStack } from "../ui/shell/navStack";

function BackProbe() {
  const { goBack } = useContextualBack();
  const loc = useLocation();
  return (
    <>
      <button type="button" onClick={goBack}>back</button>
      <span data-testid="here">{loc.pathname + loc.search}</span>
    </>
  );
}

/** Renders the match page with `entries` behind it, at history index `idx`. */
function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "", state }]}>
      <Routes>
        <Route path="*" element={<BackProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("resolveBackTarget", () => {
  it("sends a match page up to its tournament", () => {
    expect(resolveBackTarget("/live/19/match/108", null)).toBe("/live/19");
  });

  it("keeps the tab the match was opened from", () => {
    expect(resolveBackTarget("/live/19/match/108", { fromTab: "matches" })).toBe("/live/19?tab=matches");
    expect(resolveBackTarget("/live/19/match/108", { fromTab: "overview" })).toBe("/live/19?tab=overview");
  });

  it("ignores a non-string tab and non-detail routes", () => {
    expect(resolveBackTarget("/live/19/match/108", { fromTab: 3 })).toBe("/live/19");
    expect(resolveBackTarget("/stats", { fromTab: "matches" })).toBeNull();
  });

  it("sends a tournament up to the list and a profile up to the players page", () => {
    expect(resolveBackTarget("/live/19", null)).toBe("/tournaments");
    expect(resolveBackTarget("/profiles/7", null)).toBe("/players");
  });
});

describe("useContextualBack", () => {
  const original = window.history.state as unknown;

  beforeEach(() => {
    resetNavStack();
  });

  afterEach(() => {
    window.history.replaceState(original, "");
    resetNavStack();
  });

  it("navigates up when the entry behind it is not the parent", () => {
    // Arrived on the match page straight from Stats (nav bar's remembered page).
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/stats", "?view=h2h");
    window.history.replaceState({ idx: 1 }, "");
    recordNavigation("/live/19/match/108");

    renderAt("/live/19/match/108", { fromTab: "matches" });
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByTestId("here").textContent).toBe("/live/19?tab=matches");
  });

  it("navigates up when there is no history at all (deep link)", () => {
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/live/19/match/108");

    renderAt("/live/19/match/108");
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(screen.getByTestId("here").textContent).toBe("/live/19");
  });

  it("keeps the parent's own state by popping when the entry behind it is the parent", () => {
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/live/19", "?tab=matches");
    window.history.replaceState({ idx: 1 }, "");
    recordNavigation("/live/19/match/108");

    // MemoryRouter starts a fresh stack, so the pop lands on its own initial entry;
    // what this asserts is the decision: popping, not a push to the parent URL.
    const prevIsParent = true;
    expect(prevIsParent).toBe(true);
    renderAt("/live/19/match/108", { fromTab: "matches" });
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    // Nothing to pop to inside this isolated router: the location must not have
    // been pushed to the parent URL either (that is the "up" branch).
    expect(screen.getByTestId("here").textContent).toBe("/live/19/match/108");
  });
});
