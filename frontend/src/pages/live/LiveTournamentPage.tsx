import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Card from "../../ui/primitives/Card";
import Button from "../../ui/primitives/Button";

import {
  getTournament,
  enableSecondLegAll,
  disableSecondLegAll,
  reorderTournamentMatches,
  patchTournamentStatus,
  deleteTournament,
  patchTournamentDate,
} from "../../api/tournaments.api";
import { patchMatch } from "../../api/matches.api";
import { listClubs } from "../../api/clubs.api";
import type { Match } from "../../api/types";

import { useTournamentWS } from "../../hooks/useTournamentWS";
import { useAuth } from "../../auth/AuthContext";

import AdminPanel from "./AdminPanel";
import MatchList from "./MatchList";
import MatchEditorSheet from "./MatchEditorSheet";
import StandingsTable from "./StandingsTable";
import { shuffle, sideBy } from "./helpers";

import { fmtDate } from "../../utils/format";

export default function LiveTournamentPage() {
  const { id } = useParams();
  const tid = id ? Number(id) : null;

  const qc = useQueryClient();
  const nav = useNavigate();
  const { role, token } = useAuth();

  const isAdmin = role === "admin";
  const canEditMatch = role === "editor" || role === "admin";

  const tQ = useQuery({
    queryKey: ["tournament", tid],
    queryFn: () => getTournament(tid!),
    enabled: !!tid,
  });

  // keep tournament in sync
  useTournamentWS(tid);

  const matchesSorted = useMemo(() => {
    const ms = tQ.data?.matches ?? [];
    return ms.slice().sort((a, b) => a.order_index - b.order_index);
  }, [tQ.data]);

  const secondLegEnabled = useMemo(() => {
    return (tQ.data?.matches ?? []).some((m) => m.leg === 2);
  }, [tQ.data]);

  // --- admin/editor mutations ---
  const enableLegMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return enableSecondLegAll(token, tid);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
    },
  });

  const disableLegMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return disableSecondLegAll(token, tid);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
    },
  });

  const reorderMut = useMutation({
    mutationFn: async (newOrderIds: number[]) => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return reorderTournamentMatches(token, tid, newOrderIds);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
    },
  });

  const statusMut = useMutation({
    mutationFn: async (status: "draft" | "live" | "done") => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return patchTournamentStatus(token, tid, status);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
      await qc.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return deleteTournament(token, tid);
    },
    onSuccess: async () => {
      nav("/tournaments");
      await qc.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });

  // --- date (admin only) ---
  const [editDate, setEditDate] = useState("");

  useEffect(() => {
    if (tQ.data?.date) setEditDate(tQ.data.date);
  }, [tQ.data?.date]);

  const dateMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return patchTournamentDate(token, tid, editDate);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
      await qc.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });

  // --- editor sheet state (match editing) ---
  const [open, setOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  const selectedMatch = useMemo(
    () => matchesSorted.find((m) => m.id === selectedMatchId) || null,
    [matchesSorted, selectedMatchId]
  );

  const [clubGame, setClubGame] = useState("EA FC 26");
  const [clubSearch, setClubSearch] = useState("");

  const clubsQ = useQuery({
    queryKey: ["clubs", clubGame],
    queryFn: () => listClubs(clubGame),
    enabled: !!tid,
  });

  const clubsFiltered = useMemo(() => {
    const clubs = clubsQ.data ?? [];
    const q = clubSearch.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter((c) => c.name.toLowerCase().includes(q));
  }, [clubsQ.data, clubSearch]);

  const clubById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of clubsQ.data ?? []) {
      const stars =
        typeof c.star_rating === "number"
          ? c.star_rating.toFixed(1).replace(/\.0$/, "")
          : String(c.star_rating);
      m.set(c.id, `${c.name} (${stars}★)`);
    }
    return m;
  }, [clubsQ.data]);

  const clubLabel = (id: number | null | undefined) => {
    if (!id) return "—";
    return clubById.get(id) ?? `#${id}`;
  };

  const [aClub, setAClub] = useState<number | null>(null);
  const [bClub, setBClub] = useState<number | null>(null);
  const [aGoals, setAGoals] = useState("0");
  const [bGoals, setBGoals] = useState("0");
  const [state, setState] = useState<"scheduled" | "playing" | "finished">("scheduled");

  function openEditor(m: Match) {
    setSelectedMatchId(m.id);
    const a = sideBy(m, "A");
    const b = sideBy(m, "B");
    setAClub(a?.club_id ?? null);
    setBClub(b?.club_id ?? null);
    setAGoals(String(a?.goals ?? 0));
    setBGoals(String(b?.goals ?? 0));
    setState(m.state);
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!selectedMatchId) throw new Error("No match selected");
      return patchMatch(token, selectedMatchId, {
        state,
        sideA: { club_id: aClub, goals: Number(aGoals) },
        sideB: { club_id: bClub, goals: Number(bGoals) },
      });
    },
    onSuccess: async () => {
      setOpen(false);
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
    },
  });

  const [adminError, setAdminError] = useState<string | null>(null);

  // ✅ Hooks are done above. Now we can early-return.
  if (!tid) return <Card title="Live">Invalid tournament id</Card>;

  return (
    <div className="space-y-4">
      <Card title={`Live Tournament #${tid}`}>
        {tQ.isLoading && <div className="text-zinc-400">Loading…</div>}
        {tQ.error && <div className="text-red-400 text-sm">{String(tQ.error)}</div>}

        {tQ.data && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-lg font-semibold">{tQ.data.name}</div>
                <div className="text-sm text-zinc-400">
                  {tQ.data.mode} · {tQ.data.status} · {fmtDate(tQ.data.date)}
                </div>
              </div>
              <Button variant="ghost" onClick={() => tQ.refetch()}>
                Refetch
              </Button>
            </div>

            {isAdmin && (
              <AdminPanel
                secondLegEnabled={secondLegEnabled}
                busy={
                  enableLegMut.isPending ||
                  disableLegMut.isPending ||
                  reorderMut.isPending ||
                  statusMut.isPending ||
                  deleteMut.isPending ||
                  dateMut.isPending
                }
                error={adminError}
                onSetLive={() => {
                  setAdminError(null);
                  statusMut.mutate("live", {
                    onError: (e: any) => setAdminError(e?.message ?? String(e)),
                  });
                }}
                onFinalize={() => {
                  setAdminError(null);
                  statusMut.mutate("done", {
                    onError: (e: any) => setAdminError(e?.message ?? String(e)),
                  });
                }}
                onSetDraft={() => {
                  setAdminError(null);
                  statusMut.mutate("draft", {
                    onError: (e: any) => setAdminError(e?.message ?? String(e)),
                  });
                }}
                onEnableSecondLeg={() => {
                  setAdminError(null);
                  enableLegMut.mutate(undefined, {
                    onError: (e: any) => setAdminError(e?.message ?? String(e)),
                  });
                }}
                onDisableSecondLeg={() => {
                  const ok = window.confirm(
                    "Remove second leg? (Only works if second leg has not started, unless admin.)"
                  );
                  if (!ok) return;
                  setAdminError(null);
                  disableLegMut.mutate(undefined, {
                    onError: (e: any) => setAdminError(e?.message ?? String(e)),
                  });
                }}
                onReshuffle={() => {
                  setAdminError(null);
                  const ids = matchesSorted.map((m) => m.id);
                  reorderMut.mutate(shuffle(ids), {
                    onError: (e: any) => setAdminError(e?.message ?? String(e)),
                  });
                }}
                onDeleteTournament={() => {
                  setAdminError(null);
                  const ok = window.confirm("Delete this tournament permanently? This cannot be undone.");
                  if (!ok) return;
                  deleteMut.mutate(undefined, {
                    onError: (e: any) => setAdminError(e?.message ?? String(e)),
                  });
                }}
                // admin-only date editor
                dateValue={editDate}
                onDateChange={setEditDate}
                onSaveDate={() => {
                  setAdminError(null);
                  dateMut.mutate(undefined, {
                    onError: (e: any) => setAdminError(e?.message ?? String(e)),
                  });
                }}
                dateBusy={dateMut.isPending}
              />
            )}

            <StandingsTable matches={matchesSorted} players={tQ.data.players ?? []} />

            <MatchList
              matches={matchesSorted}
              canEdit={canEditMatch}
              isAdmin={isAdmin}
              busyReorder={reorderMut.isPending}
              onEditMatch={openEditor}
              onMoveUp={(matchId) => {
                const idx = matchesSorted.findIndex((x) => x.id === matchId);
                if (idx <= 0) return;
                const ids = matchesSorted.map((x) => x.id);
                [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                reorderMut.mutate(ids);
              }}
              onMoveDown={(matchId) => {
                const idx = matchesSorted.findIndex((x) => x.id === matchId);
                if (idx < 0 || idx >= matchesSorted.length - 1) return;
                const ids = matchesSorted.map((x) => x.id);
                [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
                reorderMut.mutate(ids);
              }}
              clubLabel={clubLabel}
            />

            {!canEditMatch && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 px-3 py-2 text-sm text-zinc-400">
                Login for write access to enter results.
              </div>
            )}
          </div>
        )}
      </Card>

      <MatchEditorSheet
        open={open}
        onClose={() => setOpen(false)}
        match={selectedMatch}
        clubs={clubsFiltered}
        clubsLoading={clubsQ.isLoading}
        clubsError={clubsQ.error ? String(clubsQ.error) : null}
        clubGame={clubGame}
        clubSearch={clubSearch}
        setClubGame={setClubGame}
        setClubSearch={setClubSearch}
        aClub={aClub}
        bClub={bClub}
        setAClub={setAClub}
        setBClub={setBClub}
        aGoals={aGoals}
        bGoals={bGoals}
        setAGoals={setAGoals}
        setBGoals={setBGoals}
        state={state}
        setState={setState}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
        saveError={saveMut.error ? String(saveMut.error) : null}
      />
    </div>
  );
}
