import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetNavStack, saveScroll, scrollFor } from "../ui/shell/navStack";

const KEY = "lk:nav-scroll";

describe("navStack scroll offsets", () => {
  beforeEach(() => {
    resetNavStack();
  });

  afterEach(() => {
    resetNavStack();
  });

  it("returns an offset only for the entry it was saved on", () => {
    saveScroll(2, 640, "/live/19");
    expect(scrollFor(2, "/live/19")).toBe(640);
    expect(scrollFor(3, "/live/19")).toBeNull();
  });

  it("does not hand a pushed page the offset of the entry it replaced", () => {
    saveScroll(2, 640, "/live/19");
    expect(scrollFor(2, "/profiles/1")).toBeNull();
  });

  it("overwrites the offset of an index that is reused", () => {
    saveScroll(2, 640, "/live/19");
    saveScroll(2, 120, "/profiles/1");
    expect(scrollFor(2, "/profiles/1")).toBe(120);
    expect(scrollFor(2, "/live/19")).toBeNull();
  });

  it("rounds and clamps what it stores", () => {
    saveScroll(0, 41.6, "/stats");
    expect(scrollFor(0, "/stats")).toBe(42);
    saveScroll(1, -20, "/stats");
    expect(scrollFor(1, "/stats")).toBe(0);
  });

  it("ignores nonsensical input instead of storing it", () => {
    saveScroll(Number.NaN, 10, "/stats");
    saveScroll(-1, 10, "/stats");
    saveScroll(0, Number.NaN, "/stats");
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("drops entries far below the current index", () => {
    saveScroll(1, 100, "/stats");
    saveScroll(80, 200, "/players");
    expect(scrollFor(80, "/players")).toBe(200);
    expect(scrollFor(1, "/stats")).toBeNull();
  });

  it("survives corrupted storage", () => {
    sessionStorage.setItem(KEY, "{not json");
    expect(scrollFor(0, "/stats")).toBeNull();
    saveScroll(0, 55, "/stats");
    expect(scrollFor(0, "/stats")).toBe(55);
  });

  it("ignores entries of the wrong shape", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ 0: { p: "/stats" }, 1: 12, 2: { p: "/x", y: "nope" } }));
    expect(scrollFor(0, "/stats")).toBeNull();
    expect(scrollFor(1, "/stats")).toBeNull();
    expect(scrollFor(2, "/x")).toBeNull();
  });

  it("is cleared by the test seam", () => {
    saveScroll(0, 300, "/stats");
    resetNavStack();
    expect(scrollFor(0, "/stats")).toBeNull();
  });
});
