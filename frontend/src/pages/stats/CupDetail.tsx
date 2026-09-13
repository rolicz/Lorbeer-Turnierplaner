/**
 * One cup on the Stats → Overview → Cups sub-view: current holder, records,
 * a reign timeline, the full reign list and per-player totals.
 * Surfaces follow `DESIGN.md` §3 with today's class names (`card-outer` = level-1
 * card, `panel-subtle p-3` = inset) so DS3 can migrate them mechanically.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
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
import { usePlayerColors } from "./usePlayerColors";
import { buildReigns, cupRecords, perPlayer, type CupRecordEntry, type Reign } from "./cupReigns";

const SHOWN_REIGNS = 8;

const CHIP = "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums";
const CHIP_PLAIN = `${CHIP} bg-bg-card-chip text-text-chip`;
const CHIP_ACCENT = `${CHIP} bg-accent/15 text-accent ring-1 ring-inset ring-accent/40`;

type SortKey = "player" | "titles" | "tournamentsHeld" | "longestReign";

function names(entries: CupRecordEntry[]): string {
  return entries.map((e) => e.player.display_name).join(", ");
}

/** "27.03.2026 – 23.04.2026" / "… – now" for a running reign. */
function span(r: Reign): string {
  return `${fmtDate(r.startDate)} – ${r.endDate ? fmtDate(r.endDate) : "now"}`;
}

export default function CupDetail({ cupKey, cupName }: { cupKey: string; cupName: string }) {
  const q = useQuery({ queryKey: qk.cup(cupKey), queryFn: () => getCup(cupKey) });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
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
  const legend = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of reigns) if (!seen.has(r.holder.id)) seen.set(r.holder.id, r.holder.display_name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [reigns]);

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
      <div className="card-outer space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cupColor }} aria-hidden="true" />
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-text-normal">{cupName}</h2>
          {eraMode !== "any" ? <Pill title={`Currently counts ${eraMode} tournaments only`}>{eraMode}</Pill> : null}
        </div>

        <div className="flex items-center gap-3">
          {owner ? (
            /* The holder is an identity — avatar and name open their profile. */
            <PlayerLink playerId={owner.id} name={owner.display_name} className="flex min-w-0 flex-1 items-center gap-3">
              <AvatarCircle
                playerId={owner.id}
                name={owner.display_name}
                updatedAt={avatarUpdatedAtById.get(owner.id) ?? null}
                sizeClass="h-12 w-12"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold" style={{ color: cupColor }}>
                  {owner.display_name}
                </span>
                {/* The reign length and the defenses live in the tile on the right. */}
                <span className="block text-xs text-text-muted">{since?.date ? `Holding since ${fmtDate(since.date)}` : "—"}</span>
              </span>
            </PlayerLink>
          ) : (
            <>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-bg-card-chip/40 text-text-muted">
                <Trophy size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">No owner yet</div>
                <div className="text-xs text-text-muted">—</div>
              </div>
            </>
          )}
          {current ? (
            <StatTile
              className="w-32 shrink-0"
              label="Current reign"
              value={`×${current.tournaments}`}
              hint={`${defended} defended`}
              accessory={records.currentIsRecord ? <span className={CHIP_ACCENT}>record</span> : null}
            />
          ) : null}
        </div>
      </div>

      {reigns.length ? (
        <>
          {/* 2 — records */}
          <div>
            <div className="section-head">
              <span className="section-label">Records</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatTile
                className="col-span-2 sm:col-span-1"
                label="Longest reign"
                value={records.longest ? `×${records.longest.tournaments}` : "—"}
                hint={
                  records.longest ? (
                    <>
                      <span className="block truncate">{longest.holders}</span>
                      <span className="block truncate">{longest.tied === 1 ? span(records.longest) : `${longest.tied} reigns tied`}</span>
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
          </div>

          {/* 3 — timeline */}
          <div>
            <div className="section-head">
              <span className="section-label">Reign timeline</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-card-chip/50">
              {reigns.map((r, i) => (
                <button
                  key={`${r.startTournamentId}-${r.holder.id}`}
                  type="button"
                  onClick={() => jumpToReign(r, reigns.length - 1 - i)}
                  title={`${r.holder.display_name} · ${r.tournaments} tournaments · ${span(r)}`}
                  aria-label={`${r.holder.display_name}, ${r.tournaments} tournaments — jump to this reign`}
                  className="relative h-full min-w-[6px] border-0 p-0"
                  style={{ flexGrow: Math.max(1, r.tournaments), flexBasis: 0, backgroundColor: colorOf(r.holder.id).solid }}
                >
                  {r.current ? (
                    <span className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 0 2px rgb(var(--color-text-normal) / 0.45)" }} />
                  ) : null}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {legend.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(p.id).solid }} aria-hidden="true" />
                  {p.name}
                </span>
              ))}
            </div>
          </div>

          {/* 4 — reigns, newest first */}
          <div>
            <div className="section-head">
              <span className="section-label">Reigns</span>
            </div>
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
                      className="absolute inset-0 z-0 rounded-lg focus-ring"
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
                        <span className={r.current ? CHIP_ACCENT : CHIP_PLAIN} title={`${r.tournaments} tournaments held`}>
                          ×{r.tournaments}
                        </span>
                        {r.current ? <span className="text-xs text-text-muted">current</span> : null}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {r.tookFrom ? `took it from ${r.tookFrom.display_name}` : "claimed it"} · {r.startName} · {fmtDate(r.startDate)}
                      </span>
                      {r.lostTo ? (
                        <span className="block truncate text-xs text-text-muted">
                          ended by {r.lostTo.display_name} · {fmtDate(r.endDate)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
            {newest.length > SHOWN_REIGNS ? (
              <button type="button" className="mt-1 text-xs font-medium text-accent" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : `Show all ${newest.length}`}
              </button>
            ) : null}
          </div>

          {/* 5 — per player */}
          <div>
            <div className="section-head">
              <span className="section-label">Per player</span>
            </div>
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
                    className="cursor-pointer border-b border-border-card-inner/40 transition hover:bg-hover-default/30"
                  >
                    <td className="py-2 pl-1 pr-2">
                      {/* The row opens this player's stats; the identity opens their profile. */}
                      <PlayerLink playerId={row.player.id} name={row.player.display_name} className="flex items-center gap-2">
                        <AvatarCircle
                          playerId={row.player.id}
                          name={row.player.display_name}
                          updatedAt={avatarUpdatedAtById.get(row.player.id) ?? null}
                          sizeClass="h-7 w-7"
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
            <div className="mt-1.5 text-xs text-text-muted">Held = tournaments the cup was held · Longest = best single reign</div>
          </div>
        </>
      ) : (
        <div className="text-sm text-text-muted">No title changes yet.</div>
      )}
    </section>
  );
}
