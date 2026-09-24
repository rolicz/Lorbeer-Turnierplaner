import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, RotateCw, ShieldHalf, Star, Trash2 } from "lucide-react";

import ClubStarHistory from "../ui/ClubStarHistory";
import { starsLabel } from "../ui/clubControls";
import FormLabel from "../ui/primitives/FormLabel";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import ConfirmDialog from "../ui/primitives/ConfirmDialog";
import SegmentedSwitch from "../ui/primitives/SegmentedSwitch";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import InlineLoading from "../ui/primitives/InlineLoading";
import EmptyState from "../ui/primitives/EmptyState";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import PageLayout from "../ui/layout/PageLayout";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import { useTabParam } from "../ui/shell/useTabParam";
import { List, Plus } from "lucide-react";
import ClubList, { type ClubGroup } from "./clubs/ClubList";
import PromoteClubStars from "./clubs/PromoteClubStars";

import { atLeast, useAuth } from "../auth/AuthContext";
import { createClub, deleteClub, listClubs, listLeagues, patchClub } from "../api/clubs.api";
import { qk } from "../api/queryKeys";
import type { Club, League } from "../api/types";

function starValues(): number[] {
  const out: number[] = [];
  for (let x = 0.5; x <= 5.0001; x += 0.5) out.push(Number(x.toFixed(1)));
  return out;
}

function leagueNameForClub(c: Club, leaguesById: Map<number, string>) {
  const byName = (c.league_name ?? "").trim();
  if (byName) return byName;
  if (typeof c.league_id === "number") return leaguesById.get(c.league_id) ?? "—";

  return "—";
}

/** Flag code for a club's league — the club row carries it, older rows fall back to the league list. */
function leagueNationForClub(c: Club, nationsById: Map<number, string>) {
  if (c.league_nation) return c.league_nation;
  if (typeof c.league_id === "number") return nationsById.get(c.league_id) ?? null;

  return null;
}

function groupByStars(clubs: Club[], leaguesById: Map<number, string>) {
  const m = new Map<string, Club[]>();
  for (const c of clubs) {
    const key = `${starsLabel(c.star_rating)}★`;
    const arr = m.get(key) ?? [];
    arr.push(c);
    m.set(key, arr);
  }

  const entries = Array.from(m.entries());
  entries.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));

  for (const [, arr] of entries) {
    arr.sort(
      (x, y) =>
        (y.star_rating ?? 0) - (x.star_rating ?? 0) ||
        leagueNameForClub(x, leaguesById).localeCompare(leagueNameForClub(y, leaguesById)) ||
        x.name.localeCompare(y.name)
    );
  }

  return entries;
}

function groupByLeague(clubs: Club[], leaguesById: Map<number, string>) {
  const m = new Map<string, Club[]>();
  for (const c of clubs) {
    const key = leagueNameForClub(c, leaguesById);
    const arr = m.get(key) ?? [];
    arr.push(c);
    m.set(key, arr);
  }

  const entries = Array.from(m.entries());
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  for (const [, arr] of entries) {
    arr.sort(
      (x, y) =>
        (y.star_rating ?? 0) - (x.star_rating ?? 0) ||
        x.name.localeCompare(y.name)
    );
  }

  return entries;
}

type ClubTab = "browse" | "new";
const CLUB_TAB_KEYS = ["browse", "new"] as const satisfies readonly ClubTab[];

