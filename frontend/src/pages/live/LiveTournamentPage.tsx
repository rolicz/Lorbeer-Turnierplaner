import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Button from "../../ui/primitives/Button";
import { Pill, pillDate, statusPill } from "../../ui/primitives/Pill";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import PageLoadingScreen from "../../ui/primitives/PageLoadingScreen";
import SectionSeparator from "../../ui/primitives/SectionSeparator";

import {
  getTournament,
  enableSecondLegAll,
  disableSecondLegAll,
  reorderTournamentMatches,
  deleteTournament,
  patchTournamentDate,
  patchTournamentName,
  patchTournamentDecider,
  reassign2v2Schedule,
} from "../../api/tournaments.api";

import { patchMatch, swapMatchSides } from "../../api/matches.api";
import { listClubs } from "../../api/clubs.api";
import type { Match, Club, PatchMatchBody } from "../../api/types";

import { useTournamentWS } from "../../hooks/useTournamentWS";
import { useAuth } from "../../auth/AuthContext";
import { useSeenSet } from "../../hooks/useSeenComments";

import AdminPanel from "./AdminPanel";
import MatchList from "./MatchList";
import MatchEditorSheet from "./MatchEditorSheet";
import StandingsTable from "./StandingsTable";
import CurrentGameSection from "./CurrentGameSection";
import TournamentCommentsCard from "./TournamentCommentsCard";
import { shuffle, sideBy } from "../../helpers";

import { fmtDate } from "../../utils/format";
import { listTournamentComments, markAllTournamentCommentsRead } from "../../api/comments.api";
import { usePageSubNav, type SubNavItem } from "../../ui/layout/SubNavContext";
import { useSectionSubnav } from "../../ui/layout/useSectionSubnav";

type PlayerLite = { id: number; display_name: string };

type StandRow = {
  playerId: number;
  name: string;
  pts: number;
  gd: number;
  gf: number;
};

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

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Request failed";
}

