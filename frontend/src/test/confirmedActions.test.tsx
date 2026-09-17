/**
 * C7 — every irreversible action asks first. Three representative sites, chosen
 * because they cover the three shapes the task introduces: a local `pendingX`
 * gate in front of a prop callback (AdminPanel's "Remove second leg"), the
 * one-dialog-for-the-whole-list exception (MatchList's "Swap sides"), and a
 * dialog that is skipped entirely when there is nothing to lose (the friendly
 * form's "Clear form", asked only when the form is dirty).
 *
 * Each case proves the same three things: the mutation/callback is not called
 * on the first tap, Cancel calls nothing, and the verb calls it exactly once.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

import type { Match } from "../api/types";

import AdminPanel from "../pages/live/AdminPanel";
import MatchList from "../pages/live/MatchList";

describe("C7 — Remove second leg (AdminPanel)", () => {
  function baseProps() {
    return {
      role: "editor" as const,
      status: "live" as const,
      mode: "2v2" as const,
      canEdit: true,
      canDelete: true,
      canSetDecider: true,
      secondLegEnabled: true,
      onEnableSecondLeg: vi.fn(),
      onDisableSecondLeg: vi.fn(),
      canDisableSecondLeg: true,
      secondLegMatchCount: 3,
      onReshuffle: vi.fn(),
      onDeleteTournament: vi.fn(),
      busy: false,
      error: null,
      wrap: false,
    };
  }

  it("asks before removing the second leg, and the verb fires the callback once", () => {
    const props = baseProps();
    render(<AdminPanel {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove second leg" }));

    // The first tap opens the dialog and calls nothing.
    expect(props.onDisableSecondLeg).not.toHaveBeenCalled();
    expect(screen.getByText("Remove the second leg?")).toBeInTheDocument();
    expect(screen.getByText(/3 scheduled leg-2 matches are deleted/)).toBeInTheDocument();

    // Cancel calls nothing and closes the dialog.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onDisableSecondLeg).not.toHaveBeenCalled();
    expect(screen.queryByText("Remove the second leg?")).not.toBeInTheDocument();

    // Re-open, and the verb calls the callback exactly once.
    fireEvent.click(screen.getByRole("button", { name: "Remove second leg" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Remove second leg" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(props.onDisableSecondLeg).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Remove the second leg?")).not.toBeInTheDocument();
  });
});

describe("C7 — Swap sides (MatchList, one dialog for the whole list)", () => {
  function makeMatch(): Match {
    return {
      id: 501,
      tournament_id: 9,
      leg: 1,
      order_index: 0,
      state: "scheduled",
      started_at: null,
      finished_at: null,
      odds: null,
      sides: [
        { id: 1, side: "A", club_id: null, goals: 0, players: [{ id: 1, display_name: "Roli" }] },
        { id: 2, side: "B", club_id: null, goals: 0, players: [{ id: 2, display_name: "Flo" }] },
      ],
    } as Match;
  }

  it("asks before swapping, and the verb fires onSwapSides once with the right match id", () => {
    const onSwapSides = vi.fn(() => Promise.resolve());
    render(
      <MatchList
        matches={[makeMatch()]}
        clubs={[]}
        canEdit={true}
        canReorder={true}
        busyReorder={false}
        onEditMatch={vi.fn()}
        onSwapSides={onSwapSides}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Swap sides"));

    // The first tap opens the dialog and calls nothing.
    expect(onSwapSides).not.toHaveBeenCalled();
    expect(screen.getByText("Swap sides A and B?")).toBeInTheDocument();

    // Cancel calls nothing and closes the dialog.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSwapSides).not.toHaveBeenCalled();
    expect(screen.queryByText("Swap sides A and B?")).not.toBeInTheDocument();

    // Re-open, and the verb calls onSwapSides exactly once, with this match's id.
    // Two elements now share the accessible name "Swap sides" — the row's icon
    // trigger (named by its `title`) and the dialog's own button, later in the DOM.
    fireEvent.click(screen.getByTitle("Swap sides"));
    const swapButtons = screen.getAllByRole("button", { name: "Swap sides" });
    fireEvent.click(swapButtons[swapButtons.length - 1]);
    expect(onSwapSides).toHaveBeenCalledTimes(1);
    expect(onSwapSides).toHaveBeenCalledWith(501);
    expect(screen.queryByText("Swap sides A and B?")).not.toBeInTheDocument();
  });
});

describe("C7 — Clear the friendly form, asked only when dirty", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("asks before clearing a dirty form, and an empty form clears directly", async () => {
    vi.doMock("../api/clubs.api", () => ({ listClubs: vi.fn(() => Promise.resolve([])) }));
    vi.doMock("../api/players.api", () => ({ listPlayers: vi.fn(() => Promise.resolve([])) }));
    vi.doMock("../api/friendlies.api", () => ({ createFriendlyMatch: vi.fn() }));
    vi.doMock("../api/stats.api", () => ({ getStatsOdds: vi.fn() }));
    vi.doMock("../api/playerAvatars.api", () => ({
      listPlayerAvatarMeta: vi.fn(() => Promise.resolve([])),
      playerAvatarUrl: (id: number) => `/players/${id}/avatar`,
    }));

    const { default: FriendlyMatchCard } = await import("../pages/tools/FriendlyMatchCard");
    const { AuthProvider } = await import("../auth/AuthProvider");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <FriendlyMatchCard />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText("Game")).toBeInTheDocument());

    // Untouched, default form: Clear acts directly, no dialog.
    fireEvent.click(screen.getByTitle("Clear"));
    expect(screen.queryByText("Clear the form?")).not.toBeInTheDocument();

    // "The game field edited" is one of the four dirty conditions on its own —
    // clearing it back out is the existing form's business, not this dialog's;
    // asking about it at all is what's under test here.
    const gameInput = screen.getByLabelText("Game");
    fireEvent.change(gameInput, { target: { value: "EA FC 24" } });
    fireEvent.click(screen.getByTitle("Clear"));
    expect(screen.getByText("Clear the form?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Clear the form?")).not.toBeInTheDocument();
    fireEvent.change(gameInput, { target: { value: "EA FC 26" } }); // back to clean

    // A goal away from 0 is the other dirty condition, and `clearAll` does reset
    // it — so this is where the verb's actual effect can be proven.
    const leftIncrement = screen.getAllByTitle("Increment score")[0];
    const leftStepper = leftIncrement.closest(".stepper") as HTMLElement;
    fireEvent.click(leftIncrement);
    expect(within(leftStepper).getByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Clear"));
    // The first tap asks and calls nothing — the goal is untouched until confirmed.
    expect(screen.getByText("Clear the form?")).toBeInTheDocument();
    expect(within(leftStepper).getByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Clear the form?")).not.toBeInTheDocument();
    expect(within(leftStepper).getByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Clear"));
    fireEvent.click(screen.getByRole("button", { name: "Clear form" }));
    expect(screen.queryByText("Clear the form?")).not.toBeInTheDocument();
    expect(within(leftStepper).getByText("0")).toBeInTheDocument();
  });
});
