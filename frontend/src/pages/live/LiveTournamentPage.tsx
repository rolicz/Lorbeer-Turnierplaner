import { useEffect, useMemo, useState } from "react";
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
  patchTournamentDecider, // must exist in your tournaments.api.ts
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

type PlayerLite = { id: number; display_name: string };

type StandRow = {
  playerId: number;
  name: string;
  pts: number;
  gd: number;
  gf: number;
};

// finished-only standings for “is draw at top?”
function computeFinishedStandings(matches: Match[], players: PlayerLite[]): StandRow[] {
  const rows = new Map<number, StandRow>();
  for (const p of players) rows.set(p.id, { playerId: p.id, name: p.display_name, pts: 0, gd: 0, gf: 0 });

  const counted = matches.filter((m) => m.state === "finished");

  for (const m of counted) {
    const a = sideBy(m, "A");
    const b = sideBy(m, "B");
    if (!a || !b) continue;

    const aGoals = Number(a.goals ?? 0);
    const bGoals = Number(b.goals ?? 0);

    const aWin = aGoals > bGoals;
    const bWin = bGoals > aGoals;
    const draw = aGoals === bGoals;

    for (const p of a.players) {
      const r = rows.get(p.id) ?? { playerId: p.id, name: p.display_name, pts: 0, gd: 0, gf: 0 };
      rows.set(p.id, r);
      r.gf += aGoals;
      r.gd += aGoals - bGoals;
      if (aWin) r.pts += 3;
      else if (draw) r.pts += 1;
    }

    for (const p of b.players) {
      const r = rows.get(p.id) ?? { playerId: p.id, name: p.display_name, pts: 0, gd: 0, gf: 0 };
      rows.set(p.id, r);
      r.gf += bGoals;
      r.gd += bGoals - aGoals;
      if (bWin) r.pts += 3;
      else if (draw) r.pts += 1;
    }
  }

  const out = Array.from(rows.values());
  out.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.name.localeCompare(y.name);
  });
  return out;
}

function starsLabel(v: any): string {
  if (typeof v === "number") return v.toFixed(1).replace(/\.0$/, "");
  const n = Number(v);
  if (Number.isFinite(n)) return n.toFixed(1).replace(/\.0$/, "");
  return String(v ?? "");
}




