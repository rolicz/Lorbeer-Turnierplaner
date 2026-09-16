import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import StatsPage from "../pages/StatsPage";

/**
 * The matchup's history entry (T11, still true under Q6's model).
 *
 * Opening "A vs B, every match" is the one stats param written with a **push**:
 * it swaps the whole body, so it owns a history step and becomes a page the
 * reader went *into* — which is what gives it a back chevron, a swipe and the
 * browser's own button, all agreeing (`routeHierarchy` declares it, `useBack`
 * decides, tested in `routeHierarchy.test.ts` / `useBack.test.tsx`).
 *
 * Leaving it is a `replace`, so the way out never spends an entry of its own.
 */
vi.mock("../pages/stats/StatsInsights", () => ({
  default: ({ onSetVs }: { onSetVs: (ids: number[], withPlayer?: number[], opts?: { push?: boolean }) => void }) => (
    <>
      <button type="button" onClick={() => onSetVs([2], [1], { push: true })}>open matchup</button>
      <button type="button" onClick={() => onSetVs([])}>clear matchup</button>
    </>
  ),
}));

function Probe() {
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <>
      <span data-testid="here">{loc.pathname + loc.search}</span>
      <button type="button" onClick={() => nav(-1)}>browser back</button>
    </>
  );
}

/** `/dashboard` → `entry`, so there is always something behind the stats page. */
async function renderStats(entry: string) {
  render(
    <MemoryRouter initialEntries={["/dashboard", entry]} initialIndex={1}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <StatsPage />
              <Probe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("open matchup");
}

describe("StatsPage matchup history entry", () => {
  it("opens the matchup as a push, so back returns to the H2H list", async () => {
    await renderStats("/stats?view=h2h&mode=overall&source=tournaments&player=1");

    fireEvent.click(screen.getByText("open matchup"));
    expect(screen.getByTestId("here").textContent).toBe("/stats?view=h2h&mode=overall&source=tournaments&player=1&vs=2");

    fireEvent.click(screen.getByText("browser back"));
    expect(screen.getByTestId("here").textContent).toBe("/stats?view=h2h&mode=overall&source=tournaments&player=1");
  });

  it("clears the matchup in place, without spending a history entry", async () => {
    await renderStats("/stats?view=h2h&player=1&vs=2");

    fireEvent.click(screen.getByText("clear matchup"));
    expect(screen.getByTestId("here").textContent).toBe("/stats?view=h2h&player=1");

    // A replace, not a push: what is behind us is still the page we came from.
    fireEvent.click(screen.getByText("browser back"));
    expect(screen.getByTestId("here").textContent).toBe("/dashboard");
  });
});
