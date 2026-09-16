import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Crown, List as ListIcon, MessageSquare, Plus, Trophy } from "lucide-react";

import { Pill } from "../ui/primitives/Pill";
import { List, ListRow } from "../ui/primitives/List";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import NewTournamentForm from "./tournaments/NewTournamentForm";

import PageLayout from "../ui/layout/PageLayout";
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
import { useTabParam } from "../ui/shell/useTabParam";
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
      <Crown size={14} strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

type TTab = "all" | "new";
const T_TAB_KEYS = ["all", "new"] as const satisfies readonly TTab[];

export default function TournamentsPage() {
  const navigate = useNavigate();
  const { role, token } = useAuth();
  const canWrite = role === "editor" || role === "admin";
  const pageEntered = useRouteEntryLoading();

  // The "new" tab needs editor rights; a stale/hand-typed deep link falls back to
  // "all" *and* loses the param, so nothing remembers it (A9).
  const [tab, setTab] = useTabParam<TTab>(T_TAB_KEYS, "all", "tab", {
    allowed: canWrite ? T_TAB_KEYS : (["all"] as const),
  });
  const tabs: SectionTab<TTab>[] = [
    { key: "all", label: "All tournaments", icon: <ListIcon size={14} /> },
    ...(canWrite ? [{ key: "new" as TTab, label: "New tournament", icon: <Plus size={14} /> }] : []),
  ];

  const tournamentsQ = useQuery({ queryKey: qk.tournaments(), queryFn: () => listTournaments(token) });
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
    return <PageLayout><PageLoadingScreen sectionCount={4} /></PageLayout>;
  }

  return (
    <PageLayout title="Tournaments">
      <ErrorToastOnError error={tournamentsQ.error} title="Tournaments loading failed" />

      <SectionTabs tabs={tabs} active={tab} onChange={setTab} />

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
        <div className="flex flex-col gap-5">
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
            if (st === "live") meta.push(<span className="font-medium text-status-text-green">{ui.label}</span>);
            else if (st !== "done") meta.push(<span>{ui.label}</span>);
            meta.push(<span>{fmtDate(t.date)}</span>);
            meta.push(<span>{t.mode === "2v2" ? "2v2" : "1v1"}</span>);
            if (winner)
              meta.push(
                <span className="inline-flex items-center gap-1 text-text-normal">
                  <Trophy size={12} className="shrink-0 text-gradient-gold-from" aria-hidden="true" />
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
                            <MessageSquare size={12} className="text-accent" aria-hidden="true" />
                            <span className="tabular-nums text-text-normal">{unseenCount}</span>
                          </Pill>
                        </button>
                      ) : null}
                    </>
                  ) : undefined
                }
              >
                <span className="block truncate text-base font-semibold text-text-normal">{t.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center text-xs text-text-muted">
                  {meta.map((node, i) => (
                    <span key={i} className="inline-flex items-center">
                      {/* A separator is spacing, not a third tone: it inherits the meta
                          line's own `text-text-muted` (R3). */}
                      {i > 0 ? <span className="mx-1.5">·</span> : null}
                      {node}
                    </span>
                  ))}
                </span>
                {participants.length > 0 ? (
                  <span className="mt-0.5 block truncate text-xs text-text-muted">
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
    </PageLayout>
  );
}
