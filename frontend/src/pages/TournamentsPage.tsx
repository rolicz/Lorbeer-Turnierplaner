import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Button from "../ui/primitives/Button";
import SegmentedSwitch from "../ui/primitives/SegmentedSwitch";
import AvatarButton from "../ui/primitives/AvatarButton";
import { Meta } from "../ui/primitives/Meta";
import { Pill, pillDate, statusPill } from "../ui/primitives/Pill";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import SectionSeparator from "../ui/primitives/SectionSeparator";

import { tournamentPalette, tournamentStatusUI } from "../ui/theme";
import { cn } from "../ui/cn";
import { listTournaments, createTournament } from "../api/tournaments.api";
import { listPlayers } from "../api/players.api";
import { listTournamentCommentsSummary } from "../api/comments.api";
import { type TournamentSummary } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useSeenIdsByTournamentId } from "../hooks/useSeenComments";
import { useAnyTournamentWS } from "../hooks/useTournamentWS";
import { usePlayerAvatarMap } from "../hooks/usePlayerAvatarMap";
import { usePageSubNav, type SubNavItem } from "../ui/layout/SubNavContext";
import { useSectionSubnav } from "../ui/layout/useSectionSubnav";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import { fmtDate } from "../utils/format";

type Status = "draft" | "live" | "done";

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err == null) return "Unknown error";
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function winnerLabel(t: TournamentSummary): string | null {
  if (t.winner_string) return t.winner_string;
  if (t.winner_decider_string) return `${t.winner_decider_string} (decider)`;
  return null;
}

