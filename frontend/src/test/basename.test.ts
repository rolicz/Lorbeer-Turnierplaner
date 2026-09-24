import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { resolveEntry } from "../app/basename";
import type { StatsRecord } from "../api/types";

/** Load `basename.ts` afresh with the document at `url` — it acts once, at import. */
async function bootAt(url: string) {
  window.history.replaceState({ idx: 7 }, "", url);
  vi.resetModules();
  return import("../app/basename");
}

const here = () => window.location.pathname + window.location.search + window.location.hash;

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.resetModules();
});

describe("resolveEntry (pure)", () => {
  it("sends the manifest's / to the group's root (the router's own / route goes on to the dashboard)", () => {
    expect(resolveEntry("/")).toEqual({ slug: "altherren", basename: "/g/altherren", redirect: "/g/altherren/" });
  });

  it("prefixes a legacy deep link and keeps its search and hash", () => {
    expect(resolveEntry("/live/3", "?comment=9", "#top").redirect).toBe("/g/altherren/live/3?comment=9#top");
  });

  it("leaves a URL that already names a group alone", () => {
    expect(resolveEntry("/g/altherren/live/3").redirect).toBeNull();
    expect(resolveEntry("/g/altherren").redirect).toBeNull();
  });

  it("takes another group's slug as the basename", () => {
    expect(resolveEntry("/g/other/x")).toEqual({ slug: "other", basename: "/g/other", redirect: null });
  });

  it("treats a /g with no group as /", () => {
    expect(resolveEntry("/g/").redirect).toBe("/g/altherren/");
  });
});

describe("the boot redirect", () => {
  it("rewrites / in place and remembers the cold-launch URL", async () => {
    const mod = await bootAt("/");
    expect(here()).toBe("/g/altherren/");
    expect(mod.ORIGINAL_ENTRY_PATH).toBe("/");
    expect(mod.APP_BASENAME).toBe("/g/altherren");
  });

  it("rewrites a legacy deep link, keeps history.state, and ORIGINAL_ENTRY_PATH is the pre-redirect value", async () => {
    const mod = await bootAt("/ideas?idea=1");
    expect(here()).toBe("/g/altherren/ideas?idea=1");
    expect(mod.ORIGINAL_ENTRY_PATH).toBe("/ideas?idea=1");
    expect(window.history.state).toEqual({ idx: 7 });
  });

  it("does not touch a group URL", async () => {
    const mod = await bootAt("/g/altherren/live/3?comment=9");
    expect(here()).toBe("/g/altherren/live/3?comment=9");
    expect(mod.ORIGINAL_ENTRY_PATH).toBe("/g/altherren/live/3?comment=9");
  });

  it("honours another group's slug", async () => {
    const mod = await bootAt("/g/other/stats");
    expect(mod.GROUP_SLUG).toBe("other");
    expect(mod.APP_BASENAME).toBe("/g/other");
    expect(here()).toBe("/g/other/stats");
  });
});

describe("toRouterPath / routerPathOf", () => {
  it("strips this group's prefix", async () => {
    const mod = await bootAt("/g/altherren/dashboard");
    expect(mod.toRouterPath("/g/altherren/live/3?comment=9")).toBe("/live/3?comment=9");
    expect(mod.toRouterPath("/g/altherren/ideas?idea=1")).toBe("/ideas?idea=1");
    expect(mod.toRouterPath("/g/altherren")).toBe("/");
    expect(mod.toRouterPath("/g/altherren?x=1")).toBe("/?x=1");
  });

  it("passes a path with no group through (an item cached before the batch)", async () => {
    const mod = await bootAt("/g/altherren/dashboard");
    expect(mod.toRouterPath("/profiles/3")).toBe("/profiles/3");
  });

  it("does a full navigation for another group and returns null", async () => {
    const mod = await bootAt("/g/altherren/dashboard");
    const assign = vi.fn();
    expect(mod.toRouterPath("/g/other/live/3", assign)).toBeNull();
    expect(assign).toHaveBeenCalledWith("/g/other/live/3");
    // a slug that merely starts like ours is another group, not ours
    expect(mod.toRouterPath("/g/altherrenx/live/3", assign)).toBeNull();
    // the pure half never navigates
    assign.mockClear();
    expect(mod.routerPathOf("/g/other/live/3")).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("toAbsolutePath is the inverse", async () => {
    const mod = await bootAt("/g/altherren/dashboard");
    expect(mod.toAbsolutePath("/live/3")).toBe("/g/altherren/live/3");
    expect(mod.toRouterPath(mod.toAbsolutePath("/live/3?comment=9"))).toBe("/live/3?comment=9");
  });
});

describe("a backend path in the badge legend", () => {
  it("links router-relative, so the router's basename is not added twice", async () => {
    await bootAt("/g/altherren/profiles/1");
    const { default: RecordBadges } = await import("../pages/profile/RecordBadges");
    const record = {
      key: "most_titles",
      group: "title",
      label: "Most tournament wins",
      explainer: "Tournaments won.",
      path: "/g/altherren/stats?view=overview&sub=records&record=most_titles",
      value: 5,
      holders: [{ player: { id: 1, display_name: "Roli" }, value: 5, ongoing: false }],
    } as unknown as StatsRecord;
    render(
      createElement(MemoryRouter, null, createElement(RecordBadges, { playerId: 1, records: [record] })),
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    const link = document.querySelector<HTMLAnchorElement>('[data-records-held] a');
    expect(link?.getAttribute("href")).toBe("/stats?view=overview&sub=records&record=most_titles");
  });
});