export default function LiveTournamentPage() {
  const { id } = useParams();
  const tid = id ? Number(id) : null;

  const qc = useQueryClient();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
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

  const seenCommentIds = useSeenSet(tid ?? 0);
  const commentsQ = useQuery({
    queryKey: ["comments", tid],
    queryFn: () => listTournamentComments(tid!),
    enabled: !!tid,
  });
  const unreadCommentsCount = useMemo(() => {
    if (!token) return 0;
    const cs = commentsQ.data?.comments ?? [];
    let n = 0;
    for (const c of cs) {
      if (!seenCommentIds.has(c.id)) n++;
    }
    return n;
  }, [commentsQ.data?.comments, seenCommentIds, token]);
  const unreadCommentIds = useMemo(() => {
    if (!token) return [];
    const cs = commentsQ.data?.comments ?? [];
    return cs
      .map((c) => Number(c.id))
      .filter((id) => Number.isFinite(id) && id > 0 && !seenCommentIds.has(id))
      .map((id) => Math.trunc(id));
  }, [commentsQ.data?.comments, seenCommentIds, token]);
  const markAllReadMut = useMutation({
    mutationFn: async () => {
      if (!token || !tid) throw new Error("Not logged in");
      return markAllTournamentCommentsRead(token, tid);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["comments", "read", tid, token ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["comments", "read-map", token ?? "none"] });
    },
  });
  const parseApiTs = (raw?: string | null): number => {
    if (!raw) return 0;
    let ts = Date.parse(raw);
    if (!Number.isFinite(ts) && raw.includes(" ")) ts = Date.parse(raw.replace(" ", "T"));
    return Number.isFinite(ts) ? ts : 0;
  };
  const latestUnreadCommentId = useMemo(() => {
    if (!token) return null;
    const cs = commentsQ.data?.comments ?? [];
    let bestId: number | null = null;
    let bestTs = -1;
    for (const c of cs) {
      if (seenCommentIds.has(c.id)) continue;
      // "Most recent" is based on creation time, not edits.
      const tsv = parseApiTs(c.created_at ?? "");
      if (tsv > bestTs || (tsv === bestTs && (bestId == null || c.id > bestId))) {
        bestTs = tsv;
        bestId = c.id;
      }
    }
    return bestId;
  }, [commentsQ.data?.comments, seenCommentIds, token]);
  const [focusCommentRequest, setFocusCommentRequest] = useState<{ id: number; nonce: number } | null>(null);

  useEffect(() => {
    const raw = new URLSearchParams(location.search).get("comment");
    if (!raw) return;
    const cid = Number(raw);
    if (!Number.isFinite(cid) || cid <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusCommentRequest((prev) => ({ id: Math.trunc(cid), nonce: (prev?.nonce ?? 0) + 1 }));
    const next = new URLSearchParams(location.search);
    next.delete("comment");
    setSearchParams(next, { replace: true });
  }, [location.search, setSearchParams]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const jumpUnread = sp.get("unread") === "1";
    if (!jumpUnread) return;
    if (latestUnreadCommentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusCommentRequest((prev) => ({ id: latestUnreadCommentId, nonce: (prev?.nonce ?? 0) + 1 }));
    }
    sp.delete("unread");
    setSearchParams(sp, { replace: true });
  }, [latestUnreadCommentId, location.search, setSearchParams]);

  const status = tQ.data?.status ?? "draft";
  const isDone = status === "done";

  const matchesSorted = useMemo(() => {
    const ms = tQ.data?.matches ?? [];
    return ms.slice().sort((a, b) => a.order_index - b.order_index);
  }, [tQ.data]);

  const secondLegEnabled = useMemo(() => {
    return (tQ.data?.matches ?? []).some((m) => m.leg === 2);
  }, [tQ.data]);

  const decider = useMemo(() => {
    return {
      type: tQ.data?.decider_type ?? "none",
      winner_player_id: tQ.data?.decider_winner_player_id ?? null,
      loser_player_id: tQ.data?.decider_loser_player_id ?? null,
      winner_goals: tQ.data?.decider_winner_goals ?? null,
      loser_goals: tQ.data?.decider_loser_goals ?? null,
    };
  }, [tQ.data]);

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

  const showDeciderReadOnly = useMemo(() => {
    if (!isDone) return false;
    if (decider.type !== "none") return true;
    return topDrawInfo.isTopDraw;
  }, [isDone, decider.type, topDrawInfo.isTopDraw]);

  const showDeciderEditor = isDone && topDrawInfo.isTopDraw;

  const playerNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of (tQ.data?.players ?? []) as PlayerLite[]) m.set(p.id, p.display_name);
    return m;
  }, [tQ.data?.players]);

  const deciderSummary = useMemo(() => {
    if (!showDeciderReadOnly) return null;
    if (decider.type === "none") return "No decider (kept as draw).";

    const w =
      decider.winner_player_id
        ? playerNameById.get(decider.winner_player_id) ?? `#${decider.winner_player_id}`
        : "—";
    const l =
      decider.loser_player_id
        ? playerNameById.get(decider.loser_player_id) ?? `#${decider.loser_player_id}`
        : "—";
    const score =
      decider.winner_goals != null && decider.loser_goals != null ? `${decider.winner_goals}-${decider.loser_goals}` : "—";
    const deciderText =
      decider.type === "scheresteinpapier"
        ? "Schere-Stein-Papier Turnier"
        : decider.type === "match"
          ? "Match"
          : decider.type === "penalties"
            ? "Penalties"
            : decider.type;
    return `${deciderText}: ${w} ${score} ${l}`;
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

  const reassignMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return reassign2v2Schedule(token, tid, true);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
    },
  });

  const swapSidesMut = useMutation({
    mutationFn: async (matchId: number) => {
      if (!token) throw new Error("Not logged in");
      return swapMatchSides(token, matchId);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
    },
  });

  // --- date/name (admin only) ---
  const [editDate, setEditDate] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const [editName, setEditName] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tQ.data?.name) setEditName(tQ.data.name);
  }, [tQ.data?.name]);

  const nameMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return patchTournamentName(token, tid, editName.trim());
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
      await qc.invalidateQueries({ queryKey: ["tournaments"] });
      await qc.invalidateQueries({ queryKey: ["cup"] }).catch(() => {});
    },
  });

  const deciderMut = useMutation({
    mutationFn: async (body: {
      type: "none" | "penalties" | "match" | "scheresteinpapier";
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
  const clubsQ = useQuery({
    queryKey: ["clubs", clubGame],
    queryFn: () => listClubs(clubGame),
    enabled: !!tid,
  });

  const clubs: Club[] = clubsQ.data ?? [];

  // --- current match selection ---
  const currentMatch = useMemo(() => {
    const playing = matchesSorted.find((m) => m.state === "playing");
    if (playing) return playing;

    // draft/live -> next scheduled
    if (status === "draft" || status === "live") return matchesSorted.find((m) => m.state === "scheduled") ?? null;

    return null;
  }, [matchesSorted, status]);

  const currentGameMut = useMutation({
    mutationFn: async (payload: { matchId: number; body: PatchMatchBody }) => {
      if (!token) throw new Error("Not logged in");
      return patchMatch(token, payload.matchId, payload.body);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
      await qc.invalidateQueries({ queryKey: ["cup"] }).catch(() => {});
    },
  });

  // --- match editor sheet ---
  const [open, setOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const selectedMatch = useMemo(
    () => matchesSorted.find((m) => m.id === selectedMatchId) || null,
    [matchesSorted, selectedMatchId]
  );

  const canEditMatch = role === "admin" || (role === "editor" && !isDone);
  const canReorder = isAdmin || (role === "editor" && !isDone);
  const canDisableSecondLeg = useMemo(() => {
    // Only allow removing leg2 if NO leg2 match has started (i.e. all are still scheduled)
    return !matchesSorted.some((m) => m.leg === 2 && m.state !== "scheduled");
  }, [matchesSorted]);


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

  const reopenLastMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!matchesSorted.length) throw new Error("No matches");

      const last = matchesSorted[matchesSorted.length - 1];

      // If it’s already playing, nothing to do.
      if (last.state === "playing") return { ok: true, note: "Already playing" };

      const a = sideBy(last, "A");
      const b = sideBy(last, "B");

      // patchMatch in your backend typically expects side payloads too → send them to be safe
      return patchMatch(token, last.id, {
        state: "playing",
        sideA: { club_id: a?.club_id ?? null, goals: Number(a?.goals ?? 0) },
        sideB: { club_id: b?.club_id ?? null, goals: Number(b?.goals ?? 0) },
      });
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
    },
  });

  const [panelError, setPanelError] = useState<string | null>(null);

  async function reloadAllLiveData() {
    if (!tid) return;
    const jobs: Promise<unknown>[] = [
      qc.invalidateQueries({ queryKey: ["tournament", tid], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: ["comments", tid], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: ["clubs", clubGame], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: ["players", "avatars"], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: ["comments", "summary"], refetchType: "all" }),
      qc.invalidateQueries({ queryKey: ["tournaments"], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: ["tournaments", "live"], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: ["cup"], refetchType: "active" }),
      qc.invalidateQueries({ queryKey: ["stats"], refetchType: "active" }),
    ];
    if (token) {
      jobs.push(
        qc.invalidateQueries({ queryKey: ["comments", "read", tid, token], refetchType: "active" }),
        qc.invalidateQueries({ queryKey: ["comments", "read-map", token], refetchType: "all" })
      );
    }
    await Promise.allSettled(jobs);
  }

  const showControls = isEditorOrAdmin;
  const cardTitle = tQ.data?.name ? tQ.data.name : `Tournament #${tid ?? "?"}`;
  const showCurrentGameSection = (status === "draft" || status === "live") && !!currentMatch;
  const autoJumpDoneRef = useRef(false);
  const activeSections = useMemo(() => {
    const items: Array<{ key: string; id: string }> = [{ key: "tournament", id: "section-live-top" }];
    if (showControls) items.push({ key: "controls", id: "section-editor-controls" });
    if (showCurrentGameSection) items.push({ key: "current", id: "section-current-game" });
    if (showDeciderReadOnly) items.push({ key: "decider", id: "section-decider" });
    items.push(
      { key: "standings", id: "section-standings" },
      { key: "matches", id: "section-matches" },
      { key: "comments", id: "section-comments" }
    );
    return items;
  }, [showControls, showCurrentGameSection, showDeciderReadOnly]);

  const { activeKey: activeSubKey, blinkKey: clickBlinkKey, jumpToSection } = useSectionSubnav({
    sections: activeSections,
    enabled: !!tQ.data,
  });

  useEffect(() => {
    autoJumpDoneRef.current = false;
  }, [tid]);

  useEffect(() => {
    if (!tQ.data || autoJumpDoneRef.current) return;
    autoJumpDoneRef.current = true;
    const next = tQ.data.status === "done" || !showCurrentGameSection
      ? { key: "standings", id: "section-standings" }
      : { key: "current", id: "section-current-game" };
    window.setTimeout(() => {
      jumpToSection(next.key, next.id, { lockMs: 650, blink: false, retries: 12 });
    }, 0);
  }, [jumpToSection, showCurrentGameSection, tQ.data]);

  const tournamentClassName =
    status === "live"
      ? "border border-status-border-green/80"
      : status === "draft"
        ? "border border-status-border-blue/80"
        : "border border-border-card-chip/70";
  const tournamentActiveClass =
    status === "live"
      ? "bg-bg-card-chip/45 border border-status-border-green"
      : status === "draft"
        ? "bg-bg-card-chip/45 border border-status-border-blue"
        : "bg-bg-card-chip/45 border border-border-card-chip/70";

  const liveSubNavItems = useMemo<SubNavItem[]>(() => {
    if (!tid) return [];
    const items: SubNavItem[] = [
      {
        key: "all-tournaments",
        label: "All Tournaments",
        icon: "fa-list",
        iconOnlyMobile: true,
        to: "/tournaments",
      },
      {
        key: "tournament",
        label: cardTitle,
        icon: "fa-trophy",
        active: activeSubKey === "tournament",
        className: tournamentClassName + (clickBlinkKey === "tournament" ? " subnav-click-blink" : ""),
        activeClassName: tournamentActiveClass,
        onClick: () => jumpToSection("tournament", "section-live-top", { blink: true, lockMs: 700, retries: 12 }),
      },
    ];

    if (showControls) {
      items.push({
        key: "controls",
        label: "Editor controls",
        icon: "fa-sliders",
        iconOnly: true,
        title: "Editor controls",
        active: activeSubKey === "controls",
        className: clickBlinkKey === "controls" ? "subnav-click-blink" : "",
        onClick: () => jumpToSection("controls", "section-editor-controls", { blink: true, lockMs: 700, retries: 12 }),
      });
    }
    if (showCurrentGameSection) {
      items.push({
        key: "current",
        label: "Current game",
        icon: "fa-gamepad",
        iconOnly: true,
        title: "Current game",
        active: activeSubKey === "current",
        className: clickBlinkKey === "current" ? "subnav-click-blink" : "",
        onClick: () => jumpToSection("current", "section-current-game", { blink: true, lockMs: 700, retries: 12 }),
      });
    }
    if (showDeciderReadOnly) {
      items.push({
        key: "decider",
        label: "Decider",
        icon: "fa-scale-balanced",
        iconOnly: true,
        title: "Decider",
        active: activeSubKey === "decider",
        className: clickBlinkKey === "decider" ? "subnav-click-blink" : "",
        onClick: () => jumpToSection("decider", "section-decider", { blink: true, lockMs: 700, retries: 12 }),
      });
    }

    items.push(
      {
        key: "standings",
        label: "Standings",
        icon: "fa-table-list",
        iconOnly: true,
        title: "Standings table",
        active: activeSubKey === "standings",
        className: clickBlinkKey === "standings" ? "subnav-click-blink" : "",
        onClick: () => jumpToSection("standings", "section-standings", { blink: true, lockMs: 700, retries: 12 }),
      },
      {
        key: "matches",
        label: "Matches",
        icon: "fa-list-check",
        iconOnly: true,
        title: "Matches",
        active: activeSubKey === "matches",
        className: clickBlinkKey === "matches" ? "subnav-click-blink" : "",
        onClick: () => jumpToSection("matches", "section-matches", { blink: true, lockMs: 700, retries: 12 }),
      },
      {
        key: "comments",
        label: "Comments",
        icon: "fa-comments",
        iconOnly: true,
        title: "Comments",
        active: activeSubKey === "comments",
        className: clickBlinkKey === "comments" ? "subnav-click-blink" : "",
        onClick: () => jumpToSection("comments", "section-comments", { blink: true, lockMs: 700, retries: 12 }),
      }
    );
    return items;
  }, [
    activeSubKey,
    cardTitle,
    clickBlinkKey,
    jumpToSection,
    showControls,
    showCurrentGameSection,
    showDeciderReadOnly,
    tid,
    tournamentClassName,
    tournamentActiveClass,
  ]);

  usePageSubNav(liveSubNavItems);

  if (!tid) return <div className="panel-subtle px-3 py-2 text-sm text-text-muted">Invalid tournament id</div>;

  const initialLoading = !tQ.error && !tQ.data && (tQ.isLoading || clubsQ.isLoading || commentsQ.isLoading);
  if (initialLoading) {
    return (
      <div className="page">
        <PageLoadingScreen sectionCount={5} />
      </div>
    );
  }

  return (
    <div className="page">
      <SectionSeparator id="section-live-top" className="mt-0 border-t-0 pt-0">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-text-normal sm:text-lg">
              {cardTitle}
            </div>
            {tQ.data ? (
              <div className="mt-1 inline-flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
                <Pill>{tQ.data.mode}</Pill>
                <Pill className={`${statusPill(tQ.data.status)}`}>
                  {tQ.data.status.at(0)?.toUpperCase() + tQ.data.status.slice(1)}
                </Pill>
                <Pill className={pillDate()} title="Date">
                  {fmtDate(tQ.data.date)}
                </Pill>
              </div>
            ) : null}
          </div>
          <div className="ml-auto inline-flex shrink-0 items-center gap-2">
            {unreadCommentsCount > 0 ? (
              <button
                type="button"
                className="shrink-0 inline-flex items-center"
                title="Jump to latest unread comment"
                onClick={() => {
                  if (!latestUnreadCommentId) return;
                  setFocusCommentRequest((prev) => ({
                    id: latestUnreadCommentId,
                    nonce: (prev?.nonce ?? 0) + 1,
                  }));
                }}
              >
                <Pill title="Unread comments">
                  <i className="fa-solid fa-comment text-accent" aria-hidden="true" />
                  <span className="tabular-nums text-text-normal">{unreadCommentsCount}</span>
                </Pill>
              </button>
            ) : null}
            {unreadCommentsCount > 0 ? (
              <Button
                variant="ghost"
                type="button"
                title="Mark all unread comments as read"
                onClick={() => {
                  if (!token || !tid || unreadCommentIds.length === 0 || markAllReadMut.isPending) return;
                  const ok = window.confirm(`Mark ${unreadCommentIds.length} unread comment(s) as read?`);
                  if (!ok) return;
                  markAllReadMut.mutate();
                }}
                disabled={!token || markAllReadMut.isPending}
              >
                <i className="fa-solid fa-envelope-open md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Read all</span>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                void reloadAllLiveData();
              }}
              title="Reload all data"
            >
              <i className="fa fa-arrows-rotate" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <ErrorToastOnError error={tQ.error} title="Tournament loading failed" />
      </SectionSeparator>

      {tQ.data ? (
        <>
          {showControls ? (
            <SectionSeparator
              id="section-editor-controls"
              title={role === "admin" ? "Admin controls" : "Editor controls"}
            >
              <AdminPanel
                wrap={true}
                role={role}
                status={tQ.data.status}
                secondLegEnabled={secondLegEnabled}
                canDisableSecondLeg={canDisableSecondLeg}
                busy={
                  enableLegMut.isPending ||
                  disableLegMut.isPending ||
                  reorderMut.isPending ||
                  reassignMut.isPending ||
                  deleteMut.isPending ||
                  dateMut.isPending ||
                  nameMut.isPending ||
                  deciderMut.isPending ||
                  reopenLastMut.isPending
                }
                error={panelError}
                onEnableSecondLeg={() => {
                  setPanelError(null);
                  enableLegMut.mutate(undefined, { onError: (e) => setPanelError(errorMessage(e)) });
                }}
                onDisableSecondLeg={() => {
                  setPanelError(null);
                  disableLegMut.mutate(undefined, { onError: (e) => setPanelError(errorMessage(e)) });
                }}
                onSetLastMatchPlaying={() => {
                  setPanelError(null);
                  reopenLastMut.mutate(undefined, { onError: (e) => setPanelError(errorMessage(e)) });
                }}
                setLastMatchPlayingBusy={reopenLastMut.isPending}
                onReshuffle={() => {
                  setPanelError(null);
                  const ids = matchesSorted.map((m) => m.id);
                  reorderMut.mutate(shuffle(ids), { onError: (e) => setPanelError(errorMessage(e)) });
                }}
                mode={tQ.data.mode}
                onReassign2v2={() => {
                  setPanelError(null);
                  reassignMut.mutate(undefined, { onError: (e) => setPanelError(errorMessage(e)) });
                }}
                onDeleteTournament={() => {
                  if (!isAdmin) return;
                  const ok = window.confirm("Delete tournament permanently?");
                  if (!ok) return;
                  setPanelError(null);
                  deleteMut.mutate(undefined, { onError: (e) => setPanelError(errorMessage(e)) });
                }}
                dateValue={isAdmin ? editDate : undefined}
                onDateChange={isAdmin ? setEditDate : undefined}
                onSaveDate={isAdmin ? () => dateMut.mutate() : undefined}
                dateBusy={dateMut.isPending}
                nameValue={isAdmin ? editName : undefined}
                onNameChange={isAdmin ? setEditName : undefined}
                onSaveName={isAdmin ? () => nameMut.mutate() : undefined}
                nameBusy={nameMut.isPending}
                showDeciderEditor={showDeciderEditor}
                deciderCandidates={topDrawInfo.candidates}
                currentDecider={decider}
                onSaveDecider={
                  isEditorOrAdmin
                    ? (body) => {
                        setPanelError(null);
                        deciderMut.mutate(body, { onError: (e) => setPanelError(errorMessage(e)) });
                      }
                    : undefined
                }
                deciderBusy={deciderMut.isPending}
              />
            </SectionSeparator>
          ) : null}

          {/* Current game: show even in draft (next scheduled) */}
          {showCurrentGameSection ? (
            <SectionSeparator id="section-current-game" title="Current game">
              <CurrentGameSection
                status={status}
                tournamentId={tid}
                match={currentMatch}
                clubs={clubs}
                canControl={isEditorOrAdmin && !isDone}
                busy={currentGameMut.isPending}
                onPatch={(matchId, body) => currentGameMut.mutateAsync({ matchId, body })}
                onSwapSides={async (matchId) => {
                  await swapSidesMut.mutateAsync(matchId);
                }}
              />
            </SectionSeparator>
          ) : null}

          {showDeciderReadOnly ? (
            <SectionSeparator id="section-decider" title="Decider">
              <div className="panel-subtle px-3 py-2 space-y-1">
                <div className="text-sm text-text-muted">{deciderSummary}</div>
                {decider.type === "none" && topDrawInfo.isTopDraw ? (
                  <div className="text-xs text-text-muted">Tournament ended tied at the top. A decider can be set.</div>
                ) : null}
              </div>
            </SectionSeparator>
          ) : null}

          <SectionSeparator
            id="section-standings"
            title={tQ.data.status === "done" ? "Results" : "Standings (live)"}
          >
            <StandingsTable
              tournamentId={tid}
              tournamentDate={tQ.data?.date ?? null}
              tournamentMode={tQ.data?.mode === "2v2" ? "2v2" : "1v1"}
              tournamentStatus={tQ.data?.status ?? undefined}
              wrap={false}
              matches={matchesSorted}
              players={tQ.data.players}
            />
          </SectionSeparator>

          <SectionSeparator id="section-matches" title="Matches">
            <MatchList
              matches={matchesSorted}
              clubs={clubs}
              canEdit={canEditMatch}
              canReorder={canReorder}
              busyReorder={reorderMut.isPending}
              onEditMatch={openEditor}
              onSwapSides={async (matchId) => {
                await swapSidesMut.mutateAsync(matchId);
              }}
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
            />
          </SectionSeparator>

          {tid ? (
            <SectionSeparator id="section-comments" title="Comments">
              <TournamentCommentsCard
                tournamentId={tid}
                matches={matchesSorted}
                clubs={clubs}
                players={tQ.data?.players ?? []}
                canWrite={isEditorOrAdmin}
                canDelete={isAdmin}
                focusCommentRequest={focusCommentRequest}
                collapsible={false}
              />
            </SectionSeparator>
          ) : null}

          {!isEditorOrAdmin ? (
            <div className="panel-subtle px-3 py-2 text-sm text-text-muted">Login for write access to enter results.</div>
          ) : null}
        </>
      ) : null}

      <MatchEditorSheet
        open={open}
        onClose={() => setOpen(false)}
        match={selectedMatch}
        clubs={clubs}
        clubsLoading={clubsQ.isLoading}
        clubsError={clubsQ.error ? String(clubsQ.error) : null}
        clubGame={clubGame}
        setClubGame={setClubGame}
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
