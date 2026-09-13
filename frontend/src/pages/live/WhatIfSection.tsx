/**
 * The "What if" tab: one player's best case, shown as the matches that produce it.
 *
 * Two halves that stay in sync — the projected table (where the pick ends up) and every
 * match in playing order (how it gets there). A played match is a fact; every other match
 * is a three-way control, defaulted to the result the computation chose and marked as an
 * assumption, so the reader can play the rest of the tournament out by hand. The model,
 * including what "best case" means, lives in `bestCase.ts`.
 */
import { useMemo, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import type { Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { useAuth } from "../../auth/AuthContext";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import Button from "../../ui/primitives/Button";
import { Chip } from "../../ui/primitives/Chip";
import EmptyState from "../../ui/primitives/EmptyState";
import ScoreLine from "../../ui/primitives/ScoreLine";
import { PlayerPicker } from "../stats/PlayerPicker";
import {
  buildWhatIfRows,
  computeBestCase,
  projectScenario,
  type Outcome,
  type WhatIfRow,
} from "./bestCase";
import { computeFinishedStandings, type PlayerLite } from "./tournamentStandings";

/** `1 · X · 2` — the notation the odds line on every scheduled match already uses. */
function OutcomeControl({
  value,
  onChange,
  aLabel,
  bLabel,
}: {
  value: Outcome;
  onChange: (o: Outcome) => void;
  aLabel: string;
  bLabel: string;
}) {
  const option = (o: Outcome, glyph: string, label: string) => (
    <Chip
      selected={value === o}
      onClick={() => onChange(o)}
      ariaLabel={label}
      title={label}
      className="w-11 px-0 py-2 text-center font-semibold tabular-nums"
    >
      {glyph}
    </Chip>
  );
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`Result: ${aLabel} versus ${bLabel}`}>
      {option("A", "1", `${aLabel} win`)}
      {option("D", "X", "Draw")}
      {option("B", "2", `${bLabel} win`)}
    </div>
  );
}

const DOT: Record<WhatIfRow["kind"], string> = {
  played: "bg-text-muted/60",
  live: "bg-status-text-green",
  open: "bg-status-text-blue",
};
const STATE_TEXT: Record<WhatIfRow["kind"], string> = {
  played: "text-status-text-default",
  live: "text-status-text-green",
  open: "text-status-text-blue",
};
const STATE_LABEL: Record<WhatIfRow["kind"], string> = { played: "played", live: "live", open: "to play" };

/** Where this row's result comes from — the one thing that separates fact from assumption. */
function provenance(row: WhatIfRow): { text: string; className: string } | null {
  if (row.kind === "played") return null;
  if (row.edited) return { text: "your call", className: "text-accent" };
  if (row.kind === "live") return { text: "as it stands", className: "text-text-muted" };
  if (!row.matters) return { text: "any result", className: "text-text-muted" };
  return { text: "assumed", className: "text-text-muted" };
}

function MatchRow({ row, onSet }: { row: WhatIfRow; onSet: (id: number, o: Outcome) => void }) {
  const m = row.match;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const aNames = a?.players.map((p) => p.display_name) ?? [];
  const bNames = b?.players.map((p) => p.display_name) ?? [];
  if (!aNames.length) aNames.push("—");
  if (!bNames.length) bNames.push("—");

  // An assumed result has no score, so the side that is assumed to lose is quietened
  // instead: the row says who has to win without pretending to know by how much.
  const dimmed = (side: "A" | "B") => row.kind === "open" && row.outcome !== "D" && row.outcome !== side;
  const nameNodes = (names: string[], side: "A" | "B"): ReactNode[] =>
    names.map((n, i) => (
      <span key={i} className={dimmed(side) ? "text-text-muted" : undefined}>
        {n}
      </span>
    ));

  const mark = provenance(row);

  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium">
        <div className="inline-flex min-w-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[row.kind]}`} aria-hidden="true" />
          <span className="text-text-muted">#{m.order_index + 1}</span>
          <span className={STATE_TEXT[row.kind]}>{STATE_LABEL[row.kind]}</span>
        </div>
        {mark ? <span className={`shrink-0 text-micro ${mark.className}`}>{mark.text}</span> : null}
      </div>

      <ScoreLine
        size="sm"
        state={row.kind === "open" ? "scheduled" : m.state}
        leftNames={nameNodes(aNames, "A")}
        rightNames={nameNodes(bNames, "B")}
        leftGoals={Number(a?.goals ?? 0)}
        rightGoals={Number(b?.goals ?? 0)}
      />

      {row.kind === "played" ? null : (
        <div className="mt-1.5 flex justify-center">
          <OutcomeControl
            value={row.outcome}
            onChange={(o) => onSet(m.id, o)}
            aLabel={aNames.join(" + ")}
            bLabel={bNames.join(" + ")}
          />
        </div>
      )}
    </div>
  );
}

