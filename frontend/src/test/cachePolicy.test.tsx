/**
 * Q9 — behaviour, not configuration.
 *
 * Every test here drives the *real* client (`createAppQueryClient`) through a real
 * mount / leave / wait / return, and asserts what Roli would see: whether the screen
 * comes back with its content or with a loader, and whether it asked the server again.
 * Asserting the numbers themselves would prove nothing — the numbers are only right if
 * the behaviour is.
 */
import { act, render, screen } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppQueryClient } from "../api/cachePolicy";
import { qk } from "../api/queryKeys";
import { applyTournamentsChanged } from "../hooks/realtime/applyEvent";

const MINUTE = 60_000;

/** A screen: renders its data, or the loader that means "we have nothing". */
function Screen({ queryKey, fetcher }: { queryKey: readonly unknown[]; fetcher: () => Promise<string> }) {
  const q = useQuery({ queryKey: queryKey as unknown[], queryFn: fetcher });
  if (q.isLoading) return <div>LOADING</div>;
  return <div>{q.data}</div>;
}

/** Let the pending fetch resolve and React flush, on fake timers. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("coming back to a screen (Q9)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the tournament instantly after ten minutes away, and revalidates behind it", async () => {
    const qc = createAppQueryClient();
    let answer = "7. Bauernkranzturnier";
    const fetcher = vi.fn(() => Promise.resolve(answer));
    const view = (
      <QueryClientProvider client={qc}>
        <Screen queryKey={qk.tournament(19)} fetcher={fetcher} />
      </QueryClientProvider>
    );

    const first = render(view);
    await settle();
    expect(screen.getByText("7. Bauernkranzturnier")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Leave the page: the tournament channel closes with it and the query loses its
    // last observer. Ten minutes pass — twice the old gcTime.
    first.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
    });

    // …and back. Somebody corrected the name while we were away.
    answer = "7. Bauernkranzturnier (korrigiert)";
    render(view);
    // The very first frame, before anything can have come back from the server:
    expect(screen.queryByText("LOADING")).toBeNull();
    expect(screen.getByText("7. Bauernkranzturnier")).toBeTruthy();

    // A page-scoped channel cannot have told us anything while we were away, so the
    // return revalidates — and the correction lands behind the cached render.
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByText("7. Bauernkranzturnier (korrigiert)")).toBeTruthy();
  });

  it("under the old five-minute default the same return is a loader", async () => {
    // The control: the only thing changed is how long the entry is kept.
    const qc = createAppQueryClient();
    qc.setQueryDefaults(qk.tournament(19), { gcTime: 5 * MINUTE });
    const fetcher = vi.fn(() => Promise.resolve("7. Bauernkranzturnier"));
    const view = (
      <QueryClientProvider client={qc}>
        <Screen queryKey={qk.tournament(19)} fetcher={fetcher} />
      </QueryClientProvider>
    );

    const first = render(view);
    await settle();
    first.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * MINUTE);
    });

    render(view);
    expect(screen.queryByText("LOADING")).toBeTruthy();
  });

  it("a screen with no channel refreshes on every return (ideas)", async () => {
    const qc = createAppQueryClient();
    let answer = "3 ideas";
    const fetcher = vi.fn(() => Promise.resolve(answer));
    const view = (
      <QueryClientProvider client={qc}>
        <Screen queryKey={qk.ideas(null)} fetcher={fetcher} />
      </QueryClientProvider>
    );

    const first = render(view);
    await settle();
    first.unmount();

    // Half a minute away — far inside the kept window, far outside the believed one.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    answer = "4 ideas";
    render(view);
    expect(screen.queryByText("LOADING")).toBeNull();
    expect(screen.getByText("3 ideas")).toBeTruthy();
    await settle();
    // R5 gave the board no channel, so nothing but this refetch could ever find the
    // fourth idea.
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByText("4 ideas")).toBeTruthy();
  });

  it("a screen the always-open channel covers does not re-ask (tournaments list)", async () => {
    const qc = createAppQueryClient();
    const fetcher = vi.fn(() => Promise.resolve("21 tournaments"));
    const view = (
      <QueryClientProvider client={qc}>
        <Screen queryKey={qk.tournaments()} fetcher={fetcher} />
      </QueryClientProvider>
    );

    const first = render(view);
    await settle();
    first.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    render(view);
    await settle();
    // `/ws/tournaments` is mounted app-wide for the whole session: a change to the list
    // cannot have happened quietly, so a minute later there is nothing to ask about.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText("21 tournaments")).toBeTruthy();
  });

  it("…and a push on that channel still reaches it inside the window", async () => {
    const qc = createAppQueryClient();
    let answer = "21 tournaments";
    const fetcher = vi.fn(() => Promise.resolve(answer));
    render(
      <QueryClientProvider client={qc}>
        <Screen queryKey={qk.tournaments()} fetcher={fetcher} />
      </QueryClientProvider>,
    );
    await settle();

    // Somebody on another phone creates one. The long window must not swallow this.
    answer = "22 tournaments";
    await act(async () => {
      applyTournamentsChanged(qc, { action: "created", tournament_id: 22 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByText("22 tournaments")).toBeTruthy();
  });
});

describe("a corrected result on a done tournament (Q9)", () => {
  it("refreshes the list, the cup and the stats", () => {
    const qc = createAppQueryClient();
    qc.setQueryData(qk.tournaments(), ["old list"]);
    qc.setQueryData(qk.cup("default"), { owner: "Flo" });
    qc.setQueryData(qk.stats.ratings("overall", "tournaments"), ["old ratings"]);

    applyTournamentsChanged(qc, { action: "result", tournament_id: 19, status: "done" });

    expect(qc.getQueryState(qk.tournaments())?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.cup("default"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.stats.ratings("overall", "tournaments"))?.isInvalidated).toBe(true);
  });

  it("a comment still leaves all three alone", () => {
    const qc = createAppQueryClient();
    qc.setQueryData(qk.tournaments(), ["list"]);
    qc.setQueryData(qk.cup("default"), { owner: "Flo" });

    applyTournamentsChanged(qc, { action: "comment", tournament_id: 19 });

    expect(qc.getQueryState(qk.tournaments())?.isInvalidated).toBe(false);
    expect(qc.getQueryState(qk.cup("default"))?.isInvalidated).toBe(false);
  });
});

describe("the policy table covers the key factory", () => {
  it("every qk namespace has a row, so a new query cannot land without a decision", () => {
    // Not a config assertion: this fails when somebody adds a `qk` namespace and the
    // channel-coverage map in AGENTS.md §6 stops describing the whole app.
    const keys: (readonly unknown[])[] = [];
    const walk = (node: unknown) => {
      if (typeof node === "function") {
        try {
          const key = (node as (...a: unknown[]) => readonly unknown[])(1, 1, "x", "x", "x", "x");
          if (Array.isArray(key) && key.length) keys.push(key);
        } catch {
          /* a factory that cannot be called with dummies contributes no key */
        }
        return;
      }
      if (node && typeof node === "object") for (const v of Object.values(node)) walk(v);
    };
    walk(qk);
    expect(keys.length).toBeGreaterThan(30);

    const qc = createAppQueryClient();
    for (const key of keys) {
      const defaults = qc.getQueryDefaults(key);
      expect(defaults.staleTime, `no cache policy row matches ${JSON.stringify(key)}`).toBeTypeOf("number");
    }
  });
});
