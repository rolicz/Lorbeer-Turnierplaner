/**
 * G4 — the guestbook feed carries per-caller answers, and the viewer is part of the key.
 *
 * `GET /players/{id}/guestbook` computes `can_edit` (`guestbook_can_edit`: the author
 * inside the hour, or an admin) and `my_vote` for whoever asks. The app once asked as
 * nobody, so every row came back `can_edit: false`, `my_vote: 0` — which is why the edit
 * pencil had never rendered for anybody, author or admin, while the API was right all
 * along. Since L4 the request carries nothing at all: the session is the cookie the
 * browser attaches by itself. What is left to get right is the *key* — it has to name
 * who asked, or the previous account's payload, still fresh in the cache, is handed to
 * the account that just logged in and the flags are wrong again, one step later. These
 * tests drive the real hook against the real `createAppQueryClient` and one shared cache,
 * because that is the only way the second half can fail.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppQueryClient } from "../api/cachePolicy";
import { qk } from "../api/queryKeys";
import type { PlayerGuestbookEntry, Role } from "../api/types";
import { useProfileGuestbook } from "../pages/profile/useProfileGuestbook";

const BERNI = 2;
const ADMIN = 9;

function row(over: Partial<PlayerGuestbookEntry> = {}): PlayerGuestbookEntry {
  return {
    id: 11,
    profile_player_id: 1,
    author_player_id: BERNI,
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

/**
 * Whose cookie the stubbed server sees. The app cannot read or send the cookie, so the
 * test plays the browser's jar: the answer depends on this, never on the request.
 */
let sessionOf: number | null = null;

/** The server's answer, per caller — exactly what `list_guestbook_entries` varies. */
function guestbookFor(viewer: number | null): PlayerGuestbookEntry[] {
  if (viewer === BERNI) return [row({ can_edit: true, my_vote: 1 })];
  if (viewer === ADMIN) return [row({ can_edit: true, my_vote: 0 })];
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
          ? guestbookFor(sessionOf)
          : {};
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    }),
  );
}

/** What the feed would draw: the entry's id, whether it offers Edit, and my vote. */
function Probe({ viewerId, role }: { viewerId: number | null; role: Role }) {
  const gb = useProfileGuestbook({
    targetPlayerId: 1,
    role,
    actorPlayerId: viewerId,
    currentPlayerId: viewerId,
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

function mount(qc: QueryClient, viewerId: number | null, role: Role) {
  sessionOf = viewerId;
  return render(
    <QueryClientProvider client={qc}>
      <Probe viewerId={viewerId} role={role} />
    </QueryClientProvider>,
  );
}

function guestbookCalls() {
  return calls.filter((c) => c.url.includes("/players/1/guestbook") && !c.url.includes("/read"));
}

describe("the guestbook feed is read as whoever is looking at it (G4, L4)", () => {
  beforeEach(() => {
    calls.length = 0;
    sessionOf = null;
    installFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads as nobody when there is no session, and offers no Edit", async () => {
    const qc = createAppQueryClient();
    mount(qc, null, "none");

    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:-:0"));
    expect(guestbookCalls()).toHaveLength(1);
  });

  it("gets the author the Edit control the API grants — and sends no credential of its own", async () => {
    const qc = createAppQueryClient();
    mount(qc, BERNI, "editor");

    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:edit:1"));
    // The cookie is the browser's; the app attaches nothing (L4: no token anywhere).
    expect(guestbookCalls()[0].auth).toBeNull();
  });

  it("never hands one identity's payload to the next", async () => {
    // One cache, as in the app: Berni's rows are still in it, fresh (the
    // ["players","guestbook"] row is 5 s), when the admin logs in on the same device.
    // With the viewer out of the key they would simply be re-rendered under the new
    // identity, flags and votes and all.
    const qc = createAppQueryClient();
    const out = mount(qc, BERNI, "editor");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:edit:1"));
    out.unmount();

    mount(qc, ADMIN, "admin");
    // Same `can_edit` (an admin may edit anyone's), but Berni's upvote is Berni's.
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:edit:0"));

    // Two entries, not one overwritten.
    expect(qc.getQueryData(qk.playerGuestbookFull(1, BERNI))).toEqual([row({ can_edit: true, my_vote: 1 })]);
    expect(qc.getQueryData(qk.playerGuestbookFull(1, ADMIN))).toEqual([row({ can_edit: true, my_vote: 0 })]);
    expect(guestbookCalls()).toHaveLength(2);
  });

  it("gates Edit on the effective role while the server still says can_edit", async () => {
    // "View as lower role" is a frontend-only convenience, so the session — and therefore
    // the flag — stays the account's. The effective role gates it, exactly as
    // `isEditorOrAdmin && !!row.can_edit` does for a tournament and a friendly (A10).
    const qc = createAppQueryClient();
    mount(qc, ADMIN, "none");

    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:-:0"));
    expect(qc.getQueryData<PlayerGuestbookEntry[]>(qk.playerGuestbookFull(1, ADMIN))?.[0].can_edit).toBe(true);
  });

  it("is still reached by the prefix every mutation and the profile channel invalidate", async () => {
    // `resyncPlayer`, the four header mutations and every guestbook mutation invalidate
    // the short key. It has to keep matching, or a new message would never appear.
    const qc = createAppQueryClient();
    const out = mount(qc, BERNI, "editor");
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("11:edit:1"));
    out.unmount();

    await qc.invalidateQueries({ queryKey: qk.playerGuestbook(1) });
    expect(qc.getQueryState(qk.playerGuestbookFull(1, BERNI))?.isInvalidated).toBe(true);
  });
});
