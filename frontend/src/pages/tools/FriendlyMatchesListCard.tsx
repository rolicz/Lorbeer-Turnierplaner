import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";

import { listClubs } from "../../api/clubs.api";
import { deleteFriendlyMatch, listFriendlies } from "../../api/friendlies.api";
import type { Match, MatchSide, StatsPlayerMatchesTournament } from "../../api/types";
import { MatchHistoryList } from "../stats/MatchHistoryList";
import { useAuth } from "../../auth/AuthContext";

type ModeFilter = "all" | "1v1" | "2v2";

function normalizeState(state: string): "scheduled" | "playing" | "finished" {
  const s = String(state || "").trim().toLowerCase();
  if (s === "scheduled" || s === "playing" || s === "finished") return s;
  return "finished";
}

export default function FriendlyMatchesListCard() {
  const qc = useQueryClient();
  const { role, token } = useAuth();
  const canDelete = role === "admin" && !!token;
  const [mode, setMode] = useState<ModeFilter>("all");
  const [showMeta, setShowMeta] = useState(false);

  const clubsQ = useQuery({
    queryKey: ["clubs"],
    queryFn: () => listClubs(),
    staleTime: 60_000,
  });

  const friendliesQ = useQuery({
    queryKey: ["friendlies", mode],
    queryFn: () => listFriendlies({ mode: mode === "all" ? undefined : mode, limit: 500 }),
    staleTime: 10_000,
  });

  const tournaments = useMemo<StatsPlayerMatchesTournament[]>(() => {
    const rows = friendliesQ.data ?? [];
    return rows.map((f) => {
      const sides: MatchSide[] = [...(f.sides ?? [])]
        .sort((a, b) => a.side.localeCompare(b.side))
        .map((s) => ({
          id: s.id,
          side: s.side,
          players: s.players ?? [],
          club_id: s.club_id,
          goals: Number.isFinite(Number(s.goals)) ? Number(s.goals) : 0,
        }));
      const m: Match = {
        id: 2_100_000_000 + f.id,
        tournament_id: 0,
        order_index: 0,
        leg: 1,
        state: normalizeState(f.state),
        started_at: f.created_at,
        finished_at: f.updated_at,
        sides,
      };
      return {
        id: -(3_000_000 + f.id),
        name: `Friendly #${f.id}`,
        date: f.date,
        mode: f.mode,
        status: "friendly",
        matches: [m],
      };
    });
  }, [friendliesQ.data]);

  const deleteMut = useMutation({
    mutationFn: (friendlyId: number) => {
      if (!token) throw new Error("Missing token");
      return deleteFriendlyMatch(token, friendlyId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["friendlies"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const pendingDeleteId = deleteMut.variables ?? null;

  function friendlyIdFromTournamentId(tid: number): number | null {
    if (tid >= 0) return null;
    const fid = Math.abs(tid) - 3_000_000;
    return fid > 0 ? fid : null;
  }

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-list text-text-muted" aria-hidden="true" />
          All Friendlies
        </span>
      }
      defaultOpen={false}
      variant="outer"
      bodyVariant="none"
      bodyClassName="space-y-3"
    >
      <ErrorToastOnError error={friendliesQ.error} title="Friendly matches loading failed" />
      <ErrorToastOnError error={clubsQ.error} title="Clubs loading failed" />
      <ErrorToastOnError error={deleteMut.error} title="Could not delete friendly" />

      <div className="card-inner-flat rounded-2xl space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="inline-flex h-9 w-16 sm:w-20 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-filter text-[11px]" aria-hidden="true" />
              Filter
            </div>
            <SegmentedSwitch<ModeFilter>
              value={mode}
              onChange={setMode}
              options={[
                { key: "all", label: "All" },
                { key: "1v1", label: "1v1" },
                { key: "2v2", label: "2v2" },
              ]}
              ariaLabel="Friendly mode filter"
              title="Filter mode"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="inline-flex h-9 w-16 sm:w-20 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-sliders text-[11px]" aria-hidden="true" />
              View
            </div>
            <SegmentedSwitch<boolean>
              value={showMeta}
              onChange={setShowMeta}
              options={[
                { key: false, label: "Compact", icon: "fa-compress" },
                { key: true, label: "Details", icon: "fa-list" },
              ]}
              ariaLabel="Friendly details toggle"
              title="View details"
            />
          </div>
        </div>
      </div>

      {friendliesQ.isLoading && !friendliesQ.data ? (
        <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div>
      ) : null}

      {!friendliesQ.isLoading && tournaments.length === 0 ? (
        <div className="card-inner-flat rounded-2xl text-sm text-text-muted">No friendlies yet.</div>
      ) : null}

      {tournaments.length ? (
        <div style={{ overflowAnchor: "none" }}>
          <MatchHistoryList
            tournaments={tournaments}
            clubs={clubsQ.data ?? []}
            showMeta={showMeta}
            renderTournamentActions={(t) => {
              if (!canDelete) return null;
              const fid = friendlyIdFromTournamentId(t.id);
              if (!fid) return null;
              const pending = deleteMut.isPending && pendingDeleteId === fid;
              return (
                <button
                  type="button"
                  className="btn-base btn-ghost inline-flex h-8 w-8 items-center justify-center p-0"
                  title="Delete friendly"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Delete ${t.name}?`)) return;
                    deleteMut.mutate(fid);
                  }}
                >
                  <i className={"fa-solid " + (pending ? "fa-spinner fa-spin" : "fa-trash-can")} aria-hidden="true" />
                </button>
              );
            }}
          />
        </div>
      ) : null}
    </CollapsibleCard>
  );
}
