import { useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";

import { listClubs } from "../../api/clubs.api";
import { listPlayers } from "../../api/players.api";
import { getStatsPlayerMatches } from "../../api/stats.api";
import type { Club, Match, StatsPlayerMatchesTournament } from "../../api/types";
import { sideBy } from "../../helpers";
import { clubLabelPartsById } from "../../ui/clubControls";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { Pill, pillDate } from "../../ui/primitives/Pill";
import { listPlayerAvatarMeta, playerAvatarUrl } from "../../api/playerAvatars.api";

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

type Outcome = "W" | "D" | "L";

function winnerSide(m: Match): "A" | "B" | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  if (ag === bg) return null;
  return ag > bg ? "A" : "B";
}

function outcomeForPlayer(m: Match, playerId: number): { outcome: Outcome; points: number } | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const aHas = (a?.players ?? []).some((p) => p.id === playerId);
  const bHas = (b?.players ?? []).some((p) => p.id === playerId);
  const focusSide: "A" | "B" | null = aHas && !bHas ? "A" : bHas && !aHas ? "B" : null;
  if (!focusSide) return null;

  const w = winnerSide(m);
  if (!w) return { outcome: "D", points: 1 };
  if (w === focusSide) return { outcome: "W", points: 3 };
  return { outcome: "L", points: 0 };
}

function rollingAvg(series: number[], window: number) {
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = series.slice(start, i + 1);
    // Fixed denominator (pad missing history with 0) to avoid inflating early values.
    const avg = slice.reduce((a, b) => a + b, 0) / Math.max(1, window);
    out.push(avg);
  }
  return out;
}

function AvatarButton({
  playerId,
  name,
  updatedAt,
  selected,
  onClick,
  className = "h-9 w-9",
}: {
  playerId: number;
  name: string;
  updatedAt: string | null;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ overflowAnchor: "none" }}
      className={"relative shrink-0 rounded-full transition-colors " + (selected ? "" : "hover:bg-bg-card-chip/20")}
      aria-pressed={selected}
      title={name}
    >
      <span
        className={
          `panel-subtle inline-flex items-center justify-center overflow-hidden rounded-full ${className} ` +
          (selected ? "ring-2 ring-[color:rgb(var(--color-accent)/0.85)]" : "")
        }
      >
        {updatedAt ? (
          <img
            src={playerAvatarUrl(playerId, updatedAt)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="text-sm font-semibold text-text-muted">{initial}</span>
        )}
      </span>
      <span className="sr-only">{name}</span>
    </button>
  );
}

