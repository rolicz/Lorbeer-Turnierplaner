import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { LiveTournamentLite } from "../hooks/useLiveTournament";
import { AuthProvider } from "../auth/AuthContext";
import MobileChrome from "../ui/shell/MobileChrome";
import { resetNavStack } from "../ui/shell/navStack";

const live = vi.hoisted(() => ({ current: null as LiveTournamentLite | null }));
vi.mock("../hooks/useLiveTournament", () => ({
  useLiveTournament: () => ({ data: live.current }),
}));

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <MobileChrome open={false} setOpen={() => {}} />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/**
 * Q6, decisions 1 and 2: the back affordance appears wherever you went into
 * something, and it stopped *replacing* the menu. Two controls, one question.
 */
describe("MobileChrome top bar", () => {
  beforeEach(() => {
    live.current = null;
    localStorage.clear();
    resetNavStack();
  });

  it("shows back and the menu together on a page you went into", () => {
    for (const path of ["/live/19", "/live/19/match/108", "/profiles/2", "/profile", "/stats?view=h2h&player=1&vs=4"]) {
      const view = renderAt(path);
      expect(screen.queryByRole("button", { name: "Back" }), path).not.toBeNull();
      expect(screen.queryByRole("button", { name: "Open menu" }), path).not.toBeNull();
      view.unmount();
    }
  });

  it("shows the menu alone on a destination", () => {
    for (const path of ["/dashboard", "/tournaments", "/stats", "/stats?view=h2h&sub=duos", "/settings", "/nope"]) {
      const view = renderAt(path);
      expect(screen.queryByRole("button", { name: "Back" }), path).toBeNull();
      expect(screen.queryByRole("button", { name: "Open menu" }), path).not.toBeNull();
      view.unmount();
    }
  });

  it("puts back at the screen edge, before the menu", () => {
    const { container } = renderAt("/live/19/match/108");
    const labels = Array.from(container.querySelectorAll("header button")).map((b) => b.getAttribute("aria-label"));
    expect(labels.slice(0, 2)).toEqual(["Back", "Open menu"]);
  });
});
