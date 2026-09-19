import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import VoteVotersModal from "../ui/primitives/VoteVotersModal";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";

import { useAuth } from "../auth/AuthContext";
import {
  getPlayerProfile,
  listPlayerGuestbookEntryVoters,
  listPlayers,
  patchPlayerProfile,
} from "../api/players.api";
import { ApiError } from "../api/client";
import { getCup, listCupDefs } from "../api/cup.api";
import {
  getStatsH2H,
  getStatsPlayerMatches,
  getStatsPlayers,
  getStatsRatings,
  getStatsRecords,
  getStatsStreaks,
} from "../api/stats.api";
import { listClubs } from "../api/clubs.api";
import { groupFriendlyTournamentsByDate } from "./stats/matchHistory";
import { FORM_LAST_N } from "./stats/standings";
import { usePlayerAvatarMap } from "../hooks/usePlayerAvatarMap";
import { usePlayerProfileWS } from "../hooks/useTournamentWS";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import { usePageTitle } from "../ui/layout/PageTitleContext";
import { forgetLocation } from "../ui/shell/lastLocation";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import PageLayout from "../ui/layout/PageLayout";
import { useTabParam } from "../ui/shell/useTabParam";
import { User, BarChart3, ListChecks, BookOpen } from "lucide-react";
import GuestbookSection from "./profile/GuestbookSection";
import ProfileHeader from "./profile/ProfileHeader";
import ProfileOverviewTab from "./profile/ProfileOverviewTab";
import ProfileStatsSection from "./profile/ProfileStatsSection";
import MatchHistorySection from "./profile/MatchHistorySection";
import { computeFavoriteTeammates } from "./profile/favoriteTeammates";
import { useProfilePokes } from "./profile/useProfilePokes";
import { useProfileGuestbook } from "./profile/useProfileGuestbook";
import { useGuestbookUnreadJump } from "./profile/useGuestbookUnreadJump";
import { qk } from "../api/queryKeys";

