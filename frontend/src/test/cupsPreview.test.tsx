import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { CupDef, CupResponse } from "../api/cup.api";
import type { PlayerAvatarMeta } from "../api/playerAvatars.api";
import type { Player } from "../api/types";

// The preview talks to four endpoints (cup defs, one cup each, the roster for
// the player colours, avatar meta); stub them so it renders offline.
const api = vi.hoisted(() => ({
  listCupDefs: vi.fn<() => Promise<{ cups: CupDef[] }>>(),
  getCup: vi.fn<(key?: string | null) => Promise<CupResponse>>(),
  listPlayers: vi.fn<() => Promise<Player[]>>(),
  listPlayerAvatarMeta: vi.fn<() => Promise<PlayerAvatarMeta[]>>(),
  apiFetch: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("../api/cup.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/cup.api")>()),
  listCupDefs: api.listCupDefs,
  getCup: api.getCup,
}));
vi.mock("../api/players.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/players.api")>()),
  listPlayers: api.listPlayers,
}));
vi.mock("../api/playerAvatars.api", () => ({
  listPlayerAvatarMeta: api.listPlayerAvatarMeta,
  playerAvatarUrl: (id: number) => `/players/${id}/avatar`,
}));
vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  apiFetch: api.apiFetch,
}));

import CupsPreviewCard from "../pages/dashboard/CupsPreviewCard";
import DashboardPage from "../pages/dashboard/DashboardPage";
import { CupReignTimeline } from "../pages/stats/cupParts";
import { buildReigns } from "../pages/stats/cupReigns";
import { rememberLocation, resetForgottenPaths, resolveDestination } from "../ui/shell/lastLocation";
import { NAV_DESTS } from "../ui/shell/navConfig";

const BERNI = { id: 4, display_name: "Berni" };
const ATZI = { id: 5, display_name: "Atzi" };
const RUMPI = { id: 3, display_name: "Rumpi" };
const NOBODY = { id: 0, display_name: "—" };

const DEFS: CupDef[] = [
  { key: "default", name: "Lorbeerkranz", since_date: null, eras: [{ since: "2026-07-11", mode: "2v2" }] },
  { key: "bauernkranz", name: "Bauernkranz", since_date: "2026-01-05", eras: [{ since: "2026-07-11", mode: "1v1" }] },
];

/** Berni claims it, Atzi takes it after Berni held 1, Rumpi holds it now (2 so far). */
const BAUERNKRANZ: CupResponse = {
  cup: DEFS[1],
  owner: RUMPI,
  streak: { tournaments_participated: 2, since: { tournament_id: 14, tournament_name: "4. Bauernkranzturnier", date: "2026-04-23" } },
  history: [
    { tournament_id: 7, tournament_name: "Wundleckturnier", date: "2026-01-18", from: NOBODY, to: BERNI, streak_duration: 0 },
    { tournament_id: 11, tournament_name: "2. Bauernkranzturnier", date: "2026-03-27", from: BERNI, to: ATZI, streak_duration: 1 },
    { tournament_id: 14, tournament_name: "4. Bauernkranzturnier", date: "2026-04-23", from: ATZI, to: RUMPI, streak_duration: 3 },
  ],
};

const LORBEERKRANZ: CupResponse = {
  cup: DEFS[0],
  owner: BERNI,
  streak: { tournaments_participated: 1, since: { tournament_id: 20, tournament_name: "4. Lorbeerkranzturnier", date: "2026-07-11" } },
  history: [{ tournament_id: 20, tournament_name: "4. Lorbeerkranzturnier", date: "2026-07-11", from: NOBODY, to: BERNI, streak_duration: 0 }],
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPreview() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client()}>
        <CupsPreviewCard />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** The two cup blocks, once both cups' data has arrived (the block link is the marker). */
async function cupBlocks(container: HTMLElement): Promise<HTMLElement[]> {
  await waitFor(() => {
    const blocks = container.querySelectorAll<HTMLElement>("[data-cup]");
    expect(blocks.length).toBe(2);
    for (const block of blocks) expect(block.querySelector("a[aria-label]")).toBeTruthy();
  });
  return [...container.querySelectorAll<HTMLElement>("[data-cup]")];
}

