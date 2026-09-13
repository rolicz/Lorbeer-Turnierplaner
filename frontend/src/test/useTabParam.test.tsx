import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

import { useTabParam } from "../ui/shell/useTabParam";

type Tab = "overview" | "stats" | "guestbook";
const KEYS = ["overview", "stats", "guestbook"] as const satisfies readonly Tab[];

function Probe({ param }: { param?: string }) {
  const [tab, setTab] = useTabParam<Tab>(KEYS, "overview", param);
  const loc = useLocation();
  return (
    <div>
      <span data-testid="tab">{tab}</span>
      <span data-testid="search">{loc.search}</span>
      {KEYS.map((k) => (
        <button key={k} type="button" onClick={() => setTab(k)}>
          {k}
        </button>
      ))}
    </div>
  );
}

function renderAt(url: string, param?: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Probe param={param} />
    </MemoryRouter>,
  );
}

describe("useTabParam", () => {
  it("falls back when the param is missing", () => {
    const { getByTestId } = renderAt("/profiles/1");
    expect(getByTestId("tab")).toHaveTextContent("overview");
  });

  it("falls back when the param is unknown", () => {
    const { getByTestId } = renderAt("/profiles/1?tab=nope");
    expect(getByTestId("tab")).toHaveTextContent("overview");
  });

  it("reads a known param value", () => {
    const { getByTestId } = renderAt("/profiles/1?tab=guestbook");
    expect(getByTestId("tab")).toHaveTextContent("guestbook");
  });

  it("sets the param for a non-fallback tab", () => {
    const { getByTestId, getByRole } = renderAt("/profiles/1");
    fireEvent.click(getByRole("button", { name: "stats" }));
    expect(getByTestId("tab")).toHaveTextContent("stats");
    expect(getByTestId("search")).toHaveTextContent("?tab=stats");
  });

  it("deletes the param when the fallback tab is selected", () => {
    const { getByTestId, getByRole } = renderAt("/profiles/1?tab=stats");
    fireEvent.click(getByRole("button", { name: "overview" }));
    expect(getByTestId("tab")).toHaveTextContent("overview");
    expect(getByTestId("search").textContent).toBe("");
  });

  it("keeps unrelated params", () => {
    const { getByTestId, getByRole } = renderAt("/profiles/1?entry=7");
    fireEvent.click(getByRole("button", { name: "guestbook" }));
    const search = getByTestId("search").textContent ?? "";
    expect(search).toContain("entry=7");
    expect(search).toContain("tab=guestbook");
  });

  it("honours a custom param name", () => {
    const { getByTestId, getByRole } = renderAt("/stats?view=stats", "view");
    expect(getByTestId("tab")).toHaveTextContent("stats");
    fireEvent.click(getByRole("button", { name: "guestbook" }));
    expect(getByTestId("search")).toHaveTextContent("?view=guestbook");
  });
});
