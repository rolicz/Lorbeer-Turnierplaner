import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import CollapsibleCard from "../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";

import { useAuth } from "../auth/AuthContext";
import { createClub, deleteClub, listClubs, listLeagues, patchClub } from "../api/clubs.api";
import type { Club, League } from "../api/types";

function starsLabel(v: any): string {
  if (typeof v === "number") return v.toFixed(1).replace(/\.0$/, "");
  const n = Number(v);
  if (Number.isFinite(n)) return n.toFixed(1).replace(/\.0$/, "");
  return String(v ?? "");
}

function starValues(): number[] {
  const out: number[] = [];
  for (let x = 0.5; x <= 5.0001; x += 0.5) out.push(Number(x.toFixed(1)));
  return out;
}

function leagueNameForClub(c: Club, leaguesById: Map<number, string>) {
  // Prefer embedded relationship if backend returns it
  const rel = (c as any).league;
  if (rel && typeof rel === "object" && typeof rel.name === "string") return rel.name;

  const id = (c as any).league_id as number | undefined;
  if (typeof id === "number") return leaguesById.get(id) ?? "—";

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

  const leagues: League[] = leaguesQ.data ?? [];
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

  const clubs = clubsQ.data ?? [];
  const editingClub = useMemo(() => clubs.find((c) => c.id === editId) || null, [clubs, editId]);

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!editId) throw new Error("No club selected");

      const body: any = { star_rating: Number(editStars) };

      if (editLeagueId === "") throw new Error("League cannot be empty");
      body.league_id = editLeagueId;

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
        const cid = (c as any).league_id as number | undefined;
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

  return (
    <div className="page">
      <ErrorToastOnError error={createMut.error} title="Could not create club" />
      <ErrorToastOnError error={clubsQ.error} title="Clubs loading failed" />
      <ErrorToastOnError error={patchMut.error} title="Could not update club" />
      <ErrorToastOnError error={deleteMut.error} title="Could not delete club" />
      <Card
        title="Clubs"
        variant="outer"
        right={
          <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["clubs", game] })} title="Refresh">
            <i className="fa-solid fa-rotate-right" aria-hidden="true" />
          </Button>
        }
        bodyClassName="space-y-3"
      >
        <div className="panel-subtle px-3 py-2 text-sm text-text-muted flex flex-wrap items-center gap-3">
          <span>{filteredClubs.length} shown</span>
          <span className="text-subtle">|</span>
          <span>{clubs.length} total</span>
        </div>
      </Card>

      <CollapsibleCard title="Create club" defaultOpen={false} variant="outer" bodyVariant="none">
        <div className="card-inner space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              label="Club name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SV Phönix Hönigsberg"
            />

            <label className="block">
              <div className="input-label">Stars (0.5–5.0)</div>
              <select className="input-field" value={stars} onChange={(e) => setStars(e.target.value)}>
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
      </CollapsibleCard>

      <CollapsibleCard
        title="Browse & filter"
        defaultOpen={true}
        right={<span className="text-xs text-text-muted">{filteredClubs.length} clubs</span>}
        variant="outer"
        bodyVariant="none"
      >
        <div className="card-inner">
          <div className="grid gap-2 md:grid-cols-4">
            <label className="block">
              <div className="input-label">Group</div>
              <select className="input-field" value={groupMode} onChange={(e) => setGroupMode(e.target.value as any)}>
                <option value="stars">Stars</option>
                <option value="league">League</option>
              </select>
            </label>

            <label className="block">
              <div className="input-label">Filter stars</div>
              <select className="input-field" value={filterStars} onChange={(e) => setFilterStars(e.target.value)}>
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

            <label className="block">
              <div className="input-label">Filter league</div>
              <select
                className="input-field"
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

            <Input
              label="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Hönigsberg"
            />

            <div className="flex items-end gap-2 md:col-span-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setFilterStars("");
                  setFilterLeagueId("");
                  setSearch("");
                }}
                type="button"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="Clubs list"
        defaultOpen={true}
        right={<span className="text-xs text-text-muted">{filteredClubs.length} clubs</span>}
        variant="outer"
        bodyVariant="none"
      >
        <div className="card-inner space-y-2">
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
                      const cid = (c as any).league_id as number | undefined;

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
                            <div className="panel-subtle mt-2 p-2">
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
      </CollapsibleCard>
    </div>
  );
}
