import { useMemo, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { List as ListIcon, Plus } from "lucide-react";

import { Pill } from "../ui/primitives/Pill";
import { List, ListRow } from "../ui/primitives/List";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import NewTournamentForm from "./tournaments/NewTournamentForm";

import { tournamentPalette, tournamentStatusUI } from "../ui/theme";
import { cn } from "../ui/cn";
import { cupColorVarForKey } from "../cupColors";
import { listTournaments } from "../api/tournaments.api";
import { listTournamentCommentsSummary } from "../api/comments.api";
import { type TournamentSummary } from "../api/types";
import { qk } from "../api/queryKeys";
import { useAuth } from "../auth/AuthContext";
import { useSeenIdsByTournamentId } from "../hooks/useSeenComments";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import { fmtDate } from "../utils/format";

type Status = "draft" | "live" | "done";

function winnerLabel(t: TournamentSummary): string | null {
  if (t.winner_string) return t.winner_string;
  if (t.winner_decider_string) return `${t.winner_decider_string} (decider)`;
  return null;
}

function CupStakePill({ stake }: { stake: NonNullable<TournamentSummary["cup_stakes"]>[number] }) {
  const varName = cupColorVarForKey(stake.key);
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium leading-none"
      style={{
        borderColor: `rgb(var(${varName}) / 0.55)`,
        backgroundColor: `rgb(var(${varName}) / 0.14)`,
        color: `rgb(var(${varName}))`,
      }}
      title={`${stake.name} at stake`}
    >
      <i className="fa-solid fa-crown" aria-hidden="true" />
    </span>
  );
}