type ProfileTab = "overview" | "stats" | "matches" | "guestbook";
const PROFILE_TAB_KEYS = ["overview", "stats", "matches", "guestbook"] as const satisfies readonly ProfileTab[];

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, role, playerId: currentPlayerId, actorPlayerId } = useAuth();
  const pageEntered = useRouteEntryLoading();
  const qc = useQueryClient();

  const routePlayerId = id ? Number(id) : null;
  const targetPlayerId =
    Number.isFinite(routePlayerId) && (routePlayerId ?? 0) > 0 ? (routePlayerId as number) : currentPlayerId;
  const isOwnProfileView = !!currentPlayerId && !!targetPlayerId && currentPlayerId === targetPlayerId;

  const [profileTab, setProfileTab] = useTabParam<ProfileTab>(PROFILE_TAB_KEYS, "overview");
  const playersQ = useQuery({ queryKey: qk.players(), queryFn: listPlayers });
  const profileQ = useQuery({
    queryKey: qk.playerProfile(targetPlayerId ?? "none"),
    queryFn: () => getPlayerProfile(targetPlayerId as number),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  // A player that no longer exists must not trap the Players tab (U6).
  const { pathname: locPathname, search: locSearch } = useLocation();
  useEffect(() => {
    if (!(profileQ.error instanceof ApiError) || profileQ.error.status !== 404) return;
    forgetLocation(locPathname + locSearch);
  }, [profileQ.error, locPathname, locSearch]);

  const clubsQ = useQuery({ queryKey: qk.clubs(), queryFn: () => listClubs() });
  const statsPlayersQ = useQuery({
    queryKey: qk.stats.players("profile", targetPlayerId ?? "none"),
    // Same Form window as the stats Player tab — one definition, two surfaces (A9).
    queryFn: () => getStatsPlayers({ lastN: FORM_LAST_N, mode: "overall" }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const statsStreaksQ = useQuery({
    queryKey: qk.stats.streaks("profile", targetPlayerId ?? "none"),
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
    queryKey: qk.stats.streaks("profile", "global"),
    queryFn: () =>
      getStatsStreaks({
        mode: "overall",
        scope: "tournaments",
        limit: 1,
      }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const statsH2HQ = useQuery({
    queryKey: qk.stats.h2hProfile(targetPlayerId ?? "none"),
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
    queryKey: qk.stats.ratings("profile", targetPlayerId ?? "none"),
    queryFn: () =>
      getStatsRatings({
        mode: "overall",
        scope: "tournaments",
      }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const statsMatchesQ = useQuery({
    queryKey: qk.stats.playerMatchesProfile(targetPlayerId ?? "none"),
    queryFn: () => getStatsPlayerMatches({ playerId: targetPlayerId as number, scope: "both" }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  // The profile's badge band (M5) — exactly the Records page's default key, so the badge and the
  // page it opens are one cache entry: tapping a badge is a cache hit, not a second fetch.
  const recordsQ = useQuery({
    queryKey: qk.stats.records("overall", "tournaments"),
    queryFn: () => getStatsRecords({ mode: "overall", scope: "tournaments" }),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const cupDefsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs });
  const cups = useMemo(() => {
    const raw = cupDefsQ.data?.cups?.length ? cupDefsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
    const nonDefault = raw.filter((c) => c.key !== "default");
    const defaults = raw.filter((c) => c.key === "default");
    return [...nonDefault, ...defaults];
  }, [cupDefsQ.data]);
  const cupsQ = useQueries({
    queries: cups.map((c) => ({
      queryKey: qk.cup(c.key),
      queryFn: () => getCup(c.key),
    })),
  });
  const cupsLoading = cupsQ.some((q) => q.isLoading);

  const { avatarUpdatedAtById } = usePlayerAvatarMap();

  const [bioDraftByPlayerId, setBioDraftByPlayerId] = useState<Record<number, string>>({});
  const bioDraft =
    targetPlayerId != null ? (bioDraftByPlayerId[targetPlayerId] ?? (profileQ.data?.bio ?? "")) : "";

  const player = useMemo(() => {
    const rows = playersQ.data ?? [];
    if (!targetPlayerId) return null;
    return rows.find((p) => p.id === targetPlayerId) ?? null;
  }, [playersQ.data, targetPlayerId]);

  usePageTitle(player?.display_name ?? profileQ.data?.display_name ?? "Profile");

  const isOwnProfile = isOwnProfileView;
  const canEdit = !!token && role !== "reader" && isOwnProfile;
  const displayName = player?.display_name ?? profileQ.data?.display_name ?? null;
  const avatarUpdatedAt = targetPlayerId ? avatarUpdatedAtById.get(targetPlayerId) ?? null : null;

  const playerStatsRow = useMemo(() => {
    const rows = statsPlayersQ.data?.players ?? [];
    if (!targetPlayerId) return null;
    return rows.find((r) => r.player_id === targetPlayerId) ?? null;
  }, [statsPlayersQ.data?.players, targetPlayerId]);
  const nemesis = statsH2HQ.data?.nemesis_all ?? null;
  const favorite = statsH2HQ.data?.favorite_victim_all ?? null;
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

  const allMatchTournaments = useMemo(
    () => groupFriendlyTournamentsByDate(statsMatchesQ.data?.tournaments ?? []),
    [statsMatchesQ.data?.tournaments]
  );

  // Best 2v2 partners, derived client-side from this player's finished matches.
  const favoriteTeammates = useMemo(
    () => computeFavoriteTeammates(statsMatchesQ.data?.tournaments ?? [], targetPlayerId),
    [statsMatchesQ.data?.tournaments, targetPlayerId]
  );
  const tournamentPlacementById = useMemo(() => {
    const out = new Map<number, { position: number; total: number | null }>();
    const byTournamentId = new Map<number, number>(
      (statsPlayersQ.data?.tournaments ?? []).map((t) => [Number(t.id), Number(t.players_count)])
    );
    for (const [tidStr, pos] of Object.entries(playerStatsRow?.positions_by_tournament ?? {})) {
      const tid = Number(tidStr);
      if (!Number.isFinite(tid) || tid <= 0 || pos == null) continue;
      const totalPlayers = byTournamentId.get(tid);
      out.set(tid, { position: Number(pos), total: Number.isFinite(totalPlayers) ? Number(totalPlayers) : null });
    }
    return out;
  }, [playerStatsRow?.positions_by_tournament, statsPlayersQ.data?.tournaments]);

  const pokes = useProfilePokes({ targetPlayerId, token, role, actorPlayerId });
  const guestbook = useProfileGuestbook({
    targetPlayerId,
    token,
    role,
    actorPlayerId,
    currentPlayerId,
    isOwnProfile,
    avatarUpdatedAtByPlayerId: avatarUpdatedAtById,
  });

  usePlayerProfileWS(targetPlayerId, token);

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
      await qc.invalidateQueries({ queryKey: qk.playerProfile(targetPlayerId ?? "none") });
      await qc.invalidateQueries({ queryKey: qk.playerProfiles() });
    },
  });

  // Gate the `?unread=1` deep-link jump until every profile query has loaded.
  const unreadJumpReady = !(
    playersQ.isLoading ||
    profileQ.isLoading ||
    guestbook.guestbookLoading ||
    pokes.pokesLoading ||
    pokes.pokesSummaryLoading ||
    clubsQ.isLoading ||
    statsPlayersQ.isLoading ||
    statsStreaksQ.isLoading ||
    statsStreaksGlobalQ.isLoading ||
    statsH2HQ.isLoading ||
    statsRatingsQ.isLoading ||
    statsMatchesQ.isLoading ||
    recordsQ.isLoading ||
    cupDefsQ.isLoading ||
    cupsLoading
  );
  useGuestbookUnreadJump({
    ready: unreadJumpReady,
    searchParams,
    setSearchParams,
    latestUnreadGuestbookEntryId: guestbook.latestUnreadGuestbookEntryId,
    focusGuestbookEntry: guestbook.focusGuestbookEntry,
  });

  // `PageLayout`, not a bare `.page`: the desktop's back chevron lives in its title
  // row, and a loading or logged-out profile is still a page you went into (Q6).
  if (!pageEntered) {
    return (
      <PageLayout>
        <PageLoadingScreen sectionCount={5} />
      </PageLayout>
    );
  }

  if (!targetPlayerId) {
    return (
      <PageLayout>
        <div className="px-1 py-8 text-center text-sm text-text-muted">Login to open your profile.</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={displayName ?? "Profile"}>
      <div id="profile-section-main" className="space-y-3">
        <ErrorToastOnError error={playersQ.error} title="Players loading failed" />
        <ErrorToastOnError error={profileQ.error} title="Profile loading failed" />
        <ErrorToastOnError error={pokes.pokesError} title="Pokes loading failed" />
        <ErrorToastOnError error={pokes.pokesSummaryError} title="Poke notifications loading failed" />
        <ErrorToastOnError error={saveProfileMut.error} title="Could not save profile text" />
        <ErrorToastOnError error={pokes.pokeMut.error} title="Could not anpöbeln" />
        <ErrorToastOnError error={pokes.markPokesReadAllMut.error} title="Could not mark notifications as read" />

        <ProfileHeader
          targetPlayerId={targetPlayerId}
          token={token}
          canEdit={canEdit}
          isOwnProfile={isOwnProfile}
          displayName={displayName}
          avatarUpdatedAt={avatarUpdatedAt}
          profileHeaderUpdatedAt={profileQ.data?.header_image_updated_at ?? null}
          ownedCups={ownedCups}
          totalGuestbookCount={guestbook.totalGuestbookCount}
          unreadGuestbookCount={guestbook.unreadGuestbookCount}
          unreadGuestbookAuthorsText={guestbook.unreadGuestbookAuthorsText}
          unreadGuestbookAuthorCount={guestbook.unreadGuestbookAuthorCount}
          pokes={pokes}
          records={recordsQ.data?.records ?? []}
        />

        <SectionTabs
          tabs={[
            { key: "overview", label: "Overview", icon: <User size={14} /> },
            { key: "stats", label: "Stats", icon: <BarChart3 size={14} /> },
            { key: "matches", label: "Matches", icon: <ListChecks size={14} /> },
            { key: "guestbook", label: "Guestbook", icon: <BookOpen size={14} />, badge: (isOwnProfile && guestbook.unreadGuestbookCount) || undefined },
          ] satisfies SectionTab<ProfileTab>[]}
          active={profileTab}
          onChange={setProfileTab}
        />

        {profileTab === "overview" ? (
          <ProfileOverviewTab
            canEdit={canEdit}
            bioDraft={bioDraft}
            profileBio={profileQ.data?.bio ?? null}
            onBioChange={(value) => {
              if (!targetPlayerId) return;
              setBioDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: value }));
            }}
            onSaveBio={() => saveProfileMut.mutate()}
            savingBio={saveProfileMut.isPending}
            favorite={favorite}
            nemesis={nemesis}
            statsH2HError={statsH2HQ.error}
            favoriteTeammates={favoriteTeammates}
            allMatchTournaments={allMatchTournaments}
            clubs={clubsQ.data ?? []}
            tournamentPlacementById={tournamentPlacementById}
            targetPlayerId={targetPlayerId}
            statsMatchesError={statsMatchesQ.error}
            onViewAllMatches={() => setProfileTab("matches")}
          />
        ) : null}

        {profileTab === "stats" ? (
          <ProfileStatsSection
            targetPlayerId={targetPlayerId}
            playerStatsRow={playerStatsRow}
            allPlayers={statsPlayersQ.data?.players ?? []}
            ratingsRows={statsRatingsQ.data?.rows ?? []}
            streaksCategories={statsStreaksQ.data?.categories ?? []}
            streaksGlobalCategories={statsStreaksGlobalQ.data?.categories ?? []}
            statsPlayersError={statsPlayersQ.error}
            statsStreaksError={statsStreaksQ.error}
            statsStreaksGlobalError={statsStreaksGlobalQ.error}
            statsRatingsError={statsRatingsQ.error}
          />
        ) : null}

        {profileTab === "matches" ? (
          <MatchHistorySection
            allMatchTournaments={allMatchTournaments}
            targetPlayerId={targetPlayerId}
            clubs={clubsQ.data ?? []}
            tournamentPlacementById={tournamentPlacementById}
            statsMatchesError={statsMatchesQ.error}
            clubsError={clubsQ.error}
          />
        ) : null}

        {profileTab === "guestbook" ? (
          <div id="profile-section-guestbook" className="min-h-[60svh]">
            <GuestbookSection
              {...guestbook.sectionProps}
              placeholder={`Write something for ${displayName ?? "this player"}…`}
            />
          </div>
        ) : null}
      </div>

      <VoteVotersModal
        open={guestbook.voteVotersEntryId != null}
        title="Guestbook votes"
        queryKey={["players", "guestbook", "voters", guestbook.voteVotersEntryId ?? "none"]}
        queryFn={() => listPlayerGuestbookEntryVoters(guestbook.voteVotersEntryId as number)}
        onClose={() => guestbook.setVoteVotersEntryId(null)}
      />
    </PageLayout>
  );
}
