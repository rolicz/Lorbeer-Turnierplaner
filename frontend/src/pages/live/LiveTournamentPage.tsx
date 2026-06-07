import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailOpen, MessageSquare, Gamepad2, ListChecks, SlidersHorizontal, Trophy } from "lucide-react";

import Button from "../../ui/primitives/Button";
import { Pill, pillDate } from "../../ui/primitives/Pill";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import PageLoadingScreen from "../../ui/primitives/PageLoadingScreen";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";

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
import type { DeciderType, Match, Club, PatchMatchBody } from "../../api/types";

import { useTournamentWS } from "../../hooks/useTournamentWS";
import { useAuth } from "../../auth/AuthContext";
import { useSeenSet } from "../../hooks/useSeenComments";

import AdminPanel from "./AdminPanel";
import MatchList from "./MatchList";
import StandingsTable from "./StandingsTable";
import { computeFinishedStandings, computeTopDraw } from "./tournamentStandings";
import CurrentGameSection from "./CurrentGameSection";
import TournamentCommentsCard from "./TournamentCommentsCard";
import { shuffle, sideBy } from "../../helpers";

import { fmtDate } from "../../utils/format";
import { listTournamentComments, markAllTournamentCommentsRead } from "../../api/comments.api";
import { useRouteEntryLoading } from "../../ui/layout/useRouteEntryLoading";
import { usePageTitle } from "../../ui/layout/PageTitleContext";
import InlineBack from "../../ui/shell/InlineBack";

type PlayerLite = { id: number; display_name: string };
type LiveTab = "current" | "standings" | "matches" | "comments" | "controls";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Request failed";
}

