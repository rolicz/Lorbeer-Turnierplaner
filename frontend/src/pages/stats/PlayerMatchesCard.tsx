import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";

import { listClubs } from "../../api/clubs.api";
import { listPlayers } from "../../api/players.api";
import { getStatsPlayerMatches } from "../../api/stats.api";
import type { Club, Match, StatsPlayerMatchesTournament } from "../../api/types";
import { sideBy } from "../../helpers";
import { clubLabelPartsById } from "../../ui/clubControls";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { Pill, pillDate } from "../../ui/primitives/Pill";

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function winnerSide(m: Match): "A" | "B" | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  if (ag === bg) return null;
  return ag > bg ? "A" : "B";
}

function MatchRowWithClubs({
  m,
  focusId,
  clubs,
  showMeta,
}: {
  m: Match;
  focusId: number;
  clubs: Club[];
  showMeta: boolean;
}) {
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const aClub = clubLabelPartsById(clubs, a?.club_id);
  const bClub = clubLabelPartsById(clubs, b?.club_id);

  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  const showScore = m.state !== "scheduled";

  type NameLine = { id: number; display_name: string };
  const aPlayers: NameLine[] = (a?.players ?? [])
    .filter((p) => Boolean(p.display_name))
    .map((p) => ({ id: p.id, display_name: p.display_name! }));
  const bPlayers: NameLine[] = (b?.players ?? [])
    .filter((p) => Boolean(p.display_name))
    .map((p) => ({ id: p.id, display_name: p.display_name! }));
  const aDisplay: NameLine[] = aPlayers.length ? aPlayers : [{ id: -1, display_name: "—" }];
  const bDisplay: NameLine[] = bPlayers.length ? bPlayers : [{ id: -2, display_name: "—" }];

  const focusSide: "A" | "B" | null = (() => {
    const aHas = (a?.players ?? []).some((p) => p.id === focusId);
    const bHas = (b?.players ?? []).some((p) => p.id === focusId);
    if (aHas && !bHas) return "A";
    if (bHas && !aHas) return "B";
    return null;
  })();

  const w = winnerSide(m);

  const res = (() => {
    if (m.state !== "finished" || !focusSide) return null;
    if (!w) return "D";
    return w === focusSide ? "W" : "L";
  })();

  const scoreCls =
    res === "W"
      ? "bg-status-bg-green/35 border-status-border-green/40 text-status-text-green"
      : res === "L"
        ? "bg-red-500/15 border-red-500/30 text-text-normal"
        : res === "D"
          ? "bg-amber-500/15 border-amber-500/30 text-text-normal"
          : "bg-bg-card-chip/30 border-border-card-inner/45 text-text-normal";

  const outerPad = showMeta ? "p-3" : "p-2";
  const nameText = showMeta ? "text-[15px] md:text-lg" : "text-[13px] md:text-base";
  const rowPad = showMeta ? "py-2" : "py-1";
  const scorePad = showMeta ? "px-4 py-2" : "px-3 py-1.5";
  const scoreText = showMeta ? "text-xl md:text-2xl" : "text-lg md:text-xl";

  return (
    <div className={`panel-subtle rounded-xl ${outerPad}`}>
      {/* Row 1: NAMES + SCORE (like Current Game) */}
      <div className={rowPad}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4">
          <div className="min-w-0">
            {aDisplay.map((p, i) => (
              <div
                key={`${p.display_name}-${i}`}
                className={
                  nameText + " whitespace-normal md:truncate break-words leading-tight font-medium text-text-normal"
                }
              >
                {p.display_name}
              </div>
            ))}
          </div>

          <div
            className={`card-chip justify-self-center flex items-center justify-center gap-2 border shadow-sm ${scorePad} ${scoreCls}`}
          >
            <span className={scoreText + " font-semibold tabular-nums"}>{showScore ? String(ag) : "-"}</span>
            <span className="opacity-80">:</span>
            <span className={scoreText + " font-semibold tabular-nums"}>{showScore ? String(bg) : "-"}</span>
          </div>

          <div className="min-w-0 text-right">
            {bDisplay.map((p, i) => (
              <div
                key={`${p.display_name}-${i}`}
                className={
                  nameText + " whitespace-normal md:truncate break-words leading-tight font-medium text-text-normal"
                }
              >
                {p.display_name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Clubs / leagues / stars (optional) */}
      {showMeta ? (
        <>
          <div className="mt-2 md:mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
            <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClub.name}</div>
            <div />
            <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClub.name}</div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
            <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClub.league_name}</div>
            <div />
            <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClub.league_name}</div>
          </div>

          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4 text-[11px] md:text-sm text-text-muted">
            <div className="min-w-0">
              <StarsFA rating={aClub.rating ?? 0} textClassName="text-text-muted" />
            </div>
            <div />
            <div className="min-w-0 flex justify-end">
              <StarsFA rating={bClub.rating ?? 0} textClassName="text-text-muted" />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TournamentBlock({
  t,
  focusId,
  clubs,
  showMeta,
}: {
  t: StatsPlayerMatchesTournament;
  focusId: number;
  clubs: Club[];
  showMeta: boolean;
}) {
  return (
    <div className="card-inner-flat rounded-2xl space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-normal">{t.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Pill className={pillDate()}>{fmtDate(t.date)}</Pill>
            <Pill className="pill-default">{t.mode}</Pill>
          </div>
        </div>
        <div className="shrink-0 text-[11px] text-text-muted">{t.matches.length} matches</div>
      </div>

      <div className="space-y-2">
        {t.matches.map((m) => (
          <MatchRowWithClubs key={m.id} m={m} focusId={focusId} clubs={clubs} showMeta={showMeta} />
        ))}
      </div>
    </div>
  );
}

function MetaSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  // Compact (left) -> Details (right)
  const idx = value ? 1 : 0;
  const wCls = "w-24 sm:w-28";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Details"
      title="Toggle details (clubs / leagues / stars)"
    >
      <span
        className={"absolute inset-y-1 left-1 rounded-xl shadow-sm transition-transform duration-200 ease-out " + wCls}
        style={{
          backgroundColor: "rgb(var(--color-bg-card-inner))",
          transform: `translateX(${idx * 100}%)`,
        }}
        aria-hidden="true"
      />
      {(
        [
          { k: false as const, label: "Compact", icon: "fa-compress" },
          { k: true as const, label: "Details", icon: "fa-list" },
        ] as const
      ).map((x) => (
        <button
          key={String(x.k)}
          type="button"
          onClick={() => onChange(x.k)}
          className={
            "relative z-10 inline-flex h-9 items-center justify-center gap-2 rounded-xl text-[11px] transition-colors " +
            wCls +
            " " +
            (value === x.k ? "text-text-normal" : "text-text-muted hover:text-text-normal")
          }
          aria-pressed={value === x.k}
        >
          <i className={"fa-solid " + x.icon + " hidden sm:inline"} aria-hidden="true" />
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function PlayerMatchesCard() {
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const players = playersQ.data ?? [];

  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs() });
  const clubs = clubsQ.data ?? [];

  const [playerId, setPlayerId] = useState<number | "">("");
  const [showMeta, setShowMeta] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (playerId === "") return;
    const el = selectorRef.current;
    if (!el) return;
    // Keep the selector anchored at the top when switching players (mobile-friendly).
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [playerId]);

  const matchesQ = useQuery({
    queryKey: ["stats", "playerMatches", playerId || "none"],
    queryFn: () => getStatsPlayerMatches({ playerId: Number(playerId) }),
    enabled: playerId !== "",
    staleTime: 0,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const selected = useMemo(() => {
    if (playerId === "") return null;
    return players.find((p) => p.id === playerId) ?? null;
  }, [players, playerId]);

  const tournaments = matchesQ.data?.tournaments ?? [];

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-list text-text-muted" aria-hidden="true" />
          Player Matches
        </span>
      }
      defaultOpen={false}
      variant="outer"
      bodyVariant="none"
      bodyClassName="space-y-3"
    >
      <div
        ref={selectorRef}
        className="card-inner-flat rounded-2xl space-y-2 scroll-mt-[calc(env(safe-area-inset-top,0px)+128px)] sm:scroll-mt-[calc(env(safe-area-inset-top,0px)+144px)]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
            <i className="fa-solid fa-user text-[11px]" aria-hidden="true" />
            <span>Player</span>
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <select
              className="w-full min-w-0 rounded-xl border border-border-card-inner bg-bg-card-inner px-3 py-2 text-sm text-text-normal"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Select player…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            {playerId !== "" ? (
              <button
                type="button"
                className="btn-base btn-ghost inline-flex h-10 w-10 items-center justify-center"
                onClick={() => setPlayerId("")}
                title="Clear"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
            <i className="fa-solid fa-sliders text-[11px]" aria-hidden="true" />
            <span>View</span>
          </span>
          <MetaSwitch value={showMeta} onChange={setShowMeta} />
        </div>
      </div>

      {playerId === "" ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Pick a player to see their match history.</div> : null}
      {matchesQ.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}
      {matchesQ.error ? <div className="card-inner-flat rounded-2xl text-sm text-red-400">{String(matchesQ.error)}</div> : null}
      {clubsQ.error ? <div className="card-inner-flat rounded-2xl text-sm text-red-400">{String(clubsQ.error)}</div> : null}

      {selected && tournaments.length ? (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <TournamentBlock key={t.id} t={t} focusId={selected.id} clubs={clubs} showMeta={showMeta} />
          ))}
        </div>
      ) : null}

      {selected && !matchesQ.isLoading && !tournaments.length ? (
        <div className="card-inner-flat rounded-2xl text-sm text-text-muted">No matches found for {selected.display_name}.</div>
      ) : null}
    </CollapsibleCard>
  );
}
