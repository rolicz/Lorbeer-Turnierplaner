import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { drillInBackActionFor, resolveDrillInBackAction } from "../ui/shell/backNavigation";
import { recordNavigation, resetNavStack } from "../ui/shell/navStack";
import StatsPage from "../pages/StatsPage";

/**
 * T11 — backing out of the stats matchup returns where you came from.
 *
 * The matchup is not a route but a query param (`?vs=`) on `/stats`, so only the
 * history stack can tell "I drilled in from the matrix" from "I landed here from
 * a match page". Opening it is a push; the in-view back button asks
 * `resolveDrillInBackAction` whether it may pop, exactly like the swipe gesture.
 */

/** Put the router's history index where the browser would have it. */
function atIndex(idx: number) {
  window.history.replaceState({ idx }, "");
}

describe("resolveDrillInBackAction", () => {
  const here = { pathname: "/stats", param: "vs" };

  it("pops when the entry behind is the same page without the drill-in", () => {
    expect(
      resolveDrillInBackAction({ ...here, canPop: true, previousPath: "/stats?view=h2h&mode=overall&player=1" }),
    ).toEqual({ kind: "pop" });
  });

  it("clears in place when something else sits behind it (a deep link)", () => {
    expect(
      resolveDrillInBackAction({ ...here, canPop: true, previousPath: "/live/19/match/104" }),
    ).toEqual({ kind: "clear" });
  });

  it("clears in place with nothing to pop", () => {
    expect(resolveDrillInBackAction({ ...here, canPop: false, previousPath: null })).toEqual({ kind: "clear" });
    expect(resolveDrillInBackAction({ ...here, canPop: true, previousPath: null })).toEqual({ kind: "clear" });
  });

  it("clears in place when the entry behind is another matchup", () => {
    expect(
      resolveDrillInBackAction({ ...here, canPop: true, previousPath: "/stats?view=h2h&player=1&vs=4" }),
    ).toEqual({ kind: "clear" });
  });

  // A9: `/stats` is four bodies under one path. Popping onto another one lands
  // somewhere the "Head-to-head" button never named.
  it("clears in place when the entry behind is a different stats body", () => {
    expect(
      resolveDrillInBackAction({
        ...here,
        search: "?view=h2h&player=1&vs=4",
        sameParams: ["view"],
        canPop: true,
        previousPath: "/stats?view=player&player=1",
      }),
    ).toEqual({ kind: "clear" });
  });

  it("still pops when the entry behind is the same body", () => {
    expect(
      resolveDrillInBackAction({
        ...here,
        search: "?view=h2h&player=1&vs=4",
        sameParams: ["view"],
        canPop: true,
        previousPath: "/stats?view=h2h&player=1",
      }),
    ).toEqual({ kind: "pop" });
  });

  it("ignores an empty param and a trailing slash on the entry behind", () => {
    expect(
      resolveDrillInBackAction({ ...here, canPop: true, previousPath: "/stats/?view=h2h&vs=" }),
    ).toEqual({ kind: "pop" });
  });
});

describe("drillInBackActionFor (live history + navStack)", () => {
  const original = window.history.state as unknown;

  beforeEach(() => {
    resetNavStack();
  });

  afterEach(() => {
    window.history.replaceState(original, "");
    resetNavStack();
  });

  it("pops back to the matrix the matchup was opened from", () => {
    atIndex(0);
    recordNavigation("/stats", "?view=h2h&player=1");
    atIndex(1);
    recordNavigation("/stats", "?view=h2h&player=1&vs=2");

    expect(drillInBackActionFor("/stats", "vs")).toEqual({ kind: "pop" });
  });

  it("clears the param when a match page sits behind the matchup", () => {
    atIndex(0);
    recordNavigation("/live/19/match/104");
    atIndex(1);
    recordNavigation("/stats", "?view=h2h&mode=1v1&player=1&vs=2");

    expect(drillInBackActionFor("/stats", "vs")).toEqual({ kind: "clear" });
  });
});

/* ── The URL write itself: opening the matchup is a push, clearing is not ──── */

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