/** Status chip with a pulsing dot for live tournaments. */
function StatusChip({ status }: { status: "draft" | "live" | "done" }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-status-bg-green/70 px-2.5 py-0.5 text-xs font-semibold text-status-text-green">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full live-ping opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full live-dot" />
        </span>
        Live
      </span>
    );
  }
  const cls =
    status === "draft"
      ? "bg-status-bg-blue/70 text-status-text-blue"
      : "bg-bg-card-chip/70 text-text-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status === "draft" ? "Draft" : "Done"}
    </span>
  );
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

  const TAB_KEYS: LiveTab[] = ["current", "standings", "matches", "comments", "controls"];
  const initialTab = ((): LiveTab => {
    const t = searchParams.get("tab");
    if (t === "overview") return "current"; // legacy deep links / "back" state
    return t && (TAB_KEYS as string[]).includes(t) ? (t as LiveTab) : "current";
  })();
  const [activeTab, setActiveTabState] = useState<LiveTab>(initialTab);
  // Active tab is mirrored to the URL so back-navigation (in-app + browser) restores it.
  const setActiveTab = useCallback(
    (t: LiveTab) => {
      setActiveTabState(t);
      const next = new URLSearchParams(window.location.search);
      next.set("tab", t);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  const tQ = useQuery({
    queryKey: ["tournament", tid],
    queryFn: () => getTournament(tid!),
    enabled: !!tid,
  });

  useTournamentWS(tid);

  const seenCommentIds = useSeenSet(tid ?? 0);
  const commentsQ = useQuery({
    queryKey: ["comments", tid, token ?? "none"],
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
    setActiveTab("comments");
    setFocusCommentRequest((prev) => ({ id: Math.trunc(cid), nonce: (prev?.nonce ?? 0) + 1 }));
    const next = new URLSearchParams(location.search);
    next.delete("comment");
    setSearchParams(next, { replace: true });
  }, [location.search, setSearchParams, setActiveTab]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const jumpUnread = sp.get("unread") === "1";
    if (!jumpUnread) return;
    if (latestUnreadCommentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab("comments");
      setFocusCommentRequest((prev) => ({ id: latestUnreadCommentId, nonce: (prev?.nonce ?? 0) + 1 }));
    }
    sp.delete("unread");
    setSearchParams(sp, { replace: true });
  }, [latestUnreadCommentId, location.search, setSearchParams, setActiveTab]);

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
  const clubGame = "EA FC 26";
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

  // Navigate to match detail page; remember which tab we came from so "back" restores it.
  function openEditor(m: Match) {
    nav(`/live/${tid}/match/${m.id}`, { state: { fromTab: activeTab } });
  }

  const canEditMatch = role === "admin" || (role === "editor" && !isDone);
  const canReorder = isAdmin || (role === "editor" && !isDone);
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
      if (tid) await qc.invalidateQueries({ queryKey: ["tournament", tid] });
    },
  });

  const [panelError, setPanelError] = useState<string | null>(null);

  const showControls = isEditorOrAdmin;
  const cardTitle = tQ.data?.name || locationState?.tournamentName || "Tournament";
  usePageTitle(cardTitle);
  const showCurrentGameSection = (status === "draft" || status === "live") && !!currentMatch;

  const tabs = useMemo<SectionTab<LiveTab>[]>(() => {
    const t: SectionTab<LiveTab>[] = [];
    if (showCurrentGameSection) t.push({ key: "current", label: "Current", icon: <Gamepad2 size={14} /> });
    t.push({ key: "standings", label: status === "done" ? "Results" : "Standings", icon: <Trophy size={14} /> });
    t.push({ key: "matches", label: "Matches", icon: <ListChecks size={14} /> });
    t.push({ key: "comments", label: "Comments", icon: <MessageSquare size={14} />, badge: unreadCommentsCount || undefined });
    if (showControls) {
      t.push({ key: "controls", label: role === "admin" ? "Admin" : "Controls", icon: <SlidersHorizontal size={14} /> });
    }
    return t;
  }, [status, showCurrentGameSection, unreadCommentsCount, showControls, role]);

  // Fall back to the first available tab if the active one isn't shown (e.g.
  // "current" on a done tournament, or a legacy deep link).
  const effectiveTab: LiveTab = tabs.some((t) => t.key === activeTab) ? activeTab : (tabs[0]?.key ?? "standings");

  if (!tid) return <div className="panel-subtle px-3 py-2 text-sm text-text-muted">Invalid tournament id</div>;

  const initialLoading = !pageEntered || (!tQ.error && !tQ.data && (tQ.isLoading || clubsQ.isLoading || commentsQ.isLoading));
  if (initialLoading) {
    return (
      <div className="page">
        <PageLoadingScreen sectionCount={5} />
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 hidden items-center gap-2 lg:flex">
              <InlineBack />
              <h1 className="truncate text-xl font-bold tracking-tight text-text-normal sm:text-2xl">
                {cardTitle}
              </h1>
            </div>
            {tQ.data ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusChip status={tQ.data.status} />
                <Pill>{tQ.data.mode}</Pill>
                <Pill className={pillDate()} title="Date">
                  {fmtDate(tQ.data.date)}
                </Pill>
              </div>
            ) : null}
          </div>

          <div className="inline-flex shrink-0 items-center gap-2">
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
                <MailOpen size={15} />
              </Button>
            ) : null}
          </div>
        </div>

        <ErrorToastOnError error={tQ.error} title="Tournament loading failed" />
      </div>

      <SectionTabs tabs={tabs} active={effectiveTab} onChange={setActiveTab} className="mb-4" />

      {tQ.data ? (
        <>
          {effectiveTab === "current" && showCurrentGameSection ? (
            <CurrentGameSection
              status={status}
              tournamentMode={tQ.data?.mode}
              match={currentMatch}
              clubs={clubs}
              players={tQ.data?.players ?? []}
              canControl={isEditorOrAdmin && !isDone}
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
            <div className="stack-tight">
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
              collapsible={false}
            />
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
            </div>
          ) : null}
        </>
      ) : null}

    </div>
  );
}