export default function TournamentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, token } = useAuth();
  const canWrite = role === "editor" || role === "admin";
  const pageEntered = useRouteEntryLoading();

  type TTab = "all" | "new";
  const tab: TTab = canWrite && searchParams.get("tab") === "new" ? "new" : "all";
  const setTab = (t: TTab) => {
    const n = new URLSearchParams(searchParams);
    if (t === "new") n.set("tab", "new");
    else n.delete("tab");
    setSearchParams(n, { replace: true });
  };
  const tabs: SectionTab<TTab>[] = [
    { key: "all", label: "All tournaments", icon: <ListIcon size={14} /> },
    ...(canWrite ? [{ key: "new" as TTab, label: "New tournament", icon: <Plus size={14} /> }] : []),
  ];

  const tournamentsQ = useQuery({ queryKey: qk.tournaments(), queryFn: listTournaments });
  const summaryQ = useQuery({ queryKey: qk.commentsSummary(), queryFn: listTournamentCommentsSummary });

  const tournamentsSorted = useMemo(() => {
    const ts = tournamentsQ.data ?? [];
    const key = (t: TournamentSummary): number => {
      const d = t.date ? `${t.date}T00:00:00` : (t.created_at ?? null);
      const ms = d ? new Date(d).getTime() : 0;
      return Number.isFinite(ms) ? ms : 0;
    };
    return ts.slice().sort((a, b) => {
      const da = key(a); const db = key(b);
      if (db !== da) return db - da;
      return b.id - a.id;
    });
  }, [tournamentsQ.data]);

  const tournamentIds = useMemo(() => tournamentsSorted.map((t) => t.id), [tournamentsSorted]);
  const seenIdsByTid = useSeenIdsByTournamentId(tournamentIds);

  // Group the (date-desc) list by month for subheaders.
  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; items: TournamentSummary[] }[] = [];
    for (const t of tournamentsSorted) {
      const d = t.date ? new Date(`${t.date}T00:00:00`) : null;
      const valid = d && Number.isFinite(d.getTime());
      const key = valid ? `${d.getFullYear()}-${d.getMonth()}` : "undated";
      const label = valid ? d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Undated";
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(t);
      else groups.push({ key, label, items: [t] });
    }
    return groups;
  }, [tournamentsSorted]);

  const summaryByTid = useMemo(() => {
    const m = new Map<number, { comment_ids: number[]; total_comments: number }>();
    for (const r of summaryQ.data ?? []) {
      m.set(r.tournament_id, { comment_ids: r.comment_ids ?? [], total_comments: r.total_comments });
    }
    return m;
  }, [summaryQ.data]);

  const initialLoading =
    !pageEntered || (!tournamentsQ.error && !tournamentsQ.data && tournamentsQ.isLoading);

  if (initialLoading) {
    return <div className="page"><PageLoadingScreen sectionCount={4} /></div>;
  }

  return (
    <div className="page">
      <ErrorToastOnError error={tournamentsQ.error} title="Tournaments loading failed" />

      {/* Header */}
      <div className="mb-4 hidden lg:block">
        <h1 className="text-xl font-bold tracking-tight text-text-normal">Tournaments</h1>
      </div>

      <SectionTabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === "new" && canWrite ? (
        <NewTournamentForm onCancel={() => setTab("all")} />
      ) : tournamentsSorted.length === 0 && !tournamentsQ.isLoading ? (
        <div className="px-4 py-12 text-center text-sm text-text-muted">
          No tournaments yet.
          {canWrite ? (
            <button
              type="button"
              className="ml-1 text-accent underline underline-offset-2"
              onClick={() => setTab("new")}
            >
              Create one.
            </button>
          ) : null}
        </div>
      ) : (
        <div className="stack">
          {monthGroups.map((g) => (
            <div key={g.key}>
              <div className="section-head"><span className="section-label">{g.label}</span></div>
              <List>
                {g.items.map((t) => {
            const st: Status = (t.status as Status) ?? "draft";
            const ui = tournamentStatusUI(st);
            const pal = tournamentPalette(st);
            const winner = winnerLabel(t);
            const sum = summaryByTid.get(t.id);
            const seen = seenIdsByTid.get(t.id) ?? new Set<number>();
            const unseenCount = (sum?.comment_ids ?? []).filter((cid) => !seen.has(cid)).length;
            const hasUnseen = !!token && unseenCount > 0;
            const cupStakes = t.cup_stakes ?? [];
            const participants = t.participants ?? [];

            const meta: ReactNode[] = [];
            if (st === "live") meta.push(<span className="font-medium text-emerald-400">{ui.label}</span>);
            else if (st !== "done") meta.push(<span>{ui.label}</span>);
            meta.push(<span>{fmtDate(t.date)}</span>);
            meta.push(<span>{t.mode === "2v2" ? "2v2" : "1v1"}</span>);
            if (winner)
              meta.push(
                <span className="inline-flex items-center gap-1 text-text-normal">
                  <i className="fa fa-trophy text-yellow-400" aria-hidden="true" />
                  <span className="max-w-[150px] truncate sm:max-w-[260px]">{winner}</span>
                </span>,
              );

            return (
              <ListRow
                key={t.id}
                to={`/live/${t.id}`}
                state={{ tournamentName: t.name, tournamentStatus: st }}
                ariaLabel={t.name}
                chevron={false}
                leading={<span className={cn("block self-stretch w-1 shrink-0 rounded-full min-h-10", pal.bar)} aria-hidden="true" />}
                trailing={
                  cupStakes.length || hasUnseen ? (
                    <>
                      {cupStakes.map((stake) => (
                        <CupStakePill key={stake.key} stake={stake} />
                      ))}
                      {hasUnseen ? (
                        <button
                          type="button"
                          title="Jump to latest unread comment"
                          onClick={() =>
                            navigate(`/live/${t.id}?unread=1`, {
                              state: { tournamentName: t.name, tournamentStatus: st },
                            })
                          }
                        >
                          <Pill title="Unread comments">
                            <i className="fa-solid fa-comment text-accent" aria-hidden="true" />
                            <span className="tabular-nums text-text-normal">{unseenCount}</span>
                          </Pill>
                        </button>
                      ) : null}
                    </>
                  ) : undefined
                }
              >
                <span className="block truncate text-[15px] font-semibold text-text-normal">{t.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center text-xs text-text-muted">
                  {meta.map((node, i) => (
                    <span key={i} className="inline-flex items-center">
                      {i > 0 ? <span className="mx-1.5 text-text-muted/40">·</span> : null}
                      {node}
                    </span>
                  ))}
                </span>
                {participants.length > 0 ? (
                  <span className="mt-0.5 block truncate text-[11px] text-text-muted/60">
                    {participants.map((p) => p.display_name).join(", ")}
                  </span>
                ) : null}
              </ListRow>
            );
                })}
              </List>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
