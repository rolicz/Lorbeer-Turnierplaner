import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { qk } from "../api/queryKeys";

describe("queryKeys factory", () => {
  it("tournament keys are stable", () => {
    expect(qk.tournament(1)).toEqual(["tournament", 1]);
    expect(qk.tournaments()).toEqual(["tournaments"]);
    expect(qk.tournamentsLive()).toEqual(["tournaments", "live"]);
  });

  it("comment keys include the viewer", () => {
    expect(qk.commentsReadMap(7)).toEqual(["comments", "read-map", 7]);
    expect(qk.commentsReadMap(null)).toEqual(["comments", "read-map", "anon"]);
    expect(qk.commentsReadIds(5, 7)).toEqual(["comments", "read", 5, 7]);
  });

  it("player keys are structured correctly", () => {
    expect(qk.players()).toEqual(["players"]);
    expect(qk.playerProfile(3)).toEqual(["players", "profile", 3]);
    expect(qk.playerGuestbook(3)).toEqual(["players", "guestbook", 3]);
    expect(qk.playerPokesSummary()).toEqual(["players", "pokes", "summary"]);
  });

  // G4: the guestbook rows carry per-caller answers (`can_edit`, `my_vote`), so the
  // viewer is part of the key — while the bare prefix must still reach every one of them,
  // because that is what every mutation and `resyncPlayer` invalidate.
  it("guestbook list key includes the viewer, and the prefix still matches it", async () => {
    expect(qk.playerGuestbookFull(3, 7)).toEqual(["players", "guestbook", 3, 7]);
    expect(qk.playerGuestbookFull(3, null)).toEqual(["players", "guestbook", 3, "anon"]);

    const qc = new QueryClient();
    qc.setQueryData(qk.playerGuestbookFull(3, 7), []);
    await qc.invalidateQueries({ queryKey: qk.playerGuestbook(3) });
    expect(qc.getQueryState(qk.playerGuestbookFull(3, 7))?.isInvalidated).toBe(true);
  });

  it("stats keys include parameters", () => {
    expect(qk.stats.players()).toEqual(["stats", "players"]);
    expect(qk.stats.players("1v1", 10)).toEqual(["stats", "players", "1v1", 10]);
    expect(qk.stats.ratings()).toEqual(["stats", "ratings"]);
    expect(qk.stats.ratings("2v2", "both")).toEqual(["stats", "ratings", "2v2", "both"]);
  });

  it("cup keys work", () => {
    expect(qk.cupDefs()).toEqual(["cup", "defs"]);
    expect(qk.cup("default")).toEqual(["cup", "default"]);
    expect(qk.cupAll()).toEqual(["cup"]);
  });

  // A10: the friendlies rows carry per-caller capability flags, so the viewer is part of
  // the key — while the bare prefix must still reach every one of them.
  it("friendlies list key includes the viewer, and the prefix still matches it", async () => {
    expect(qk.friendliesList("all", 7)).toEqual(["friendlies", "all", 7]);
    expect(qk.friendliesList("1v1", null)).toEqual(["friendlies", "1v1", "anon"]);

    const qc = new QueryClient();
    qc.setQueryData(qk.friendliesList("all", 7), []);
    await qc.invalidateQueries({ queryKey: qk.friendlies() });
    expect(qc.getQueryState(qk.friendliesList("all", 7))?.isInvalidated).toBe(true);
  });

  // L4 pre-declares the keys L6, L7 and L9 read, so those tasks never touch the factory.
  it("auth and admin keys sit under their own prefixes", () => {
    expect(qk.auth.sessions()).toEqual(["auth", "sessions"]);
    expect(qk.auth.passkeys()).toEqual(["auth", "passkeys"]);
    expect(qk.admin.accounts()).toEqual(["admin", "accounts"]);
    expect(qk.admin.sessions(4)).toEqual(["admin", "sessions", 4]);
    expect(qk.admin.invites()).toEqual(["admin", "invites"]);
  });

  it("clubs key is optional-game", () => {
    expect(qk.clubs()).toEqual(["clubs"]);
    expect(qk.clubs("fc25")).toEqual(["clubs", "fc25"]);
  });

  // A3: prefix matching runs one way only. Invalidating the *filtered* key would
  // leave Stats, profiles and the friendlies list on their stale club names.
  it("invalidating qk.clubs() reaches the filtered and the unfiltered query", async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.clubs(), [{ id: 1 }]);
    qc.setQueryData(qk.clubs("EA FC 26"), [{ id: 1 }]);

    await qc.invalidateQueries({ queryKey: qk.clubs() });
    expect(qc.getQueryState(qk.clubs())?.isInvalidated).toBe(true);
    expect(qc.getQueryState(qk.clubs("EA FC 26"))?.isInvalidated).toBe(true);

    // the other direction does not hold — which is exactly what A3 fixed
    const qc2 = new QueryClient();
    qc2.setQueryData(qk.clubs(), [{ id: 1 }]);
    qc2.setQueryData(qk.clubs("EA FC 26"), [{ id: 1 }]);
    await qc2.invalidateQueries({ queryKey: qk.clubs("EA FC 26") });
    expect(qc2.getQueryState(qk.clubs())?.isInvalidated).toBe(false);
    expect(qc2.getQueryState(qk.clubs("EA FC 26"))?.isInvalidated).toBe(true);
  });
});
