/** Streaks tab — record + current runs per streak category. */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Flame, Shield, Goal, Lock } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import PlayerLink from "../../ui/primitives/PlayerLink";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { getStatsStreaks } from "../../api/stats.api";
import { qk } from "../../api/queryKeys";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import type { StatsMode } from "./statsMode";
import type { StatsScope, StatsStreakCategory } from "../../api/types";
import { streakDateText } from "./streakDisplay";

/** Per-category streak glyph (matches the FA badge icons used elsewhere). */
function StreakCatIcon({ catKey, size = 12 }: { catKey: string; size?: number }) {
  if (catKey === "unbeaten_streak") return <Shield size={size} aria-hidden="true" />;
  if (catKey === "scoring_streak") return <Goal size={size} aria-hidden="true" />;
  if (catKey === "clean_sheet_streak") return <Lock size={size} aria-hidden="true" />;
  return <Flame size={size} aria-hidden="true" />; // win_streak + fallback
}

export default function StreaksView({ mode, scope }: { mode: StatsMode; scope: StatsScope }) {
  const q = useQuery({
    queryKey: qk.stats.streaks(mode, 200, scope),
    queryFn: () => getStatsStreaks({ mode, playerId: null, limit: 200, scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;
  const cats: StatsStreakCategory[] = q.data?.categories ?? [];

  return (
    <div className="grid gap-x-6 gap-y-6 lg:grid-cols-2">
      {cats.map((c) => {
        const records = (c.records ?? []).slice(0, 5);
        const current = (c.current ?? []).filter((r) => r.length > 0).slice(0, 5);
        return (
          <div key={c.key} className="space-y-2">
            <div className="section-head">
              <span className="section-label inline-flex items-center gap-1.5"><StreakCatIcon catKey={c.key} size={12} />{c.name}</span>
            </div>
            <p className="-mt-1 text-xs text-text-muted">{c.description}</p>
            {records.length ? (
              <div className="list-divided">
                {records.map((r, i) => (
                  <div key={`${r.player.id}-${i}`} className="flex items-center gap-2 py-2">
                    <span className="w-4 text-center text-xs font-bold tabular-nums text-text-muted">{i + 1}</span>
                    {/* Identity → profile (the row itself has no other action). */}
                    <PlayerLink playerId={r.player.id} name={r.player.display_name} className="flex min-w-0 flex-1 items-center gap-2">
                      <AvatarCircle playerId={r.player.id} name={r.player.display_name} updatedAt={avatarUpdatedAtById.get(r.player.id) ?? null} sizeClass="h-6 w-6" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-text-normal">{r.player.display_name}</span>
                        {streakDateText(r) ? <span className="block text-xs tabular-nums text-text-muted">{streakDateText(r)}</span> : null}
                      </span>
                    </PlayerLink>
                    {r.ongoing ? <span className="shrink-0 rounded-full bg-status-bg-green/60 px-1.5 text-xs text-status-text-green">live</span> : null}
                    <span className="text-sm font-bold tabular-nums text-accent">{r.length}</span>
                  </div>
                ))}
              </div>
            ) : <div className="text-sm text-text-muted">None yet.</div>}
            {current.length ? (
              <div className="pt-1">
                <div className="mb-1 text-xs font-medium text-text-muted">Current</div>
                <div className="flex flex-wrap gap-1.5">
                  {current.map((r) => (
                    <PlayerLink
                      key={r.player.id}
                      playerId={r.player.id}
                      name={r.player.display_name}
                      className="inline-flex items-center gap-1 rounded-full bg-bg-card-chip/50 px-2 py-0.5 text-xs"
                    >
                      {r.player.display_name} <b className="text-text-normal">{r.length}</b>
                    </PlayerLink>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {!cats.length ? <div className="text-sm text-text-muted">No streak data yet.</div> : null}
    </div>
  );
}
