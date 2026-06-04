import { describe, it, expect } from "vitest";
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
});