export default function ClubsPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const pageEntered = useRouteEntryLoading();

  const isAdmin = role === "admin";
  const isEditorOrAdmin = atLeast(role, "editor");
  const canEdit = isEditorOrAdmin;

  // The "new" tab needs editor rights; a stale/hand-typed deep link falls back to
  // "browse" *and* loses the param, so nothing remembers it (A9).
  const [tab, setTab] = useTabParam<ClubTab>(CLUB_TAB_KEYS, "browse", "tab", {
    allowed: canEdit ? CLUB_TAB_KEYS : (["browse"] as const),
  });
  const clubTabs: SectionTab<ClubTab>[] = [
    { key: "browse", label: "Clubs", icon: <List size={14} /> },
    ...(canEdit ? [{ key: "new" as ClubTab, label: "New club", icon: <Plus size={14} /> }] : []),
  ];

  const game = "EA FC 26";

  // Create form
  const [name, setName] = useState("");
  const [stars, setStars] = useState("4.0");
  const [leagueId, setLeagueId] = useState<number | "">("");

  // Filters
  const [groupMode, setGroupMode] = useState<"stars" | "league">("stars");
  const [filterStars, setFilterStars] = useState<string>(""); // "" = any
  const [filterLeagueId, setFilterLeagueId] = useState<number | "">(""); // "" = any
  const [search, setSearch] = useState("");

  const clubsQ = useQuery({
    queryKey: qk.clubs(game),
    queryFn: () => listClubs(game),
    // Switching game is a filter, not a different subject: keep the list on screen
    // while the other game loads instead of emptying the page under the picker (Q9).
    placeholderData: keepPreviousData,
  });

  const leaguesQ = useQuery({
    queryKey: qk.leagues(),
    queryFn: () => listLeagues(),
    staleTime: 60_000,
  });

  const leagues: League[] = useMemo(() => leaguesQ.data ?? [], [leaguesQ.data]);
  const leaguesById = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of leagues) m.set(l.id, l.name);
    return m;
  }, [leagues]);

  // Nations for flags: by id for club rows, by name for the group-by-league headers
  // (groups are keyed by the league's display name).
  const leagueNations = useMemo(() => {
    const byId = new Map<number, string>();
    const byName = new Map<string, string>();
    for (const l of leagues) {
      if (!l.nation) continue;
      byId.set(l.id, l.nation);
      byName.set(l.name, l.nation);
    }
    return { byId, byName };
  }, [leagues]);

  // Default create league if not selected yet
  const effectiveCreateLeagueId = useMemo(() => {
    if (leagueId !== "") return leagueId;
    if (leagues.length) return leagues[0].id;
    return "";
  }, [leagueId, leagues]);

  const createMut = useMutation({
    mutationFn: async () => {
      const nm = name.trim();
      const gm = game.trim();
      const lid = effectiveCreateLeagueId;
      if (!nm) throw new Error("Missing club name");
      if (!gm) throw new Error("Missing game");
      if (lid === "") throw new Error("No league available (seed leagues first)");
      return createClub({ name: nm, game: gm, star_rating: Number(stars), league_id: lid });
    },
    onSuccess: async () => {
      setName("");
      // `qk.clubs()` = ["clubs"] is the PREFIX: it matches this page's
      // ["clubs", game] query and the unfiltered one Stats, profiles and the
      // friendlies list use. `qk.clubs(game)` matches only this page's (A3).
      await qc.invalidateQueries({ queryKey: qk.clubs() });
    },
  });

  // Edit per club
  const [pendingDeleteClubId, setPendingDeleteClubId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editStars, setEditStars] = useState("4.0");
  const [editLeagueId, setEditLeagueId] = useState<number | "">("");
  const [editName, setEditName] = useState("");

  const clubs = useMemo(() => clubsQ.data ?? [], [clubsQ.data]);
  const editingClub = useMemo(() => clubs.find((c) => c.id === editId) || null, [clubs, editId]);

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!editId) throw new Error("No club selected");

      if (editLeagueId === "") throw new Error("League cannot be empty");
      const body: Partial<{ name: string; game: string; star_rating: number; league_id: number }> = {
        star_rating: Number(editStars),
        league_id: editLeagueId,
      };

      if (isAdmin) {
        const nm = editName.trim();
        if (nm && nm !== (editingClub?.name ?? "")) body.name = nm;
      }

      return patchClub(editId, body);
    },
    onSuccess: async () => {
      setEditId(null);
      await qc.invalidateQueries({ queryKey: qk.clubs() });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (clubId: number) => {
      return deleteClub(clubId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.clubs() });
    },
  });

  const filteredClubs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return clubs.filter((c) => {
      if (filterStars) {
        const s = starsLabel(c.star_rating);
        if (s !== filterStars) return false;
      }

      if (filterLeagueId !== "") {
        const cid = c.league_id;
        if (cid !== filterLeagueId) return false;
      }

      if (q) {
        const ln = leagueNameForClub(c, leaguesById);
        const hay = `${c.name} ${ln} ${c.game}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [clubs, filterStars, filterLeagueId, search, leaguesById]);

  const hasActiveFilters = !!filterStars || filterLeagueId !== "" || !!search.trim();
  // Remount per star-group when filters change so groups auto-open while filtering/searching.
  // Avoid including the actual query string to prevent remounting on every keystroke.
  const filterKey = `${hasActiveFilters ? "1" : "0"}|${filterStars}|${filterLeagueId === "" ? "" : String(filterLeagueId)}|${groupMode}`;

  const grouped = useMemo(() => {
    if (groupMode === "league") return groupByLeague(filteredClubs, leaguesById);
    return groupByStars(filteredClubs, leaguesById);
  }, [filteredClubs, leaguesById, groupMode]);

  const clubGroups: ClubGroup[] = useMemo(
    () =>
      grouped.map(([label, clubsInGroup]) => ({
        // The filter state rides in the key so a group remounts — and therefore
        // auto-opens — when the filters change (never on every keystroke).
        key: `${label}|${filterKey}`,
        label,
        nation: groupMode === "league" ? leagueNations.byName.get(label) ?? null : null,
        suffix: groupMode === "league" ? "league" : undefined,
        rows: clubsInGroup.map((c) => ({
          club: c,
          leagueName: leagueNameForClub(c, leaguesById),
          leagueNation: leagueNationForClub(c, leagueNations.byId),
        })),
      })),
    [grouped, filterKey, groupMode, leagueNations, leaguesById],
  );

  // Tapping a row is the only way into the editor (Q15): it opens this club and
  // seeds the form from it, or closes it again if it was already the open one.
  const toggleEditor = (c: Club) => {
    if (editId === c.id) {
      setEditId(null);
      return;
    }
    setEditId(c.id);
    setEditStars(String(c.star_rating ?? 3.0));
    setEditLeagueId(typeof c.league_id === "number" ? c.league_id : leagues[0]?.id ?? "");
    setEditName(c.name);
  };

  const doomedClub = useMemo(
    () => (pendingDeleteClubId == null ? null : clubs.find((c) => c.id === pendingDeleteClubId) ?? null),
    [clubs, pendingDeleteClubId],
  );

  const initialLoading =
    !pageEntered ||
    (!clubsQ.error && !clubsQ.data && clubsQ.isLoading) ||
    (!leaguesQ.error && !leaguesQ.data && leaguesQ.isLoading);

  if (initialLoading) {
    return (
      <PageLayout>
        <PageLoadingScreen sectionCount={4} />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Clubs">
      <ErrorToastOnError error={createMut.error} title="Could not create club" />
      <ErrorToastOnError error={clubsQ.error} title="Clubs loading failed" />
      <ErrorToastOnError error={patchMut.error} title="Could not update club" />
      <ErrorToastOnError error={deleteMut.error} title="Could not delete club" />

      <SectionTabs tabs={clubTabs} active={tab} onChange={setTab} />

      {tab === "new" && canEdit ? (
      <section className="mx-auto w-full max-w-lg">
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-medium text-text-normal">Name</span>
              <input
                className="input-field min-w-0 flex-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SV Phönix Hönigsberg"
              />
            </label>

            <label className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-medium text-text-normal">Stars</span>
              <select className="input-field min-w-0 flex-1" value={stars} onChange={(e) => setStars(e.target.value)}>
                {starValues().map((v) => (
                  <option key={v} value={String(v)}>
                    {starsLabel(v)}★
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm font-medium text-text-normal">League</span>
              <select
                className="input-field min-w-0 flex-1"
                value={effectiveCreateLeagueId}
                onChange={(e) => setLeagueId(e.target.value ? Number(e.target.value) : "")}
              >
                {!leagues.length && <option value="">(no leagues loaded)</option>}
                {leagues.map((l) => (
                  <option key={l.id} value={String(l.id)}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={() => createMut.mutate()}
              disabled={!canEdit || !name.trim() || !game.trim() || effectiveCreateLeagueId === "" || createMut.isPending}
            >
              {createMut.isPending ? "Creating…" : "Create"}
            </Button>

            {!canEdit ? (
              <div className="self-center text-sm text-text-muted">Login as editor/admin to create clubs.</div>
            ) : null}
          </div>
        </div>
      </section>
      ) : null}

      {tab === "browse" ? (
      <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="section-label">Group</span>
          <SegmentedSwitch<"stars" | "league">
            value={groupMode}
            onChange={setGroupMode}
            options={[
              { key: "stars", label: "Stars", icon: <Star size={14} aria-hidden="true" /> },
              { key: "league", label: "League", icon: <ShieldHalf size={14} aria-hidden="true" /> },
            ]}
            ariaLabel="Group clubs"
            title="Group by stars or league"
          />
        </div>
        <label className="flex items-center gap-2">
          <span className="section-label">Stars</span>
          <select className="select-field w-auto" value={filterStars} onChange={(e) => setFilterStars(e.target.value)}>
            <option value="">Any</option>
            {starValues().map((v) => {
              const s = starsLabel(v);
              return (
                <option key={v} value={s}>
                  {s}★
                </option>
              );
            })}
          </select>
        </label>
        <label className="flex min-w-0 max-w-full items-center gap-2">
          <span className="section-label">League</span>
          <select
            className="select-field w-auto min-w-0 max-w-full"
            value={filterLeagueId === "" ? "" : String(filterLeagueId)}
            onChange={(e) => setFilterLeagueId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Any</option>
            {leagues.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div className="min-w-[150px] flex-1">
          <input
            className="input-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clubs…"
          />
        </div>
        {hasActiveFilters ? (
          <Button
            variant="ghost"
            onClick={() => {
              setFilterStars("");
              setFilterLeagueId("");
              setSearch("");
            }}
            type="button"
            title="Clear filters"
          >
            <Eraser size={14} className="md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">Clear</span>
          </Button>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span>{filteredClubs.length} of {clubs.length} clubs</span>
          <Button variant="ghost" onClick={() => void qc.invalidateQueries({ queryKey: qk.clubs() })} title="Refresh">
            <RotateCw size={14} className="md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">Refresh</span>
          </Button>
        </div>

        {clubsQ.isLoading ? <InlineLoading /> : null}

        {!clubsQ.isLoading && grouped.length === 0 ? (
          <EmptyState title="No clubs match the current filters." className="px-1 py-6" />
        ) : null}

        <ClubList
          groups={clubGroups}
          defaultOpen={hasActiveFilters}
          canEdit={canEdit}
          expandedId={editId}
          onToggleRow={toggleEditor}
          renderEditor={(c) => (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                {isAdmin ? (
                  <Input label="Name (admin)" value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : (
                  <div className="self-end text-sm text-text-muted">Name can only be changed by admin.</div>
                )}

                <label className="block">
                  <FormLabel>Stars</FormLabel>
                  <select className="input-field" value={editStars} onChange={(e) => setEditStars(e.target.value)}>
                    {starValues().map((v) => (
                      <option key={v} value={String(v)}>
                        {starsLabel(v)}★
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <FormLabel>League</FormLabel>
                  <select
                    className="input-field"
                    value={editLeagueId === "" ? "" : String(editLeagueId)}
                    onChange={(e) => setEditLeagueId(e.target.value ? Number(e.target.value) : "")}
                  >
                    {!leagues.length ? <option value="">(no leagues loaded)</option> : null}
                    {leagues.map((l) => (
                      <option key={l.id} value={String(l.id)}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* A star change appends to the record; the record is
                  right here so that is visible (R4). */}
              <ClubStarHistory clubId={c.id} />
              <PromoteClubStars clubId={c.id} isAdmin={isAdmin} />

              {/* Delete is here and nowhere else: the row carries no controls, so the
                  one place that can destroy a club is the editor that row opens (Q15). */}
              <div className="flex items-center justify-between gap-2">
                {isAdmin ? (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setPendingDeleteClubId(c.id)}
                    disabled={deleteMut.isPending || patchMut.isPending}
                    title="Delete this club"
                    className="inline-flex items-center gap-1.5"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setEditId(null)} type="button">
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => patchMut.mutate()} disabled={patchMut.isPending}>
                    {patchMut.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        />
      </section>
      </div>
      ) : null}

      {/* A club only goes when nothing played with it — the dialog says so before you
          press, instead of the 409 telling you afterwards (DESIGN.md §7). */}
      <ConfirmDialog
        open={!!doomedClub}
        title="Delete this club?"
        subtitle="Only a club that no match and no friendly uses can be removed."
        confirmLabel="Delete club"
        busy={deleteMut.isPending}
        onCancel={() => setPendingDeleteClubId(null)}
        onConfirm={() => {
          if (pendingDeleteClubId == null) return;
          const clubId = pendingDeleteClubId;
          // The row that carried the editor is about to go; close it first.
          if (editId === clubId) setEditId(null);
          setPendingDeleteClubId(null);
          deleteMut.mutate(clubId);
        }}
      >
        <div>
          {doomedClub?.name} · {doomedClub ? leagueNameForClub(doomedClub, leaguesById) : "—"} ·{" "}
          {starsLabel(doomedClub?.star_rating)}★
        </div>
        <div>Its crest and its star rating go with it.</div>
        <div>
          Used in a tournament match or a friendly, it stays: the delete is refused and nothing
          changes.
        </div>
      </ConfirmDialog>
    </PageLayout>
  );
}
