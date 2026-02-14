import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStatsH2H, getStatsPlayerMatches, getStatsPlayers, getStatsRatings, getStatsStreaks } from "../../api/stats.api";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import { StreakPatch, type ActiveStreak } from "../../ui/StreakPatches";
import type { Match, StatsPlayerMatchesTournament, StatsStreakCategory, StatsStreakRow, StatsStreaksResponse } from "../../api/types";
import { sideBy } from "../../helpers";

function ppm(pts: number, played: number) {
  return played > 0 ? (pts / played).toFixed(2) : "0.00";
}

function toActiveStreaks(data: StatsStreaksResponse | undefined): ActiveStreak[] {
  if (!data?.categories?.length) return [];
  const byKey = (key: string): StatsStreakCategory | undefined => data.categories.find((c) => c.key === key);
  const cur = (key: string): StatsStreakRow[] => byKey(key)?.current ?? [];
  const rec = (key: string): StatsStreakRow[] => byKey(key)?.records ?? [];

  const wins = cur("win_streak")?.[0] ?? null;
  const unbeaten = cur("unbeaten_streak")?.[0] ?? null;
  const scoring = cur("scoring_streak")?.[0] ?? null;
  const clean = cur("clean_sheet_streak")?.[0] ?? null;

  const bestLen = (rows: StatsStreakRow[]) => rows.reduce((m, r) => Math.max(m, Number(r.length ?? 0)), 0);
  const bestWin = bestLen(rec("win_streak"));
  const bestUnbeaten = bestLen(rec("unbeaten_streak"));
  const bestScoring = bestLen(rec("scoring_streak"));
  const bestClean = bestLen(rec("clean_sheet_streak"));

  const out: ActiveStreak[] = [];
  const minLen = 2;

  if (wins && Number(wins.length ?? 0) >= minLen) {
    out.push({ key: "win_streak", length: Number(wins.length), highlight: Number(wins.length) >= bestWin && bestWin > 0 });
  }
  if (unbeaten && Number(unbeaten.length ?? 0) >= minLen) {
    const wlen = Number(wins?.length ?? 0);
    const ulen = Number(unbeaten.length ?? 0);
    if (!(wlen > 0 && ulen <= wlen)) {
      out.push({ key: "unbeaten_streak", length: ulen, highlight: ulen >= bestUnbeaten && bestUnbeaten > 0 });
    }
  }
  if (scoring && Number(scoring.length ?? 0) >= minLen) {
    const len = Number(scoring.length);
    out.push({ key: "scoring_streak", length: len, highlight: len >= bestScoring && bestScoring > 0 });
  }
  if (clean && Number(clean.length ?? 0) >= minLen) {
    const len = Number(clean.length);
    out.push({ key: "clean_sheet_streak", length: len, highlight: len >= bestClean && bestClean > 0 });
  }
  return out;
}

function outcomeForPlayer(m: Match, playerId: number): "W" | "D" | "L" | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  if (!a || !b) return null;
  const aHas = (a.players ?? []).some((p) => p.id === playerId);
  const bHas = (b.players ?? []).some((p) => p.id === playerId);
  if (!aHas && !bHas) return null;
  const ag = Number(a.goals ?? 0);
  const bg = Number(b.goals ?? 0);
  if (ag === bg) return "D";
  if (aHas) return ag > bg ? "W" : "L";
  return bg > ag ? "W" : "L";
}

