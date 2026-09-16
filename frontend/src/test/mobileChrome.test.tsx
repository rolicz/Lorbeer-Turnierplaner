import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { LiveTournamentLite } from "../hooks/useLiveTournament";
import { AuthProvider } from "../auth/AuthProvider";
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
 *
 * Q13 fixed where those controls sit: the menu owns the screen edge on every
 * page, back appears inboard of it, and the title is centred on the screen
 * because both side boxes reserve the same 80px whether or not anything is in
 * them. The geometry itself is measured in a browser (the plan's table); what a
 * unit test can hold is the frame that produces it.
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

  it("keeps the menu at the screen edge and puts back inboard of it (Q13)", () => {
    const { container } = renderAt("/live/19/match/108");
    const labels = Array.from(container.querySelectorAll("header button")).map((b) => b.getAttribute("aria-label"));
    expect(labels.slice(0, 2)).toEqual(["Open menu", "Back"]);
  });

  it("frames the title between two equal, always-reserved side boxes (Q13)", () => {
    const frames: string[][] = [];
    for (const path of ["/dashboard", "/live/19", "/live/19/match/108", "/profiles/2"]) {
      const view = renderAt(path);
      const row = view.container.querySelector("header > div");
      const boxes = Array.from(row?.children ?? []);
      expect(boxes, path).toHaveLength(3);

      // The side boxes are the same fixed width (84px = menu 40 + gap 4 + back 40),
      // and they do not change when the chevron comes and goes — that is what keeps
      // the centre box centred.
      expect(boxes[0].className, path).toContain("w-top-bar-side");
      expect(boxes[2].className, path).toContain("w-top-bar-side");

      // The title is the centre box: it grows into whatever is left, centres its
      // text there and truncates rather than pushing anything aside.
      expect(boxes[1].getAttribute("data-testid"), path).toBe("top-bar-title");
      expect(boxes[1].className, path).toContain("flex-1");
      expect(boxes[1].className, path).toContain("text-center");
      expect(boxes[1].className, path).toContain("truncate");

      // One control at a time on the right, so its width is fixed too (Q13).
      expect(boxes[2].querySelectorAll("[data-connection-status]").length, path).toBeLessThanOrEqual(1);

      frames.push([boxes[0].className, boxes[1].className, boxes[2].className]);
      view.unmount();
    }
    for (const frame of frames) expect(frame).toEqual(frames[0]);
  });
});
