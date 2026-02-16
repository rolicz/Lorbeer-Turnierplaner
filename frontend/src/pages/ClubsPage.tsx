import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import CollapsibleCard from "../ui/primitives/CollapsibleCard";
import SegmentedSwitch from "../ui/primitives/SegmentedSwitch";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import { usePageSubNav, type SubNavItem } from "../ui/layout/SubNavContext";
import { useSectionSubnav } from "../ui/layout/useSectionSubnav";
import SectionSeparator from "../ui/primitives/SectionSeparator";

import { useAuth } from "../auth/AuthContext";
import { createClub, deleteClub, listClubs, listLeagues, patchClub } from "../api/clubs.api";
import type { Club, League } from "../api/types";

function starsLabel(v: unknown): string {
  if (typeof v === "number") return v.toFixed(1).replace(/\.0$/, "");
  if (typeof v === "string") return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n.toFixed(1).replace(/\.0$/, "");
  return "";
}

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

export default function ClubsPage() {
  const { token, role } = useAuth();
  const qc = useQueryClient();
  const defaultScrollDoneRef = useRef(false);

  const isAdmin = role === "admin";
  const isEditorOrAdmin = role === "editor" || role === "admin";
  const canEdit = isEditorOrAdmin;

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
    queryKey: ["clubs", game],
    queryFn: () => listClubs(game),
  });

  const leaguesQ = useQuery({
    queryKey: ["leagues"],
    queryFn: () => listLeagues(),
    staleTime: 60_000,
  });

  const leagues: League[] = useMemo(() => leaguesQ.data ?? [], [leaguesQ.data]);
  const leaguesById = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of leagues) m.set(l.id, l.name);
    return m;
  }, [leagues]);

  // Default create league if not selected yet
  const effectiveCreateLeagueId = useMemo(() => {
    if (leagueId !== "") return leagueId;
    if (leagues.length) return leagues[0].id;
    return "";
  }, [leagueId, leagues]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      const nm = name.trim();
      const gm = game.trim();
      const lid = effectiveCreateLeagueId;
      if (!nm) throw new Error("Missing club name");
      if (!gm) throw new Error("Missing game");
      if (lid === "") throw new Error("No league available (seed leagues first)");
      return createClub(token, { name: nm, game: gm, star_rating: Number(stars), league_id: lid });
    },
    onSuccess: async () => {
      setName("");
      await qc.invalidateQueries({ queryKey: ["clubs", game] });
    },
  });

  // Edit per club
  const [editId, setEditId] = useState<number | null>(null);
  const [editStars, setEditStars] = useState("4.0");
  const [editLeagueId, setEditLeagueId] = useState<number | "">("");
  const [editName, setEditName] = useState("");

  const clubs = useMemo(() => clubsQ.data ?? [], [clubsQ.data]);
  const editingClub = useMemo(() => clubs.find((c) => c.id === editId) || null, [clubs, editId]);

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
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

      return patchClub(token, editId, body);
    },
    onSuccess: async () => {
      setEditId(null);
      await qc.invalidateQueries({ queryKey: ["clubs", game] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (clubId: number) => {
      if (!token) throw new Error("No token");
      return deleteClub(token, clubId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clubs", game] });
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

  const pageSections = useMemo(
    () => [
      { key: "create-new", id: "section-clubs-create" },
      { key: "browse-filter", id: "section-clubs-browse" },
      { key: "clubs-list", id: "section-clubs-list" },
    ],
    []
  );

  const { activeKey: activeSubKey, blinkKey: subnavBlinkKey, jumpToSection } = useSectionSubnav({
    sections: pageSections,
    enabled: true,
  });

  const computeBrowseOffset = useCallback((): number => {
    const browseEl = document.getElementById("section-clubs-browse");
    const createEl = document.getElementById("section-clubs-create");
    const headerEl = document.getElementById("app-top-nav");
    if (!browseEl || !createEl || !headerEl) return 0;

    const headerHeight = Math.ceil(headerEl.getBoundingClientRect().height);
    const browseTop = window.scrollY + browseEl.getBoundingClientRect().top;
    const createBottom = window.scrollY + createEl.getBoundingClientRect().bottom;

    const baseTarget = Math.max(0, browseTop - headerHeight);
    const minTargetToHideCreate = Math.max(0, createBottom - headerHeight + 1);
    const target = Math.max(baseTarget, minTargetToHideCreate);
    return baseTarget - target;
  }, []);

  const computeListOffset = useCallback((): number => {
    const listEl = document.getElementById("section-clubs-list");
    const browseEl = document.getElementById("section-clubs-browse");
    const headerEl = document.getElementById("app-top-nav");
    if (!listEl || !browseEl || !headerEl) return 0;

    const headerHeight = Math.ceil(headerEl.getBoundingClientRect().height);
    const listTop = window.scrollY + listEl.getBoundingClientRect().top;
    const browseBottom = window.scrollY + browseEl.getBoundingClientRect().bottom;

    const baseTarget = Math.max(0, listTop - headerHeight);
    const minTargetToHideBrowse = Math.max(0, browseBottom - headerHeight + 1);
    const target = Math.max(baseTarget, minTargetToHideBrowse);
    return baseTarget - target;
  }, []);

  useEffect(() => {
    if (defaultScrollDoneRef.current) return;
    defaultScrollDoneRef.current = true;
    window.setTimeout(() => {
      jumpToSection("browse-filter", "section-clubs-browse", {
        blink: false,
        lockMs: 600,
        retries: 20,
        offsetPx: computeBrowseOffset(),
        behavior: "auto",
      });
    }, 0);
  }, [computeBrowseOffset, jumpToSection]);

  const subNavItems = useMemo<SubNavItem[]>(
    () => [
      {
        key: "create-new",
        label: "Create New",
        icon: "fa-plus",
        active: activeSubKey === "create-new",
        className: subnavBlinkKey === "create-new" ? "subnav-click-blink" : "",
        onClick: () =>
          jumpToSection("create-new", "section-clubs-create", {
            blink: true,
            lockMs: 700,
            retries: 20,
          }),
      },
      {
        key: "browse-filter",
        label: "Browse & Filter",
        icon: "fa-filter",
        active: activeSubKey === "browse-filter",
        className: subnavBlinkKey === "browse-filter" ? "subnav-click-blink" : "",
        onClick: () =>
          jumpToSection("browse-filter", "section-clubs-browse", {
            blink: true,
            lockMs: 700,
            retries: 20,
            offsetPx: computeBrowseOffset(),
          }),
      },
      {
        key: "clubs-list",
        label: "Clubs List",
        icon: "fa-list",
        active: activeSubKey === "clubs-list",
        className: subnavBlinkKey === "clubs-list" ? "subnav-click-blink" : "",
        onClick: () =>
          jumpToSection("clubs-list", "section-clubs-list", {
            blink: true,
            lockMs: 700,
            retries: 20,
            offsetPx: computeListOffset(),
          }),
      },
    ],
    [activeSubKey, computeBrowseOffset, computeListOffset, jumpToSection, subnavBlinkKey]
  );

  usePageSubNav(subNavItems);

  return (
    <div className="page">
      <ErrorToastOnError error={createMut.error} title="Could not create club" />
      <ErrorToastOnError error={clubsQ.error} title="Clubs loading failed" />
      <ErrorToastOnError error={patchMut.error} title="Could not update club" />
      <ErrorToastOnError error={deleteMut.error} title="Could not delete club" />

      <SectionSeparator id="section-clubs-create" title="Create New" className="mt-0 border-t-0 pt-0">
        <div className="panel-subtle p-3 space-y-3">
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
      </SectionSeparator>

      <SectionSeparator id="section-clubs-browse" title="Browse & Filter">
        <div className="card-inner-flat rounded-2xl space-y-2">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-24 shrink-0 items-center text-sm font-medium text-text-muted">Group</span>
              <div className="min-w-0 flex flex-1 items-center justify-between gap-2">
                <SegmentedSwitch<"stars" | "league">
                  value={groupMode}
                  onChange={setGroupMode}
                  options={[
                    { key: "stars", label: "Stars", icon: "fa-star" },
                    { key: "league", label: "League", icon: "fa-shield-halved" },
                  ]}
                  ariaLabel="Group clubs"
                  title="Group by stars or league"
                  widthClass="w-20 sm:w-24"
                />
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
                  <i className="fa-solid fa-eraser md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">Clear</span>
                </Button>
              </div>
            </div>

            <label className="flex items-center gap-3">
              <span className="inline-flex h-9 w-24 shrink-0 items-center text-sm font-medium text-text-muted">Stars</span>
              <select className="input-field min-w-0 flex-1" value={filterStars} onChange={(e) => setFilterStars(e.target.value)}>
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

            <label className="flex items-center gap-3">
              <span className="inline-flex h-9 w-24 shrink-0 items-center text-sm font-medium text-text-muted">League</span>
              <select
                className="input-field min-w-0 flex-1"
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

            <label className="flex items-center gap-3">
              <span className="inline-flex h-9 w-24 shrink-0 items-center text-sm font-medium text-text-muted">Search</span>
              <input
                className="input-field min-w-0 flex-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. Hönigsberg"
              />
            </label>
        </div>
      </SectionSeparator>

      <SectionSeparator id="section-clubs-list" title="Clubs List" className="min-h-[100svh]">
        <div className="mb-2 border-b border-border-card-chip/60 pb-2">
          <div className="flex items-center justify-between gap-2 text-sm text-text-muted">
            <div className="flex items-center gap-3">
              <span>{filteredClubs.length} shown</span>
              <span className="text-subtle">|</span>
              <span>{clubs.length} total</span>
            </div>
            <Button variant="ghost" onClick={() => void qc.invalidateQueries({ queryKey: ["clubs", game] })} title="Refresh">
              <i className="fa-solid fa-rotate-right md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
          </div>
        </div>
        <div className="card-inner-flat rounded-2xl space-y-2">
          {clubsQ.isLoading ? <div className="text-text-muted">Loading…</div> : null}

          {!clubsQ.isLoading && grouped.length === 0 ? (
            <div className="panel-subtle px-3 py-2 text-sm text-text-muted">No clubs match the current filters.</div>
          ) : null}

          {grouped.map(([label, clubsInGroup]) => {
            const suffix = groupMode === "league" ? "league" : "";
            return (
              <CollapsibleCard
                key={`${label}|${filterKey}`}
                title={
                  <span className="inline-flex items-center gap-2">
                    <span className="font-semibold">{label}</span>
                    {suffix ? <span className="text-xs text-text-muted">{suffix}</span> : null}
                  </span>
                }
                right={<span className="text-xs text-text-muted">{clubsInGroup.length}</span>}
                defaultOpen={hasActiveFilters}
                variant="none"
                className="panel-subtle"
              >
                {() => (
                  <div className="space-y-2">
                    {clubsInGroup.map((c) => {
                      const ln = leagueNameForClub(c, leaguesById);
                      const isEditing = editId === c.id;
                      const cid = c.league_id;

                      return (
                        <div key={c.id} className="panel-subtle px-3 py-2 transition hover:bg-hover-default/40">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium">{c.name}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="card-chip rounded-full px-2 py-0.5 text-[11px]">{c.game}</span>
                                <span className="card-chip rounded-full px-2 py-0.5 text-[11px]">{ln}</span>
                                <span className="card-chip rounded-full px-2 py-0.5 text-[11px]">
                                  {starsLabel(c.star_rating)}★
                                </span>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {canEdit ? (
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setEditId(c.id);
                                    setEditStars(String(c.star_rating ?? 3.0));
                                    setEditLeagueId(typeof cid === "number" ? cid : leagues[0]?.id ?? "");
                                    setEditName(c.name);
                                  }}
                                  type="button"
                                >
                                  Edit
                                </Button>
                              ) : null}

                              {isAdmin ? (
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    const ok = window.confirm(`Delete club "${c.name}"? (Will fail if used in matches)`);
                                    if (!ok) return;
                                    deleteMut.mutate(c.id);
                                  }}
                                  disabled={deleteMut.isPending}
                                  type="button"
                                >
                                  Delete
                                </Button>
                              ) : null}
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="card-inner-flat mt-2 p-2">
                              <div className="grid gap-2 md:grid-cols-3">
                                {isAdmin ? (
                                  <Input
                                    label="Name (admin)"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                  />
                                ) : (
                                  <div className="text-sm text-text-muted self-end">Name can only be changed by admin.</div>
                                )}

                                <label className="block">
                                  <div className="input-label">Stars</div>
                                  <select
                                    className="input-field"
                                    value={editStars}
                                    onChange={(e) => setEditStars(e.target.value)}
                                  >
                                    {starValues().map((v) => (
                                      <option key={v} value={String(v)}>
                                        {starsLabel(v)}★
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="block">
                                  <div className="input-label">League</div>
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

                              <div className="mt-2 flex items-center gap-2">
                                <Button onClick={() => patchMut.mutate()} disabled={patchMut.isPending}>
                                  {patchMut.isPending ? "Saving…" : "Save"}
                                </Button>
                                <Button variant="ghost" onClick={() => setEditId(null)} type="button">
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CollapsibleCard>
            );
          })}
        </div>
      </SectionSeparator>
    </div>
  );
}
