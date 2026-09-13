import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

import { restoreWindowScroll } from "../ui/scroll";

/** Stands in for the document: the browser clamps a scroll to what fits. */
let maxScroll = 10_000;
let scrollY = 0;
let cancel: (() => void) | null = null;

const scrollToMock = vi.fn((arg: number | ScrollToOptions) => {
  const top = Math.round(typeof arg === "number" ? arg : (arg.top ?? 0));
  scrollY = Math.max(0, Math.min(maxScroll, top));
});

beforeEach(() => {
  maxScroll = 10_000;
  scrollY = 0;
  scrollToMock.mockClear();
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  window.scrollTo = scrollToMock as unknown as typeof window.scrollTo;
});

afterEach(() => {
  cancel?.();
  cancel = null;
});

describe("restoreWindowScroll", () => {
  it("reaches the offset once the content is there", async () => {
    maxScroll = 0; // page still a skeleton
    cancel = restoreWindowScroll(500);
    await waitFor(() => expect(scrollToMock).toHaveBeenCalled());
    expect(scrollY).toBe(0);

    maxScroll = 2000; // content arrives
    await waitFor(() => expect(scrollY).toBe(500));
  });

  it("never scrolls when it is already at the offset", async () => {
    scrollY = 500;
    cancel = restoreWindowScroll(500);
    await new Promise((r) => setTimeout(r, 120));
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("reports the offset it applied", async () => {
    const applied = vi.fn();
    cancel = restoreWindowScroll(300, applied);
    await waitFor(() => expect(applied).toHaveBeenCalledWith(300));
    expect(scrollY).toBe(300);
  });

  it("stops chasing as soon as the user scrolls", async () => {
    maxScroll = 0;
    cancel = restoreWindowScroll(500);
    await waitFor(() => expect(scrollToMock).toHaveBeenCalled());
    window.dispatchEvent(new Event("wheel"));

    maxScroll = 2000;
    await new Promise((r) => setTimeout(r, 300));
    expect(scrollY).toBe(0);
  });

  it("stops when cancelled", async () => {
    maxScroll = 0;
    cancel = restoreWindowScroll(500);
    await waitFor(() => expect(scrollToMock).toHaveBeenCalled());
    cancel();
    cancel = null;

    maxScroll = 2000;
    await new Promise((r) => setTimeout(r, 300));
    expect(scrollY).toBe(0);
  });
});
