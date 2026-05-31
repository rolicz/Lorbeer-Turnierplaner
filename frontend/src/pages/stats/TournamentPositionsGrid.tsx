import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { StatsTournamentLite } from "../../api/types";
import TournamentLaurelMarkers from "./TournamentLaurelMarkers";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function parseDateSafe(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function useTournamentCols() {
  const [cols, setCols] = useState<number>(() => {
    if (typeof window === "undefined") return 12;
    const w = window.innerWidth;
    if (w >= 1024) return 12;
    if (w >= 640) return 10;
    return 8;
  });

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const next = w >= 1024 ? 12 : w >= 640 ? 10 : 8;
      setCols(next);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return cols;
}

export default function TournamentPositionsGrid({
  tournaments,
  positionsByTournament,
  expanded,
}: {
  tournaments: StatsTournamentLite[];
  positionsByTournament: Record<number, number | null>;
  expanded: boolean;
}) {
  const cols = useTournamentCols();

  const tournamentsSorted = useMemo(() => {
    const ts = tournaments.slice();
    ts.sort((a, b) => {
      const da = parseDateSafe(a.date);
      const db = parseDateSafe(b.date);
      if (da != null && db != null && da !== db) return da - db;
      return a.id - b.id;
    });
    return ts;
  }, [tournaments]);

  const recencyByTournamentId = useMemo(() => {
    const m = new Map<number, number>();
    const dates = tournamentsSorted.map((t) => parseDateSafe(t.date) ?? 0);
    const min = dates.length ? Math.min(...dates) : 0;
    const max = dates.length ? Math.max(...dates) : 1;
    const span = Math.max(1, max - min);
    tournamentsSorted.forEach((t) => {
      const d = parseDateSafe(t.date) ?? min;
      m.set(t.id, (d - min) / span);
    });
    return m;
  }, [tournamentsSorted]);

  const total = tournamentsSorted.length;
  const visible = useMemo(() => {
    if (expanded || total <= cols) return tournamentsSorted;
    return tournamentsSorted.slice(Math.max(0, total - cols));
  }, [cols, expanded, total, tournamentsSorted]);

  return (
    <div className="relative w-full">
      <div className="panel rounded-2xl p-2">
        <div className="grid grid-cols-8 gap-1 sm:grid-cols-10 lg:grid-cols-12">
          {visible.length === 0 ? (
            <div className="col-span-full panel-subtle px-3 py-2 text-xs text-text-muted">No tournaments yet.</div>
          ) : null}

          {visible.map((t) => {
            const pos = positionsByTournament?.[t.id] ?? null;
            const title = t.date ? `${t.name} · ${t.date}` : t.name;
            const opacity = 0.5 + 0.5 * (recencyByTournamentId.get(t.id) ?? 0.5);

            if (pos == null) {
              return (
                <div
                  key={t.id}
                  title={title + " · did not participate"}
                  className="pos-none relative inline-flex h-9 items-center justify-center rounded-xl border text-[11px] font-mono tabular-nums"
                  style={{ opacity }}
                >
                  <TournamentLaurelMarkers stakes={t.cup_stakes} />
                  —
                </div>
              );
            }

            const totalPlayers = Number(t.players_count ?? 0) || Math.max(1, pos);
            const isWinner = pos === 1;
            const gradientPosition = totalPlayers <= 1 ? 0 : clamp((pos - 1) / (totalPlayers - 1), 0, 1);
            const base =
              "inline-flex h-9 items-center justify-center rounded-xl border text-[11px] font-mono tabular-nums transition " +
              "hover:brightness-110 hover:border-accent/40";
            const cls = isWinner ? "pos-winner shadow-[0_0_0_1px_rgba(16,185,129,0.15)]" : "pos-tile";
            const posVar = "--pos-p" as const;

            return (
              <Link
                key={t.id}
                to={`/live/${t.id}`}
                title={`${title} · position ${pos}/${totalPlayers}`}
                className={
                  base +
                  " " +
                  cls +
                  " relative w-full select-none no-underline cursor-pointer overflow-visible focus:outline-none focus:ring-2 focus:ring-accent/30"
                }
                style={
                  isWinner
                    ? ({ opacity } as CSSProperties)
                    : ({ opacity, [posVar]: gradientPosition } as CSSProperties)
                }
                aria-label={`${title}, position ${pos} of ${totalPlayers}`}
              >
                <TournamentLaurelMarkers stakes={t.cup_stakes} />
                <span>{pos}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
