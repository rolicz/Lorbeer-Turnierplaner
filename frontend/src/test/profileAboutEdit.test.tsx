/**
 * Q-A — the owner's About block is the visitor's About block plus one button.
 *
 * What is pinned here is the thing Roli asked for ("about text on own profile should look
 * exactly like other profiles, with edit button beside comments label") and the two ways a
 * regression would take it back: an editor that is always open on your own profile, and a
 * way in that hides itself when there is nothing written yet — an owner with an empty bio
 * could then never write one, because the comments trigger is absent on an empty About by
 * design (there is nothing to pin).
 */
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../hooks/useCupHolders", () => ({
  useCupFirstClaims: () => ({ firstClaimTournamentByCupKey: new Map<string, number>() }),
}));

import ProfileOverviewTab from "../pages/profile/ProfileOverviewTab";

type Overrides = Partial<ComponentProps<typeof ProfileOverviewTab>>;

function renderTab(overrides: Overrides = {}) {
  const onBioChange = vi.fn();
  const onSaveBio = vi.fn<() => Promise<unknown>>(() => Promise.resolve());
  const onCommentOnAbout = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProfileOverviewTab
          canEdit={false}
          bioDraft="Plays left back."
          profileBio="Plays left back."
          onBioChange={onBioChange}
          onSaveBio={onSaveBio}
          savingBio={false}
          favorite={null}
          nemesis={null}
          statsH2HError={null}
          favoriteTeammates={[]}
          allMatchTournaments={[]}
          clubs={[]}
          tournamentPlacementById={new Map()}
          targetPlayerId={1}
          statsMatchesError={null}
          onViewAllMatches={() => {}}
          aboutCommentCount={0}
          canPostGuestbook={false}
          onCommentOnAbout={onCommentOnAbout}
          {...overrides}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, onBioChange, onSaveBio, onCommentOnAbout };
}

const editButton = () => document.querySelector<HTMLButtonElement>("[data-edit-about]");
const aboutTrigger = () => document.querySelector<HTMLElement>('[data-subject-trigger="about"]');
const textarea = () => document.querySelector("textarea");

describe("the About block on your own profile", () => {
  it("reads exactly as a visitor's does, with no editor in sight", () => {
    const { container } = renderTab({ canEdit: true });
    expect(textarea()).toBeNull();
    expect(container.textContent).toContain("Plays left back.");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("renders the same read view for the owner and for a visitor", () => {
    const owner = renderTab({ canEdit: true });
    const ownerText = owner.container.querySelector(".whitespace-pre-wrap")?.outerHTML;
    owner.unmount();
    const visitor = renderTab({ canEdit: false });
    expect(visitor.container.querySelector(".whitespace-pre-wrap")?.outerHTML).toBe(ownerText);
  });

  it("offers the way in even with nothing written yet", () => {
    renderTab({ canEdit: true, profileBio: null, bioDraft: "" });
    // The comments trigger is absent on an empty About (nothing to pin) — the edit action
    // must not follow it, or a new bio could never be written.
    expect(aboutTrigger()).toBeNull();
    expect(editButton()).not.toBeNull();
  });

  it("gives a visitor no way in", () => {
    renderTab({ canEdit: false, profileBio: null, bioDraft: "" });
    expect(editButton()).toBeNull();
  });

  it("is a matched pair with the comments trigger: same idiom, same height", () => {
    renderTab({ canEdit: true, canPostGuestbook: true, aboutCommentCount: 2 });
    const edit = editButton();
    const trigger = aboutTrigger();
    expect(edit).not.toBeNull();
    expect(trigger).not.toBeNull();
    for (const el of [edit!, trigger!]) {
      expect(el.tagName).toBe("BUTTON");
      expect(el.className).toContain("btn-ghost");
      expect(el.className).toContain("h-8");
      expect(el.className).toContain("text-xs");
    }
    // Both live in the section head's action slot, and the comments control keeps the corner.
    const slot = edit!.parentElement!;
    expect(slot.className).toContain("order-1");
    expect(slot).toBe(trigger!.parentElement);
    expect(slot.lastElementChild).toBe(trigger);
  });

  it("opens the editor from the saved text and hides its own trigger while open", () => {
    const { onBioChange } = renderTab({ canEdit: true, canPostGuestbook: true, bioDraft: "a half-typed draft" });
    fireEvent.click(editButton()!);
    expect(onBioChange).toHaveBeenCalledWith("Plays left back.");
    expect(textarea()).not.toBeNull();
    expect(editButton()).toBeNull();
    // The trigger is about the *saved* text, which has not moved: it stays.
    expect(aboutTrigger()).not.toBeNull();
  });

  it("leaves Save disabled until the draft differs, then closes the editor once it lands", async () => {
    const onSaveBio = vi.fn<() => Promise<unknown>>(() => Promise.resolve());
    const { rerender } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ProfileOverviewTab
            canEdit
            bioDraft="Plays left back."
            profileBio="Plays left back."
            onBioChange={() => {}}
            onSaveBio={onSaveBio}
            savingBio={false}
            favorite={null}
            nemesis={null}
            statsH2HError={null}
            favoriteTeammates={[]}
            allMatchTournaments={[]}
            clubs={[]}
            tournamentPlacementById={new Map()}
            targetPlayerId={1}
            statsMatchesError={null}
            onViewAllMatches={() => {}}
            aboutCommentCount={0}
            canPostGuestbook={false}
            onCommentOnAbout={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(editButton()!);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    const withDraft = (bio: string, saved: string) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ProfileOverviewTab
            canEdit
            bioDraft={bio}
            profileBio={saved}
            onBioChange={() => {}}
            onSaveBio={onSaveBio}
            savingBio={false}
            favorite={null}
            nemesis={null}
            statsH2HError={null}
            favoriteTeammates={[]}
            allMatchTournaments={[]}
            clubs={[]}
            tournamentPlacementById={new Map()}
            targetPlayerId={1}
            statsMatchesError={null}
            onViewAllMatches={() => {}}
            aboutCommentCount={0}
            canPostGuestbook={false}
            onCommentOnAbout={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    rerender(withDraft("Plays right back.", "Plays left back."));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(onSaveBio).toHaveBeenCalledTimes(1);

    // The parent's mutation resolves only once the profile query has caught up, so the read
    // view it returns to already shows the saved text.
    rerender(withDraft("Plays right back.", "Plays right back."));
    await waitFor(() => expect(textarea()).toBeNull());
    expect(screen.getByText("Plays right back.")).toBeTruthy();
    expect(editButton()).not.toBeNull();
  });

  it("discards the draft on Cancel and returns to the read view", () => {
    const { onBioChange, onSaveBio } = renderTab({ canEdit: true, bioDraft: "half a thought" });
    fireEvent.click(editButton()!);
    onBioChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onBioChange).toHaveBeenCalledWith("Plays left back.");
    expect(onSaveBio).not.toHaveBeenCalled();
    expect(textarea()).toBeNull();
    expect(editButton()).not.toBeNull();
  });

  it("keeps the editor open when the save fails", async () => {
    const onSaveBio = vi.fn<() => Promise<unknown>>(() => Promise.reject(new Error("nope")));
    renderTab({ canEdit: true, bioDraft: "Plays right back.", onSaveBio });
    fireEvent.click(editButton()!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaveBio).toHaveBeenCalledTimes(1));
    expect(textarea()).not.toBeNull();
  });

  it("nests no link inside a link", () => {
    const { container } = renderTab({ canEdit: true, canPostGuestbook: true, aboutCommentCount: 1 });
    expect(container.querySelectorAll("a a").length).toBe(0);
  });
});
