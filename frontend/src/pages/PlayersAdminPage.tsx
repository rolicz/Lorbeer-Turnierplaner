import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import AvatarCircle from "../ui/primitives/AvatarCircle";
import CupOwnerBadge from "../ui/primitives/CupOwnerBadge";
import { Pill } from "../ui/primitives/Pill";
import { List, ListRow } from "../ui/primitives/List";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import { Users, UserPlus } from "lucide-react";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";

import { useAuth } from "../auth/AuthContext";
import {
  createPlayer,
  listPlayerGuestbookSummary,
  listPlayerPokeSummary,
  listPlayerProfiles,
  listPlayers,
  patchPlayer,
} from "../api/players.api";
import { getCup, listCupDefs, type CupDef } from "../api/cup.api";
import { cupColorVarForKey, rgbFromCssVar } from "../cupColors";
import { usePlayerAvatarMap } from "../hooks/usePlayerAvatarMap";
import { useSeenGuestbookIdsByProfileId } from "../hooks/useSeenGuestbook";
import { scrollToSectionById } from "../ui/scrollToSection";

/** Solid ring for a single cup, evenly-split conic-gradient ring for multiple. */
function cupRingBackground(defs: CupDef[]): string | undefined {
  const colors = defs.map((c) => rgbFromCssVar(cupColorVarForKey(c.key)));
  if (colors.length === 0) return undefined;
  if (colors.length === 1) return colors[0];
  const step = 360 / colors.length;
  return `conic-gradient(${colors.map((col, i) => `${col} ${i * step}deg ${(i + 1) * step}deg`).join(", ")})`;
}