describe("CupsPreviewCard", () => {
  beforeEach(() => {
    api.listCupDefs.mockReset().mockResolvedValue({ cups: DEFS });
    api.getCup.mockReset().mockImplementation((key) => Promise.resolve(key === "bauernkranz" ? BAUERNKRANZ : LORBEERKRANZ));
    api.listPlayers.mockReset().mockResolvedValue([]);
    api.listPlayerAvatarMeta.mockReset().mockResolvedValue([]);
  });

  it("shows every cup with its holder, since-date and running reign", async () => {
    const { container } = renderPreview();
    const [bk, lk] = await cupBlocks(container);

    // The named cup comes first, `default` last (the Cups page's order).
    expect([bk.dataset.cup, lk.dataset.cup]).toEqual(["bauernkranz", "default"]);

    // Rumpi has held it for two tournaments = one defended; Berni just won.
    expect(within(bk).getByRole("link", { name: /Rumpi/ }).getAttribute("href")).toBe("/profiles/3");
    expect(within(bk).getByText(/^Holding since 23\/04\/2026 · 1 defended$/)).toBeTruthy();
    expect(within(bk).getByTitle("2 tournaments held").textContent).toBe("×2");

    expect(within(lk).getByRole("link", { name: /Berni/ }).getAttribute("href")).toBe("/profiles/4");
    expect(within(lk).getByText(/^Holding since 11\/07\/2026$/)).toBeTruthy();
    expect(within(lk).getByTitle("1 tournaments held").textContent).toBe("×1");
  });

  it("renders each cup's reign timeline and names the holders under it", async () => {
    const { container } = renderPreview();
    const [bk, lk] = await cupBlocks(container);

    // Bauernkranz: three reigns (1 · 3 · 2 tournaments); Lorbeerkranz: one.
    const bar = (block: HTMLElement) => block.querySelector("[data-reign-timeline]") as HTMLElement;
    expect([...bar(bk).children].map((c) => (c as HTMLElement).style.flexGrow)).toEqual(["1", "3", "2"]);
    expect(bar(lk).children.length).toBe(1);
    // The legend names every holder of that cup, the current one included.
    expect(within(bk).getAllByText("Berni").length).toBe(1);
    expect(within(bk).getAllByText("Atzi").length).toBe(1);
    expect(within(bk).getAllByText("Rumpi").length).toBe(2); // holder line + legend
  });

  it("opens the Cups page at that cup, from the header and from the block", async () => {
    const { container } = renderPreview();
    const [bk, lk] = await cupBlocks(container);

    const header = within(bk).getByTitle("Open Bauernkranz in Stats — reigns, records and per-player totals");
    const block = within(bk).getByRole("link", { name: "Bauernkranz — open reigns and records in Stats" });
    for (const link of [header, block]) {
      expect(link.getAttribute("href")).toBe("/stats?view=overview&sub=cups&cup=bauernkranz");
    }
    expect(
      within(lk).getByRole("link", { name: "Lorbeerkranz — open reigns and records in Stats" }).getAttribute("href"),
    ).toBe("/stats?view=overview&sub=cups&cup=default");
  });

  it("keeps the holder a profile link without nesting it in the block link", async () => {
    const { container } = renderPreview();
    await cupBlocks(container);

    expect(container.querySelectorAll("a a").length).toBe(0);
  });

  it("says so when a cup has no owner yet", async () => {
    api.getCup.mockImplementation((key) =>
      Promise.resolve(
        key === "bauernkranz"
          ? { ...BAUERNKRANZ, owner: null, streak: { tournaments_participated: 0, since: { tournament_id: null, tournament_name: null, date: null } }, history: [] }
          : LORBEERKRANZ,
      ),
    );
    const { container } = renderPreview();
    const [bk] = await cupBlocks(container);

    expect(within(bk).getByText("No owner yet")).toBeTruthy();
    expect(within(bk).getByText("No title changes yet.")).toBeTruthy();
  });
});

describe("CupReignTimeline", () => {
  const reigns = buildReigns(BAUERNKRANZ);

  function renderTimeline(onSelect?: (r: (typeof reigns)[number], i: number) => void) {
    return render(
      <QueryClientProvider client={client()}>
        <CupReignTimeline reigns={reigns} onSelect={onSelect} />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    api.listPlayers.mockReset().mockResolvedValue([]);
  });

  it("is a decorative bar when nothing can be selected", () => {
    const { container } = renderTimeline();
    const bar = container.querySelector("[data-reign-timeline]") as HTMLElement;

    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll("button").length).toBe(0);
    // One segment per reign, sized by the tournaments it was held.
    expect([...bar.children].map((c) => (c as HTMLElement).style.flexGrow)).toEqual(["1", "3", "2"]);
  });

  it("makes every segment a button that reports its chronological index", () => {
    const onSelect = vi.fn();
    const { container } = renderTimeline(onSelect);
    const bar = container.querySelector("[data-reign-timeline]") as HTMLElement;

    expect(bar.getAttribute("aria-hidden")).toBeNull();
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(3);
    fireEvent.click(buttons[2]);
    expect(onSelect).toHaveBeenCalledWith(reigns[2], 2);
  });
});

function Probe() {
  const loc = useLocation();
  return <span data-testid="url">{loc.pathname + loc.search}</span>;
}

function renderDashboardAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={client()}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/stats" element={<Probe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("the dashboard's retired Cups tab", () => {
  beforeEach(() => {
    localStorage.clear();
    resetForgottenPaths();
    api.apiFetch.mockReset().mockResolvedValue(null);
    api.listCupDefs.mockReset().mockResolvedValue({ cups: DEFS });
    api.getCup.mockReset().mockResolvedValue(LORBEERKRANZ);
    api.listPlayers.mockReset().mockResolvedValue([]);
    api.listPlayerAvatarMeta.mockReset().mockResolvedValue([]);
  });

  it("sends ?tab=cups to the Cups sub-view in Stats", async () => {
    renderDashboardAt("/dashboard?tab=cups");
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/stats?view=overview&sub=cups"));
  });

  it("does not trap the Dashboard tab with a remembered ?tab=cups", async () => {
    const dashboard = NAV_DESTS.find((d) => d.key === "dashboard")!;
    rememberLocation("/dashboard", "?tab=cups");
    expect(resolveDestination(dashboard, "/stats")).toBe("/dashboard?tab=cups");

    renderDashboardAt("/dashboard?tab=cups");
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/stats?view=overview&sub=cups"));

    // The memory is gone, so the next tap on Dashboard opens the dashboard.
    expect(resolveDestination(dashboard, "/stats")).toBe("/dashboard");
  });
});