export default function LiveTournamentPage() {
  const { id } = useParams();
  const tid = id ? Number(id) : null;

  const qc = useQueryClient();
  const nav = useNavigate();
  const { role, token } = useAuth();

  const isAdmin = role === "admin";
  const isEditorOrAdmin = role === "editor" || role === "admin";

  const tQ = useQuery({
    queryKey: ["tournament", tid],
    queryFn: () => getTournament(tid!),
    enabled: !!tid,
  });

  useTournamentWS(tid);

  const status = tQ.data?.status ?? "draft";
  const isDone = status === "done";

  const matchesSorted = useMemo(() => {
    const ms = tQ.data?.matches ?? [];
    return ms.slice().sort((a, b) => a.order_index - b.order_index);
  }, [tQ.data]);

  const secondLegEnabled = useMemo(() => {
    return (tQ.data?.matches ?? []).some((m) => m.leg === 2);
  }, [tQ.data]);

  // --- decider fields from backend (names must match your backend response) ---
  const decider = useMemo(() => {
    const t: any = tQ.data ?? {};
    return {
      type: (t.decider_type ?? "none") as "none" | "penalties" | "match",
      winner_player_id: (t.decider_winner_player_id ?? null) as number | null,
      loser_player_id: (t.decider_loser_player_id ?? null) as number | null,
      winner_goals: (t.decider_winner_goals ?? null) as number | null,
      loser_goals: (t.decider_loser_goals ?? null) as number | null,
    };
  }, [tQ.data]);

  // finished-only top draw candidates
  const topDrawInfo = useMemo(() => {
    const players = (tQ.data?.players ?? []) as PlayerLite[];
    if (!tQ.data || !players.length) return { isTopDraw: false, candidates: [] as { id: number; name: string }[] };

    const rows = computeFinishedStandings(matchesSorted, players);
    if (!rows.length) return { isTopDraw: false, candidates: [] as { id: number; name: string }[] };

    const top = rows[0];
    const tied = rows.filter((r) => r.pts === top.pts && r.gd === top.gd && r.gf === top.gf);
    const candidates = tied.map((r) => ({ id: r.playerId, name: r.name }));
    return { isTopDraw: candidates.length >= 2, candidates };
  }, [tQ.data, matchesSorted]);

  // Readers should be able to SEE a decider if it exists, OR if it’s a draw and needs one.
  const showDeciderReadOnly = useMemo(() => {
    if (!isDone) return false;
    if (decider.type !== "none") return true;
    return topDrawInfo.isTopDraw;
  }, [isDone, decider.type, topDrawInfo.isTopDraw]);

  // Editor+admin can edit decider only when done + top draw (your requested rule)
  const showDeciderEditor = isDone && topDrawInfo.isTopDraw;

  const playerNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of (tQ.data?.players ?? []) as PlayerLite[]) m.set(p.id, p.display_name);
    return m;
  }, [tQ.data?.players]);

  const deciderSummary = useMemo(() => {
    if (!showDeciderReadOnly) return null;
    if (decider.type === "none") return "No decider (kept as draw).";


    const w = decider.winner_player_id ? playerNameById.get(decider.winner_player_id) ?? `#${decider.winner_player_id}` : "—";
    const l = decider.loser_player_id ? playerNameById.get(decider.loser_player_id) ?? `#${decider.loser_player_id}` : "—";
    const score =
      decider.winner_goals != null && decider.loser_goals != null ? `${decider.winner_goals}-${decider.loser_goals}` : "—";
    return `${decider.type.charAt(0).toUpperCase() + decider.type.slice(1)}: ${w} ${score} ${l}`;
  }, [showDeciderReadOnly, decider, playerNameById]);


  // --- mutations ---
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
    mutationFn: async (newStatus: "draft" | "live" | "done") => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return patchTournamentStatus(token, tid, newStatus);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
      await qc.invalidateQueries({ queryKey: ["tournaments"] });
      await qc.invalidateQueries({ queryKey: ["cup"] }).catch(() => {});
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
      await qc.invalidateQueries({ queryKey: ["cup"] }).catch(() => {});
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
      await qc.invalidateQueries({ queryKey: ["cup"] }).catch(() => {});
    },
  });

  // --- decider patch (editor+admin) ---
  const deciderMut = useMutation({
    mutationFn: async (body: {
      type: "none" | "penalties" | "match";
      winner_player_id: number | null;
      loser_player_id: number | null;
      winner_goals: number | null;
      loser_goals: number | null;
    }) => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return patchTournamentDecider(token, tid, body);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
      await qc.invalidateQueries({ queryKey: ["tournaments"] });
      await qc.invalidateQueries({ queryKey: ["cup"] }).catch(() => {});
    },
  });

  // --- clubs ---
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
      m.set(c.id, `${c.name} (${starsLabel(c.star_rating)}★)`);
    }
    return m;
  }, [clubsQ.data]);

  const clubLabel = (clubId: number | null | undefined) => {
    if (!clubId) return "—";
    return clubById.get(clubId) ?? `#${clubId}`;
  };

  // --- match editor sheet ---
  const [open, setOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const selectedMatch = useMemo(
    () => matchesSorted.find((m) => m.id === selectedMatchId) || null,
    [matchesSorted, selectedMatchId]
  );

  const canEditMatch = isEditorOrAdmin && !isDone;

  const [aClub, setAClub] = useState<number | null>(null);
  const [bClub, setBClub] = useState<number | null>(null);
  const [aGoals, setAGoals] = useState("0");
  const [bGoals, setBGoals] = useState("0");
  const [mState, setMState] = useState<"scheduled" | "playing" | "finished">("scheduled");

  function openEditor(m: Match) {
    setSelectedMatchId(m.id);
    const a = sideBy(m, "A");
    const b = sideBy(m, "B");
    setAClub(a?.club_id ?? null);
    setBClub(b?.club_id ?? null);
    setAGoals(String(a?.goals ?? 0));
    setBGoals(String(b?.goals ?? 0));
    setMState(m.state);
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!selectedMatchId) throw new Error("No match selected");
      return patchMatch(token, selectedMatchId, {
        state: mState,
        sideA: { club_id: aClub, goals: Number(aGoals) },
        sideB: { club_id: bClub, goals: Number(bGoals) },
      });
    },
    onSuccess: async () => {
      setOpen(false);
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
      await qc.invalidateQueries({ queryKey: ["cup"] }).catch(() => {});
    },
  });

  const [panelError, setPanelError] = useState<string | null>(null);

  if (!tid) return <Card title="Live">Invalid tournament id</Card>;

  const showControls = isEditorOrAdmin; // readers don’t see the control panel

  const canReorder = isEditorOrAdmin && !isDone;

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

            {/* Read-only decider card (visible to everyone) */}
            {showDeciderReadOnly && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-base font-semibold">Decider</div>
                <div className="mt-1 text-sm text-zinc-300">{deciderSummary}</div>
                {decider.type === "none" && topDrawInfo.isTopDraw && (
                  <div className="mt-1 text-xs text-zinc-500">
                    Tournament ended tied at the top. A decider can be set (penalties or deciding match).
                  </div>
                )}
              </div>
            )}

            {/* Control panel (editor+admin only) */}
            {showControls && (
              <AdminPanel
                role={role}
                status={tQ.data.status}
                secondLegEnabled={secondLegEnabled}
                busy={
                  enableLegMut.isPending ||
                  disableLegMut.isPending ||
                  reorderMut.isPending ||
                  statusMut.isPending ||
                  deleteMut.isPending ||
                  dateMut.isPending ||
                  deciderMut.isPending
                }
                error={panelError}
                onSetLive={() => {
                  setPanelError(null);
                  statusMut.mutate("live", { onError: (e: any) => setPanelError(e?.message ?? String(e)) });
                }}
                onFinalize={() => {
                  setPanelError(null);
                  statusMut.mutate("done", { onError: (e: any) => setPanelError(e?.message ?? String(e)) });
                }}
                onSetDraft={() => {
                  setPanelError(null);
                  statusMut.mutate("draft", { onError: (e: any) => setPanelError(e?.message ?? String(e)) });
                }}
                onEnableSecondLeg={() => {
                  setPanelError(null);
                  enableLegMut.mutate(undefined, { onError: (e: any) => setPanelError(e?.message ?? String(e)) });
                }}
                onDisableSecondLeg={() => {
                  setPanelError(null);
                  disableLegMut.mutate(undefined, { onError: (e: any) => setPanelError(e?.message ?? String(e)) });
                }}
                onReshuffle={() => {
                  setPanelError(null);
                  const ids = matchesSorted.map((m) => m.id);
                  reorderMut.mutate(shuffle(ids), { onError: (e: any) => setPanelError(e?.message ?? String(e)) });
                }}
                onDeleteTournament={() => {
                  if (!isAdmin) return;
                  const ok = window.confirm("Delete tournament permanently?");
                  if (!ok) return;
                  setPanelError(null);
                  deleteMut.mutate(undefined, { onError: (e: any) => setPanelError(e?.message ?? String(e)) });
                }}
                // date editor: admin only
                dateValue={isAdmin ? editDate : undefined}
                onDateChange={isAdmin ? setEditDate : undefined}
                onSaveDate={isAdmin ? () => dateMut.mutate() : undefined}
                dateBusy={dateMut.isPending}
                // decider editor: editor+admin
                showDeciderEditor={showDeciderEditor}
                deciderCandidates={topDrawInfo.candidates}
                currentDecider={decider}
                onSaveDecider={
                  isEditorOrAdmin
                    ? (body) => {
                        setPanelError(null);
                        deciderMut.mutate(body, { onError: (e: any) => setPanelError(e?.message ?? String(e)) });
                      }
                    : undefined
                }
                deciderBusy={deciderMut.isPending}
              />
            )}

            <StandingsTable matches={matchesSorted} players={tQ.data.players} />

            <MatchList
              matches={matchesSorted}
              canEdit={canEditMatch}
              canReorder={canReorder}
              busyReorder={reorderMut.isPending}
              onEditMatch={openEditor}
              onMoveUp={(matchId) => {
                if (!canReorder) return;
                const idx = matchesSorted.findIndex((x) => x.id === matchId);
                if (idx <= 0) return;
                const ids = matchesSorted.map((x) => x.id);
                [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                reorderMut.mutate(ids);
              }}
              onMoveDown={(matchId) => {
                if (!canReorder) return;
                const idx = matchesSorted.findIndex((x) => x.id === matchId);
                if (idx < 0 || idx >= matchesSorted.length - 1) return;
                const ids = matchesSorted.map((x) => x.id);
                [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
                reorderMut.mutate(ids);
              }}
              clubLabel={clubLabel}
            />

            {!canEditMatch && role !== "reader" && isDone && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 px-3 py-2 text-sm text-zinc-400">
                Tournament is done. Matches are read-only.
              </div>
            )}

            {!isEditorOrAdmin && (
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
        state={mState}
        setState={setMState}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
        saveError={saveMut.error ? String(saveMut.error) : null}
      />
    </div>
  );
}
