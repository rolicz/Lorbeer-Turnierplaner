import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";

import { listPlayers } from "../../api/players.api";
import { getStatsStreaks } from "../../api/stats.api";
import type { StatsStreakCategory, StatsStreakRow } from "../../api/types";

type Mode = "overall" | "1v1" | "2v2";
type View = "records" | "current";

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function ModeSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const idx = value === "overall" ? 0 : value === "1v1" ? 1 : 2;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Filter mode"
      title="Filter: Overall / 1v1 / 2v2"
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
          { k: "overall" as const, label: "Overall", icon: "fa-layer-group" },
          { k: "1v1" as const, label: "1v1", icon: "fa-user" },
          { k: "2v2" as const, label: "2v2", icon: "fa-users" },
        ] as const
      ).map((x) => (
        <button
          key={x.k}
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

function ViewSwitch({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  // Current is the default, left-side view.
  const idx = value === "current" ? 0 : 1;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="View"
      title="View: Current or records"
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
          { k: "current" as const, label: "Current", icon: "fa-clock" },
          { k: "records" as const, label: "Records", icon: "fa-trophy" },
        ] as const
      ).map((x) => (
        <button
          key={x.k}
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

function StreakRow({ r, view }: { r: StatsStreakRow; view: View }) {
  const start = fmtDate(r.start_ts);
  const end = fmtDate(r.end_ts);
  const rangeText =
    view === "current"
      ? (start ? `since ${start}` : "")
      : (start && end ? `${start} → ${end}` : (start || end ? (start || end) : ""));

  return (
    <div className="panel-subtle flex items-center justify-between gap-3 rounded-xl px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text-normal">{r.player.display_name}</div>
        <div className="text-[11px] text-text-muted">{rangeText}</div>
      </div>
      <div className="shrink-0 font-mono tabular-nums text-lg font-semibold text-text-normal">{r.length}</div>
    </div>
  );
}

function CatBlock({
  c,
  rows,
  total,
  showAll,
  onToggleAll,
  view,
}: {
  c: StatsStreakCategory;
  rows: StatsStreakRow[];
  total: number;
  showAll: boolean;
  onToggleAll: () => void;
  view: View;
}) {
  const hasMore = total > 5;
  return (
    <div className="card-inner-flat rounded-2xl space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-normal">{c.name}</div>
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
            <StreakRow key={c.key + "-" + r.player.id + "-" + (r.start_ts ?? "") + "-" + (r.end_ts ?? "") + "-" + r.length} r={r} view={view} />
          ))
        ) : (
          <div className="text-sm text-text-muted">No data yet.</div>
        )}
      </div>
    </div>
  );
}

export default function StreaksCard() {
  // Keep the players query around for cache warmup / consistency with other cards.
  useQuery({ queryKey: ["players"], queryFn: listPlayers });

  const [mode, setMode] = useState<Mode>("overall");
  const [view, setView] = useState<View>("current");
  const [showAllByKey, setShowAllByKey] = useState<Record<string, boolean>>({});

  const FETCH_LIMIT = 200;
  const q = useQuery({
    queryKey: ["stats", "streaks", mode, FETCH_LIMIT],
    queryFn: () => getStatsStreaks({ mode, playerId: null, limit: FETCH_LIMIT }),
    staleTime: 0,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

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
      <div className="card-inner-flat rounded-2xl space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-filter text-[11px]" aria-hidden="true" />
              <span>Filter</span>
            </span>
            <ModeSwitch value={mode} onChange={setMode} />
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-eye text-[11px]" aria-hidden="true" />
              <span>View</span>
            </span>
            <ViewSwitch value={view} onChange={setView} />
          </div>
        </div>
      </div>

      {q.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}
      {q.error ? <div className="card-inner-flat rounded-2xl text-sm text-red-400">{String(q.error)}</div> : null}

      {q.data ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {(q.data.categories ?? []).map((c) => {
            const k = `${view}-${mode}-${c.key}`;
            const showAll = !!showAllByKey[k];
            const total = view === "records" ? c.records_total : c.current_total;
            const list = view === "records" ? c.records : c.current;
            const rows = showAll ? list : list.slice(0, 5);
            return (
              <CatBlock
                key={c.key}
                c={c}
                rows={rows}
                total={total}
                showAll={showAll}
                onToggleAll={() => setShowAllByKey((prev) => ({ ...prev, [k]: !prev[k] }))}
                view={view}
              />
            );
          })}
        </div>
      ) : null}
    </CollapsibleCard>
  );
}
