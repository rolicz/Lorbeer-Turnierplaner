import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";

import Button from "../ui/primitives/Button";
import SegmentedSwitch from "../ui/primitives/SegmentedSwitch";
import AvatarButton from "../ui/primitives/AvatarButton";
import { Pill, pillDate, statusPill } from "../ui/primitives/Pill";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import Sheet from "../ui/primitives/Sheet";

import { tournamentPalette, tournamentStatusUI } from "../ui/theme";
import { cn } from "../ui/cn";
import { cupColorVarForKey } from "../cupColors";
import { listTournaments, createTournament } from "../api/tournaments.api";
import { listPlayers } from "../api/players.api";
import { listTournamentCommentsSummary } from "../api/comments.api";
import { type TournamentSummary } from "../api/types";
import { qk } from "../api/queryKeys";
import { useAuth } from "../auth/AuthContext";
import { useSeenIdsByTournamentId } from "../hooks/useSeenComments";
import { usePlayerAvatarMap } from "../hooks/usePlayerAvatarMap";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import { fmtDate } from "../utils/format";

type Status = "draft" | "live" | "done";

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err == null) return "Unknown error";
  try { return JSON.stringify(err); } catch { return "Unknown error"; }
}

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

function CreateTournamentSheet({
  open,
  onClose,
  players,
  playersLoading,
  avatarUpdatedAtById,
}: {
  open: boolean;
  onClose: () => void;
  players: { id: number; display_name: string }[];
  playersLoading: boolean;
  avatarUpdatedAtById: Map<number, string>;
}) {
  const qc = useQueryClient();
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"1v1" | "2v2">("1v1");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!name.trim()) throw new Error("Name missing");
      if (selectedIds.length < 3) throw new Error("Select at least 3 players");
      return createTournament(token, {
        name: name.trim(),
        mode,
        player_ids: selectedIds,
        auto_generate: true,
        randomize: true,
      });
    },
    onSuccess: async () => {
      setName("");
      setSelected({});
      await qc.invalidateQueries({ queryKey: qk.tournaments() });
      onClose(); // parent calls setCreateOpen(false); error cleared via handleClose in user-close path
      setErrorMsg(null);
    },
    onError: (err: unknown) => setErrorMsg(errText(err)),
  });


  function handleClose() { setErrorMsg(null); onClose(); }

  return (
    <Sheet open={open} title="New Tournament" onClose={handleClose}>
      <div className="space-y-4 overflow-y-auto pb-6">
        {errorMsg ? (
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{errorMsg}</div>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">Name</span>
          <input
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="42. Lorbeerkranz Turnier"
            autoFocus
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">Mode</span>
          <SegmentedSwitch<"1v1" | "2v2">
            value={mode}
            onChange={setMode}
            options={[{ key: "1v1", label: "1v1" }, { key: "2v2", label: "2v2" }]}
            ariaLabel="Tournament mode"
            title="Tournament mode"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-text-muted">
            Players{selectedIds.length > 0 ? ` (${selectedIds.length} selected)` : ""}
          </span>
          {playersLoading ? (
            <div className="text-sm text-text-muted">Loading…</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {players.map((p) => (
                <AvatarButton
                  key={p.id}
                  playerId={p.id}
                  name={p.display_name}
                  updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
                  selected={!!selected[p.id]}
                  onClick={() => setSelected((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className="h-10 w-10"
                />
              ))}
            </div>
          )}
        </div>

        <Button
          className="w-full"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          type="button"
        >
          {createMut.isPending ? "Creating…" : "Create Tournament"}
        </Button>
      </div>
    </Sheet>
  );
}

export default function TournamentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role, token } = useAuth();
  const canWrite = role === "editor" || role === "admin";
  const pageEntered = useRouteEntryLoading();
  const [createOpen, setCreateOpen] = useState(false);

  const tournamentsQ = useQuery({ queryKey: qk.tournaments(), queryFn: listTournaments });
  const playersQ = useQuery({ queryKey: qk.players(), queryFn: listPlayers, enabled: canWrite });
  const summaryQ = useQuery({ queryKey: qk.commentsSummary(), queryFn: listTournamentCommentsSummary });
  const { avatarUpdatedAtById } = usePlayerAvatarMap({ enabled: canWrite });

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
    !pageEntered ||
    (!tournamentsQ.error && !tournamentsQ.data && tournamentsQ.isLoading);

  if (initialLoading) {
    return <div className="page"><PageLoadingScreen sectionCount={4} /></div>;
  }

  return (
    <div className="page">
      <ErrorToastOnError error={playersQ.error} title="Players loading failed" />
      <ErrorToastOnError error={tournamentsQ.error} title="Tournaments loading failed" />

      {canWrite ? (
        <CreateTournamentSheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          players={playersQ.data ?? []}
          playersLoading={playersQ.isLoading}
          avatarUpdatedAtById={avatarUpdatedAtById}
        />
      ) : null}

      {/* Header row */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-normal">Tournaments</h1>
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
            <Button onClick={() => setCreateOpen(true)} type="button">
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
                onClick={() => setCreateOpen(true)}
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
