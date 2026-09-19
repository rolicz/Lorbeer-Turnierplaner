/**
 * G4 — the guestbook feed is a public read that carries per-caller answers.
 *
 * `GET /players/{id}/guestbook` computes `can_edit` (`guestbook_can_edit`: the author
 * inside the hour, or an admin) and `my_vote` from the bearer token. The app asked for it
 * without one, so the server answered for an anonymous caller and every row came back
 * `can_edit: false`, `my_vote: 0` — which is why the edit pencil had never rendered in the
 * app for anybody, author or admin, while the API was right all along.
 *
 * Sending the token is only half of it: the key has to name who asked, or the logged-out
 * payload already in the cache is handed to the account that just logged in and the flags
 * are wrong again, one step later. These tests drive the real hook against the real
 * `createAppQueryClient` and one shared cache, because that is the only way the second
 * half can fail.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppQueryClient } from "../api/cachePolicy";
import { qk } from "../api/queryKeys";
import type { PlayerGuestbookEntry, Role } from "../api/types";
import { useProfileGuestbook } from "../pages/profile/useProfileGuestbook";

const AUTHOR_ID = 2;

function row(over: Partial<PlayerGuestbookEntry> = {}): PlayerGuestbookEntry {
  return {
    id: 11,
    profile_player_id: 1,
    author_player_id: AUTHOR_ID,
    author_display_name: "Berni",
    parent_entry_id: null,
    body: "nice header",
    created_at: "2026-09-19T10:00:00",
    updated_at: "2026-09-19T10:00:00",
    upvotes: 1,
    downvotes: 0,
    my_vote: 0,
    can_edit: false,
    subject: null,
    ...over,
  };
}

/** The server's answer, per caller — exactly what `list_guestbook_entries` varies. */
function guestbookFor(token: string | null): PlayerGuestbookEntry[] {
  if (token === "berni") return [row({ can_edit: true, my_vote: 1 })];
  if (token === "admin") return [row({ can_edit: true, my_vote: 0 })];
  return [row()];
}

const calls: { url: string; auth: string | null }[] = [];

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const auth = new Headers(init?.headers ?? {}).get("Authorization");
      calls.push({ url, auth });
      const body = url.includes("/guestbook/read")
        ? { entry_ids: [] }
        : url.includes("/guestbook")
          ? guestbookFor(auth ? auth.replace("Bearer ", "") : null)
          : {};
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    }),
  );
}

/** What the feed would draw: the entry's id, whether it offers Edit, and my vote. */
function Probe({ token, role }: { token: string | null; role: Role }) {
  const gb = useProfileGuestbook({
    targetPlayerId: 1,
    token,
    role,
    actorPlayerId: AUTHOR_ID,
    currentPlayerId: AUTHOR_ID,
    isOwnProfile: false,
    avatarUpdatedAtByPlayerId: new Map(),
  });
  const ctx = gb.sectionProps.cardContext;
  return (
    <div data-testid="probe">
      {gb.sectionProps.roots
        .map((entry) => `${entry.id}:${ctx.canEditEntry(entry) ? "edit" : "-"}:${entry.my_vote}`)
        .join("|")}
    </div>
  );
}

function mount(qc: QueryClient, token: string | null, role: Role) {
  return render(
    <QueryClientProvider client={qc}>
      <Probe token={token} role={role} />
    </QueryClientProvider>,
  );
}

function guestbookCalls() {
  return calls.filter((c) => c.url.includes("/players/1/guestbook") && !c.url.includes("/read"));
}

describe("the guestbook feed is read as whoever is looking at it (G4)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends no token for a logged-out reader, and offers no Edit", async () => {
    const qc = createAppQueryClient();
    mount(qc, null, "reader");

    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:-:0"));
    expect(guestbookCalls()).toHaveLength(1);
    expect(guestbookCalls()[0].auth).toBeNull();
  });

  it("sends the caller's token, so the author gets the Edit control the API grants", async () => {
    const qc = createAppQueryClient();
    mount(qc, "berni", "editor");

    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:edit:1"));
    expect(guestbookCalls()[0].auth).toBe("Bearer berni");
  });

  it("never hands the logged-out payload to the account that just logged in", async () => {
    // One cache, as in the app: the anonymous rows are still in it, fresh (the
    // ["players","guestbook"] row is 5 s), when the login lands. With the viewer out of
    // the key they would simply be re-rendered under the new identity, flags and all.
    const qc = createAppQueryClient();
    const out = mount(qc, null, "reader");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:-:0"));
    out.unmount();

    mount(qc, "berni", "editor");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:edit:1"));

    // Two entries, not one overwritten: the logged-out answer is still the logged-out one.
    expect(qc.getQueryData(qk.playerGuestbookFull(1, null))).toEqual([row()]);
    expect(guestbookCalls()).toHaveLength(2);
  });

  it("does not carry the previous account's flags into the next one", async () => {
    const qc = createAppQueryClient();
    const first = mount(qc, "berni", "editor");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:edit:1"));
    first.unmount();

    mount(qc, "admin", "admin");
    // Same `can_edit` (an admin may edit anyone's), but Berni's upvote is Berni's.
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:edit:0"));
  });

  it("hides Edit from an admin viewing as a reader, and the server still says can_edit", async () => {
    // "View as lower role" is a frontend-only convenience, so the token — and therefore
    // the flag — stays an admin's. The effective role gates it, exactly as
    // `isEditorOrAdmin && !!row.can_edit` does for a tournament and a friendly (A10).
    const qc = createAppQueryClient();
    mount(qc, "admin", "reader");

    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:-:0"));
    expect(qc.getQueryData<PlayerGuestbookEntry[]>(qk.playerGuestbookFull(1, "admin"))?.[0].can_edit).toBe(true);
  });

  it("is still reached by the prefix every mutation and the profile channel invalidate", async () => {
    // `resyncPlayer`, the four header mutations and every guestbook mutation invalidate
    // the short key. It has to keep matching, or a new message would never appear.
    const qc = createAppQueryClient();
    const out = mount(qc, "berni", "editor");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:edit:1"));
    out.unmount();

    await qc.invalidateQueries({ queryKey: qk.playerGuestbook(1) });
    expect(qc.getQueryState(qk.playerGuestbookFull(1, "berni"))?.isInvalidated).toBe(true);
  });
});
