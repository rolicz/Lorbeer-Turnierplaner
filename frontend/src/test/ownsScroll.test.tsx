/**
 * A9 — "save and return" from a match page lands on the row it edited.
 *
 * `MatchDetailPage` pushes back to the tournament with `focusMatchId`, and the
 * page smooth-scrolls to that row and flashes it. The shell's own restore for a
 * PUSH is an instant jump to the top on the next frame, which aborted that
 * scroll and played the flash off-screen. A destination that places the scroll
 * itself says so in `location.state`, exactly like a `#hash` target.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

const restoreMock = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("../ui/scroll", () => ({
  restoreWindowScroll: restoreMock,
  prefersReducedMotion: () => false,
  scrollElementToTop: () => false,
}));

import { ownsScroll, useScrollRestoration } from "../ui/shell/useScrollRestoration";

function Harness() {
  useScrollRestoration();
  const nav = useNavigate();
  return (
    <>
      <button type="button" onClick={() => nav("/live/19", { state: { focusMatchId: 8, ownsScroll: true } })}>
        save-and-return
      </button>
      <button type="button" onClick={() => nav("/live/19")}>
        plain-push
      </button>
      <Routes>
        <Route path="*" element={<div style={{ height: 3000 }} />} />
      </Routes>
    </>
  );
}

async function renderHarness() {
  restoreMock.mockClear();
  render(
    <MemoryRouter initialEntries={["/live/19/match/8"]}>
      <Harness />
    </MemoryRouter>,
  );
  // The initial render is a POP and restores its own (unknown → 0) offset; the
  // assertions below are about the navigation that follows it.
  await Promise.resolve();
  restoreMock.mockClear();
}

describe("ownsScroll", () => {
  it("recognises only an explicit claim", () => {
    expect(ownsScroll({ ownsScroll: true })).toBe(true);
    expect(ownsScroll({ ownsScroll: false })).toBe(false);
    expect(ownsScroll({ focusMatchId: 8 })).toBe(false);
    expect(ownsScroll(null)).toBe(false);
    expect(ownsScroll(undefined)).toBe(false);
    expect(ownsScroll("ownsScroll")).toBe(false);
  });

  it("a plain push is still put back at the top", async () => {
    await renderHarness();
    screen.getByRole("button", { name: "plain-push" }).click();
    await Promise.resolve();
    expect(restoreMock).toHaveBeenCalledWith(0, expect.anything());
  });

  it("a push that owns its scroll is left alone", async () => {
    await renderHarness();
    screen.getByRole("button", { name: "save-and-return" }).click();
    await Promise.resolve();
    expect(restoreMock).not.toHaveBeenCalled();
  });
});
