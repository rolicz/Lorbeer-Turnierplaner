import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";

import Button from "../ui/primitives/Button";
import { Pill, pillDate, statusPill } from "../ui/primitives/Pill";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";

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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role, token } = useAuth();
  const canWrite = role === "editor" || role === "admin";
  const pageEntered = useRouteEntryLoading();

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
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="hidden text-xl font-bold tracking-tight text-text-normal lg:block">Tournaments</h1>
          <p className="text-sm text-text-muted">{tournamentsSorted.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => void qc.invalidateQueries({ queryKey: qk.tournaments() })}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={15} />
          </Button>
          {canWrite ? (
            <Button onClick={() => navigate("/tournaments/new")} type="button">
              <Plus size={15} className="mr-1" />
              New
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tournament list */}
      <div className="space-y-2">
        {tournamentsQ.isLoading ? <div className="text-text-muted">Loading…</div> : null}
        {tournamentsSorted.length === 0 && !tournamentsQ.isLoading ? (
          <div className="rounded-xl border border-border-card-chip/40 px-4 py-8 text-center text-sm text-text-muted">
            No tournaments yet.
            {canWrite ? (
              <button
                type="button"
                className="ml-1 text-accent underline underline-offset-2"
                onClick={() => navigate("/tournaments/new")}
              >
                Create one.
              </button>
            ) : null}
          </div>
        ) : null}

        {tournamentsSorted.map((t) => {
          const st: Status = (t.status as Status) ?? "draft";
          const ui = tournamentStatusUI(st);
          const pal = tournamentPalette(st);
          const winner = winnerLabel(t);
          const tid = t.id;
          const sum = summaryByTid.get(tid);
          const seen = seenIdsByTid.get(tid) ?? new Set<number>();
          const unseenIds = (sum?.comment_ids ?? []).filter((cid) => !seen.has(cid));
          const unseenCount = unseenIds.length;
          const hasUnseen = !!token && unseenCount > 0;
          const cupStakes = t.cup_stakes ?? [];

          return (
            <Link
              key={t.id}
              to={`/live/${t.id}`}
              state={{ tournamentName: t.name, tournamentStatus: st }}
              className={cn(
                "relative block overflow-hidden rounded-xl border px-4 py-3 transition",
                pal.wrap,
              )}
            >
              <div className={`absolute left-0 top-0 h-full w-1 ${pal.bar}`} />
              <div className="pl-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-text-normal sm:text-base">
                      {t.name}
                    </div>
                  </div>
                  <Pill title="Mode">{t.mode === "2v2" ? "2v2" : "1v1"}</Pill>
                </div>

                <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {st !== "done" ? (
                      <Pill className={statusPill(st)} title={ui.label}>
                        <span>{ui.label}</span>
                      </Pill>
                    ) : null}
                    <Pill className={pillDate()} title="Date">
                      <span>{fmtDate(t.date)}</span>
                    </Pill>
                    {winner ? (
                      <Pill title="Winner">
                        <i className="fa fa-trophy mr-1 text-yellow-400" aria-hidden="true" />
                        <span className="max-w-[160px] truncate sm:max-w-[260px]">{winner}</span>
                      </Pill>
                    ) : null}
                  </div>

                  {cupStakes.length || hasUnseen ? (
                    <div className="inline-flex shrink-0 items-center justify-end gap-1.5">
                      {cupStakes.map((stake) => (
                        <CupStakePill key={stake.key} stake={stake} />
                      ))}
                      {hasUnseen ? (
                        <button
                          type="button"
                          className="inline-flex items-center"
                          title="Jump to latest unread comment"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/live/${t.id}?unread=1`, {
                              state: { tournamentName: t.name, tournamentStatus: st },
                            });
                          }}
                        >
                          <Pill title="Unread comments">
                            <i className="fa-solid fa-comment text-accent" aria-hidden="true" />
                            <span className="tabular-nums text-text-normal">{unseenCount}</span>
                          </Pill>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