export default function TournamentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role, token } = useAuth();
  const canWrite = role === "editor" || role === "admin";

  const tournamentsQ = useQuery({ queryKey: ["tournaments"], queryFn: listTournaments });
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers, enabled: canWrite });
  const summaryQ = useQuery({ queryKey: ["comments", "summary"], queryFn: listTournamentCommentsSummary });
  const { avatarUpdatedAtById } = usePlayerAvatarMap({ enabled: canWrite });

  useAnyTournamentWS();

  const [createToast, setCreateToast] = useState<string | null>(null);
  const defaultScrollDoneRef = useRef(false);
  const pageEntered = useRouteEntryLoading();

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"1v1" | "2v2">("1v1");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected]
  );

  const tournamentsSorted = useMemo(() => {
    const ts = tournamentsQ.data ?? [];
    const key = (t: TournamentSummary): number => {
      const d = t.date ? `${t.date}T00:00:00` : t.created_at ?? null;
      const ms = d ? new Date(d).getTime() : 0;
      return Number.isFinite(ms) ? ms : 0;
    };
    return ts.slice().sort((a, b) => {
      const da = key(a);
      const db = key(b);
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

  const pageSections = useMemo(() => {
    const items: Array<{ key: string; id: string }> = [{ key: "all-tournaments", id: "section-tournaments-all" }];
    if (canWrite) items.unshift({ key: "create-new", id: "section-tournaments-create" });
    return items;
  }, [canWrite]);

  const { activeKey: activeSubKey, blinkKey: subnavBlinkKey, jumpToSection } = useSectionSubnav({
    sections: pageSections,
    enabled: pageEntered,
    initialKey: "all-tournaments",
  });

  const computeAllTournamentsOffset = useCallback((): number => {
    if (!canWrite) return 0;
    const allEl = document.getElementById("section-tournaments-all");
    const createEl = document.getElementById("section-tournaments-create");
    const headerEl = document.getElementById("app-top-nav");
    if (!allEl || !createEl || !headerEl) return 0;

    const headerHeight = Math.ceil(headerEl.getBoundingClientRect().height);
    const allTop = window.scrollY + allEl.getBoundingClientRect().top;
    const createBottom = window.scrollY + createEl.getBoundingClientRect().bottom;

    const baseTarget = Math.max(0, allTop - headerHeight);
    // To fully hide "Create New", visible content starts below the sticky header:
    // visibleStart = scrollTop + headerHeight.
    // So we need: scrollTop >= createBottom - headerHeight.
    const minTargetToHideCreate = Math.max(0, createBottom - headerHeight + 1);
    const target = Math.max(baseTarget, minTargetToHideCreate);

    // scrollToSectionById computes: target = baseTarget - offset.
    return baseTarget - target;
  }, [canWrite]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!name.trim()) throw new Error("Name missing");
      if (selectedIds.length < 3) throw new Error("Select at least 3 players");
      const created = await createTournament(token, {
        name: name.trim(),
        mode,
        player_ids: selectedIds,
        auto_generate: true,
        randomize: true,
      });
      return created.id;
    },
    onSuccess: async () => {
      setName("");
      setSelected({});
      await qc.invalidateQueries({ queryKey: ["tournaments"] });
      jumpToSection("all-tournaments", "section-tournaments-all", {
        blink: false,
        lockMs: 600,
        retries: 20,
        offsetPx: computeAllTournamentsOffset(),
        behavior: "auto",
      });
    },
    onError: (err: unknown) => {
      setCreateToast(errText(err));
    },
  });

  useEffect(() => {
    if (!createToast) return;
    const t = window.setTimeout(() => setCreateToast(null), 3800);
    return () => window.clearTimeout(t);
  }, [createToast]);

  useLayoutEffect(() => {
    if (defaultScrollDoneRef.current) return;
    if (!tournamentsQ.data) return;
    defaultScrollDoneRef.current = true;
    jumpToSection("all-tournaments", "section-tournaments-all", {
      blink: false,
      lockMs: 600,
      retries: 20,
      offsetPx: computeAllTournamentsOffset(),
      behavior: "auto",
    });
  }, [computeAllTournamentsOffset, jumpToSection, tournamentsQ.data]);

  const subNavItems = useMemo<SubNavItem[]>(() => {
    const items: SubNavItem[] = [
      {
        key: "all-tournaments",
        label: "All Tournaments",
        icon: "fa-list",
        active: activeSubKey === "all-tournaments",
        className: subnavBlinkKey === "all-tournaments" ? "subnav-click-blink" : "",
        onClick: () =>
          jumpToSection("all-tournaments", "section-tournaments-all", {
            blink: true,
            lockMs: 700,
            retries: 20,
            offsetPx: computeAllTournamentsOffset(),
          }),
      },
    ];
    if (canWrite) {
      items.unshift({
        key: "create-new",
        label: "Create New",
        icon: "fa-plus",
        active: activeSubKey === "create-new",
        className: subnavBlinkKey === "create-new" ? "subnav-click-blink" : "",
        onClick: () =>
          jumpToSection("create-new", "section-tournaments-create", {
            blink: true,
            lockMs: 700,
            retries: 20,
          }),
      });
    }
    return items;
  }, [activeSubKey, canWrite, computeAllTournamentsOffset, jumpToSection, subnavBlinkKey]);

  usePageSubNav(subNavItems);

  const initialLoading =
    !pageEntered ||
    !tournamentsQ.error &&
    !tournamentsQ.data &&
    (
      tournamentsQ.isLoading ||
      (canWrite && playersQ.isLoading && !playersQ.data) ||
      summaryQ.isLoading
    );

  if (initialLoading) {
    return (
      <div className="page">
        <PageLoadingScreen sectionCount={4} />
      </div>
    );
  }

  return (
    <div className="page">
      {createToast ? (
        <div className="fixed bottom-4 right-4 z-50 max-w-[min(92vw,380px)]">
          <div className="card-outer p-2 shadow-xl">
            <div className="card-inner-flat flex items-start gap-2 py-2">
              <i className="fa-solid fa-circle-exclamation mt-0.5 text-[color:rgb(var(--delta-down)/1)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-text-normal">Could not create tournament</div>
                <div className="mt-0.5 break-anywhere text-xs text-text-muted">{createToast}</div>
              </div>
              <button
                type="button"
                onClick={() => setCreateToast(null)}
                className="icon-button inline-flex h-7 w-7 items-center justify-center"
                title="Dismiss"
              >
                <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ErrorToastOnError error={playersQ.error} title="Players loading failed" />
      <ErrorToastOnError error={tournamentsQ.error} title="Tournaments loading failed" />

      {canWrite ? (
        <SectionSeparator id="section-tournaments-create" title="Create New" className="mt-0 border-t-0 pt-0">
          <div className="card-inner space-y-3">
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-sm font-medium text-text-normal">Name</span>
                <input
                  className="input-field min-w-0 flex-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="42. Lorbeerkranz Turnier"
                  aria-label="Tournament name"
                />
              </label>

              <div className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-sm font-medium text-text-normal">Mode</span>
                <SegmentedSwitch<"1v1" | "2v2">
                  value={mode}
                  onChange={setMode}
                  options={[
                    { key: "1v1", label: "1v1" },
                    { key: "2v2", label: "2v2" },
                  ]}
                  ariaLabel="Tournament mode"
                  title="Tournament mode"
                  widthClass="w-16 sm:w-20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-text-normal">Players</div>
              {playersQ.isLoading ? <div className="text-sm text-text-muted">Loading players…</div> : null}
              <div className="-mx-1 overflow-x-auto px-1 py-0.5">
                <div className="flex min-w-full items-center justify-between gap-2">
                {playersQ.data?.map((p) => {
                  const checked = !!selected[p.id];
                  return (
                    <div
                      key={p.id}
                      className="flex shrink-0 items-center"
                    >
                      <AvatarButton
                        playerId={p.id}
                        name={p.display_name}
                        updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
                        selected={checked}
                        onClick={() =>
                          setSelected((prev) => ({
                            ...prev,
                            [p.id]: !prev[p.id],
                          }))
                        }
                        className="h-9 w-9 sm:h-10 sm:w-10"
                      />
                    </div>
                  );
                })}
                </div>
              </div>
              <div className="text-xs text-text-muted">Selected: {selectedIds.length}</div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} type="button">
                <i className="fa fa-check md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">{createMut.isPending ? "Creating…" : "Create"}</span>
              </Button>
            </div>
          </div>
        </SectionSeparator>
      ) : null}

      <SectionSeparator
        id="section-tournaments-all"
        title="All Tournaments"
        className={canWrite ? "min-h-[100svh]" : undefined}
      >
        <div className="mb-2 border-b border-border-card-chip/60 pb-2">
          <div className="flex items-center justify-between gap-2">
            <Meta size="sm">Active + past tournaments.</Meta>
            <Button
              variant="ghost"
              onClick={() => void qc.invalidateQueries({ queryKey: ["tournaments"] })}
              title="Refresh"
            >
              <i className="fa fa-refresh md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {tournamentsQ.isLoading ? <div className="text-text-muted">Loading…</div> : null}

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

            return (
              <Link
                key={t.id}
                to={`/live/${t.id}`}
                state={{ tournamentName: t.name, tournamentStatus: st }}
                className={cn(
                  "relative block overflow-hidden rounded-xl border px-4 py-3 transition",
                  pal.wrap
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

                    <div className="shrink-0">
                      <Pill title="Mode">{t.mode === "2v2" ? "2v2" : "1v1"}</Pill>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                      <Pill className={statusPill(st)} title={ui.label}>
                        <span>{ui.label}</span>
                      </Pill>

                      <Pill className={pillDate()} title="Date">
                        <span>{fmtDate(t.date)}</span>
                      </Pill>

                      {winner ? (
                        <Pill title="Winner">
                          <span>
                            <i className="fa fa-trophy text-yellow-400 mr-1" aria-hidden="true" />
                          </span>
                          <span className="max-w-[160px] truncate sm:max-w-[260px]">{winner}</span>
                        </Pill>
                      ) : null}
                    </div>

                    {hasUnseen ? (
                      <button
                        type="button"
                        className="shrink-0 justify-self-end inline-flex items-center"
                        title="Jump to latest unread comment"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/live/${t.id}?unread=1`, { state: { tournamentName: t.name, tournamentStatus: st } });
                        }}
                      >
                        <Pill title="Unread comments">
                          <i className="fa-solid fa-comment text-accent" aria-hidden="true" />
                          <span className="tabular-nums text-text-normal">{unseenCount}</span>
                        </Pill>
                      </button>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </SectionSeparator>
    </div>
  );
}
