/**
 * T15-B — one ring around every avatar, and only its colour carries meaning.
 *
 * jsdom has no layout, so "the box never moves" is asserted in Playwright; what
 * is pinned here is the contract the ring is built on: one implementation, the
 * neutral hairline as the default, a cup colour only when cups are handed in,
 * and a tooltip that cannot leak into the accessible name of the `PlayerLink`
 * most avatars sit inside.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../api/playerAvatars.api", () => ({
  playerAvatarUrl: (id: number) => `/players/${id}/avatar`,
}));

import AvatarCircle from "../ui/primitives/AvatarCircle";
import PlayerLink from "../ui/primitives/PlayerLink";

const ring = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-avatar-ring]")!;

describe("AvatarCircle ring", () => {
  it("gives an avatar with no cups the neutral hairline", () => {
    const { container } = render(<AvatarCircle playerId={1} name="Roli" updatedAt="x" />);
    const r = ring(container);

    expect(r.dataset.avatarRing).toBe("neutral");
    expect(r.style.padding).toBe("1px");
    expect(r.style.background).toContain("--color-border-card-chip");
    expect(r.querySelector("[title]")).toBeNull();
  });

  it("paints the cup's own colour, thicker, when the player holds one today", () => {
    const { container } = render(
      <AvatarCircle playerId={3} name="Rumpi" updatedAt="x" cups={[{ key: "bauernkranz", name: "Bauernkranz" }]} />,
    );
    const r = ring(container);

    expect(r.dataset.avatarRing).toBe("cup");
    expect(r.style.padding).toBe("2.5px");
    expect(r.style.background).toBe("rgb(var(--color-cup-green-dark))");
    expect(r.querySelector("[title]")).toHaveAttribute("title", "Holds Bauernkranz");
  });

  it("splits the ring evenly between the cups a player holds at once", () => {
    const { container } = render(
      <AvatarCircle
        playerId={4}
        name="Berni"
        updatedAt="x"
        cups={[
          { key: "bauernkranz", name: "Bauernkranz" },
          { key: "default", name: "Lorbeerkranz" },
        ]}
      />,
    );
    const r = ring(container);

    expect(r.dataset.avatarRing).toBe("cup");
    expect(r.style.background).toBe(
      "conic-gradient(rgb(var(--color-cup-green-dark)) 0deg 180deg, rgb(var(--color-cup-gold)) 180deg 360deg)",
    );
    expect(r.querySelector("[title]")).toHaveAttribute("title", "Holds Bauernkranz · Lorbeerkranz");
  });

  it("treats an empty cup list as 'holds nothing', not as a cup", () => {
    const { container } = render(<AvatarCircle playerId={1} name="Roli" updatedAt="x" cups={[]} />);
    expect(ring(container).dataset.avatarRing).toBe("neutral");
  });

  it("keeps its box: the ring is drawn inside the size the call site asked for", () => {
    const plain = render(<AvatarCircle playerId={1} name="Roli" updatedAt="x" sizeClass="h-6 w-6" />);
    const held = render(
      <AvatarCircle playerId={3} name="Rumpi" updatedAt="x" sizeClass="h-6 w-6" cups={[{ key: "default", name: "Lorbeerkranz" }]} />,
    );

    expect(ring(plain.container).className).toContain("h-6 w-6");
    expect(ring(held.container).className).toContain("h-6 w-6");
  });

  it("never lends its tooltip to the link around it", () => {
    render(
      <MemoryRouter>
        <PlayerLink playerId={3} name="Rumpi">
          <AvatarCircle playerId={3} name="Rumpi" updatedAt="x" cups={[{ key: "bauernkranz", name: "Bauernkranz" }]} />
          <span>Rumpi</span>
        </PlayerLink>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Rumpi" })).toHaveAttribute("href", "/profiles/3");
  });
});
