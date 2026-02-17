import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import Button from "../ui/primitives/Button";
import Textarea from "../ui/primitives/Textarea";
import AvatarCircle from "../ui/primitives/AvatarCircle";
import CupOwnerBadge from "../ui/primitives/CupOwnerBadge";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import CommentImageCropper from "../ui/primitives/CommentImageCropper";
import ImageLightbox from "../ui/primitives/ImageLightbox";
import { Pill } from "../ui/primitives/Pill";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";

import { useAuth } from "../auth/AuthContext";
import {
  createPlayerPoke,
  createPlayerGuestbookEntry,
  deletePlayerGuestbookEntry,
  getPlayerProfile,
  listPlayerPokes,
  listPlayerPokeReadIds,
  listPlayerPokeSummary,
  listPlayerGuestbookReadIds,
  listPlayerGuestbook,
  markAllPlayerPokesRead,
  markAllPlayerGuestbookEntriesRead,
  markPlayerGuestbookEntryRead,
  listPlayers,
  patchPlayerProfile,
} from "../api/players.api";
import { deletePlayerAvatar, putPlayerAvatar } from "../api/playerAvatars.api";
import {
  deletePlayerHeaderImage,
  playerHeaderImageUrl,
  putPlayerHeaderImage,
} from "../api/playerHeaders.api";
import { getCup, listCupDefs } from "../api/cup.api";
import { getStatsH2H, getStatsPlayerMatches, getStatsPlayers, getStatsRatings, getStatsStreaks } from "../api/stats.api";
import { listClubs } from "../api/clubs.api";
import { MatchHistoryList } from "./stats/MatchHistoryList";
import PlayerAvatarEditor from "./players/PlayerAvatarEditor";
import { usePlayerAvatarMap } from "../hooks/usePlayerAvatarMap";
import { usePlayerHeaderMap } from "../hooks/usePlayerHeaderMap";
import { usePageSubNav, type SubNavItem } from "../ui/layout/SubNavContext";
import { useSectionSubnav } from "../ui/layout/useSectionSubnav";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import SectionSeparator from "../ui/primitives/SectionSeparator";

function fmtDateTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(n: number) {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function fmtInt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

function streakIconForKey(key: string) {
  switch (key) {
    case "win_streak":
      return { icon: "fa-fire-flame-curved", label: "Win streak" };
    case "unbeaten_streak":
      return { icon: "fa-shield", label: "Unbeaten streak" };
    case "scoring_streak":
      return { icon: "fa-futbol", label: "Scoring streak" };
    case "clean_sheet_streak":
      return { icon: "fa-lock", label: "Clean sheet streak" };
    default:
      return null;
  }
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, role, playerId: currentPlayerId } = useAuth();
  const pageEntered = useRouteEntryLoading();
  const qc = useQueryClient();

  const routePlayerId = id ? Number(id) : null;
  const targetPlayerId =
    Number.isFinite(routePlayerId) && (routePlayerId ?? 0) > 0 ? (routePlayerId as number) : currentPlayerId;

  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const profileQ = useQuery({
    queryKey: ["players", "profile", targetPlayerId ?? "none"],
    queryFn: () => getPlayerProfile(targetPlayerId as number),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const guestbookQ = useQuery({
    queryKey: ["players", "guestbook", targetPlayerId ?? "none"],
    queryFn: () => listPlayerGuestbook(targetPlayerId as number),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const pokesSummaryQ = useQuery({
    queryKey: ["players", "pokes", "summary"],
    queryFn: listPlayerPokeSummary,
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const pokesQ = useQuery({
    queryKey: ["players", "pokes", targetPlayerId ?? "none"],
    queryFn: () => listPlayerPokes(targetPlayerId as number, 80),
    enabled:
      !!token &&
      !!currentPlayerId &&
      !!targetPlayerId &&
      currentPlayerId === targetPlayerId &&
      Number.isFinite(targetPlayerId) &&
      (targetPlayerId ?? 0) > 0,
  });
  const pokeReadQ = useQuery({
    queryKey: ["players", "pokes", "read", targetPlayerId ?? "none", token ?? "none"],
    queryFn: () => listPlayerPokeReadIds(token as string, targetPlayerId as number),
    enabled: !!token && Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const guestbookReadQ = useQuery({
    queryKey: ["players", "guestbook", "read", targetPlayerId ?? "none", token ?? "none"],
    queryFn: () => listPlayerGuestbookReadIds(token as string, targetPlayerId as number),
    enabled: !!token && Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs() });
  const statsPlayersQ = useQuery({
    queryKey: ["stats", "players", "profile", targetPlayerId ?? "none"],
    queryFn: () => getStatsPlayers({ lastN: 10, mode: "overall" }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const statsStreaksQ = useQuery({
    queryKey: ["stats", "streaks", "profile", targetPlayerId ?? "none"],
    queryFn: () =>
      getStatsStreaks({
        mode: "overall",
        playerId: targetPlayerId as number,
        scope: "tournaments",
        limit: 3,
    }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const statsStreaksGlobalQ = useQuery({
    queryKey: ["stats", "streaks", "profile", "global"],
    queryFn: () =>
      getStatsStreaks({
        mode: "overall",
        scope: "tournaments",
        limit: 1,
      }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const statsH2HQ = useQuery({
    queryKey: ["stats", "h2h", "profile", targetPlayerId ?? "none"],
    queryFn: () =>
      getStatsH2H({
        playerId: targetPlayerId as number,
        scope: "tournaments",
        order: "played",
        limit: 20,
      }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const statsRatingsQ = useQuery({
    queryKey: ["stats", "ratings", "profile", targetPlayerId ?? "none"],
    queryFn: () =>
      getStatsRatings({
        mode: "overall",
        scope: "tournaments",
      }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const statsMatchesQ = useQuery({
    queryKey: ["stats", "player-matches", "profile", targetPlayerId ?? "none"],
    queryFn: () => getStatsPlayerMatches({ playerId: targetPlayerId as number, scope: "tournaments" }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const cupDefsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  const cups = useMemo(() => {
    const raw = cupDefsQ.data?.cups?.length ? cupDefsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
    const nonDefault = raw.filter((c) => c.key !== "default");
    const defaults = raw.filter((c) => c.key === "default");
    return [...nonDefault, ...defaults];
  }, [cupDefsQ.data]);
  const cupsQ = useQueries({
    queries: cups.map((c) => ({
      queryKey: ["cup", c.key],
      queryFn: () => getCup(c.key),
    })),
  });
  const cupsLoading = cupsQ.some((q) => q.isLoading);

  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();
  const { headerUpdatedAtById: headerUpdatedAtByPlayerId } = usePlayerHeaderMap();

  const [bioDraftByPlayerId, setBioDraftByPlayerId] = useState<Record<number, string>>({});
  const [guestbookDraftByPlayerId, setGuestbookDraftByPlayerId] = useState<Record<number, string>>({});
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [headerEditorOpen, setHeaderEditorOpen] = useState(false);
  const [headerLightboxSrc, setHeaderLightboxSrc] = useState<string | null>(null);
  const [showAllMatchTournaments, setShowAllMatchTournaments] = useState(false);
  const [pokeButtonFlash, setPokeButtonFlash] = useState<{
    kind: "none" | "sent" | "read";
    playerId: number | null;
  }>({ kind: "none", playerId: null });
  const unreadJumpHandledRef = useRef<number | null>(null);

  const bioDraft =
    targetPlayerId != null ? (bioDraftByPlayerId[targetPlayerId] ?? (profileQ.data?.bio ?? "")) : "";
  const guestbookDraft = targetPlayerId != null ? (guestbookDraftByPlayerId[targetPlayerId] ?? "") : "";

  const player = useMemo(() => {
    const rows = playersQ.data ?? [];
    if (!targetPlayerId) return null;
    return rows.find((p) => p.id === targetPlayerId) ?? null;
  }, [playersQ.data, targetPlayerId]);

  const isOwnProfile = !!currentPlayerId && !!targetPlayerId && currentPlayerId === targetPlayerId;
  const canEdit = !!token && role !== "reader" && isOwnProfile;
  const canPostGuestbook = !!token && role !== "reader";
  const seenGuestbook = useMemo(
    () => new Set((guestbookReadQ.data?.entry_ids ?? []).map((x) => Number(x))),
    [guestbookReadQ.data?.entry_ids]
  );
  const seenPokes = useMemo(
    () => new Set((pokeReadQ.data?.poke_ids ?? []).map((x) => Number(x))),
    [pokeReadQ.data?.poke_ids]
  );
  const avatarUpdatedAt = targetPlayerId ? avatarUpdatedAtByPlayerId.get(targetPlayerId) ?? null : null;
  const headerUpdatedAt = targetPlayerId
    ? headerUpdatedAtByPlayerId.get(targetPlayerId) ?? profileQ.data?.header_image_updated_at ?? null
    : null;
  const headerImageSrc =
    targetPlayerId && headerUpdatedAt ? playerHeaderImageUrl(targetPlayerId, headerUpdatedAt) : null;

  const playerStatsRow = useMemo(() => {
    const rows = statsPlayersQ.data?.players ?? [];
    if (!targetPlayerId) return null;
    return rows.find((r) => r.player_id === targetPlayerId) ?? null;
  }, [statsPlayersQ.data?.players, targetPlayerId]);
  const streakByKey = useMemo(() => {
    const m = new Map<string, { current: number; record: number }>();
    for (const cat of statsStreaksQ.data?.categories ?? []) {
      const current = cat.current?.[0]?.length ?? 0;
      const record = cat.records?.[0]?.length ?? 0;
      m.set(cat.key, { current, record });
    }
    return m;
  }, [statsStreaksQ.data?.categories]);
  const globalRecordByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const cat of statsStreaksGlobalQ.data?.categories ?? []) {
      m.set(cat.key, cat.records?.[0]?.length ?? 0);
    }
    return m;
  }, [statsStreaksGlobalQ.data?.categories]);
  const nemesis = statsH2HQ.data?.nemesis_all ?? null;
  const favorite = statsH2HQ.data?.favorite_victim_all ?? null;
  const eloRow = useMemo(() => {
    if (!targetPlayerId) return null;
    return (statsRatingsQ.data?.rows ?? []).find((r) => r.player.id === targetPlayerId) ?? null;
  }, [statsRatingsQ.data?.rows, targetPlayerId]);
  const eloRank = useMemo(() => {
    if (!targetPlayerId) return null;
    const rows = statsRatingsQ.data?.rows ?? [];
    const idx = rows.findIndex((r) => r.player.id === targetPlayerId);
    return idx >= 0 ? idx + 1 : null;
  }, [statsRatingsQ.data?.rows, targetPlayerId]);
  const ownedCups = useMemo(() => {
    if (!targetPlayerId) return [] as { key: string; name: string }[];
    const out: { key: string; name: string }[] = [];
    for (let i = 0; i < cups.length; i++) {
      const def = cups[i];
      const q = cupsQ[i];
      if (q?.data?.owner?.id !== targetPlayerId) continue;
      out.push({ key: def.key, name: q.data.cup?.name ?? def.name ?? def.key });
    }
    return out;
  }, [cups, cupsQ, targetPlayerId]);

  const allMatchTournaments = statsMatchesQ.data?.tournaments ?? [];
  const visibleMatchTournaments = showAllMatchTournaments ? allMatchTournaments : allMatchTournaments.slice(0, 2);
  const unreadGuestbookCount = useMemo(() => {
    if (!token) return 0;
    let n = 0;
    for (const row of guestbookQ.data ?? []) {
      if (!seenGuestbook.has(row.id)) n++;
    }
    return n;
  }, [guestbookQ.data, seenGuestbook, token]);
  const unreadGuestbookIds = useMemo(
    () => (!token ? [] : (guestbookQ.data ?? []).filter((row) => !seenGuestbook.has(row.id)).map((row) => row.id)),
    [guestbookQ.data, seenGuestbook, token]
  );
  const latestUnreadGuestbookId = useMemo(() => {
    if (!token) return null;
    let bestId: number | null = null;
    let bestTs = -1;
    for (const row of guestbookQ.data ?? []) {
      if (seenGuestbook.has(row.id)) continue;
      const ts = Date.parse(row.created_at);
      const tsSafe = Number.isFinite(ts) ? ts : 0;
      if (bestId == null || tsSafe > bestTs || (tsSafe === bestTs && row.id > bestId)) {
        bestId = row.id;
        bestTs = tsSafe;
      }
    }
    return bestId;
  }, [guestbookQ.data, seenGuestbook, token]);
  const pokeSummaryRow = useMemo(() => {
    if (!targetPlayerId) return null;
    return (pokesSummaryQ.data ?? []).find((row) => Number(row.profile_player_id) === Number(targetPlayerId)) ?? null;
  }, [pokesSummaryQ.data, targetPlayerId]);
  const unreadPokeCount = useMemo(() => {
    if (!token || !isOwnProfile) return 0;
    const ids = pokeSummaryRow?.poke_ids ?? [];
    if (!ids.length) return 0;
    return ids.filter((id) => !seenPokes.has(Number(id))).length;
  }, [token, isOwnProfile, pokeSummaryRow?.poke_ids, seenPokes]);
  const unreadPokeAuthorsText = useMemo(() => {
    if (!token || !isOwnProfile) return "";
    const unreadRows = (pokesQ.data ?? []).filter((row) => !seenPokes.has(Number(row.id)));
    if (!unreadRows.length) return "";
    const byAuthor = new Map<number, { name: string; count: number }>();
    for (const row of unreadRows) {
      const authorId = Number(row.author_player_id);
      const prev = byAuthor.get(authorId);
      if (prev) {
        prev.count += 1;
      } else {
        byAuthor.set(authorId, {
          name: row.author_display_name || `Player #${authorId}`,
          count: 1,
        });
      }
    }
    const top = Array.from(byAuthor.values()).slice(0, 3);
    const names = top.map((x) => (x.count > 1 ? `${x.name} x${x.count}` : x.name));
    const rest = byAuthor.size - top.length;
    return rest > 0 ? `${names.join(", ")} +${rest}` : names.join(", ");
  }, [isOwnProfile, pokesQ.data, seenPokes, token]);
  const unreadPokeAuthorCount = useMemo(() => {
    if (!token || !isOwnProfile) return 0;
    const unreadRows = (pokesQ.data ?? []).filter((row) => !seenPokes.has(Number(row.id)));
    if (!unreadRows.length) return 0;
    return new Set(unreadRows.map((row) => Number(row.author_player_id))).size;
  }, [isOwnProfile, pokesQ.data, seenPokes, token]);

  const sections = useMemo(
    () => [
      { key: "profile-main", id: "profile-section-main" },
      { key: "profile-guestbook", id: "profile-section-guestbook" },
    ],
    []
  );
  const { activeKey: activeSubKey, blinkKey: subnavBlinkKey, jumpToSection } = useSectionSubnav({
    sections,
    enabled: !!targetPlayerId && pageEntered,
    initialKey: "profile-main",
  });

  const computeGuestbookMetrics = useCallback(() => {
    const mainEl = document.getElementById("profile-section-main");
    const guestEl = document.getElementById("profile-section-guestbook");
    const headerEl = document.getElementById("app-top-nav");
    if (!mainEl || !guestEl || !headerEl) return null;

    const headerHeight = Math.ceil(headerEl.getBoundingClientRect().height);
    const guestTop = window.scrollY + guestEl.getBoundingClientRect().top;
    const mainBottom = window.scrollY + mainEl.getBoundingClientRect().bottom;

    const baseTarget = Math.max(0, guestTop - headerHeight - 2);
    const minTargetToHideMain = Math.max(0, mainBottom - headerHeight + 1);
    const sectionTarget = Math.max(baseTarget, minTargetToHideMain);

    return { headerHeight, minTargetToHideMain, baseTarget, sectionTarget };
  }, []);

  const computeGuestbookOffset = useCallback((): number => {
    const m = computeGuestbookMetrics();
    if (!m) return 0;
    return m.baseTarget - m.sectionTarget;
  }, [computeGuestbookMetrics]);

  const scrollToGuestbookSection = useCallback(
    (blink = true, behavior: ScrollBehavior = "smooth") => {
      jumpToSection("profile-guestbook", "profile-section-guestbook", {
        blink,
        retries: 20,
        offsetPx: computeGuestbookOffset(),
        behavior,
      });
    },
    [computeGuestbookOffset, jumpToSection]
  );

  const focusGuestbookEntry = useCallback(
    (entryId: number, options?: { blink?: boolean; behavior?: ScrollBehavior }) => {
      const behavior = options?.behavior ?? "smooth";
      scrollToGuestbookSection(options?.blink ?? false, behavior);
      let tries = 0;
      const maxTries = 80;
      const run = () => {
        const el = document.getElementById(`guestbook-entry-${entryId}`);
        if (!el) {
          if (tries >= maxTries) return;
          tries += 1;
          window.setTimeout(run, 120);
          return;
        }

        const m = computeGuestbookMetrics();
        const headerHeight =
          m?.headerHeight ??
          Math.ceil(document.getElementById("app-top-nav")?.getBoundingClientRect().height ?? 0);
        const minTarget = m?.minTargetToHideMain ?? 0;
        const rect = el.getBoundingClientRect();
        const entryTop = window.scrollY + rect.top;
        const usableViewport = Math.max(140, window.innerHeight - headerHeight);
        const centeredTarget = entryTop - headerHeight - Math.max(12, Math.floor((usableViewport - rect.height) / 2));
        const targetTop = Math.max(0, Math.max(minTarget, centeredTarget));

        window.scrollTo({ top: targetTop, behavior });
        window.setTimeout(() => {
          window.scrollTo({ top: targetTop, behavior });
        }, 320);

        el.classList.remove("comment-attn");
        void el.offsetHeight;
        el.classList.add("comment-attn");
        window.setTimeout(() => el.classList.remove("comment-attn"), 1700);
      };
      run();
    },
    [computeGuestbookMetrics, scrollToGuestbookSection]
  );

  const subNavItems = useMemo<SubNavItem[]>(() => {
    if (!targetPlayerId) {
      return [
        {
          key: "all-players",
          label: "All Players",
          icon: "fa-users",
          active: true,
          to: "/players",
        },
      ];
    }

    const profileLabel = (player?.display_name ?? profileQ.data?.display_name ?? "Profile").trim() || "Profile";

    return [
      {
        key: "all-players",
        label: "All Players",
        icon: "fa-users",
        active: false,
        to: "/players",
      },
      {
        key: "profile-main",
        label: profileLabel,
        icon: "fa-id-badge",
        active: activeSubKey === "profile-main",
        className: `md:ml-1 md:rounded-r-none ${subnavBlinkKey === "profile-main" ? "subnav-click-blink" : ""}`.trim(),
        onClick: () => jumpToSection("profile-main", "profile-section-main", { blink: true, retries: 20 }),
      },
      {
        key: "profile-guestbook",
        label: "Guestbook",
        icon: "fa-book",
        active: activeSubKey === "profile-guestbook",
        className: `md:rounded-l-none ${subnavBlinkKey === "profile-guestbook" ? "subnav-click-blink" : ""}`.trim(),
        onClick: () => scrollToGuestbookSection(true),
      },
    ];
  }, [
    activeSubKey,
    jumpToSection,
    player?.display_name,
    profileQ.data?.display_name,
    scrollToGuestbookSection,
    subnavBlinkKey,
    targetPlayerId,
  ]);

  usePageSubNav(subNavItems);

  const saveProfileMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      return patchPlayerProfile(token, targetPlayerId, { bio: bioDraft });
    },
    onSuccess: async (saved) => {
      if (targetPlayerId) {
        setBioDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: saved.bio ?? "" }));
      }
      await qc.invalidateQueries({ queryKey: ["players", "profile", targetPlayerId ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "profiles"] });
    },
  });

  const putAvatarMut = useMutation({
    mutationFn: async (blob: Blob) => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      return putPlayerAvatar(token, targetPlayerId, blob);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["players", "avatars"] });
    },
  });

  const delAvatarMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      await deletePlayerAvatar(token, targetPlayerId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["players", "avatars"] });
    },
  });

  const putHeaderMut = useMutation({
    mutationFn: async (blob: Blob) => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      return putPlayerHeaderImage(token, targetPlayerId, blob);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["players", "headers"] });
      await qc.invalidateQueries({ queryKey: ["players", "profile", targetPlayerId ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "profiles"] });
    },
  });

  const delHeaderMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      await deletePlayerHeaderImage(token, targetPlayerId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["players", "headers"] });
      await qc.invalidateQueries({ queryKey: ["players", "profile", targetPlayerId ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "profiles"] });
    },
  });

  const createGuestbookMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      return createPlayerGuestbookEntry(token, targetPlayerId, guestbookDraft.trim());
    },
    onSuccess: async () => {
      if (targetPlayerId) setGuestbookDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: "" }));
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", targetPlayerId ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", "summary"] });
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", "read", targetPlayerId ?? "none", token ?? "none"] });
    },
  });

  const deleteGuestbookMut = useMutation({
    mutationFn: async (entryId: number) => {
      if (!token) throw new Error("Not logged in");
      await deletePlayerGuestbookEntry(token, entryId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", targetPlayerId ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", "summary"] });
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", "read", targetPlayerId ?? "none", token ?? "none"] });
    },
  });
  const markGuestbookReadMut = useMutation({
    mutationFn: async (entryId: number) => {
      if (!token) throw new Error("Not logged in");
      return markPlayerGuestbookEntryRead(token, entryId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", "read", targetPlayerId ?? "none", token ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", "read-map", token ?? "none"] });
    },
  });
  const markGuestbookReadAllMut = useMutation({
    mutationFn: async () => {
      if (!token || !targetPlayerId) throw new Error("Not logged in");
      return markAllPlayerGuestbookEntriesRead(token, targetPlayerId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", "read", targetPlayerId ?? "none", token ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "guestbook", "read-map", token ?? "none"] });
    },
  });
  const pokeMut = useMutation({
    mutationFn: async () => {
      if (!token || !targetPlayerId) throw new Error("Not logged in");
      return createPlayerPoke(token, targetPlayerId);
    },
    onSuccess: async () => {
      setPokeButtonFlash({ kind: "sent", playerId: targetPlayerId ?? null });
      await qc.invalidateQueries({ queryKey: ["players", "pokes", "summary"] });
      await qc.invalidateQueries({ queryKey: ["players", "pokes", targetPlayerId ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "pokes", "read", targetPlayerId ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "pokes", "read-map", token ?? "none"] });
    },
  });
  const markPokesReadAllMut = useMutation({
    mutationFn: async () => {
      if (!token || !targetPlayerId) throw new Error("Not logged in");
      return markAllPlayerPokesRead(token, targetPlayerId);
    },
    onSuccess: async () => {
      setPokeButtonFlash({ kind: "read", playerId: targetPlayerId ?? null });
      await qc.invalidateQueries({ queryKey: ["players", "pokes", "summary"] });
      await qc.invalidateQueries({ queryKey: ["players", "pokes", targetPlayerId ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "pokes", "read", targetPlayerId ?? "none", token ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["players", "pokes", "read-map", token ?? "none"] });
    },
  });

  useEffect(() => {
    if (pokeButtonFlash.kind === "none") return;
    const t = window.setTimeout(() => setPokeButtonFlash({ kind: "none", playerId: null }), 1100);
    return () => window.clearTimeout(t);
  }, [pokeButtonFlash]);

  const unreadJumpReady = useMemo(() => {
    return !(
      playersQ.isLoading ||
      profileQ.isLoading ||
      guestbookQ.isLoading ||
      pokesQ.isLoading ||
      pokesSummaryQ.isLoading ||
      pokeReadQ.isLoading ||
      clubsQ.isLoading ||
      statsPlayersQ.isLoading ||
      statsStreaksQ.isLoading ||
      statsStreaksGlobalQ.isLoading ||
      statsH2HQ.isLoading ||
      statsRatingsQ.isLoading ||
      statsMatchesQ.isLoading ||
      cupDefsQ.isLoading ||
      cupsLoading
    );
  }, [
    clubsQ.isLoading,
    cupDefsQ.isLoading,
    cupsLoading,
    guestbookQ.isLoading,
    pokesQ.isLoading,
    pokesSummaryQ.isLoading,
    pokeReadQ.isLoading,
    playersQ.isLoading,
    profileQ.isLoading,
    statsH2HQ.isLoading,
    statsMatchesQ.isLoading,
    statsPlayersQ.isLoading,
    statsRatingsQ.isLoading,
    statsStreaksGlobalQ.isLoading,
    statsStreaksQ.isLoading,
  ]);
  const pokeFlashKind =
    pokeButtonFlash.playerId != null &&
    targetPlayerId != null &&
    Number(pokeButtonFlash.playerId) === Number(targetPlayerId)
      ? pokeButtonFlash.kind
      : "none";

  useEffect(() => {
    const jumpUnread = searchParams.get("unread") === "1";
    if (!jumpUnread) {
      unreadJumpHandledRef.current = null;
      return;
    }
    if (!latestUnreadGuestbookId) return;
    if (!unreadJumpReady) return;
    if (unreadJumpHandledRef.current === latestUnreadGuestbookId) return;
    unreadJumpHandledRef.current = latestUnreadGuestbookId;
    focusGuestbookEntry(latestUnreadGuestbookId, { blink: false, behavior: "auto" });
    window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("unread");
      setSearchParams(next, { replace: true });
    }, 420);
  }, [focusGuestbookEntry, latestUnreadGuestbookId, searchParams, setSearchParams, unreadJumpReady]);

  if (!pageEntered) {
    return (
      <div className="page">
        <PageLoadingScreen sectionCount={5} />
      </div>
    );
  }

  if (!targetPlayerId) {
    return (
      <SectionSeparator
        id="profile-section-main"
        title={
          <span className="inline-flex items-center gap-2">
            <i className="fa-solid fa-id-badge text-text-muted" aria-hidden="true" />
            Profile
          </span>
        }
        className="mt-0 border-t-0 pt-0"
      >
        <div className="text-sm text-text-muted">Login to open your profile.</div>
      </SectionSeparator>
    );
  }

  return (
    <div className="page">
      <SectionSeparator
        id="profile-section-main"
        title={
          <span className="inline-flex items-center gap-2">
            <i className="fa-solid fa-id-badge text-text-muted" aria-hidden="true" />
            Profile
          </span>
        }
        className="mt-0 border-t-0 pt-0"
      >
      <div className="space-y-3">
        <ErrorToastOnError error={playersQ.error} title="Players loading failed" />
        <ErrorToastOnError error={profileQ.error} title="Profile loading failed" />
        <ErrorToastOnError error={pokesQ.error} title="Pokes loading failed" />
        <ErrorToastOnError error={pokesSummaryQ.error} title="Poke notifications loading failed" />
        <ErrorToastOnError error={pokeReadQ.error} title="Poke notifications loading failed" />
        <ErrorToastOnError error={saveProfileMut.error} title="Could not save profile text" />
        <ErrorToastOnError error={putAvatarMut.error} title="Could not save avatar" />
        <ErrorToastOnError error={delAvatarMut.error} title="Could not delete avatar" />
        <ErrorToastOnError error={putHeaderMut.error} title="Could not save header image" />
        <ErrorToastOnError error={delHeaderMut.error} title="Could not delete header image" />
        <ErrorToastOnError error={pokeMut.error} title="Could not anpöbeln" />
        <ErrorToastOnError error={markPokesReadAllMut.error} title="Could not mark notifications as read" />

        <div className="panel-subtle p-3 space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-border-card-inner/60 bg-bg-card-inner">
            {headerImageSrc ? (
              <button type="button" className="block w-full" onClick={() => setHeaderLightboxSrc(headerImageSrc)} title="Open header image">
                <img
                  src={headerImageSrc}
                  alt=""
                  className="w-full object-cover aspect-[16/9] cursor-zoom-in"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ) : (
              <div className="aspect-[16/9] grid place-items-center text-sm text-text-muted bg-bg-card-chip/25">
                No header image
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <AvatarCircle
              playerId={targetPlayerId}
              name={player?.display_name ?? profileQ.data?.display_name ?? String(targetPlayerId)}
              updatedAt={avatarUpdatedAt}
              sizeClass="h-14 w-14"
            />
            <div className="min-w-0">
              <div className="min-w-0 flex items-center gap-2">
                <span className="truncate text-base font-semibold text-text-normal">
                  {player?.display_name ?? profileQ.data?.display_name ?? `Player #${targetPlayerId}`}
                </span>
                {ownedCups.length ? (
                  <span className="inline-flex items-center gap-1.5">
                    {ownedCups.map((c) => (
                      <CupOwnerBadge key={c.key} cupKey={c.key} cupName={c.name} />
                    ))}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-text-muted">{isOwnProfile ? "This is your profile" : "Public profile"}</div>
            </div>
            <div className="ml-auto shrink-0">
              <div className="flex items-center gap-2">
                {isOwnProfile && unreadPokeCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (markPokesReadAllMut.isPending) return;
                      void markPokesReadAllMut.mutateAsync();
                    }}
                    disabled={markPokesReadAllMut.isPending}
                    title="Mark all anpöbel notifications as read"
                    className="h-9 w-9 p-0 inline-flex items-center justify-center active:scale-95"
                  >
                    {markPokesReadAllMut.isPending ? (
                      <i className="fa-solid fa-spinner fa-spin text-accent" aria-hidden="true" />
                    ) : pokeFlashKind === "read" ? (
                      <i className="fa-solid fa-circle-check text-accent" aria-hidden="true" />
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <i className="fa-solid fa-bell text-accent" aria-hidden="true" />
                        <span className="text-[11px] tabular-nums text-text-normal">{unreadPokeCount}</span>
                      </span>
                    )}
                  </Button>
                ) : null}

                {canEdit ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setHeaderEditorOpen(true)}
                      title={headerImageSrc ? "Edit header image" : "Upload header image"}
                    >
                      <i className="fa-solid fa-image md:hidden" aria-hidden="true" />
                      <span className="hidden md:inline">{headerImageSrc ? "Edit header" : "Upload header"}</span>
                    </Button>
                    {headerImageSrc ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          void delHeaderMut.mutateAsync();
                        }}
                        title="Delete header image"
                        className="h-9 w-9 p-0 inline-flex items-center justify-center"
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </Button>
                    ) : null}
                    <Button type="button" variant="ghost" onClick={() => setAvatarEditorOpen(true)} title="Edit avatar">
                      <i className="fa-solid fa-user-pen md:hidden" aria-hidden="true" />
                      <span className="hidden md:inline">Edit avatar</span>
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          {isOwnProfile && unreadPokeCount > 0 && unreadPokeAuthorsText ? (
            <div className="pt-1">
              <div className="inline-flex max-w-full items-center gap-1.5 text-[11px] text-text-muted">
                <i className="fa-solid fa-bell text-accent" aria-hidden="true" />
                <span className="truncate">
                  Angepöbelt von{unreadPokeAuthorCount > 1 ? ` (${unreadPokeAuthorCount})` : ""}: {unreadPokeAuthorsText}
                </span>
              </div>
            </div>
          ) : null}
          {!isOwnProfile && canPostGuestbook ? (
            <div className="pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (pokeMut.isPending) return;
                  void pokeMut.mutateAsync();
                }}
                disabled={pokeMut.isPending}
                title="Anpöbeln"
                className="active:scale-95 w-full sm:w-auto sm:ml-auto sm:flex"
              >
                <span className="inline-flex items-center gap-2">
                  <i
                    className={
                      "fa-solid " +
                      (pokeMut.isPending
                        ? "fa-spinner fa-spin"
                        : pokeFlashKind === "sent"
                          ? "fa-circle-check text-accent"
                          : "fa-hand-fist")
                    }
                    aria-hidden="true"
                  />
                  <span>{pokeMut.isPending ? "Anpöbeln…" : pokeFlashKind === "sent" ? "Gesendet" : "Anpöbeln"}</span>
                </span>
              </Button>
            </div>
          ) : null}
        </div>

        <div className="panel-subtle p-3 space-y-2">
          <div className="text-sm font-semibold text-text-normal">About</div>
          {canEdit ? (
            <>
              <Textarea
                label="Profile text"
                value={bioDraft}
                onChange={(e) => {
                  if (!targetPlayerId) return;
                  const next = e.target.value;
                  setBioDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: next }));
                }}
                placeholder="Write something about this player…"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => saveProfileMut.mutate()}
                  disabled={saveProfileMut.isPending || bioDraft === (profileQ.data?.bio ?? "")}
                  title="Save profile text"
                >
                  {saveProfileMut.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-sm text-text-normal whitespace-pre-wrap">{profileQ.data?.bio?.trim() || "No profile text yet."}</div>
          )}
        </div>

        <div className="panel-subtle p-3 space-y-3">
          <div className="text-sm font-semibold text-text-normal">Interesting stats</div>
          <ErrorToastOnError error={statsPlayersQ.error} title="Stats loading failed" />
          <ErrorToastOnError error={statsStreaksQ.error} title="Streaks loading failed" />
          <ErrorToastOnError error={statsStreaksGlobalQ.error} title="Streaks loading failed" />
          <ErrorToastOnError error={statsH2HQ.error} title="H2H loading failed" />
          <ErrorToastOnError error={statsRatingsQ.error} title="Ratings loading failed" />
          <ErrorToastOnError error={statsMatchesQ.error} title="Player matches loading failed" />
          <ErrorToastOnError error={clubsQ.error} title="Clubs loading failed" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="card-chip inline-flex items-center gap-2 px-2 py-1">
              <i className="fa-solid fa-gamepad text-text-muted" aria-hidden="true" />
              <span className="text-[11px] text-text-muted">P</span>
              <span className="text-[11px] font-mono tabular-nums text-text-chip">{fmtInt(playerStatsRow?.played ?? 0)}</span>
            </span>

            <span className="card-chip inline-flex items-center gap-2 px-2 py-1">
              <span className="inline-flex items-center gap-1">
                <span className="text-[11px] text-text-muted">W</span>
                <span className="text-[11px] font-mono tabular-nums text-status-text-green">{fmtInt(playerStatsRow?.wins ?? 0)}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-[11px] text-text-muted">D</span>
                <span className="text-[11px] font-mono tabular-nums text-amber-300">{fmtInt(playerStatsRow?.draws ?? 0)}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-[11px] text-text-muted">L</span>
                <span className="text-[11px] font-mono tabular-nums text-red-300">{fmtInt(playerStatsRow?.losses ?? 0)}</span>
              </span>
            </span>

            <span className="card-chip inline-flex items-center gap-2 px-2 py-1">
              <i className="fa-regular fa-futbol text-text-muted" aria-hidden="true" />
              <span className="text-[11px] font-mono tabular-nums text-text-chip">
                {fmtInt(playerStatsRow?.gf ?? 0)}:{fmtInt(playerStatsRow?.ga ?? 0)}
              </span>
              <span
                className={
                  "text-[11px] font-mono tabular-nums " +
                  ((playerStatsRow?.gd ?? 0) > 0
                    ? "text-status-text-green"
                    : (playerStatsRow?.gd ?? 0) < 0
                      ? "text-red-300"
                      : "text-text-muted")
                }
                title="Goal difference"
              >
                ({(playerStatsRow?.gd ?? 0) > 0 ? "+" : ""}
                {fmtInt(playerStatsRow?.gd ?? 0)})
              </span>
            </span>

            <span className="card-chip inline-flex items-center gap-2 px-2 py-1">
              <i className="fa-solid fa-trophy text-text-muted" aria-hidden="true" />
              <span className="text-[11px] text-text-muted">PPM</span>
              <span className="text-[11px] font-mono tabular-nums text-text-chip">
                {pct((playerStatsRow?.played ?? 0) > 0 ? (playerStatsRow?.pts ?? 0) / (playerStatsRow?.played ?? 1) : 0)}
              </span>
            </span>

            <span className="card-chip inline-flex items-center gap-2 px-2 py-1">
              <i className="fa-solid fa-chart-line text-text-muted" aria-hidden="true" />
              <span className="text-[11px] text-text-muted">Last 10</span>
              <span className="text-[11px] font-mono tabular-nums text-text-chip">{pct(playerStatsRow?.lastN_avg_pts ?? 0)}</span>
            </span>

            <span className="card-chip inline-flex items-center gap-2 px-2 py-1">
              <i className="fa-solid fa-ranking-star text-text-muted" aria-hidden="true" />
              <span className="text-[11px] text-text-muted">Elo</span>
              <span className="text-[11px] font-mono tabular-nums text-text-chip">
                {eloRow ? Math.round(eloRow.rating) : "—"}
              </span>
              <span className="text-[11px] text-text-muted">{eloRank != null ? `#${eloRank}` : ""}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {(["win_streak", "unbeaten_streak", "scoring_streak", "clean_sheet_streak"] as const).map((k) => {
              const icon = streakIconForKey(k);
              const cur = streakByKey.get(k)?.current ?? 0;
              const rec = streakByKey.get(k)?.record ?? 0;
              const globalRec = globalRecordByKey.get(k) ?? 0;
              const isNewRecordNow = cur > 0 && cur === globalRec;
              return (
                <div key={k} className={"card-chip px-3 py-2 " + (isNewRecordNow ? "border-accent" : "")}>
                  <div className="inline-flex items-center gap-2 text-text-muted">
                    {icon ? <i className={"fa-solid " + icon.icon} aria-hidden="true" /> : null}
                    <span>{icon?.label ?? k}</span>
                  </div>
                  <div className="font-semibold mt-0.5">
                    {cur}
                    <span className="text-text-muted"> / {rec}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="card-chip px-3 py-2">
              <div className="inline-flex items-center gap-2 text-text-muted">
                <i className="fa-solid fa-face-smile" aria-hidden="true" />
                <span>Favorite</span>
              </div>
              <div className="font-semibold mt-0.5">{favorite?.opponent.display_name ?? "—"}</div>
              {favorite ? (
                <div className="text-text-muted mt-0.5">
                  {favorite.wins}-{favorite.draws}-{favorite.losses} · {pct(favorite.pts_per_match)} ppm
                </div>
              ) : null}
            </div>
            <div className="card-chip px-3 py-2">
              <div className="inline-flex items-center gap-2 text-text-muted">
                <i className="fa-solid fa-heart-crack" aria-hidden="true" />
                <span>Nemesis</span>
              </div>
              <div className="font-semibold mt-0.5">{nemesis?.opponent.display_name ?? "—"}</div>
              {nemesis ? (
                <div className="text-text-muted mt-0.5">
                  {nemesis.wins}-{nemesis.draws}-{nemesis.losses} · {pct(nemesis.pts_per_match)} ppm
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border-card-inner/50 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-text-muted">Recent tournaments and matches</div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAllMatchTournaments((v) => !v)}
                title={showAllMatchTournaments ? "Show recent" : "Show all"}
                className="h-8 px-3 text-[11px]"
              >
                {showAllMatchTournaments ? "Recent" : "All"}
              </Button>
            </div>
            <MatchHistoryList
              tournaments={visibleMatchTournaments}
              focusId={targetPlayerId}
              clubs={clubsQ.data ?? []}
              showMeta={false}
            />
          </div>
        </div>

      </div>
      </SectionSeparator>

      <SectionSeparator
        id="profile-section-guestbook"
        title={
          <span className="inline-flex items-center gap-2">
            <i className="fa-solid fa-book text-text-muted" aria-hidden="true" />
            Guestbook
          </span>
        }
        className="min-h-[100svh]"
      >
      <div className="space-y-3">
        {unreadGuestbookCount > 0 ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              title="Jump to latest unread guestbook message"
              onClick={() => {
                if (!latestUnreadGuestbookId) return;
                focusGuestbookEntry(latestUnreadGuestbookId, { blink: false });
              }}
            >
              <Pill title="Unread guestbook messages">
                <i className="fa-solid fa-envelope text-accent" aria-hidden="true" />
                <span className="tabular-nums text-text-normal">{unreadGuestbookCount}</span>
              </Pill>
            </button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (!targetPlayerId || unreadGuestbookIds.length === 0 || markGuestbookReadAllMut.isPending) return;
                const ok = window.confirm(`Mark ${unreadGuestbookIds.length} unread guestbook message(s) as read?`);
                if (!ok) return;
                markGuestbookReadAllMut.mutate();
              }}
              title="Mark all unread guestbook messages as read"
              disabled={markGuestbookReadAllMut.isPending}
            >
              <i className="fa-solid fa-envelope-open md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Read all</span>
            </Button>
          </div>
        ) : null}
        <ErrorToastOnError error={guestbookQ.error} title="Guestbook loading failed" />
        <ErrorToastOnError error={guestbookReadQ.error} title="Guestbook read-status loading failed" />
        <ErrorToastOnError error={createGuestbookMut.error} title="Could not post guestbook message" />
        <ErrorToastOnError error={deleteGuestbookMut.error} title="Could not delete guestbook message" />
        <ErrorToastOnError error={markGuestbookReadMut.error} title="Could not mark guestbook entry as read" />
        <ErrorToastOnError error={markGuestbookReadAllMut.error} title="Could not mark guestbook as read" />

        {canPostGuestbook ? (
          <div className="panel-subtle p-3 space-y-2">
            <Textarea
              label="Leave a message"
              value={guestbookDraft}
              onChange={(e) => {
                if (!targetPlayerId) return;
                const next = e.target.value;
                setGuestbookDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: next }));
              }}
              placeholder={`Write something for ${(player?.display_name ?? profileQ.data?.display_name ?? "this player")}…`}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => createGuestbookMut.mutate()}
                disabled={createGuestbookMut.isPending || !guestbookDraft.trim()}
                title="Post message"
              >
                <i className="fa-solid fa-paper-plane md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">{createGuestbookMut.isPending ? "Posting…" : "Post"}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="panel-subtle p-3 text-sm text-text-muted">Login as a player to post guestbook messages.</div>
        )}

        {guestbookQ.isLoading ? <div className="text-sm text-text-muted">Loading…</div> : null}
        {!guestbookQ.isLoading && (guestbookQ.data?.length ?? 0) === 0 ? (
          <div className="panel-subtle p-3 text-sm text-text-muted">No messages yet.</div>
        ) : null}

        <div className="space-y-2">
          {(guestbookQ.data ?? []).map((entry) => {
            const authorAvatarUpdatedAt = avatarUpdatedAtByPlayerId.get(entry.author_player_id) ?? null;
            const canDeleteEntry =
              !!token &&
              (role === "admin" || isOwnProfile || currentPlayerId === entry.author_player_id);
            const isUnseen = !!token && !seenGuestbook.has(entry.id);
            return (
              <div
                key={entry.id}
                id={`guestbook-entry-${entry.id}`}
                className="panel-subtle p-3 scroll-mt-28 sm:scroll-mt-32"
                onClick={() => {
                  if (!token || !isUnseen || markGuestbookReadMut.isPending) return;
                  markGuestbookReadMut.mutate(entry.id);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <AvatarCircle
                      playerId={entry.author_player_id}
                      name={entry.author_display_name}
                      updatedAt={authorAvatarUpdatedAt}
                      sizeClass="h-8 w-8"
                      fallbackClassName="text-xs font-semibold text-text-muted"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-text-normal">{entry.author_display_name}</div>
                      <div className="text-[11px] text-text-muted">
                        {fmtDateTime(entry.created_at)}
                        {entry.updated_at !== entry.created_at ? " · edited" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {isUnseen ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!token || markGuestbookReadMut.isPending) return;
                          markGuestbookReadMut.mutate(entry.id);
                        }}
                        title="Mark as read"
                        className="h-8 w-8 p-0 inline-flex items-center justify-center"
                      >
                        <i className="fa-solid fa-envelope text-accent motion-safe:animate-pulse" aria-hidden="true" />
                      </Button>
                    ) : null}
                    {canDeleteEntry ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const ok = window.confirm("Delete this message?");
                          if (!ok) return;
                          void deleteGuestbookMut.mutateAsync(entry.id);
                        }}
                        title="Delete message"
                        className="h-8 w-8 p-0 inline-flex items-center justify-center"
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 text-sm whitespace-pre-wrap">{entry.body}</div>
              </div>
            );
          })}
        </div>
      </div>
      </SectionSeparator>

      <PlayerAvatarEditor
        open={avatarEditorOpen}
        title="Edit avatar"
        canEdit={canEdit}
        onClose={() => setAvatarEditorOpen(false)}
        onSave={async (blob) => {
          await putAvatarMut.mutateAsync(blob);
        }}
        onDelete={
          canEdit && avatarUpdatedAt
            ? async () => {
                await delAvatarMut.mutateAsync();
              }
            : null
        }
      />

      <CommentImageCropper
        open={headerEditorOpen}
        title="Edit profile header"
        aspectW={16}
        aspectH={9}
        outputWidth={1920}
        outputHeight={1080}
        hint="Crop 16:9 · exported as 1920x1080"
        onClose={() => setHeaderEditorOpen(false)}
        onApply={async (blob) => {
          await putHeaderMut.mutateAsync(blob);
        }}
      />

      <ImageLightbox open={!!headerLightboxSrc} src={headerLightboxSrc} onClose={() => setHeaderLightboxSrc(null)} />
    </div>
  );
}
