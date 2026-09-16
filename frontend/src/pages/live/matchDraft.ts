/**
 * The match editor's draft, as pure functions (A2).
 *
 * Two editors on one match is normal here: results get entered from different
 * phones during a tournament night. So the form does not hold a copy of the
 * match — it holds only the fields THIS editor changed (`MatchEdits`), each
 * together with the value it started from (`base`):
 *
 * - an untouched field simply renders the server's current value, so a realtime
 *   update lands in the form without ever re-seeding under someone's hands,
 * - a touched field keeps this editor's value until they save or drop it,
 * - a touched field whose server value moved away from `base` is a *conflict*:
 *   shown, never resolved silently,
 * - a save sends only the touched fields, so it cannot revert a field somebody
 *   else edited in the meantime.
 */
import type { Match } from "../../api/types";
import { sideBy } from "../../helpers";

export type MatchDraft = {
  state: Match["state"];
  aGoals: number;
  bGoals: number;
  aClub: number | null;
  bClub: number | null;
};

/** Field order = the order the conflict banner lists them in. */
export const MATCH_DRAFT_FIELDS = ["state", "aGoals", "bGoals", "aClub", "bClub"] as const;
export type MatchDraftField = (typeof MATCH_DRAFT_FIELDS)[number];

/** This editor's pending changes: the value they set, and the one they started from. */
export type MatchEdits = {
  [K in MatchDraftField]?: { mine: MatchDraft[K]; base: MatchDraft[K] };
};

export type MatchPatchFields = {
  state?: Match["state"];
  sideA?: { club_id?: number | null; goals?: number };
  sideB?: { club_id?: number | null; goals?: number };
};

/** The server's values for a match, in draft shape. */
export function draftFromMatch(match: Match): MatchDraft {
  const a = sideBy(match, "A");
  const b = sideBy(match, "B");
  return {
    state: match.state,
    aGoals: Math.max(0, Number(a?.goals ?? 0)),
    bGoals: Math.max(0, Number(b?.goals ?? 0)),
    aClub: a?.club_id ?? null,
    bClub: b?.club_id ?? null,
  };
}

export function sameDraft(a: MatchDraft | null, b: MatchDraft | null): boolean {
  if (!a || !b) return false;
  return MATCH_DRAFT_FIELDS.every((f) => a[f] === b[f]);
}

/** What the controls show: this editor's value where they set one, the server's elsewhere. */
export function draftWithEdits(server: MatchDraft, edits: MatchEdits): MatchDraft {
  return {
    state: edits.state ? edits.state.mine : server.state,
    aGoals: edits.aGoals ? edits.aGoals.mine : server.aGoals,
    bGoals: edits.bGoals ? edits.bGoals.mine : server.bGoals,
    aClub: edits.aClub ? edits.aClub.mine : server.aClub,
    bClub: edits.bClub ? edits.bClub.mine : server.bClub,
  };
}

/**
 * Record one change. Setting a field back to the value it started from drops the
 * override, so the field follows the server again.
 */
export function withEdit<K extends MatchDraftField>(
  edits: MatchEdits,
  server: MatchDraft,
  field: K,
  value: MatchDraft[K],
): MatchEdits {
  const prev = edits[field];
  // `??` would be wrong here: `null` is a real base value (a side with no club).
  const base: MatchDraft[K] = prev ? prev.base : server[field];
  const next: MatchEdits = { ...edits };
  if (value === base) {
    delete next[field];
    return next;
  }
  // TS cannot narrow a generic key of a mapped type; the pair is field-correct by construction.
  (next as Record<MatchDraftField, { mine: unknown; base: unknown }>)[field] = { mine: value, base };
  return next;
}

/** Fields this editor changed. */
export function editedFields(edits: MatchEdits): MatchDraftField[] {
  return MATCH_DRAFT_FIELDS.filter((f) => edits[f] !== undefined);
}

/** Fields somebody else moved after this editor had started changing them. */
export function conflictFields(edits: MatchEdits, server: MatchDraft): MatchDraftField[] {
  return MATCH_DRAFT_FIELDS.filter((f) => {
    const e = edits[f];
    return !!e && server[f] !== e.base && server[f] !== e.mine;
  });
}

/**
 * PATCH body holding only what this editor changed — `null` when nothing did.
 * The backend patches per field (`model_fields_set`), so an omitted field keeps
 * whatever value it has on the server.
 */
export function patchBodyForEdits(edits: MatchEdits): MatchPatchFields | null {
  if (editedFields(edits).length === 0) return null;

  const body: MatchPatchFields = {};
  if (edits.state) body.state = edits.state.mine;

  const sideA: { club_id?: number | null; goals?: number } = {};
  if (edits.aClub) sideA.club_id = edits.aClub.mine;
  if (edits.aGoals) sideA.goals = edits.aGoals.mine;
  if (Object.keys(sideA).length > 0) body.sideA = sideA;

  const sideB: { club_id?: number | null; goals?: number } = {};
  if (edits.bClub) sideB.club_id = edits.bClub.mine;
  if (edits.bGoals) sideB.goals = edits.bGoals.mine;
  if (Object.keys(sideB).length > 0) body.sideB = sideB;

  return body;
}
