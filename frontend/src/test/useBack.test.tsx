import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom";

import { useBack } from "../ui/shell/backNavigation";
import { recordNavigation, resetNavStack } from "../ui/shell/navStack";

/**
 * Q6/Q6b — the hook the chevrons and the gesture share, against a real router.
 *
 * Three things are asserted that the pure decision cannot show: that `hasBack` is
 * the only thing deciding whether an affordance exists, that going **up** is a
 * `replace` — it consumes the page being left, so walking up a deep link never
 * grows history and the ladder cannot ping-pong — and that the arrival kind the
 * hook reads is the one `navStack` recorded, not anything derived from the URLs.
 */
function BackProbe() {
  const { hasBack, goBack } = useBack();
  const loc = useLocation();
  const navType = useNavigationType();
  return (
    <>
      {hasBack ? (
        <button type="button" onClick={goBack}>
          back
        </button>
      ) : null}
      <button type="button" onClick={goBack}>
        force
      </button>
      <span data-testid="here">{loc.pathname + loc.search}</span>
      <span data-testid="nav-type">{navType}</span>
    </>
  );
}

function renderAt(path: string, state?: unknown) {
  const [pathname, search] = path.split("?");
  return render(
    <MemoryRouter initialEntries={[{ pathname, search: search ? `?${search}` : "", state }]}>
      <Routes>
        <Route path="*" element={<BackProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const here = () => screen.getByTestId("here").textContent;
const navType = () => screen.getByTestId("nav-type").textContent;

describe("useBack — where the affordance appears", () => {
  const original = window.history.state as unknown;

  beforeEach(() => resetNavStack());
  afterEach(() => {
    window.history.replaceState(original, "");
    resetNavStack();
  });

  it("draws it on every page you went into, the matchup included", () => {
    for (const path of [
      "/live/19",
      "/live/19/match/108",
      "/profiles/2",
      "/profile",
      "/stats?view=h2h&player=1&vs=4",
    ]) {
      const view = renderAt(path);
      expect(screen.queryByRole("button", { name: "back" }), path).not.toBeNull();
      view.unmount();
    }
  });

  it("draws it on no destination — not even one you navigated to", () => {
    for (const path of ["/dashboard", "/tournaments", "/stats", "/stats?view=h2h&sub=duos", "/settings", "/nope"]) {
      const view = renderAt(path);
      expect(screen.queryByRole("button", { name: "back" }), path).toBeNull();
      view.unmount();
    }
  });
});

describe("useBack — what it does", () => {
  const original = window.history.state as unknown;

  beforeEach(() => resetNavStack());
  afterEach(() => {
    window.history.replaceState(original, "");
    resetNavStack();
  });

  it("navigates up after a jump — and replaces, not pushes", () => {
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/stats", "?view=h2h", "drill");
    window.history.replaceState({ idx: 1 }, "");
    recordNavigation("/live/19/match/108", "", "jump"); // the Tournaments tab's remembered page

    renderAt("/live/19/match/108", { fromTab: "matches" });
    fireEvent.click(screen.getByRole("button", { name: "back" }));

    expect(here()).toBe("/live/19?tab=matches");
    expect(navType()).toBe("REPLACE");
  });

  it("pops instead when the very same pair of URLs was a drill-in (Q6b)", () => {
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/stats", "?view=h2h", "drill");
    window.history.replaceState({ idx: 1 }, "");
    recordNavigation("/live/19/match/108", "", "drill"); // a Records row in Stats

    renderAt("/live/19/match/108", { fromTab: "matches" });
    fireEvent.click(screen.getByRole("button", { name: "back" }));

    // Identical URLs, opposite answers — the only difference is what was recorded
    // when the navigation was made. MemoryRouter starts its own stack, so the pop
    // has nowhere to land: what this pins is that back did *not* navigate up.
    expect(here()).toBe("/live/19/match/108");
  });

  it("navigates up from a deep link with no history at all", () => {
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/live/19/match/108", "", "drill");

    renderAt("/live/19/match/108");
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(here()).toBe("/live/19");
  });

  it("pops (not pushes the parent URL) when the entry behind is the parent", () => {
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/live/19", "?tab=matches", "drill");
    window.history.replaceState({ idx: 1 }, "");
    recordNavigation("/live/19/match/108", "", "drill");

    renderAt("/live/19/match/108", { fromTab: "matches" });
    fireEvent.click(screen.getByRole("button", { name: "back" }));

    // MemoryRouter starts its own stack, so the pop has nowhere to land: what
    // this pins is the decision — the location was not navigated to the parent.
    expect(here()).toBe("/live/19/match/108");
  });

  it("leaves the matchup for its H2H list, keeping the filters and collapsing the team", () => {
    // The in-place exit: a deep link or a jump, where there is nothing to pop to.
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/live/17/match/93", "", "drill");
    window.history.replaceState({ idx: 1 }, "");
    recordNavigation("/stats", "?view=h2h&mode=2v2&source=tournaments&player=1,4&vs=2,5", "jump");

    renderAt("/stats?view=h2h&mode=2v2&source=tournaments&player=1,4&vs=2,5");
    fireEvent.click(screen.getByRole("button", { name: "back" }));

    expect(here()).toBe("/stats?view=h2h&mode=2v2&source=tournaments&player=1");
  });

  it("goes home from a destination with nothing behind it, and does nothing at home", () => {
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/settings", "", "jump");
    renderAt("/settings");
    fireEvent.click(screen.getByRole("button", { name: "force" }));
    expect(here()).toBe("/dashboard");

    resetNavStack();
    window.history.replaceState({ idx: 0 }, "");
    recordNavigation("/dashboard", "", "jump");
    renderAt("/dashboard");
    fireEvent.click(screen.getAllByRole("button", { name: "force" })[1]);
    expect(screen.getAllByTestId("here")[1].textContent).toBe("/dashboard");
  });
});
