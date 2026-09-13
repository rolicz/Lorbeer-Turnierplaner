import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { qk } from "../api/queryKeys";

describe("queryKeys factory", () => {
  it("tournament keys are stable", () => {
    expect(qk.tournament(1)).toEqual(["tournament", 1]);
    expect(qk.tournaments()).toEqual(["tournaments"]);
    expect(qk.tournamentsLive()).toEqual(["tournaments", "live"]);
  });

  it("comment keys include token", () => {
    expect(qk.commentsReadMap("tok")).toEqual(["comments", "read-map", "tok"]);
    expect(qk.commentsReadMap(null)).toEqual(["comments", "read-map", "none"]);
    expect(qk.commentsReadIds(5, "tok")).toEqual(["comments", "read", 5, "tok"]);
  });

  it("player keys are structured correctly", () => {
    expect(qk.players()).toEqual(["players"]);
    expect(qk.playerProfile(3)).toEqual(["players", "profile", 3]);
    expect(qk.playerGuestbook(3)).toEqual(["players", "guestbook", 3]);
    expect(qk.playerPokesSummary()).toEqual(["players", "pokes", "summary"]);
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
