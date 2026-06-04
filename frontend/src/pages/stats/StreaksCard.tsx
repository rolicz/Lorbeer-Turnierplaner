import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { Pill } from "../../ui/primitives/Pill";

import { listPlayers } from "../../api/players.api";
import { getStatsStreaks } from "../../api/stats.api";
import type { StatsScope, StatsStreakCategory, StatsStreakRow } from "../../api/types";
import {
  StatsFilterDataControls,
  type StatsMode,
} from "./StatsControls";
import { fmtDate } from "../../utils/format";

function iconForCatKey(key: string) {
  switch (key) {
    case "win_streak":
      return { icon: "fa-fire-flame-curved", label: "Win streak" };
    case "unbeaten_streak":
      return { icon: "fa-shield", label: "Unbeaten streak" };
    case "scoring_streak":
      return { icon: "fa-futbol", label: "Scoring streak" };
    case "clean_sheet_streak":
      return { icon: "fa-lock", label: "Clean sheet streak" };
    default:
      return null;
  }
}


function StreakRow({ r, ongoing }: { r: StatsStreakRow; ongoing?: StatsStreakRow | null }) {
  const start = fmtDate(r.start_ts);
  const end = fmtDate(r.end_ts);
  const rangeText = r.ongoing
    ? (start ? `since ${start}` : "still ongoing")
    : (start && end ? `${start} → ${end}` : (start || end ? (start || end) : ""));
  const ongoingStart = fmtDate(ongoing?.start_ts);
  const ongoingText = ongoing && !r.ongoing && Number(ongoing.length) > 0 && Number(ongoing.length) < Number(r.length)
    ? `${ongoingStart ? `Since ${ongoingStart}` : "Ongoing"}: ${ongoing.length}`
    : "";

  return (
    <div className="panel-subtle flex items-center justify-between gap-3 rounded-xl px-3 py-2">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="truncate text-sm font-semibold text-text-normal">{r.player.display_name}</div>
          {r.ongoing ? (
            <Pill
              className="min-w-0 border-status-border-green bg-status-bg-green px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-status-text-green"
              title="This record streak is still ongoing"
            >
              ongoing
            </Pill>
          ) : null}
        </div>
        <div className="text-[11px] text-text-muted">{rangeText}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono tabular-nums text-lg font-semibold text-text-normal">{r.length}</div>
        {ongoingText ? <div className="text-[11px] text-text-muted">{ongoingText}</div> : null}
      </div>
    </div>
  );
}

function CatBlock({
  c,
  rows,
  currentByPlayerId,
  total,
  showAll,
  onToggleAll,
}: {
  c: StatsStreakCategory;
  rows: StatsStreakRow[];
  currentByPlayerId: ReadonlyMap<number, StatsStreakRow>;
  total: number;
  showAll: boolean;
  onToggleAll: () => void;
}) {
  const hasMore = total > 5;
  const icon = iconForCatKey(c.key);
  return (
    <div className="card-inner-flat rounded-2xl space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-normal inline-flex items-center gap-2">
            {icon ? <i className={"fa-solid " + icon.icon + " text-text-muted"} aria-hidden="true" /> : null}
            <span>{c.name}</span>
          </div>
          <div className="mt-1 text-[11px] text-text-muted">{c.description}</div>
        </div>
        {hasMore ? (
          <button
            type="button"
            className="btn-base btn-ghost inline-flex h-9 items-center justify-center px-3 py-2 text-[11px] shrink-0"
            onClick={onToggleAll}
            title={showAll ? "Show top 5" : "Show all"}
          >
            {showAll ? "Top 5" : "All"}
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {rows.length ? (
          rows.map((r) => (
            <StreakRow
              key={c.key + "-" + r.player.id + "-" + (r.start_ts ?? "") + "-" + (r.end_ts ?? "") + "-" + r.length}
              r={r}
              ongoing={currentByPlayerId.get(Number(r.player.id)) ?? null}
            />
          ))
        ) : (
          <div className="text-sm text-text-muted">No data yet.</div>
        )}
      </div>
    </div>
  );
}

export default function StreaksCard({ embedded = false }: { embedded?: boolean } = {}) {
  // Keep the players query around for cache warmup / consistency with other cards.
  useQuery({ queryKey: ["players"], queryFn: listPlayers, refetchOnReconnect: false, refetchOnWindowFocus: false });

  const [mode, setMode] = useState<StatsMode>("overall");
  const [scope, setScope] = useState<StatsScope>("tournaments");
  const [showAllByKey, setShowAllByKey] = useState<Record<string, boolean>>({});

  const FETCH_LIMIT = 200;

  const q = useQuery({
    queryKey: ["stats", "streaks", mode, FETCH_LIMIT, scope],
    queryFn: () => getStatsStreaks({ mode, playerId: null, limit: FETCH_LIMIT, scope }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const content = (
    <>
      <ErrorToastOnError error={q.error} title="Streaks loading failed" />
      <div className="card-inner-flat rounded-2xl space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <StatsFilterDataControls mode={mode} onModeChange={setMode} scope={scope} onScopeChange={setScope} />
        </div>
      </div>

      {q.isLoading && !q.data ? <InlineLoading label="Loading…" /> : null}

      {q.data ? (
        <div className="grid gap-3 lg:grid-cols-2" style={{ overflowAnchor: "none" }}>
          {(q.data.categories ?? []).map((c) => {
            const k = `records-${mode}-${scope}-${c.key}`;
            const showAll = !!showAllByKey[k];
            const total = c.records_total;
            const list = c.records;
            const rows = showAll ? list : list.slice(0, 5);
            const currentByPlayerId = new Map((c.current ?? []).map((r) => [Number(r.player.id), r]));
            return (
              <CatBlock
                key={c.key}
                c={c}
                rows={rows}
                currentByPlayerId={currentByPlayerId}
                total={total}
                showAll={showAll}
                onToggleAll={() => setShowAllByKey((prev) => ({ ...prev, [k]: !prev[k] }))}
              />
            );
          })}
        </div>
      ) : null}
    </>
  );

  if (embedded) return <div className="space-y-3">{content}</div>;

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-fire-flame-curved text-text-muted" aria-hidden="true" />
          Streaks
        </span>
      }
      defaultOpen={false}
      scrollOnOpen={true}
      variant="outer"
      bodyVariant="none"
      bodyClassName="space-y-3"
    >
      {content}
    </CollapsibleCard>
  );
}
