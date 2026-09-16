import { describe, it, expect } from "vitest";

import {
  conflictFields,
  draftFromMatch,
  draftWithEdits,
  editedFields,
  patchBodyForEdits,
  sameDraft,
  withEdit,
  type MatchDraft,
  type MatchEdits,
} from "../pages/live/matchDraft";
import type { Match } from "../api/types";

function match(state: Match["state"], ag: number, bg: number, ac: number | null, bc: number | null): Match {
  return {
    id: 7,
    tournament_id: 1,
    leg: 1,
    order_index: 0,
    state,
    started_at: null,
    finished_at: null,
    odds: null,
    sides: [
      { id: 1, side: "A", club_id: ac, goals: ag, players: [{ id: 1, display_name: "P1" }] },
      { id: 2, side: "B", club_id: bc, goals: bg, players: [{ id: 2, display_name: "P2" }] },
    ],
  };
}

const server = (over: Partial<MatchDraft> = {}): MatchDraft => ({
  state: "playing",
  aGoals: 1,
  bGoals: 0,
  aClub: null,
  bClub: null,
  ...over,
});

describe("matchDraft", () => {
  it("reads the server's values off a match", () => {
    expect(draftFromMatch(match("playing", 2, 1, 10, null))).toEqual({
      state: "playing",
      aGoals: 2,
      bGoals: 1,
      aClub: 10,
      bClub: null,
    });
  });

  it("shows the server's value for every field this editor has not touched", () => {
    const edits = withEdit({}, server(), "aGoals", 3);
    // the other editor moved the score AND the state
    const next = server({ aGoals: 9, bGoals: 4, state: "finished" });
    expect(draftWithEdits(next, edits)).toEqual({
      state: "finished", // followed
      aGoals: 3, // ours, kept
      bGoals: 4, // followed
      aClub: null,
      bClub: null,
    });
  });

  it("forgets an edit that is set back to where it started", () => {
    const base = server();
    let edits = withEdit({}, base, "aGoals", 3);
    expect(editedFields(edits)).toEqual(["aGoals"]);
    edits = withEdit(edits, base, "aGoals", 1);
    expect(editedFields(edits)).toEqual([]);
  });

  it("keeps the base of a club edit even when the base is null", () => {
    const base = server({ aClub: null });
    let edits = withEdit({}, base, "aClub", 5);
    // the other editor picked a club in the meantime; we change ours again
    edits = withEdit(edits, server({ aClub: 77 }), "aClub", 6);
    expect(edits.aClub).toEqual({ mine: 6, base: null });
    // our base is still "no club", so 77 is a conflict, not our own value
    expect(conflictFields(edits, server({ aClub: 77 }))).toEqual(["aClub"]);
  });

  it("flags a conflict only where both editors moved the same field differently", () => {
    const base = server();
    const edits = withEdit(withEdit({}, base, "aGoals", 3), base, "state", "finished");

    // nobody else touched anything
    expect(conflictFields(edits, base)).toEqual([]);
    // somebody else changed a field we never touched
    expect(conflictFields(edits, server({ bGoals: 5 }))).toEqual([]);
    // somebody else changed a field we are changing, to a different value
    expect(conflictFields(edits, server({ aGoals: 2 }))).toEqual(["aGoals"]);
    // …to the same value we chose: nothing to resolve
    expect(conflictFields(edits, server({ aGoals: 3 }))).toEqual([]);
    // both of our fields moved away under us
    expect(conflictFields(edits, server({ aGoals: 2, state: "scheduled" }))).toEqual([
      "state",
      "aGoals",
    ]);
  });

  it("patches only the fields this editor changed", () => {
    const base = server();
    const edits = withEdit(withEdit({}, base, "bGoals", 2), base, "aClub", 42);
    expect(patchBodyForEdits(edits)).toEqual({ sideA: { club_id: 42 }, sideB: { goals: 2 } });
  });

  it("sends nothing when nothing was changed", () => {
    expect(patchBodyForEdits({})).toBeNull();
    const edits: MatchEdits = withEdit({}, server(), "state", "finished");
    expect(patchBodyForEdits(edits)).toEqual({ state: "finished" });
  });

  it("compares two server snapshots field by field", () => {
    expect(sameDraft(server(), server())).toBe(true);
    expect(sameDraft(server(), server({ bClub: 3 }))).toBe(false);
    expect(sameDraft(null, server())).toBe(false);
  });
});
