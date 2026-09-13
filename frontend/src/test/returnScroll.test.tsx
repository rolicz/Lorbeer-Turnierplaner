import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { readReturnScroll, resetReturnScroll, saveReturnScroll, useReturnScroll } from "../ui/shell/useReturnScroll";
import { useTabParam } from "../ui/shell/useTabParam";

const KEY = "lk:return-scroll";

let scrollY = 0;
const scrollToMock = vi.fn((arg: number | ScrollToOptions) => {
  scrollY = Math.round(typeof arg === "number" ? arg : (arg.top ?? 0));
});

beforeEach(() => {
  resetReturnScroll();
  scrollY = 0;
  scrollToMock.mockClear();
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  window.scrollTo = scrollToMock as unknown as typeof window.scrollTo;
});

afterEach(() => {
  resetReturnScroll();
});

describe("return-scroll store", () => {
  it("remembers and reads back an offset", () => {
    saveReturnScroll("/stats:h2h:players", 820);
    expect(readReturnScroll("/stats:h2h:players")).toBe(820);
  });

  it("defaults to the current offset", () => {
    scrollY = 640;
    saveReturnScroll("/stats:h2h:players");
    expect(readReturnScroll("/stats:h2h:players")).toBe(640);
  });

  it("knows nothing about a view it has not seen", () => {
    expect(readReturnScroll("/stats:overview:cups")).toBeNull();
  });

  it("survives corrupted storage", () => {
    sessionStorage.setItem(KEY, "{not json");
    expect(readReturnScroll("/stats:h2h:players")).toBeNull();
    saveReturnScroll("/stats:h2h:players", 10);
    expect(readReturnScroll("/stats:h2h:players")).toBe(10);
  });

  it("drops the oldest views once it is full", () => {
    for (let i = 0; i < 62; i++) saveReturnScroll(`/view-${i}`, i + 1);
    expect(readReturnScroll("/view-0")).toBeNull();
    expect(readReturnScroll("/view-61")).toBe(62);
  });
});

function DrillIn() {
  const { save, restore, swap } = useReturnScroll();
  return (
    <div>
      <button type="button" onClick={() => save("list")}>save</button>
      <button type="button" onClick={() => restore("list")}>restore</button>
      <button type="button" onClick={() => swap("list", null)}>drill in</button>
      <button type="button" onClick={() => swap("list", "other")}>to other</button>
    </div>
  );
}

describe("useReturnScroll", () => {
  it("drilling in remembers the list and starts at the top", async () => {
    const { getByRole } = render(<DrillIn />);
    scrollY = 900;
    fireEvent.click(getByRole("button", { name: "drill in" }));
    expect(readReturnScroll("list")).toBe(900);
    await waitFor(() => expect(scrollY).toBe(0));
  });

  it("the way back lands on the remembered offset", async () => {
    const { getByRole } = render(<DrillIn />);
    scrollY = 900;
    fireEvent.click(getByRole("button", { name: "drill in" }));
    await waitFor(() => expect(scrollY).toBe(0));
    fireEvent.click(getByRole("button", { name: "restore" }));
    await waitFor(() => expect(scrollY).toBe(900));
  });

  it("a view that was never seen opens at the top", async () => {
    const { getByRole } = render(<DrillIn />);
    scrollY = 500;
    fireEvent.click(getByRole("button", { name: "to other" }));
    expect(readReturnScroll("list")).toBe(500);
    await waitFor(() => expect(scrollY).toBe(0));
  });

  it("does not scroll when it is already where it wants to be", async () => {
    const { getByRole } = render(<DrillIn />);
    saveReturnScroll("list", 0);
    fireEvent.click(getByRole("button", { name: "restore" }));
    await waitFor(() => expect(scrollToMock).not.toHaveBeenCalled());
  });
});

type Tab = "overview" | "matches";
const TABS = ["overview", "matches"] as const satisfies readonly Tab[];

function TabProbe() {
  const [tab, setTab] = useTabParam<Tab>(TABS, "overview");
  return (
    <div>
      <span data-testid="tab">{tab}</span>
      {TABS.map((k) => (
        <button key={k} type="button" onClick={() => setTab(k)}>{k}</button>
      ))}
    </div>
  );
}

describe("useTabParam scroll memory", () => {
  it("each tab keeps the offset it was left at", async () => {
    const { getByRole, getByTestId } = render(
      <MemoryRouter initialEntries={["/profiles/1?tab=matches"]}>
        <TabProbe />
      </MemoryRouter>,
    );
    expect(getByTestId("tab")).toHaveTextContent("matches");

    scrollY = 760;
    fireEvent.click(getByRole("button", { name: "overview" }));
    expect(readReturnScroll("/profiles/1?tab=matches")).toBe(760);
    await waitFor(() => expect(scrollY).toBe(0));

    fireEvent.click(getByRole("button", { name: "matches" }));
    await waitFor(() => expect(scrollY).toBe(760));
  });

  it("re-selecting the open tab changes nothing", () => {
    const { getByRole } = render(
      <MemoryRouter initialEntries={["/profiles/1?tab=matches"]}>
        <TabProbe />
      </MemoryRouter>,
    );
    scrollY = 300;
    fireEvent.click(getByRole("button", { name: "matches" }));
    expect(readReturnScroll("/profiles/1?tab=matches")).toBeNull();
    expect(scrollToMock).not.toHaveBeenCalled();
  });
});
