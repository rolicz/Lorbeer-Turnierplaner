import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import PlayerLink from "../ui/primitives/PlayerLink";

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