/**
 * "wins all 3 of their remaining matches", "wins 2 and loses 1 of their 3 remaining
 * matches". Counts only matches that have not started: a match the focus player is in
 * right now counts as it stands and belongs to "the other results", where its own row
 * says so.
 */
function focusClause(name: string, wins: number, draws: number, losses: number): string {
  const total = wins + draws + losses;
  if (!total) return `${name} has nothing left to play`;
  if (wins === total) {
    if (total === 1) return `${name} wins their last match`;
    return total === 2
      ? `${name} wins both of their remaining matches`
      : `${name} wins all ${total} of their remaining matches`;
  }
  const parts: string[] = [];
  if (wins) parts.push(`wins ${wins}`);
  if (draws) parts.push(`draws ${draws}`);
  if (losses) parts.push(`loses ${losses}`);
  const listed = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${name} ${listed} of their ${total} remaining ${total === 1 ? "match" : "matches"}`;
}

export default function WhatIfSection({ matches, players }: { matches: Match[]; players: PlayerLite[] }) {
  const { actorPlayerId } = useAuth();
  const { avatarUpdatedAtById } = usePlayerAvatarMap();

  const liveTable = useMemo(
    () => computeFinishedStandings(matches, players, { includePlaying: true }),
    [matches, players],
  );

  // Opens on the reader's own player when they are in this tournament — the question is
  // usually "what about me" — and on the current leader otherwise.
  const [pickedId, setPickedId] = useState<number | null>(null);
  const focusId = useMemo(() => {
    const has = (id: number | null | undefined) => id != null && players.some((p) => p.id === id);
    if (has(pickedId)) return pickedId as number;
    if (has(actorPlayerId)) return actorPlayerId as number;
    return liveTable[0]?.playerId ?? players[0]?.id ?? null;
  }, [pickedId, actorPlayerId, players, liveTable]);

  const best = useMemo(
    () => (focusId == null ? null : computeBestCase(matches, players, focusId)),
    [matches, players, focusId],
  );

  // Edits are kept per focus player: picking someone else asks a new question.
  const [edits, setEdits] = useState<{ focusId: number; map: Map<number, Outcome> } | null>(null);
  const outcomes = useMemo(() => {
    const out = new Map(best?.outcomes ?? []);
    if (edits && edits.focusId === focusId) {
      // Only matches that are still open can be overridden — a match that finished in
      // the meantime (this page is live) drops its edit and becomes a fact again.
      for (const [id, o] of edits.map) if (out.has(id)) out.set(id, o);
    }
    return out;
  }, [best, edits, focusId]);

  const projection = useMemo(
    () => (focusId == null ? null : projectScenario(matches, players, focusId, outcomes)),
    [matches, players, focusId, outcomes],
  );
  const rows = useMemo(
    () => (focusId == null || !best ? [] : buildWhatIfRows(matches, players, focusId, best.outcomes, outcomes)),
    [matches, players, focusId, best, outcomes],
  );

  if (focusId == null || !best || !projection) {
    return <EmptyState title="Nothing to project" hint="This tournament has no players yet." />;
  }

  const focusName = players.find((p) => p.id === focusId)?.display_name ?? "";
  const dirty = rows.some((r) => r.edited);
  const mine = rows.filter((r) => r.kind === "open" && r.focusSide);
  const wins = mine.filter((r) => r.outcome === r.focusSide).length;
  const draws = mine.filter((r) => r.outcome === "D").length;
  const clause = focusClause(focusName, wins, draws, mine.length - wins - draws);

  const setOutcome = (id: number, o: Outcome) =>
    setEdits((prev) => {
      const map = new Map(prev && prev.focusId === focusId ? prev.map : []);
      map.set(id, o);
      return { focusId, map };
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="section-label">Player</span>
        <PlayerPicker
          players={liveTable.map((r) => ({ id: r.playerId, name: r.name }))}
          selectedId={focusId}
          onSelect={(id) => {
            setPickedId(id);
            setEdits(null);
          }}
          size="h-9 w-9"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5 lg:order-2">
          <div className="inset flex items-start gap-3">
            <div className="shrink-0 text-center">
              <div className="text-2xl font-bold tabular-nums text-text-normal">#{projection.pos}</div>
              <div className="text-micro text-text-muted">{dirty ? "this scenario" : "best case"}</div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed text-text-normal">
                {dirty ? (
                  <>
                    With these results — {clause} — they finish{" "}
                    <b className="text-text-normal">#{projection.pos}</b>.
                  </>
                ) : (
                  <>
                    If {clause} and the other results fall as shown, they finish{" "}
                    <b className="text-status-text-green">#{projection.pos}</b>.
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Currently #{projection.nowPos || "–"}
                {dirty ? <> · best case #{best.pos}</> : null}
                {best.exact ? null : <> · search cut short, #{best.pos} may not be the ceiling</>}
              </p>
            </div>
          </div>

          <div>
            <div className="section-head">
              <span className="section-label">Projected table</span>
            </div>
            <p className="mb-1 text-xs leading-relaxed text-text-muted">
              An assumed result has no goals, so only points decide here — and a tie goes to {focusName}.
            </p>
            <div className="list-divided">
              {projection.proj.map((r, idx) => {
                const gained = r.pts - r.nowPts;
                return (
                  <div
                    key={r.playerId}
                    className={"row " + (r.isFocus ? "-mx-2 rounded-xl bg-accent/10 px-2" : "")}
                  >
                    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-text-muted">{idx + 1}</span>
                    <AvatarCircle
                      playerId={r.playerId}
                      name={r.name}
                      updatedAt={avatarUpdatedAtById.get(r.playerId) ?? null}
                      sizeClass="h-8 w-8"
                    />
                    <span
                      className={
                        "min-w-0 flex-1 truncate " + (r.isFocus ? "font-semibold text-text-normal" : "text-text-normal")
                      }
                    >
                      {r.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-text-muted">
                      {gained > 0 ? `+${gained}` : ""}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-text-normal">{r.pts}</span>
                    <span className="shrink-0 text-micro leading-none text-text-muted">pts</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:order-1">
          <div className="section-head">
            <span className="section-label">Every match</span>
            {dirty ? (
              <div className="order-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setEdits(null)}
                  title="Reset every match to the computed best case"
                  className="gap-1.5"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  <span>Reset to best case</span>
                </Button>
              </div>
            ) : null}
          </div>
          <p className="mb-1 text-xs leading-relaxed text-text-muted">
            Played matches are facts. Set any other result yourself: <b className="text-text-normal">1</b> home win ·{" "}
            <b className="text-text-normal">X</b> draw · <b className="text-text-normal">2</b> away win.
          </p>
          <div className="list-divided">
            {rows.map((row) => (
              <MatchRow key={row.match.id} row={row} onSet={setOutcome} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