export default function PlayersAdminPage() {
  const { token, role } = useAuth();
  const pageEntered = useRouteEntryLoading();
  const isAdmin = role === "admin";
  const navigate = useNavigate();
  const qc = useQueryClient();

  type PlayersTab = "players" | "add";
  const [tab, setTab] = useState<PlayersTab>("players");
  const playersTabs: SectionTab<PlayersTab>[] = [
    { key: "players", label: "Players", icon: <Users size={14} /> },
    ...(isAdmin ? [{ key: "add" as PlayersTab, label: "Add player", icon: <UserPlus size={14} /> }] : []),
  ];

  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const profilesQ = useQuery({ queryKey: ["players", "profiles"], queryFn: listPlayerProfiles });
  const guestbookSummaryQ = useQuery({
    queryKey: ["players", "guestbook", "summary"],
    queryFn: listPlayerGuestbookSummary,
  });
  const pokesSummaryQ = useQuery({
    queryKey: ["players", "pokes", "summary"],
    queryFn: listPlayerPokeSummary,
  });
  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();

  const [newName, setNewName] = useState("");
  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!isAdmin) throw new Error("Admin only");
      return createPlayer(token, newName.trim());
    },
    onSuccess: async () => {
      setNewName("");
      await qc.invalidateQueries({ queryKey: ["players"] });
      await qc.invalidateQueries({ queryKey: ["stats"] });
      await qc.invalidateQueries({ queryKey: ["cup"] });
    },
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const patchMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!isAdmin) throw new Error("Admin only");
      if (!editId) throw new Error("No player selected");
      const n = editName.trim();
      if (!n) throw new Error("Name cannot be empty");
      return patchPlayer(token, editId, n);
    },
    onSuccess: async () => {
      setEditId(null);
      setEditName("");
      await qc.invalidateQueries({ queryKey: ["players"] });
      await qc.invalidateQueries({ queryKey: ["stats"] });
      await qc.invalidateQueries({ queryKey: ["cup"] });
    },
  });

  const players = playersQ.data ?? [];
  const seenGuestbookByPid = useSeenGuestbookIdsByProfileId(players.map((p) => p.id));
  const guestbookSummaryByPid = useMemo(() => {
    const map = new Map<number, { entry_ids: number[] }>();
    for (const row of guestbookSummaryQ.data ?? []) {
      map.set(Number(row.profile_player_id), { entry_ids: row.entry_ids ?? [] });
    }
    return map;
  }, [guestbookSummaryQ.data]);
  const pokeSummaryByPid = useMemo(() => {
    const map = new Map<number, { poke_ids: number[]; unread_by_profile_owner_count: number }>();
    for (const row of pokesSummaryQ.data ?? []) {
      map.set(Number(row.profile_player_id), {
        poke_ids: row.poke_ids ?? [],
        unread_by_profile_owner_count: Number(row.unread_by_profile_owner_count ?? 0),
      });
    }
    return map;
  }, [pokesSummaryQ.data]);
  const bioByPlayerId = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of profilesQ.data ?? []) {
      map.set(Number(p.player_id), p.bio ?? "");
    }
    return map;
  }, [profilesQ.data]);

  // Current cup holders → laurel badge(s) next to the name + a cup-colored ring
  // around the avatar (a player can hold multiple cups). Loaded async (cache is
  // shared with the dashboard/cup cards); does not block the initial render.
  const cupDefsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  const cupDefs = useMemo<CupDef[]>(() => cupDefsQ.data?.cups ?? [], [cupDefsQ.data]);
  const cupQueries = useQueries({
    queries: cupDefs.map((c) => ({ queryKey: ["cup", c.key], queryFn: () => getCup(c.key) })),
  });
  // Cheap to rebuild each render (cups are few); avoids a complex useMemo dep list.
  const cupsByPlayerId = new Map<number, CupDef[]>();
  cupQueries.forEach((q, i) => {
    const ownerId = Number(q.data?.owner?.id ?? 0);
    const def = cupDefs[i];
    if (ownerId > 0 && def) {
      const arr = cupsByPlayerId.get(ownerId) ?? [];
      arr.push(def);
      cupsByPlayerId.set(ownerId, arr);
    }
  });

  const initialLoading =
    !pageEntered ||
    (playersQ.isLoading && !playersQ.data) ||
    (profilesQ.isLoading && !profilesQ.data) ||
    (guestbookSummaryQ.isLoading && !guestbookSummaryQ.data) ||
    (pokesSummaryQ.isLoading && !pokesSummaryQ.data);

  if (initialLoading) {
    return (
      <div className="page">
        <PageLoadingScreen sectionCount={4} />
      </div>
    );
  }

  const openProfile = (playerId: number, jumpUnread: boolean) => {
    navigate(`/profiles/${playerId}${jumpUnread ? "?unread=1" : ""}`);
    // Keep row-click behavior consistent with profile subnav scroll positioning.
    window.setTimeout(() => {
      scrollToSectionById("profile-section-main", 24);
    }, 0);
  };

  return (
    <div className="page space-y-3">
      <ErrorToastOnError error={createMut.error} title="Could not create player" />
      <ErrorToastOnError error={playersQ.error} title="Players loading failed" />
      <ErrorToastOnError error={patchMut.error} title="Could not save player" />
      <ErrorToastOnError error={guestbookSummaryQ.error} title="Guestbook summary loading failed" />
      <ErrorToastOnError error={pokesSummaryQ.error} title="Poke summary loading failed" />

      <div className="mb-1 hidden lg:block">
        <h1 className="text-xl font-bold tracking-tight text-text-normal">Players</h1>
      </div>

      <SectionTabs tabs={playersTabs} active={tab} onChange={setTab} />

      {tab === "add" && isAdmin ? (
        <div className="mx-auto w-full max-w-md">
          <div className="section-head"><span className="section-label">Create player</span></div>
          <div className="flex flex-wrap items-end gap-2">
            <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !newName.trim()}
              title="Create"
            >
              {createMut.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      ) : (
        <List>
          {players.map((p) => {
            const updatedAt = avatarUpdatedAtByPlayerId.get(p.id) ?? null;
            const editing = editId === p.id;
            const bio = bioByPlayerId.get(p.id)?.trim() ?? "";
            const seen = seenGuestbookByPid.get(p.id) ?? new Set<number>();
            const entryIds = guestbookSummaryByPid.get(p.id)?.entry_ids ?? [];
            const unseenCount = entryIds.filter((eid) => !seen.has(eid)).length;
            const hasUnseen = !!token && unseenCount > 0;
            const unseenPokes = Number(pokeSummaryByPid.get(p.id)?.unread_by_profile_owner_count ?? 0);
            const hasUnreadPokes = unseenPokes > 0;
            const heldCups = cupsByPlayerId.get(p.id) ?? [];
            const ringBg = cupRingBackground(heldCups);

            return (
              <div key={p.id}>
                <ListRow
                  onClick={() => openProfile(p.id, false)}
                  ariaLabel={`Open profile: ${p.display_name}`}
                  leading={
                    ringBg ? (
                      <span className="inline-flex shrink-0 rounded-full p-[2.5px]" style={{ background: ringBg }} title={`Holds ${heldCups.map((c) => c.name).join(", ")}`}>
                        <AvatarCircle playerId={p.id} name={p.display_name} updatedAt={updatedAt} sizeClass="h-10 w-10" />
                      </span>
                    ) : (
                      <AvatarCircle playerId={p.id} name={p.display_name} updatedAt={updatedAt} sizeClass="h-10 w-10" />
                    )
                  }
                  trailing={
                    <>
                      {hasUnreadPokes ? (
                        <button type="button" title="Unread anpöbel notifications" onClick={() => openProfile(p.id, false)}>
                          <Pill title="Unread anpöbel notifications">
                            <i className="fa-solid fa-bell text-accent" aria-hidden="true" />
                            <span className="tabular-nums text-text-normal">{unseenPokes}</span>
                          </Pill>
                        </button>
                      ) : null}
                      {hasUnseen ? (
                        <button type="button" title="Jump to latest unread guestbook message" onClick={() => openProfile(p.id, true)}>
                          <Pill title="Unread guestbook messages">
                            <i className="fa-solid fa-envelope text-accent" aria-hidden="true" />
                            <span className="tabular-nums text-text-normal">{unseenCount}</span>
                          </Pill>
                        </button>
                      ) : null}
                      {isAdmin ? (
                        editing ? (
                          <Button variant="ghost" type="button" onClick={() => { setEditId(null); setEditName(""); }} title="Cancel">
                            <i className="fa-solid fa-xmark" aria-hidden="true" />
                          </Button>
                        ) : (
                          <Button variant="ghost" type="button" onClick={() => { setEditId(p.id); setEditName(p.display_name); }} title="Rename">
                            <i className="fa-solid fa-pen" aria-hidden="true" />
                          </Button>
                        )
                      ) : null}
                    </>
                  }
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-text-normal">{p.display_name}</span>
                    {heldCups.length ? (
                      <span className="flex shrink-0 items-center gap-1">
                        {heldCups.map((c) => (
                          <CupOwnerBadge key={c.key} cupKey={c.key} cupName={c.name} size="sm" />
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {bio ? <span className="mt-0.5 block truncate text-xs text-text-muted">{bio}</span> : null}
                </ListRow>

                {editing && isAdmin ? (
                  <div className="flex flex-wrap items-end gap-2 pb-3 pl-[52px]">
                    <Input label="New name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Button
                      type="button"
                      onClick={() => patchMut.mutate()}
                      disabled={patchMut.isPending || !editName.trim()}
                      title="Save"
                    >
                      {patchMut.isPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </List>
      )}
    </div>
  );
}
