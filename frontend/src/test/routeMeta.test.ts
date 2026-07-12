import { describe, it, expect, afterEach } from "vitest";
import { routeMeta, historyCanPop } from "../ui/shell/routeMeta";

describe("routeMeta", () => {
  it("classifies a live match detail route", () => {
    expect(routeMeta("/live/abc/match/42")).toEqual({ isDetail: true, backTo: "/live/abc" });
    expect(routeMeta("/live/abc/match/42/")).toEqual({ isDetail: true, backTo: "/live/abc" });
  });

  it("classifies a live tournament route", () => {
    expect(routeMeta("/live/abc")).toEqual({ isDetail: true, backTo: "/tournaments" });
    expect(routeMeta("/live/abc/")).toEqual({ isDetail: true, backTo: "/tournaments" });
  });

  it("classifies a profile route", () => {
    expect(routeMeta("/profiles/7")).toEqual({ isDetail: true, backTo: "/players" });
  });

  it("classifies top-level routes as non-detail", () => {
    expect(routeMeta("/tournaments")).toEqual({ isDetail: false, backTo: null });
    expect(routeMeta("/dashboard")).toEqual({ isDetail: false, backTo: null });
    expect(routeMeta("/players")).toEqual({ isDetail: false, backTo: null });
  });
});

describe("historyCanPop", () => {
  const original = window.history.state as unknown;

  afterEach(() => {
    window.history.replaceState(original, "");
  });

  it("returns false when idx is 0", () => {
    window.history.replaceState({ idx: 0 }, "");
    expect(historyCanPop()).toBe(false);
  });

  it("returns true when idx is greater than 0", () => {
    window.history.replaceState({ idx: 2 }, "");
    expect(historyCanPop()).toBe(true);
  });

  it("returns false when state is missing", () => {
    window.history.replaceState(null, "");
    expect(historyCanPop()).toBe(false);
  });
});