function Sparkline({
  series,
  outcomes,
  xMinLabel,
  xMaxLabel,
}: {
  series: number[]; // points per match: 0/1/3
  outcomes: Outcome[];
  xMinLabel?: string;
  xMaxLabel?: string;
}) {
  const n = Math.min(series.length, outcomes.length);
  const w = 320;
  const h = 80;
  const padX = 8;
  const padY = 10;
  if (n <= 1) return null;

  const avg = rollingAvg(series.slice(0, n), 5);
  const xAt = (i: number) => padX + (i * (w - padX * 2)) / Math.max(1, n - 1);
  const yAt = (v: number) => {
    const vv = Math.max(0, Math.min(3, v));
    const innerH = h - padY * 2;
    return padY + (1 - vv / 3) * innerH;
  };

  const pts = avg.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(" ");
  const area = `${padX},${h - padY} ${pts} ${w - padX},${h - padY}`;

  const dotFill = (o: Outcome) =>
    o === "W" ? "rgb(var(--color-status-text-green))" : o === "D" ? "rgb(251 191 36)" : "rgb(248 113 113)";

  return (
    <div className="panel-subtle rounded-2xl p-3">
      <div className="text-[11px] font-medium text-text-muted">Form (last {n})</div>
      <svg
        className="mt-2 h-[80px] w-full"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-label="Form sparkline"
      >
        <defs>
          <linearGradient id="formFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0" />
          </linearGradient>
          <filter id="formGlow" x="-20%" y="-50%" width="140%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodColor="rgb(var(--color-accent))" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* y grid */}
        {[0, 1, 2, 3].map((v) => (
          <line
            key={v}
            x1={padX}
            x2={w - padX}
            y1={yAt(v)}
            y2={yAt(v)}
            stroke="rgb(var(--color-border-card-inner))"
            strokeOpacity={v === 0 ? 0.55 : 0.28}
            strokeWidth={v === 0 ? 1 : 1}
          />
        ))}

        {/* y labels */}
        <text x={padX} y={yAt(3) + 4} fontSize="10" fill="rgb(var(--color-text-muted))">
          3
        </text>
        <text x={padX} y={yAt(0) - 2} fontSize="10" fill="rgb(var(--color-text-muted))">
          0
        </text>

        {/* baseline (explicit for crispness) */}
        <line
          x1={padX}
          x2={w - padX}
          y1={h - padY}
          y2={h - padY}
          stroke="rgb(var(--color-border-card-inner))"
          strokeOpacity="0.55"
          strokeWidth="1"
        />

        {/* area */}
        <polygon points={area} fill="url(#formFill)" />

        {/* line */}
        <polyline
          points={pts}
          fill="none"
          stroke="rgb(var(--color-accent))"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#formGlow)"
        />

        {/* outcome dots */}
        {outcomes.slice(0, n).map((o, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(avg[i])} r={2.3} fill={dotFill(o)} opacity="0.95" />
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-text-muted">
          Rolling avg <span className="text-text-normal">5</span> (0..3)
          {xMinLabel || xMaxLabel ? (
            <span className="text-text-muted">
              {" "}
              · {xMinLabel || "—"} <span className="opacity-70">to</span> {xMaxLabel || "—"}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {outcomes.slice(-n).map((o, i) => (
            <span
              key={i}
              className={
                "h-2.5 w-2.5 rounded-sm " +
                (o === "W"
                  ? "bg-status-bg-green/45"
                  : o === "D"
                    ? "bg-amber-500/35"
                    : "bg-red-500/30")
              }
              title={o}
            />
          ))}
        </div>
      </div>
    </div>
  );
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
  const wCls = "w-20 sm:w-28";
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
  const avatarMetaQ = useQuery({
    queryKey: ["players", "avatars"],
    queryFn: listPlayerAvatarMeta,
    staleTime: 30_000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const avatarUpdatedAtById = useMemo(() => {
    const m = new Map<number, string>();
    for (const x of avatarMetaQ.data ?? []) m.set(x.player_id, x.updated_at);
    return m;
  }, [avatarMetaQ.data]);

  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs() });
  const clubs = clubsQ.data ?? [];

  const [playerId, setPlayerId] = useState<number | "">("");
  const [showMeta, setShowMeta] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);

  // Intentionally no auto-scroll on avatar selection; it feels jumpy on mobile and is easy to trigger accidentally.

  const matchesQ = useQuery({
    queryKey: ["stats", "playerMatches", playerId || "none"],
    queryFn: () => getStatsPlayerMatches({ playerId: Number(playerId) }),
    enabled: playerId !== "",
    placeholderData: keepPreviousData,
    staleTime: 0,
    // Avoid surprise reflows while the user is interacting (mobile scroll anchoring can look like "jumps").
    // WS invalidation still refreshes stats when tournaments change.
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const selected = useMemo(() => {
    if (playerId === "") return null;
    return players.find((p) => p.id === playerId) ?? null;
  }, [players, playerId]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [players]);

  const tournaments = matchesQ.data?.tournaments ?? [];
  const form = useMemo(() => {
    if (!selected) return null;
    const flat = tournaments.flatMap((t) =>
      t.matches
        .filter((m) => m.state === "finished")
        .map((m) => ({
          t_date: new Date(t.date ?? 0).getTime(),
          t_label: fmtDate(t.date),
          order: m.order_index ?? 0,
          m,
        }))
    );
    const sorted = flat
      .slice()
      .sort((a, b) => (a.t_date !== b.t_date ? a.t_date - b.t_date : a.order - b.order))
      .slice(-25);
    const last = sorted.map((x) => x.m);
    const out: Outcome[] = [];
    const pts: number[] = [];
    for (const m of last) {
      const o = outcomeForPlayer(m, selected.id);
      if (!o) continue;
      out.push(o.outcome);
      pts.push(o.points);
    }
    if (!out.length) return null;
    return {
      pts,
      out,
      startLabel: sorted[0]?.t_label ?? "",
      endLabel: sorted[sorted.length - 1]?.t_label ?? "",
    };
  }, [selected, tournaments]);

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-list text-text-muted" aria-hidden="true" />
          Player Matches
        </span>
      }
      defaultOpen={false}
      scrollOnOpen={true}
      variant="outer"
      bodyVariant="none"
      bodyClassName="space-y-3"
    >
      <ErrorToastOnError error={matchesQ.error} title="Player matches loading failed" />
      <ErrorToastOnError error={clubsQ.error} title="Club data loading failed" />
      <div
        ref={selectorRef}
        className="card-inner-flat rounded-2xl space-y-2 scroll-mt-[calc(env(safe-area-inset-top,0px)+128px)] sm:scroll-mt-[calc(env(safe-area-inset-top,0px)+144px)]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 w-20 shrink-0 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
            <i className="fa-solid fa-sliders text-[11px]" aria-hidden="true" />
            <span>View</span>
          </span>
          <MetaSwitch value={showMeta} onChange={setShowMeta} />
        </div>

        <div className="h-px bg-border-card-inner/70" />

        <div className="-mx-1 overflow-x-auto px-1 py-0.5">
          <div className="flex min-w-full items-center justify-between gap-2">
            {sortedPlayers.map((p) => (
              <AvatarButton
                key={p.id}
                playerId={p.id}
                name={p.display_name}
                updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
                selected={playerId === p.id}
                onClick={() => setPlayerId(p.id)}
                className="h-8 w-8"
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ overflowAnchor: "none" }}>
        {playerId === "" ? (
          <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Pick a player to see their match history.</div>
        ) : null}
        {matchesQ.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}

        {selected && tournaments.length ? (
          <div className="space-y-3">
            {form ? <Sparkline series={form.pts} outcomes={form.out} xMinLabel={form.startLabel} xMaxLabel={form.endLabel} /> : null}
            {tournaments.map((t) => (
              <TournamentBlock key={t.id} t={t} focusId={selected.id} clubs={clubs} showMeta={showMeta} />
            ))}
          </div>
        ) : null}

        {selected && !matchesQ.isLoading && !tournaments.length ? (
          <div className="card-inner-flat rounded-2xl text-sm text-text-muted">No matches found for {selected.display_name}.</div>
        ) : null}
      </div>
    </CollapsibleCard>
  );
}
