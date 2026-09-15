import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailOpen, MessageSquare, Gamepad2, LayoutGrid, ListChecks, Signpost, SlidersHorizontal, Trophy } from "lucide-react";

import Button from "../../ui/primitives/Button";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import PageLoadingScreen from "../../ui/primitives/PageLoadingScreen";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import PageLayout from "../../ui/layout/PageLayout";

import {
  getTournament,
  listTournaments,
  enableSecondLegAll,
  disableSecondLegAll,
  reorderTournamentMatches,
  deleteTournament,
  patchTournamentDate,
  patchTournamentName,
  patchTournamentDecider,
  reassign2v2Schedule,
} from "../../api/tournaments.api";

import { ApiError } from "../../api/client";
import { patchMatch, swapMatchSides } from "../../api/matches.api";
import { listClubs } from "../../api/clubs.api";
import type { DeciderType, Match, Club, PatchMatchBody } from "../../api/types";

import { useTournamentWS } from "../../hooks/useTournamentWS";
import { useAuth } from "../../auth/AuthContext";
import { useSeenSet } from "../../hooks/useSeenComments";

import AdminPanel from "./AdminPanel";
import MatchList from "./MatchList";
import OverviewSection from "./OverviewSection";
import StandingsTable from "./StandingsTable";
import WhatIfSection from "./WhatIfSection";
import { computeFinishedStandings, computeTopDraw } from "./tournamentStandings";
import CurrentGameSection from "./CurrentGameSection";
import TournamentCommentsCard from "./TournamentCommentsCard";
import TournamentMetaPills from "./TournamentMetaPills";
import { isEditableMatch } from "./bestCase";
import { shuffle, sideBy } from "../../helpers";

import { listTournamentComments, markAllTournamentCommentsRead } from "../../api/comments.api";
import { qk } from "../../api/queryKeys";
import { useRouteEntryLoading } from "../../ui/layout/useRouteEntryLoading";
import { usePageTitle } from "../../ui/layout/PageTitleContext";
import InlineBack from "../../ui/shell/InlineBack";
import { forgetLocation } from "../../ui/shell/lastLocation";
import { useReturnScroll } from "../../ui/shell/useReturnScroll";

type PlayerLite = { id: number; display_name: string };
type LiveTab = "overview" | "current" | "standings" | "matches" | "comments" | "whatif" | "controls";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Request failed";
}