export default function PlayerLiveStatsModal({
  open,
  onClose,
  player,
  avatarUpdatedAt,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  player: { id: number; name: string } | null;
  avatarUpdatedAt: string | null;
  mode: "1v1" | "2v2";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pid = player?.id ?? null;
  const enabled = open && pid != null;

  const playersModeQ = useQuery({
    queryKey: ["stats", "players", mode, 10],
    queryFn: () => getStatsPlayers({ mode, lastN: 10 }),
    enabled,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });
  const playersOverallQ = useQuery({
    queryKey: ["stats", "players", "overall", 10],
    queryFn: () => getStatsPlayers({ mode: "overall", lastN: 10 }),
    enabled,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });
  const ratingsModeQ = useQuery({
    queryKey: ["stats", "ratings", mode],
    queryFn: () => getStatsRatings({ mode }),
    enabled,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });
  const h2hQ = useQuery({
    queryKey: ["stats", "h2h", pid ?? "none", 8, "played"],
    queryFn: () => getStatsH2H({ playerId: pid ?? undefined, limit: 8, order: "played" }),
    enabled,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });
  const streakQ = useQuery({
    queryKey: ["stats", "streaks", "overall", pid ?? "none"],
    queryFn: () => getStatsStreaks({ mode: "overall", playerId: pid ?? undefined, limit: 50 }),
    enabled,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });
  const matchesQ = useQuery({
    queryKey: ["stats", "playerMatches", pid ?? "none"],
    queryFn: () => {
      if (pid == null) throw new Error("No player selected");
      return getStatsPlayerMatches({ playerId: pid });
    },
    enabled,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });

  const rowMode = useMemo(
    () => (pid != null ? (playersModeQ.data?.players ?? []).find((r) => r.player_id === pid) ?? null : null),
    [playersModeQ.data, pid],
  );
  const rowOverall = useMemo(
    () => (pid != null ? (playersOverallQ.data?.players ?? []).find((r) => r.player_id === pid) ?? null : null),
    [playersOverallQ.data, pid],
  );
  const ratingInfo = useMemo(() => {
    if (!pid || !ratingsModeQ.data?.rows?.length) return null;
    const idx = ratingsModeQ.data.rows.findIndex((r) => r.player.id === pid);
    if (idx < 0) return null;
    const rr = ratingsModeQ.data.rows[idx];
    return { rating: rr.rating, rank: idx + 1, total: ratingsModeQ.data.rows.length };
  }, [pid, ratingsModeQ.data]);
  const favorite = useMemo(() => {
    const d = h2hQ.data;
    if (!d) return null;
    if (mode === "1v1") return d.favorite_victim_1v1?.opponent?.display_name ?? null;
    if (mode === "2v2") return d.favorite_victim_2v2?.opponent?.display_name ?? null;
    return d.favorite_victim_all?.opponent?.display_name ?? null;
  }, [h2hQ.data, mode]);
  const nemesis = useMemo(() => {
    const d = h2hQ.data;
    if (!d) return null;
    if (mode === "1v1") return d.nemesis_1v1?.opponent?.display_name ?? null;
    if (mode === "2v2") return d.nemesis_2v2?.opponent?.display_name ?? null;
    return d.nemesis_all?.opponent?.display_name ?? null;
  }, [h2hQ.data, mode]);
  const streaks = useMemo(() => toActiveStreaks(streakQ.data), [streakQ.data]);
  const recent5 = useMemo(() => {
    if (!pid) return [] as Array<"W" | "D" | "L">;
    const ts = (matchesQ.data?.tournaments ?? [])
      .filter((t: StatsPlayerMatchesTournament) => t.status === "done" && t.mode === mode)
      .slice()
      .sort((a, b) => {
        const da = Date.parse(a.date ?? "");
        const db = Date.parse(b.date ?? "");
        if (da !== db) return da - db;
        return a.id - b.id;
      });

    const outcomes: Array<"W" | "D" | "L"> = [];
    for (const t of ts) {
      const ms = (t.matches ?? []).slice().sort((m1, m2) => (m1.order_index ?? 0) - (m2.order_index ?? 0));
      for (const m of ms) {
        const o = outcomeForPlayer(m, pid);
        if (o) outcomes.push(o);
      }
    }
    return outcomes.slice(-5);
  }, [matchesQ.data, mode, pid]);

  if (!open || !player) return null;

  const loading =
    playersModeQ.isLoading || playersOverallQ.isLoading || ratingsModeQ.isLoading || h2hQ.isLoading || streakQ.isLoading || matchesQ.isLoading;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-3 sm:p-6">
        <div className="card-outer w-full max-w-xl p-3 sm:p-4 max-h-[85vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 inline-flex items-center gap-3">
              <AvatarCircle
                playerId={player.id}
                name={player.name}
                updatedAt={avatarUpdatedAt}
                sizeClass="h-10 w-10"
                fallbackClassName="text-base font-semibold text-text-muted"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-text-normal">{player.name}</div>
                <div className="text-[11px] text-text-muted">Player stats ({mode})</div>
              </div>
            </div>
            <button type="button" className="icon-button" onClick={onClose} title="Close">✕</button>
          </div>

          <div className="mt-3 card-inner-flat rounded-2xl p-3">
            <div className="text-[11px] text-text-muted">Form and rating</div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div className="text-text-muted">
                Last 10 ({mode}): <span className="text-text-normal font-mono tabular-nums">{(rowMode?.lastN_avg_pts ?? 0).toFixed(2)}</span> ppm
              </div>
              <div className="text-text-muted">
                Last 10 (overall):{" "}
                <span className="text-text-normal font-mono tabular-nums">{(rowOverall?.lastN_avg_pts ?? 0).toFixed(2)}</span> ppm
              </div>
              <div className="text-text-muted">
                Overall ppm: <span className="text-text-normal font-mono tabular-nums">{ppm(rowOverall?.pts ?? 0, rowOverall?.played ?? 0)}</span>
              </div>
              <div className="text-text-muted">
                Rating ({mode}):{" "}
                <span className="text-text-normal font-mono tabular-nums">
                  {ratingInfo ? `${Math.round(ratingInfo.rating)} (#${ratingInfo.rank}/${ratingInfo.total})` : "—"}
                </span>
              </div>
            </div>
            <div className="mt-2 border-t border-border-card-inner/60 pt-2 text-xs">
              <span className="text-text-muted">Last 5:</span>{" "}
              {recent5.length ? (
                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                  {recent5.map((o, i) => (
                    <span
                      key={i}
                      className={
                        o === "W"
                          ? "text-status-text-green"
                          : o === "D"
                            ? "text-text-muted"
                            : "delta-down"
                      }
                      title={o === "W" ? "Win" : o === "D" ? "Draw" : "Loss"}
                    >
                      {o}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-text-muted"> —</span>
              )}
            </div>
          </div>

          <div className="mt-2 card-inner-flat rounded-2xl p-3">
            <div className="text-[11px] text-text-muted">Streak patches</div>
            <div className="mt-1 inline-flex flex-wrap items-center gap-1.5">
              {streaks.length ? (
                streaks.map((s, i) => <StreakPatch key={s.key + "-" + i} streak={s} />)
              ) : (
                <span className="text-xs text-text-muted">No active streaks</span>
              )}
            </div>
          </div>

          <div className="mt-2 card-inner-flat rounded-2xl p-3">
            <div className="text-[11px] text-text-muted">Direct rivals ({mode})</div>
            <div className="mt-1 grid gap-1 sm:grid-cols-2 text-xs">
              <div className="text-text-muted">
                Favorite: <span className="text-text-normal">{favorite ?? "—"}</span>
              </div>
              <div className="text-text-muted">
                Nemesis: <span className="text-text-normal">{nemesis ?? "—"}</span>
              </div>
            </div>
          </div>

          {loading ? <div className="mt-2 text-xs text-text-muted">Loading…</div> : null}
        </div>
      </div>
    </div>
  );
}
