/**
 * W2 — an avatar asks for the size it is drawn at, from inside itself.
 *
 * The constraint this pins is Roli's: `AvatarCircle` is one component and does not grow a
 * size argument at 25 call sites, because the `sizeClass` it is already given is the
 * answer. So what is asserted is the `src` the component builds on its own — the rung for
 * the box, `?v=` still first and still there, and **no** `?w=` at all when the class is
 * one the reader cannot parse, which is the promise that a future call site can only ever
 * be slow.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { API_BASE } from "../api/client";
import AvatarCircle from "../ui/primitives/AvatarCircle";

const UPDATED = "2026-02-07T22:49:55.205956";
// The base is whatever this build was given (`/api` in production, a LAN host in dev);
// what the test is about is everything after it.
const SRC = `${API_BASE}/players/1/avatar`;
const V = "v=2026-02-07T22%3A49%3A55.205956";

function setDpr(value: number) {
  Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });
}

afterEach(() => setDpr(1));

function srcOf(sizeClass?: string): string {
  const { container } = render(
    sizeClass == null ? (
      <AvatarCircle playerId={1} name="Roli" updatedAt={UPDATED} />
    ) : (
      <AvatarCircle playerId={1} name="Roli" updatedAt={UPDATED} sizeClass={sizeClass} />
    ),
  );
  return container.querySelector("img")!.getAttribute("src")!;
}

describe("AvatarCircle media width", () => {
  it("asks for the rung its own box needs, at dpr 1", () => {
    setDpr(1);
    expect(srcOf("h-6 w-6")).toBe(`${SRC}?${V}&w=64`);
    expect(srcOf("h-10 w-10")).toBe(`${SRC}?${V}&w=64`);
    expect(srcOf("h-20 w-20")).toBe(`${SRC}?${V}&w=128`);
  });

  it("asks for a bigger rung on a 3x screen, still without a call site saying so", () => {
    setDpr(3);
    expect(srcOf("h-6 w-6")).toBe(`${SRC}?${V}&w=128`);
    expect(srcOf("h-10 w-10")).toBe(`${SRC}?${V}&w=128`);
    expect(srcOf("h-20 w-20")).toBe(`${SRC}?${V}&w=256`);
  });

  it("uses the default size class when the call site passes none", () => {
    setDpr(3);
    expect(srcOf()).toBe(`${SRC}?${V}&w=128`); // h-10 w-10, 40px
  });

  it("serves the original — no `w=` at all — when the class cannot be read", () => {
    setDpr(3);
    expect(srcOf("h-full w-full")).toBe(`${SRC}?${V}`);
    expect(srcOf("h-[3.25rem] w-[3.25rem]")).toBe(`${SRC}?${V}`);
  });

  it("keeps the picture lazy and the version first", () => {
    const { container } = render(<AvatarCircle playerId={3} name="Rumpi" updatedAt={UPDATED} sizeClass="h-7 w-7" />);
    const img = container.querySelector("img")!;

    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("src")).toMatch(/\?v=[^&]+&w=\d+$/);
  });
});