export default function LiveTournamentPage() {
  const { id } = useParams();
  const tid = id ? Number(id) : null;

  const qc = useQueryClient();
  const pageEntered = useRouteEntryLoading();
  const location = useLocation();
  const locationState = (location.state as {
    tournamentName?: string;
    tournamentStatus?: "draft" | "live" | "done";
  } | null) ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useNavigate();
  const { role, token } = useAuth();

  const isAdmin = role === "admin";
  const isEditorOrAdmin = role === "editor" || role === "admin";

  const TAB_KEYS: LiveTab[] = ["overview", "current", "standings", "matches", "comments", "whatif", "controls"];
  const initialTab = ((): LiveTab | null => {
    const t = searchParams.get("tab");
    return t && (TAB_KEYS as string[]).includes(t) ? (t as LiveTab) : null;
  })();
  // null = neither the URL nor the user picked a tab yet → status-dependent default below.
  const [chosenTab, setChosenTabState] = useState<LiveTab | null>(initialTab);
  // Active tab is mirrored to the URL so back-navigation (in-app + browser) restores it.
  // Each tab keeps its own scroll offset (this page has its own tab state, so it
  // wires `useReturnScroll` itself instead of going through `useTabParam`).
  const { swap: swapTabScroll } = useReturnScroll();
  // The effective tab (see `activeTab` below), kept in a ref so the setter can
  // name the tab it is leaving without depending on it.
  const activeTabRef = useRef<LiveTab | null>(initialTab);
  const setActiveTab = useCallback(
    (t: LiveTab) => {
      if (activeTabRef.current !== t) {
        swapTabScroll(`${location.pathname}?tab=${activeTabRef.current ?? ""}`, `${location.pathname}?tab=${t}`);
      }
      setChosenTabState(t);
      const next = new URLSearchParams(window.location.search);
      next.set("tab", t);
      setSearchParams(next, { replace: true });
    },
    [location.pathname, setSearchParams, swapTabScroll],
  );

  const tQ = useQuery({
    queryKey: qk.tournament(tid!),
    queryFn: () => getTournament(tid!, token),
    enabled: !!tid,
  });

  // Every tournament opens on the Overview (T15). The old "done → Results" rule
  // predates T12: a finished Overview now leads with the winner and the final
  // standings and lists every match played, so there is nothing left to skip.
  // Explicit choices (URL deep link or a tab click) always win.
  const activeTab: LiveTab = chosenTab ?? "overview";
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useTournamentWS(tid);

  const { ids: seenCommentIds, loaded: seenCommentIdsLoaded } = useSeenSet(tid ?? 0);
  const commentsQ = useQuery({
    queryKey: qk.commentsTournamentFull(tid!, token),
    queryFn: () => listTournamentComments(tid!, token),
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
      await qc.invalidateQueries({ queryKey: qk.commentsReadIds(tid!, token) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadMap(token) });
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
      const tsv = parseApiTs(c.created_at ?? "");
      if (tsv > bestTs || (tsv === bestTs && (bestId == null || c.id > bestId))) {
        bestTs = tsv;
        bestId = c.id;
      }
    }
    return bestId;
  }, [commentsQ.data?.comments, seenCommentIds, token]);
  const [focusCommentRequest, setFocusCommentRequest] = useState<{ id: number; nonce: number } | null>(null);

  // A tournament that no longer exists must not trap the Tournaments tab (U6).
  useEffect(() => {
    if (!(tQ.error instanceof ApiError) || tQ.error.status !== 404) return;
    forgetLocation(location.pathname + location.search);
  }, [tQ.error, location.pathname, location.search]);

  /**
   * The single writer for both comment deep links (A5).
   *
   * A deep link changes two things at once: it opens the Comments tab and it
   * spends the param that asked for it. Done as two writes — `setActiveTab`
   * first, then `setSearchParams` built from this render's `location.search` —
   * the second one starts from the URL as it was *before* the first and
   * silently reverts it, so `?tab=comments` was dropped and a reload (or a
   * `lastLocation` replay) landed back on Overview. One write, built from the
   * live URL, cannot lose a half of itself.
   *
   * No `swapTabScroll` here on purpose: a deep link is not a tab switch away
   * from something — it scrolls to the entry it named.
   */
  const openCommentsForDeepLink = useCallback(
    (consumedParam: "comment" | "unread", focusCommentId: number | null) => {
      setChosenTabState("comments");
      if (focusCommentId != null) {
        setFocusCommentRequest((prev) => ({ id: focusCommentId, nonce: (prev?.nonce ?? 0) + 1 }));
      }
      const next = new URLSearchParams(window.location.search);
      next.set("tab", "comments");
      next.delete(consumedParam);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    const raw = new URLSearchParams(location.search).get("comment");
    if (!raw) return;
    const cid = Number(raw);
    if (!Number.isFinite(cid) || cid <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openCommentsForDeepLink("comment", Math.trunc(cid));
  }, [location.search, openCommentsForDeepLink]);

  // `?unread=1` (the unread pill on the tournaments list) can only be answered
  // once the comments *and* this viewer's read ids are in — on a cold load both
  // are still in flight while this first runs. Spending the flag then threw it
  // away before it could be used, which is why the pill never jumped (A5). When
  // nothing is unread any more the link still opens the feed it pointed at.
  const unreadDeepLinkReady = commentsQ.isSuccess && seenCommentIdsLoaded;
  useEffect(() => {
    if (new URLSearchParams(location.search).get("unread") !== "1") return;
    if (!unreadDeepLinkReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openCommentsForDeepLink("unread", latestUnreadCommentId);
  }, [latestUnreadCommentId, location.search, openCommentsForDeepLink, unreadDeepLinkReady]);

  // When returning from a match detail page, scroll to (and flash) that match row.
  const focusMatchId = (location.state as { focusMatchId?: number } | null)?.focusMatchId ?? null;
  useEffect(() => {
    if (activeTab !== "matches" || !focusMatchId) return;
    const el = document.getElementById(`match-row-${focusMatchId}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("comment-attn");
    const t = window.setTimeout(() => el.classList.remove("comment-attn"), 1600);
    return () => window.clearTimeout(t);
  }, [activeTab, focusMatchId, tQ.data]);

  const status = tQ.data?.status ?? locationState?.tournamentStatus ?? "draft";
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
      type: (tQ.data?.decider_type ?? "none") as DeciderType,
      winner_player_id: tQ.data?.decider_winner_player_id ?? null,
      loser_player_id: tQ.data?.decider_loser_player_id ?? null,
      winner_goals: tQ.data?.decider_winner_goals ?? null,
      loser_goals: tQ.data?.decider_loser_goals ?? null,
    };
  }, [tQ.data]);

  const topDrawInfo = useMemo(() => {
    const players = (tQ.data?.players ?? []) as PlayerLite[];
    if (!tQ.data || !players.length) return { isTopDraw: false, candidates: [] as { id: number; name: string }[] };
    return computeTopDraw(computeFinishedStandings(matchesSorted, players));
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
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
    },
  });

  const disableLegMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return disableSecondLegAll(token, tid);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
    },
  });

  const reorderMut = useMutation({
    mutationFn: async (newOrderIds: number[]) => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return reorderTournamentMatches(token, tid, newOrderIds);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
    },
  });

  // The delete confirmation names what is lost, so it needs the cup stakes — which live on
  // the list row, not the detail payload (computing them per detail request would walk every
  // tournament × every cup on the realtime path). Fetched only once the dialog opens.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const listForStakesQ = useQuery({
    queryKey: qk.tournaments(),
    queryFn: () => listTournaments(token),
    enabled: confirmDelete,
  });
  const cupStakes = useMemo(() => {
    const row = (listForStakesQ.data ?? []).find((t) => Number(t.id) === Number(tid));
    return row?.cup_stakes ?? [];
  }, [listForStakesQ.data, tid]);

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return deleteTournament(token, tid);
    },
    onSuccess: async () => {
      setConfirmDelete(false);
      forgetLocation(location.pathname + location.search);
      nav("/tournaments");
      await qc.invalidateQueries({ queryKey: qk.tournaments() });
      // A deleted tournament is a hole in the cup fold and in every stat derived from it.
      await qc.invalidateQueries({ queryKey: qk.cupAll() }).catch(() => {});
      await qc.invalidateQueries({ queryKey: qk.stats.all() }).catch(() => {});
    },
  });

  const reassignMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!tid) throw new Error("No tournament id");
      return reassign2v2Schedule(token, tid, true);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
    },
  });

  const swapSidesMut = useMutation({
    mutationFn: async (matchId: number) => {
      if (!token) throw new Error("Not logged in");
      return swapMatchSides(token, matchId);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
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
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
      await qc.invalidateQueries({ queryKey: qk.tournaments() });
      await qc.invalidateQueries({ queryKey: qk.cupAll() }).catch(() => {});
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
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
      await qc.invalidateQueries({ queryKey: qk.tournaments() });
      await qc.invalidateQueries({ queryKey: qk.cupAll() }).catch(() => {});
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
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
      await qc.invalidateQueries({ queryKey: qk.tournaments() });
      await qc.invalidateQueries({ queryKey: qk.cupAll() }).catch(() => {});
    },
  });

  // --- clubs ---
  const clubGame = "EA FC 26";
  const clubsQ = useQuery({
    queryKey: qk.clubs(clubGame),
    queryFn: () => listClubs(clubGame),
    enabled: !!tid,
  });

  const clubs: Club[] = clubsQ.data ?? [];

  // --- current match selection ---
  const currentMatch = useMemo(() => {
    const playing = matchesSorted.find((m) => m.state === "playing");
    if (playing) return playing;
    if (status === "draft" || status === "live") return matchesSorted.find((m) => m.state === "scheduled") ?? null;
    return null;
  }, [matchesSorted, status]);

  const currentGameMut = useMutation({
    mutationFn: async (payload: { matchId: number; body: PatchMatchBody }) => {
      if (!token) throw new Error("Not logged in");
      return patchMatch(token, payload.matchId, payload.body);
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
      await qc.invalidateQueries({ queryKey: qk.cupAll() }).catch(() => {});
    },
  });

  // Navigate to match detail page; remember which tab we came from so "back" restores it.
  function openEditor(m: Match) {
    nav(`/live/${tid}/match/${m.id}`, { state: { fromTab: activeTab } });
  }

  // A10: the server answers "what may this caller do to this tournament right now" and
  // ships the answer with the payload. The role check stays as the coarse gate only, so
  // an admin previewing as editor/reader still gets that role's page.
  const canEditTournament = isEditorOrAdmin && !!tQ.data?.can_edit;
  const canDeleteTournament = isEditorOrAdmin && !!tQ.data?.can_delete;
  const canSetDecider = isEditorOrAdmin && !!tQ.data?.can_set_decider;
  const canEditMatch = canEditTournament;
  const canReorder = canEditTournament;
  const canDisableSecondLeg = useMemo(() => {
    return !matchesSorted.some((m) => m.leg === 2 && m.state !== "scheduled");
  }, [matchesSorted]);

  const reopenLastMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!matchesSorted.length) throw new Error("No matches");
      const last = matchesSorted[matchesSorted.length - 1];
      if (last.state === "playing") return { ok: true, note: "Already playing" };
      const a = sideBy(last, "A");
      const b = sideBy(last, "B");
      return patchMatch(token, last.id, {
        state: "playing",
        sideA: { club_id: a?.club_id ?? null, goals: Number(a?.goals ?? 0) },
        sideB: { club_id: b?.club_id ?? null, goals: Number(b?.goals ?? 0) },
      });
    },
    onSuccess: async () => {
      if (tid) await qc.invalidateQueries({ queryKey: qk.tournament(tid) });
    },
  });

  const [panelError, setPanelError] = useState<string | null>(null);
  /** "Read all" asks first — in the app's own dialog, never the browser's (R2). */
  const [markAllReadAsked, setMarkAllReadAsked] = useState(false);

  const showControls = isEditorOrAdmin;
  // Nothing to project once every match has been played (T13).
  const showWhatIf = useMemo(() => matchesSorted.some(isEditableMatch), [matchesSorted]);
  const cardTitle = tQ.data?.name || locationState?.tournamentName || "Tournament";
  usePageTitle(cardTitle);
  const showCurrentGameSection = (status === "draft" || status === "live") && !!currentMatch;

  const tabs = useMemo<SectionTab<LiveTab>[]>(() => {
    const t: SectionTab<LiveTab>[] = [];
    t.push({ key: "overview", label: "Overview", icon: <LayoutGrid size={14} /> });
    if (showCurrentGameSection) t.push({ key: "current", label: "Current", icon: <Gamepad2 size={14} /> });
    t.push({ key: "standings", label: status === "done" ? "Results" : "Standings", icon: <Trophy size={14} /> });
    t.push({ key: "matches", label: "Matches", icon: <ListChecks size={14} /> });
    // What if sits with the matches it projects, left of the comments (R2b).
    if (showWhatIf) t.push({ key: "whatif", label: "What if", icon: <Signpost size={14} /> });
    t.push({ key: "comments", label: "Comments", icon: <MessageSquare size={14} />, badge: unreadCommentsCount || undefined });
    if (showControls) {
      t.push({ key: "controls", label: role === "admin" ? "Admin" : "Controls", icon: <SlidersHorizontal size={14} /> });
    }
    return t;
  }, [status, showCurrentGameSection, unreadCommentsCount, showWhatIf, showControls, role]);

  // Fall back to the first available tab if the active one isn't shown (e.g.
  // "current" on a done tournament, or a legacy deep link).
  const effectiveTab: LiveTab = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key ?? "standings");

  if (!tid) return <div className="inset px-3 py-2 text-sm text-text-muted">Invalid tournament id</div>;

  const initialLoading = !pageEntered || (!tQ.error && !tQ.data && (tQ.isLoading || clubsQ.isLoading || commentsQ.isLoading));
  if (initialLoading) {
    return (
      <div className="page">
        <PageLoadingScreen sectionCount={5} />
      </div>
    );
  }

  const markAllReadAction =
    unreadCommentsCount > 0 ? (
      <Button
        variant="ghost"
        type="button"
        title="Mark all unread comments as read"
        onClick={() => {
          if (!token || !tid || unreadCommentIds.length === 0 || markAllReadMut.isPending) return;
          setMarkAllReadAsked(true);
        }}
        disabled={!token || markAllReadMut.isPending}
      >
        <MailOpen size={15} />
      </Button>
    ) : null;

  return (
    <PageLayout
      title={cardTitle}
      back={<InlineBack />}
      meta={<TournamentMetaPills mode={tQ.data?.mode} date={tQ.data?.date} />}
    >
      <ErrorToastOnError error={tQ.error} title="Tournament loading failed" />

      <SectionTabs tabs={tabs} active={effectiveTab} onChange={setActiveTab} />

      {tQ.data ? (
        <>
          {effectiveTab === "overview" ? (
            <OverviewSection
              tournamentId={tid}
              mode={tQ.data.mode}
              date={tQ.data.date}
              isDone={isDone}
              decider={decider}
              matches={matchesSorted}
              players={tQ.data.players ?? []}
              clubs={clubs}
              onOpenCurrentMatch={(m) => {
                // The "current" tab only exists while there is a playing/scheduled
                // match; otherwise (done, or all matches finished but not yet done)
                // go to the match page directly.
                if (isDone || !showCurrentGameSection) openEditor(m);
                else setActiveTab("current");
              }}
              onGoToStandings={() => setActiveTab("standings")}
              onGoToMatches={() => setActiveTab("matches")}
            />
          ) : null}

          {effectiveTab === "current" && showCurrentGameSection ? (
            <CurrentGameSection
              status={status}
              tournamentMode={tQ.data?.mode}
              match={currentMatch}
              clubs={clubs}
              players={tQ.data?.players ?? []}
              canControl={canEditTournament}
              canDeleteComments={isAdmin}
              busy={currentGameMut.isPending}
              onPatch={(matchId, body) => currentGameMut.mutateAsync({ matchId, body })}
              onSwapSides={async (matchId) => {
                await swapSidesMut.mutateAsync(matchId);
              }}
              onOpenMatch={openEditor}
            />
          ) : null}

          {effectiveTab === "standings" ? (
            <div className="flex flex-col gap-3">
              {showDeciderReadOnly ? (
                <div>
                  <div className="section-head"><span className="section-label">Decider</span></div>
                  <div className="space-y-1 text-sm text-text-muted">
                    <div>{deciderSummary}</div>
                    {decider.type === "none" && topDrawInfo.isTopDraw ? (
                      <div className="text-xs">
                        Tournament ended tied at the top. A decider can be set
                        {showControls ? " in the Controls tab." : "."}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <StandingsTable
                tournamentId={tid}
                tournamentDate={tQ.data?.date ?? null}
                tournamentMode={tQ.data?.mode === "2v2" ? "2v2" : "1v1"}
                tournamentStatus={tQ.data?.status ?? undefined}
                wrap={false}
                matches={matchesSorted}
                players={tQ.data.players}
              />

              {!isEditorOrAdmin ? (
                <div className="text-sm text-text-muted">Login for write access to enter results.</div>
              ) : null}
            </div>
          ) : null}

          {effectiveTab === "matches" ? (
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
          ) : null}

          {effectiveTab === "comments" ? (
            <TournamentCommentsCard
              tournamentId={tid}
              matches={matchesSorted}
              clubs={clubs}
              players={tQ.data?.players ?? []}
              canWrite={isEditorOrAdmin}
              canDelete={isAdmin}
              focusCommentRequest={focusCommentRequest}
              headerAction={markAllReadAction}
            />
          ) : null}

          {effectiveTab === "whatif" && showWhatIf ? (
            <WhatIfSection matches={matchesSorted} players={tQ.data.players ?? []} />
          ) : null}

          {effectiveTab === "controls" && showControls ? (
            <div>
              <div className="section-head">
                <span className="section-label">{role === "admin" ? "Admin controls" : "Editor controls"}</span>
              </div>
              <AdminPanel
                wrap={false}
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
                canEdit={canEditTournament}
                canDelete={canDeleteTournament}
                canSetDecider={canSetDecider}
                onDeleteTournament={() => {
                  if (!canDeleteTournament) return;
                  setConfirmDelete(true);
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
                  canSetDecider
                    ? (body) => {
                        setPanelError(null);
                        deciderMut.mutate(body, { onError: (e) => setPanelError(errorMessage(e)) });
                      }
                    : undefined
                }
                deciderBusy={deciderMut.isPending}
              />

              <ConfirmDialog
                open={confirmDelete}
                title={`Delete "${tQ.data.name}"?`}
                subtitle="The tournament and everything recorded in it are removed for good."
                confirmLabel="Delete tournament"
                busy={deleteMut.isPending}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => {
                  setPanelError(null);
                  deleteMut.mutate(undefined, { onError: (e) => setPanelError(errorMessage(e)) });
                }}
              >
                <div>
                  {matchesSorted.length === 0
                    ? "No matches were played yet."
                    : `${matchesSorted.length} ${matchesSorted.length === 1 ? "match" : "matches"} and every result in ${matchesSorted.length === 1 ? "it" : "them"} are deleted.`}
                </div>
                {cupStakes.length > 0 ? (
                  <div>
                    {cupStakes.map((c) => c.name).join(" and ")}{" "}
                    {cupStakes.length === 1 ? "was" : "were"} at stake here — deleting this
                    recalculates who holds {cupStakes.length === 1 ? "it" : "them"}.
                  </div>
                ) : null}
                <div>This cannot be undone.</div>
              </ConfirmDialog>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Nothing is lost here, so no red block — a title, a sentence, Cancel and the verb. */}
      <ConfirmDialog
        open={markAllReadAsked}
        title="Mark all comments as read?"
        subtitle={`The ${unreadCommentIds.length} unread comment${unreadCommentIds.length === 1 ? "" : "s"} in this tournament count as read — for you only, and nothing is deleted.`}
        confirmLabel={`Mark ${unreadCommentIds.length} as read`}
        busyLabel="Marking…"
        busy={markAllReadMut.isPending}
        onCancel={() => setMarkAllReadAsked(false)}
        onConfirm={() => {
          setMarkAllReadAsked(false);
          if (!token || !tid || unreadCommentIds.length === 0) return;
          markAllReadMut.mutate();
        }}
      />
    </PageLayout>
  );
}
