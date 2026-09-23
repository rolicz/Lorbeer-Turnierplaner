/**
 * One cup on the Stats → Overview → Cups sub-view: current holder, records,
 * a reign timeline, the full reign list and per-player totals.
 * Surfaces follow `DESIGN.md` §3: `card` for each block, `inset` for the boxes inside.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import PlayerLink from "../../ui/primitives/PlayerLink";
import InlineLoading from "../../ui/primitives/InlineLoading";
import StatTile from "../../ui/primitives/StatTile";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { Pill } from "../../ui/primitives/Pill";
import { currentEraMode, getCup } from "../../api/cup.api";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { qk } from "../../api/queryKeys";
import { fmtDate } from "../../utils/format";
import { prefersReducedMotion } from "../../ui/scroll";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { useCupHolders } from "../../hooks/useCupHolders";
import StatsSection from "./StatsSection";
import { usePlayerColors } from "./usePlayerColors";
import { buildReigns, cupRecords, perPlayer, reignSpan, type CupRecordEntry, type Reign } from "./cupReigns";
import { CHIP_ACCENT, CupHolder, CupReignTimeline, ReignChip } from "./cupParts";

const SHOWN_REIGNS = 8;

type SortKey = "player" | "titles" | "tournamentsHeld" | "longestReign";

function names(entries: CupRecordEntry[]): string {
  return entries.map((e) => e.player.display_name).join(", ");
}

export default function CupDetail({ cupKey, cupName }: { cupKey: string; cupName: string }) {
  const q = useQuery({ queryKey: qk.cup(cupKey), queryFn: () => getCup(cupKey) });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const { cupsHeldByPlayerId } = useCupHolders();
  const { colorOf } = usePlayerColors();
  const nav = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("tournamentsHeld");
  const [dir, setDir] = useState<1 | -1>(-1);

  const cupColor = rgbFromCssVar(cupColorVarForKey(cupKey));
  const reigns = useMemo(() => buildReigns(q.data), [q.data]);
  const records = useMemo(() => cupRecords(reigns), [reigns]);
  const playerRows = useMemo(() => perPlayer(reigns), [reigns]);
  // Newest first in the list; the timeline stays chronological.
  const newest = useMemo(() => reigns.slice().reverse(), [reigns]);
  const shown = showAll ? newest : newest.slice(0, SHOWN_REIGNS);
  // Several reigns can share the record — name every holder, and only show the
  // date span when exactly one reign holds it.
  const longest = useMemo(() => {
    const best = records.longest?.tournaments ?? 0;
    const tied = reigns.filter((r) => r.tournaments === best);
    const seen = new Map<number, string>();
    for (const r of tied) if (!seen.has(r.holder.id)) seen.set(r.holder.id, r.holder.display_name);
    return { holders: [...seen.values()].join(", "), tied: tied.length };
  }, [reigns, records]);

  const sortedRows = useMemo(() => {
    const val = (r: (typeof playerRows)[number]) =>
      sortKey === "titles" ? r.titles : sortKey === "longestReign" ? r.longestReign : r.tournamentsHeld;
    // Ties fall back to `perPlayer`'s own order (held, then titles, then name).
    return playerRows.slice().sort((a, b) => {
      const primary = sortKey === "player" ? a.player.display_name.localeCompare(b.player.display_name) * dir : (val(a) - val(b)) * dir;
      return primary || b.tournamentsHeld - a.tournamentsHeld || b.titles - a.titles || a.player.display_name.localeCompare(b.player.display_name);
    });
  }, [playerRows, sortKey, dir]);

  const owner = q.data?.owner ?? null;
  const eraMode = currentEraMode(q.data?.cup?.eras);
  const since = q.data?.streak?.since;
  const current = reigns.find((r) => r.current) ?? null;
  // `tournaments_participated` counts the winning tournament itself, so a fresh
  // win is 1 → zero defenses.
  const defended = Math.max(0, (current?.tournaments ?? 0) - 1);

  const rowId = (r: Reign) => `reign-${cupKey}-${r.startTournamentId}`;
  const jumpToReign = (r: Reign, idx: number) => {
    if (idx < newest.length - SHOWN_REIGNS) setShowAll(true);
    requestAnimationFrame(() => {
      document.getElementById(rowId(r))?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  };
  const setSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(k === "player" ? 1 : -1);
    }
  };

  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;

  return (
    <section className="space-y-4">
      <ErrorToastOnError error={q.error} title="Cup loading failed" />

      {/* 1 — current holder */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cupColor }} aria-hidden="true" />
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-text-normal">{cupName}</h2>
          {eraMode !== "any" ? <Pill title={`Currently counts ${eraMode} tournaments only`}>{eraMode}</Pill> : null}
        </div>

        {/* The reign length and the defenses live in the tile on the right, so the
            holder line only carries the identity and the start date. */}
        <CupHolder
          owner={owner}
          color={cupColor}
          since={since?.date}
          trailing={current ? (
            <StatTile
              className="w-32 shrink-0"
              label="Current reign"
              value={`×${current.tournaments}`}
              hint={`${defended} defended`}
              accessory={records.currentIsRecord ? <span className={CHIP_ACCENT}>record</span> : null}
            />
          ) : null}
        />
      </div>

      {reigns.length ? (
        <>
          {/* 2 — records */}
          <StatsSection label="Records">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatTile
                className="col-span-2 sm:col-span-1"
                label="Longest reign"
                value={records.longest ? `×${records.longest.tournaments}` : "—"}
                hint={
                  records.longest ? (
                    <>
                      <span className="block truncate">{longest.holders}</span>
                      <span className="block truncate">{longest.tied === 1 ? reignSpan(records.longest) : `${longest.tied} reigns tied`}</span>
                    </>
                  ) : null
                }
              />
              <StatTile
                label="Most titles"
                value={records.mostTitles[0]?.count ?? "—"}
                hint={<span className="block truncate">{names(records.mostTitles) || "—"}</span>}
              />
              <StatTile
                label="Most tournaments held"
                value={records.mostTournamentsHeld[0]?.count ?? "—"}
                hint={<span className="block truncate">{names(records.mostTournamentsHeld) || "—"}</span>}
              />
            </div>
          </StatsSection>

          {/* 3 — timeline */}
          <StatsSection label="Reign timeline" explainer="Each block is one reign — tap it to jump to that row.">
            <CupReignTimeline reigns={reigns} onSelect={(r, i) => jumpToReign(r, reigns.length - 1 - i)} />
          </StatsSection>

          {/* 4 — reigns, newest first */}
          <StatsSection
            label="Reigns"
            action={newest.length > SHOWN_REIGNS ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : `Show all ${newest.length}`}
              </Button>
            ) : null}
          >
            <div className="list-divided">
              {shown.map((r) => {
                const color = colorOf(r.holder.id).solid;
                return (
                  /* Two targets, no nesting: the tournament is a stretched link behind the
                     row, the holder's avatar + name sit above it as their own link. */
                  <div key={rowId(r)} id={rowId(r)} className="row row-tap relative scroll-mt-20">
                    <Link
                      to={`/live/${r.startTournamentId}`}
                      aria-label={`${r.startName} — open tournament`}
                      className="absolute inset-0 z-0 rounded-xl focus-ring"
                    />
                    <PlayerLink
                      playerId={r.holder.id}
                      name={r.holder.display_name}
                      decorative
                      className="pointer-events-auto relative z-10 shrink-0"
                    >
                      <AvatarCircle
                        playerId={r.holder.id}
                        name={r.holder.display_name}
                        updatedAt={avatarUpdatedAtById.get(r.holder.id) ?? null}
                        sizeClass="h-8 w-8"
                        cups={cupsHeldByPlayerId.get(r.holder.id)}
                      />
                    </PlayerLink>
                    <span className="pointer-events-none relative z-10 min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {/* Colour as a dot (not coloured text) — the app's convention and
                            the only one that keeps contrast in the light theme. */}
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                        <PlayerLink
                          playerId={r.holder.id}
                          name={r.holder.display_name}
                          className="pointer-events-auto min-w-0"
                        >
                          <span className="block truncate text-sm font-semibold text-text-normal">{r.holder.display_name}</span>
                        </PlayerLink>
                        <ReignChip tournaments={r.tournaments} current={r.current} />
                        {r.current ? <span className="text-xs text-text-muted">current</span> : null}
                      </span>
                      {/* The other two people in this line are names too (N4, Q-F): the
                          holder above them is already a link, and "took it from Berni" was
                          the same person spelled as plain text one line lower. Inline, so
                          the line still truncates as one line, and `pointer-events-auto`
                          above the stretched tournament link so the row keeps its own
                          action everywhere else. */}
                      <span className="block truncate text-xs text-text-muted">
                        {r.tookFrom ? (
                          <>
                            took it from{" "}
                            <PlayerLink
                              playerId={r.tookFrom.id}
                              name={r.tookFrom.display_name}
                              className="pointer-events-auto"
                            >
                              {r.tookFrom.display_name}
                            </PlayerLink>
                          </>
                        ) : (
                          "claimed it"
                        )}{" "}
                        · {r.startName} · {fmtDate(r.startDate)}
                      </span>
                      {r.lostTo ? (
                        <span className="block truncate text-xs text-text-muted">
                          ended by{" "}
                          <PlayerLink
                            playerId={r.lostTo.id}
                            name={r.lostTo.display_name}
                            className="pointer-events-auto"
                          >
                            {r.lostTo.display_name}
                          </PlayerLink>{" "}
                          · {fmtDate(r.endDate)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </StatsSection>

          {/* 5 — per player */}
          <StatsSection label="Per player" explainer="Held = tournaments the cup was held · Longest = best single reign">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-card-chip/50 text-xs uppercase tracking-wide text-text-muted">
                  {([
                    ["player", "Player", "left"],
                    ["titles", "Titles", "right"],
                    ["tournamentsHeld", "Held", "right"],
                    ["longestReign", "Longest", "right"],
                  ] as Array<[SortKey, string, "left" | "right"]>).map(([key, label, align]) => (
                    <th key={key} className={`py-2 font-medium ${align === "left" ? "pl-1 pr-2 text-left" : "px-2 text-right"}`}>
                      <button
                        type="button"
                        onClick={() => setSort(key)}
                        className={"inline-flex items-center gap-0.5 " + (sortKey === key ? "text-accent" : "hover:text-text-normal")}
                      >
                        {label}
                        {sortKey === key ? <span aria-hidden="true">{dir === -1 ? "▾" : "▴"}</span> : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    key={row.player.id}
                    onClick={() => nav(`/stats?view=player&player=${row.player.id}`)}
                    className="cursor-pointer border-b border-border-card-chip/40 transition hover:bg-hover-default/30"
                  >
                    <td className="py-2 pl-1 pr-2">
                      {/* The row opens this player's stats; the identity opens their profile. */}
                      <PlayerLink playerId={row.player.id} name={row.player.display_name} className="flex items-center gap-2">
                        <AvatarCircle
                          playerId={row.player.id}
                          name={row.player.display_name}
                          updatedAt={avatarUpdatedAtById.get(row.player.id) ?? null}
                          sizeClass="h-7 w-7"
                          cups={cupsHeldByPlayerId.get(row.player.id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-text-normal">{row.player.display_name}</span>
                          <span className="block text-xs text-text-muted">{row.daysHeld} days held</span>
                        </span>
                      </PlayerLink>
                    </td>
                    <td className="px-2 text-right tabular-nums">{row.titles}</td>
                    <td className="px-2 text-right font-bold tabular-nums">{row.tournamentsHeld}</td>
                    <td className="px-2 text-right tabular-nums">×{row.longestReign}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </StatsSection>
        </>
      ) : (
        <EmptyState title="No title changes yet." className="py-2" />
      )}
    </section>
  );
}
