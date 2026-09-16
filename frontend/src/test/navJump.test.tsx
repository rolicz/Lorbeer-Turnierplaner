import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import { Link, MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { LiveTournamentLite } from "../hooks/useLiveTournament";
import { AuthProvider } from "../auth/AuthProvider";
import BottomTabBar from "../ui/shell/BottomTabBar";
import MobileChrome from "../ui/shell/MobileChrome";
import Sidebar from "../ui/shell/Sidebar";
import { isJumpNavigation } from "../ui/shell/backNavigation";
import { rememberLocation, resetForgottenPaths } from "../ui/shell/lastLocation";
import { currentArrival, resetNavStack } from "../ui/shell/navStack";
import { NAV_JUMP_STATE } from "../ui/shell/backNavigation";
import { useRememberLocation } from "../ui/shell/useRememberLocation";

/**
 * Q6b — **every way into a destination is marked a jump, and none is missed.**
 *
 * This is the half of the rule that cannot be inferred later: a tab tap and an
 * in-content link produce the same-looking history, and back has to treat them
 * as opposites (N1 vs T11). The mark is put on at the one moment the difference
 * exists — the navigation itself — so every shell that offers a destination has
 * to carry it. Three shells, plus the shortcuts that do not go through
 * `useDestinationLinks`: the "Live now" entry and the Settings link.
 *
 * Clicking a real `<Link>` and reading `location.state` is the only test that
 * proves the prop actually reaches the navigation.
 */
const live = vi.hoisted(() => ({ current: null as LiveTournamentLite | null }));
vi.mock("../hooks/useLiveTournament", () => ({
  useLiveTournament: () => ({ data: live.current }),
}));

function Probe() {
  const loc = useLocation();
  return (
    <>
      <span data-testid="to">{loc.pathname + loc.search}</span>
      <span data-testid="jump">{isJumpNavigation(loc.state) ? "jump" : "drill"}</span>
    </>
  );
}

function renderShell(shell: React.ReactNode, path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          {shell}
          <Probe />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Click a link by its accessible name and report where it went, and how. */
function follow(view: { container: HTMLElement }, name: string | RegExp): { to: string | null; kind: string | null } {
  const scope = within(view.container);
  fireEvent.click(scope.getAllByRole("link", { name })[0]);
  return { to: scope.getByTestId("to").textContent, kind: scope.getByTestId("jump").textContent };
}

describe("every nav destination is entered as a jump", () => {
  beforeEach(() => {
    live.current = null;
    localStorage.clear();
    resetForgottenPaths();
    resetNavStack();
  });

  it("the bottom tab bar marks all five tabs", () => {
    const view = renderShell(<BottomTabBar />, "/dashboard");
    for (const name of ["Dashboard", "Tournaments", "Friendlies", "Stats", "Players"]) {
      expect(follow(view, name).kind, name).toBe("jump");
    }
  });

  it("the bottom bar's remembered page and its live shortcut are jumps too", () => {
    // Both are how a tab can land on a page you went *into* — which is exactly
    // where back must go up instead of popping (N1).
    live.current = { id: 19, name: "4. Lorbeerkranzturnier", mode: "2v2", status: "live" };
    const withLive = renderShell(<BottomTabBar />, "/dashboard");
    expect(follow(withLive, "Tournaments")).toEqual({ to: "/live/19", kind: "jump" });
    withLive.unmount();

    resetNavStack();
    localStorage.clear();
    live.current = null;
    rememberLocation("/profiles/1", "?tab=guestbook");
    const remembered = renderShell(<BottomTabBar />, "/dashboard");
    expect(follow(remembered, "Players")).toEqual({ to: "/profiles/1?tab=guestbook", kind: "jump" });
  });

  it("the second tap on the active destination is a jump as well", () => {
    rememberLocation("/live/19", "?tab=matches");
    const view = renderShell(<BottomTabBar />, "/live/19");
    expect(follow(view, "Tournaments")).toEqual({ to: "/tournaments", kind: "jump" });
  });

  it("the desktop sidebar marks its destinations, Live now and Settings", () => {
    live.current = { id: 19, name: "4. Lorbeerkranzturnier", mode: "2v2", status: "live" };
    const view = renderShell(<Sidebar collapsed={false} onToggleCollapse={() => {}} />, "/dashboard");
    for (const name of [/Live now/, "Tournaments", "Stats", "Players", "Settings"]) {
      expect(follow(view, name).kind, String(name)).toBe("jump");
    }
  });

  it("the mobile drawer marks its destinations, Live now and Settings", () => {
    live.current = { id: 19, name: "4. Lorbeerkranzturnier", mode: "2v2", status: "live" };
    const view = renderShell(<MobileChrome open setOpen={() => {}} />, "/dashboard");
    for (const name of [/Live now/, "Tournaments", "Stats", "Players", "Settings"]) {
      expect(follow(view, name).kind, String(name)).toBe("jump");
    }
  });
});

/**
 * The other half of the seam: the mark rides on the navigation, `navStack` keeps
 * the answer. What is asserted here is the *stickiness* — the moment a page
 * rewrites its own query string (`?tab=`, a stats filter) `location.state` is
 * wiped, and re-deriving the kind from the wiped state at that point would
 * relabel a jump as a drill-in and hand N1 straight back.
 */
function Recorder() {
  useRememberLocation();
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <>
      <Link to="/live/21" state={NAV_JUMP_STATE}>
        tab
      </Link>
      <Link to="/live/21">row</Link>
      <button type="button" onClick={() => nav({ search: "?tab=matches" }, { replace: true })}>
        switch tab
      </button>
      <span data-testid="at">{loc.pathname + loc.search}</span>
    </>
  );
}

describe("what the shell records for the entry it lands on", () => {
  beforeEach(() => {
    resetNavStack();
    window.history.replaceState({ idx: 0 }, "");
  });

  it("records a jump, and keeps it when the page rewrites its own query string", () => {
    const view = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Recorder />
      </MemoryRouter>,
    );
    const scope = within(view.container);

    fireEvent.click(scope.getByRole("link", { name: "tab" }));
    expect(currentArrival("/live/21")).toBe("jump");

    fireEvent.click(scope.getByRole("button", { name: "switch tab" }));
    expect(scope.getByTestId("at").textContent).toBe("/live/21?tab=matches");
    expect(currentArrival("/live/21")).toBe("jump");
  });

  it("records a drill-in for an ordinary link", () => {
    const view = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Recorder />
      </MemoryRouter>,
    );
    fireEvent.click(within(view.container).getByRole("link", { name: "row" }));
    expect(currentArrival("/live/21")).toBe("drill");
  });
});
