import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import PlayerLink from "../ui/primitives/PlayerLink";
import { AuthProvider } from "../auth/AuthProvider";
import { qk } from "../api/queryKeys";
import { LIST_ROW_OVERLAY_CLASS } from "../ui/primitives/List";
import { seedSession } from "./authFixtures";

function Here() {
  const loc = useLocation();
  return <div data-testid="url">{loc.pathname + loc.search}</div>;
}

function renderLink(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/stats?view=overview&sub=records"]}>
      <Routes>
        <Route path="*" element={<>{ui}<Here /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PlayerLink", () => {
  it("links the identity to that player's profile", () => {
    renderLink(<PlayerLink playerId={7} name="Roli">Roli</PlayerLink>);

    const link = screen.getByRole("link", { name: "Roli" });
    expect(link).toHaveAttribute("href", "/profiles/7");
    expect(link).toHaveAttribute("title", "Open Roli's profile");
    expect(link.className).toContain("no-underline");

    fireEvent.click(link);
    expect(screen.getByTestId("url").textContent).toBe("/profiles/7");
  });

  it("keeps the click from reaching the row it sits in", () => {
    const rowClick = vi.fn();
    renderLink(
      <div onClick={rowClick}>
        <PlayerLink playerId={2} name="Flo">Flo</PlayerLink>
        <span>rest of the row</span>
      </div>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Flo" }));
    expect(rowClick).not.toHaveBeenCalled();
    expect(screen.getByTestId("url").textContent).toBe("/profiles/2");

    // …but the rest of the row still triggers the row's own action.
    fireEvent.click(screen.getByText("rest of the row"));
    expect(rowClick).toHaveBeenCalledTimes(1);
  });

  it("lets a caller suppress the navigation (a drag, not a tap)", () => {
    renderLink(
      <PlayerLink playerId={3} name="Rumpi" onClick={(e) => e.preventDefault()}>
        Rumpi
      </PlayerLink>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Rumpi" }));
    expect(screen.getByTestId("url").textContent).toBe("/stats?view=overview&sub=records");
  });

  it("takes a custom title and hides a decorative duplicate from assistive tech", () => {
    const { container } = renderLink(
      <>
        <PlayerLink playerId={4} name="Berni" decorative>
          <span>avatar</span>
        </PlayerLink>
        <PlayerLink playerId={4} name="Berni" title="Berni · 3 titles">
          Berni
        </PlayerLink>
      </>,
    );

    // Only the named link is in the accessibility tree.
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Berni" })).toHaveAttribute("title", "Berni · 3 titles");

    const decorative = container.querySelector('a[aria-hidden="true"]');
    expect(decorative).not.toBeNull();
    expect(decorative).toHaveAttribute("tabindex", "-1");
    expect(decorative).toHaveAttribute("href", "/profiles/4");
  });
});

// ---- L11: PlayerLink decides who may open a profile ------------------------------------

type Access = { siteAdmin?: boolean; roster: number[]; accounts?: Array<{ player_id: number; role: string; site_admin?: boolean }> };

function renderWithAccess(ui: React.ReactNode, { siteAdmin = false, roster, accounts = [] }: Access) {
  seedSession({ player_id: 1, site_admin: siteAdmin, role: siteAdmin ? "admin" : "editor" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.players(), roster.map((id) => ({ id, display_name: `P${id}` })));
  qc.setQueryData(
    qk.admin.accounts(),
    accounts.map((a) => ({
      display_name: `P${a.player_id}`,
      site_admin: false,
      password_origin: "set",
      has_passkey: false,
      session_count: 0,
      last_seen_at: null,
      ...a,
    })),
  );
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/stats"]}>
          <Routes>
            <Route path="*" element={<>{ui}<Here /></>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("PlayerLink — who may open a profile (L11)", () => {
  beforeEach(() => {
    // `AuthProvider` asks `/me` in an effect; a failure without a status changes nothing (L4).
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline in tests"))));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("is a link, unmarked, for a player in the caller's roster", () => {
    renderWithAccess(<PlayerLink playerId={4} name="Berni">Berni</PlayerLink>, { roster: [1, 4] });
    const link = screen.getByRole("link", { name: "Berni" });
    expect(link).toHaveAttribute("href", "/profiles/4");
    expect(screen.queryByLabelText("From another group")).toBeNull();
  });

  it("is plain text with the mark for a player outside every group the caller is in", () => {
    const { container } = renderWithAccess(
      <PlayerLink playerId={9} name="Fremder" className="inline-flex">Fremder</PlayerLink>,
      { roster: [1, 4] },
    );
    expect(screen.queryByRole("link")).toBeNull();
    const span = screen.getByTitle("Not in your group");
    expect(span.tagName).toBe("SPAN");
    expect(span.className).toContain("inline-flex");
    expect(span.className).not.toContain("hover:text-accent");
    expect(screen.getByLabelText("From another group")).toBeInTheDocument();
    expect(container.querySelectorAll("a").length).toBe(0);
  });

  it("never marks the caller's own name, roster or not", () => {
    renderWithAccess(<PlayerLink playerId={1} name="Roli">Roli</PlayerLink>, { roster: [] });
    expect(screen.getByRole("link", { name: "Roli" })).toHaveAttribute("href", "/profiles/1");
    expect(screen.queryByLabelText("From another group")).toBeNull();
  });

  it("lets the site admin open anyone, and marks the one who shares no group", () => {
    renderWithAccess(
      <>
        <PlayerLink playerId={9} name="Fremder">Fremder</PlayerLink>
        <PlayerLink playerId={4} name="Berni">Berni</PlayerLink>
      </>,
      {
        siteAdmin: true,
        roster: [1, 4, 9],
        accounts: [{ player_id: 4, role: "editor" }, { player_id: 9, role: "none" }],
      },
    );
    const foreign = screen.getByRole("link", { name: /Fremder/ });
    expect(foreign).toHaveAttribute("href", "/profiles/9");
    expect(foreign.querySelector('[aria-label="From another group"]')).not.toBeNull();
    const shared = screen.getByRole("link", { name: "Berni" });
    expect(shared.querySelector('[aria-label="From another group"]')).toBeNull();
  });

  it("does not repeat the mark on a decorative duplicate", () => {
    renderWithAccess(
      <PlayerLink playerId={9} name="Fremder" decorative><span>avatar</span></PlayerLink>,
      { roster: [1] },
    );
    expect(screen.queryByLabelText("From another group")).toBeNull();
  });

  it("stretched: the row's overlay, with no children and the ListRow class", () => {
    const { container } = renderWithAccess(
      <div className="relative">
        <PlayerLink stretched playerId={4} name="Berni" />
      </div>,
      { roster: [1, 4] },
    );
    const link = screen.getByRole("link", { name: "Open Berni's profile" });
    expect(link).toHaveAttribute("href", "/profiles/4");
    expect(link.className).toBe(LIST_ROW_OVERLAY_CLASS);
    expect(link.childNodes.length).toBe(0);
    fireEvent.click(link);
    expect(screen.getByTestId("url").textContent).toBe("/profiles/4");
    expect(container.querySelectorAll("a a").length).toBe(0);
  });

  it("stretched: nothing at all when the profile may not be opened", () => {
    const { container } = renderWithAccess(
      <div className="relative"><PlayerLink stretched playerId={9} name="Fremder" /></div>,
      { roster: [1, 4] },
    );
    expect(container.querySelectorAll("a").length).toBe(0);
  });
});
