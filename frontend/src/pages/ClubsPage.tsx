import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import { useAuth } from "../auth/AuthContext";
import { createClub, listClubs, patchClub, deleteClub } from "../api/clubs.api";
import { STAR_OPTIONS, clamp } from "../helpers";
import { StarsFA } from "../ui/primitives/StarsFA";

export default function ClubsPage() {
  const { token, role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const [game, setGame] = useState("EA FC 26");
  const q = useQuery({ queryKey: ["clubs", game], queryFn: () => listClubs(game) });

  const [name, setName] = useState("");
  const [stars, setStars] = useState("4.0");

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      return createClub(token, { name: name.trim(), game: game.trim(), star_rating: Number(stars) });
    },
    onSuccess: async () => {
      setName("");
      await qc.invalidateQueries({ queryKey: ["clubs", game] });
    },
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editStars, setEditStars] = useState("4.0");
  const [editName, setEditName] = useState("");


  const currentEditStars = clamp(Number(editStars || 0.5), 0.5, 5);
  const snappedEditStars = Math.round(currentEditStars * 2) / 2;

  const currentCreateStars = clamp(Number(stars || 0.5), 0.5, 5);
  const snappedCreateStars = Math.round(currentCreateStars * 2) / 2;

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!editId) throw new Error("No club selected");

      const body: any = { star_rating: Number(editStars) };
      if (isAdmin) body.name = editName.trim();

      return patchClub(token, editId, body);
    },
    onSuccess: async () => {
      setEditId(null);
      await qc.invalidateQueries({ queryKey: ["clubs", game] });
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => {
      if (!token) throw new Error("No token");
      return deleteClub(token, id);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clubs", game] });
    },
  });

  // --- foldable sections by star rating ---
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const isCollapsed = (label: string) => collapsed.has(label);
  const toggle = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const clubsByStars = useMemo(() => {
    const cs = q.data ?? [];

    const sorted = cs.slice().sort((a, b) => {
      const da = Number(a.star_rating ?? 0);
      const db = Number(b.star_rating ?? 0);
      if (db !== da) return db - da;
      return a.name.localeCompare(b.name);
    });

    const groups = new Map<string, typeof sorted>();
    for (const c of sorted) {
      const starsNum = Number(c.star_rating ?? 0);
      const label = `${starsNum.toFixed(1).replace(/\.0$/, "")}★`;
      const arr = groups.get(label) ?? [];
      arr.push(c);
      groups.set(label, arr);
    }

    return Array.from(groups.entries()); // [ [label, clubs[]], ... ] in sorted order
  }, [q.data]);

  const allLabels = useMemo(() => clubsByStars.map(([label]) => label), [clubsByStars]);

  function collapseAll() {
    setCollapsed(new Set(allLabels));
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  return (
    <div className="space-y-4">
      <Card title="Clubs (Teams)" variant="plain">
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Game" value={game} onChange={(e) => setGame(e.target.value)} />
          <Input
            label="Club name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sturm Graz"
          />
          <div className="w-full">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-zinc-500">Stars</span>
              <StarsFA rating={snappedCreateStars} />
            </div>

            <select
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              value={String(snappedCreateStars)}
              onChange={(e) => setStars(e.target.value)}
            >
              {STAR_OPTIONS.map((v) => (
                <option key={v} value={String(v)}>
                  {v.toFixed(1).replace(/\.0$/, "")}
                </option>
              ))}
            </select>
          </div>


        </div>

        {createMut.error && <div className="mt-2 text-sm text-red-400">{String(createMut.error)}</div>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => createMut.mutate()} disabled={!name.trim() || !game.trim() || createMut.isPending}>
            <i className="fa fa-plus md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">{createMut.isPending ? "Creating…" : "Create"}</span>
          </Button>
          <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["clubs", game] })} title="Refresh">
            <i className="fa fa-refresh md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">Refresh</span>
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={expandAll} type="button" title="Expand all">
              <i className="fa fa-plus md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Expand all</span>
            </Button>
            <Button variant="ghost" onClick={collapseAll} type="button" title="Collapse all">
              <i className="fa fa-minus md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Collapse all</span>
            </Button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {q.isLoading && <div className="text-zinc-400">Loading…</div>}
          {q.error && <div className="text-red-400 text-sm">{String(q.error)}</div>}

          {clubsByStars.map(([label, clubs]) => (
          <div key={label} className="space-y-2">
            <button
              type="button"
              onClick={() => toggle(label)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-left hover:bg-zinc-900/40"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {isCollapsed(label) ? (
                    <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                  ) : (
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  )}
                </span>

                <span className="text-sm font-semibold text-zinc-200">{label}</span>

                <span className="text-xs text-zinc-500 font-normal inline-flex items-center gap-1">
                  <i className="fa-regular fa-folder-open" aria-hidden="true" />
                  <span>({clubs.length})</span>
                </span>
              </div>

              <span className="text-xs text-zinc-500 inline-flex items-center gap-1">
                {isCollapsed(label) ? (
                  <>
                    <i className="fa-regular fa-eye" aria-hidden="true" />
                    <span className="hidden sm:inline">Show</span>
                  </>
                ) : (
                  <>
                    <i className="fa-regular fa-eye-slash" aria-hidden="true" />
                    <span className="hidden sm:inline">Hide</span>
                  </>
                )}
              </span>
            </button>

            {!isCollapsed(label) && (
              <div className="space-y-2">
                {clubs.map((c) => (
                  <div key={c.id} className="rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-900/20">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        <div className="text-xs text-zinc-500">{c.game}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <StarsFA rating={c.star_rating} />

                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditId(c.id);
                            setEditStars(String(c.star_rating));
                            setEditName(c.name);
                          }}
                          type="button"
                        >
                          <i className="fa-solid fa-pen-to-square md:hidden" aria-hidden="true" />
                          <span className="hidden md:inline">Edit</span>
                        </Button>
                      </div>
                    </div>

                    {editId === c.id && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        {isAdmin && (
                          <Input
                            label="New name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Club name"
                          />
                        )}

                        <div className="w-full">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs text-zinc-500">New stars</span>
                            <StarsFA rating={snappedEditStars} />
                          </div>

                          <select
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                            value={String(snappedEditStars)}
                            onChange={(e) => setEditStars(e.target.value)}
                          >
                            {STAR_OPTIONS.map((v) => (
                              <option key={v} value={String(v)}>
                                {v.toFixed(1).replace(/\.0$/, "")}
                              </option>
                            ))}
                          </select>
                        </div>

                        <Button onClick={() => patchMut.mutate()} disabled={patchMut.isPending} type="button" title="Save">
                          <i className="fa-solid fa-check md:hidden" aria-hidden="true" />
                          <span className="hidden md:inline">{patchMut.isPending ? "Saving…" : "Save"}</span>
                        </Button>

                        <Button variant="ghost" onClick={() => setEditId(null)} type="button" title="Cancel">
                          <i className="fa-solid fa-xmark md:hidden" aria-hidden="true" />
                          <span className="hidden md:inline">Cancel</span>
                        </Button>

                        {isAdmin && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              const ok = window.confirm(`Delete club "${c.name}"? This cannot be undone.`);
                              if (!ok) return;
                              delMut.mutate(c.id);
                            }}
                            type="button"
                            title="Delete"
                          >
                            <i className="fa-solid fa-trash md:hidden" aria-hidden="true" />
                            <span className="hidden md:inline">Delete</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          ))}

        </div>
      </Card>
    </div>
  );
}
