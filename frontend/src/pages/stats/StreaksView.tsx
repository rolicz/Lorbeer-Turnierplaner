/** Streaks tab — record + current runs per streak category. */
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import EmptyState from "../../ui/primitives/EmptyState";
import PlayerLink from "../../ui/primitives/PlayerLink";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { getStatsStreaks } from "../../api/stats.api";
import { qk } from "../../api/queryKeys";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { useCupHolders } from "../../hooks/useCupHolders";
import { recordIcon } from "./recordIcons";
import { RECORD_PARAM, recordSectionId } from "./statsNav";
import { useOneShotSectionParam } from "./useOneShotSectionParam";
import StatsSection from "./StatsSection";
import type { StatsMode } from "./statsMode";
import type { StatsScope, StatsStreakCategory } from "../../api/types";
import { streakDateText } from "./streakDisplay";

/** How many rows / chips a category shows before the "+N more" line. */
const SHOWN = 5;

export default function StreaksView({ mode, scope }: { mode: StatsMode; scope: StatsScope }) {
  const q = useQuery({
    queryKey: qk.stats.streaks(mode, 200, scope),
    queryFn: () => getStatsStreaks({ mode, playerId: null, limit: 200, scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const { cupsHeldByPlayerId } = useCupHolders();
  const cats: StatsStreakCategory[] = q.data?.categories ?? [];
  // `?record=<key>` (a badge tap, or a record-endpoint path): scroll that
  // category into view, then drop the param (the shared `?cup=` mechanism, M4).
  useOneShotSectionParam(RECORD_PARAM, recordSectionId, cats.map((c) => c.key), !!q.data);
  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;
  if (!cats.length) return <EmptyState title="No streak data yet." className="py-6" />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {cats.map((c) => {
        const all = c.records ?? [];
        const records = all.slice(0, SHOWN);
        const currentAll = (c.current ?? []).filter((r) => r.length > 0);
        const current = currentAll.slice(0, SHOWN);
        const Icon = recordIcon(c.key);
        return (
          <div key={c.key} id={recordSectionId(c.key)}>
            <StatsSection label={c.name} icon={<Icon size={12} aria-hidden="true" />} explainer={c.description}>
              {records.length ? (
                <div className="list-divided">
                  {records.map((r, i) => (
                    <div key={`${r.player.id}-${i}`} className="flex items-center gap-2 py-2">
                      <span className="w-4 text-center text-xs font-bold tabular-nums text-text-muted">{i + 1}</span>
                      {/* Identity → profile (the row itself has no other action). */}
                      <PlayerLink playerId={r.player.id} name={r.player.display_name} className="flex min-w-0 flex-1 items-center gap-2">
                        <AvatarCircle playerId={r.player.id} name={r.player.display_name} updatedAt={avatarUpdatedAtById.get(r.player.id) ?? null} sizeClass="h-6 w-6" cups={cupsHeldByPlayerId.get(r.player.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-text-normal">{r.player.display_name}</span>
                          {streakDateText(r) ? <span className="block text-xs tabular-nums text-text-muted">{streakDateText(r)}</span> : null}
                        </span>
                      </PlayerLink>
                      {r.ongoing ? <span className="chip shrink-0">current</span> : null}
                      <span className="text-sm font-bold tabular-nums text-accent">{r.length}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No streaks yet." className="py-2" />}
              {all.length > records.length ? <div className="text-xs text-text-muted">+{all.length - records.length} more</div> : null}
              {current.length ? (
                <div className="pt-1">
                  <div className="mb-1 text-xs font-medium text-text-muted">Current</div>
                  <div className="flex flex-wrap items-center gap-1.5">
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
                    {currentAll.length > current.length ? (
                      <span className="text-xs text-text-muted">+{currentAll.length - current.length} more</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </StatsSection>
          </div>
        );
      })}
    </div>
  );
}
