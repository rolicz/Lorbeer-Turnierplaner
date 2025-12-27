import Sheet from "../../ui/primitives/Sheet";
import Input from "../../ui/primitives/Input";
import Button from "../../ui/primitives/Button";
import type { Club, Match } from "../../api/types";
import { sideBy } from "./helpers";
import { useMemo } from "react";

export default function MatchEditorSheet({
  open,
  onClose,
  match,
  clubs,
  clubsLoading,
  clubsError,
  clubGame,
  clubSearch,
  setClubGame,
  setClubSearch,
  aClub,
  bClub,
  setAClub,
  setBClub,
  aGoals,
  bGoals,
  setAGoals,
  setBGoals,
  state,
  setState,
  onSave,
  saving,
  saveError,
}: {
  open: boolean;
  onClose: () => void;
  match: Match | null;
  clubs: Club[];
  clubsLoading: boolean;
  clubsError: string | null;
  clubGame: string;
  clubSearch: string;
  setClubGame: (v: string) => void;
  setClubSearch: (v: string) => void;
  aClub: number | null;
  bClub: number | null;
  setAClub: (v: number | null) => void;
  setBClub: (v: number | null) => void;
  aGoals: string;
  bGoals: string;
  setAGoals: (v: string) => void;
  setBGoals: (v: string) => void;
  state: "scheduled" | "playing" | "finished";
  setState: (v: "scheduled" | "playing" | "finished") => void;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
}) {
  const a = match ? sideBy(match, "A") : undefined;
  const b = match ? sideBy(match, "B") : undefined;

  return (
    <Sheet open={open} title={`Edit Match #${match?.id ?? "—"}`} onClose={onClose}>
      {!match ? (
        <div className="text-sm text-zinc-400">No match selected.</div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 p-3">
            <div className="mb-2 text-sm font-medium">Match State</div>
            <div className="grid grid-cols-3 gap-2">
              {(["scheduled", "playing", "finished"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    state === s ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 hover:bg-zinc-900/40"
                  }`}
                  onClick={() => setState(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              {a?.players.map(p => p.display_name).join(" + ")} vs {b?.players.map(p => p.display_name).join(" + ")}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 p-3">
            <div className="mb-2 text-sm font-medium">Clubs</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Game filter" value={clubGame} onChange={(e) => setClubGame(e.target.value)} />
              <Input label="Search" value={clubSearch} onChange={(e) => setClubSearch(e.target.value)} placeholder="e.g. Madrid" />
            </div>

            {clubsLoading && <div className="mt-2 text-sm text-zinc-400">Loading clubs…</div>}
            {clubsError && <div className="mt-2 text-sm text-red-400">{clubsError}</div>}

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ClubSelect label="Side A club" clubs={clubs} value={aClub} onChange={setAClub} />
              <ClubSelect label="Side B club" clubs={clubs} value={bClub} onChange={setBClub} />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 p-3">
            <div className="mb-2 text-sm font-medium">Goals</div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Side A goals" inputMode="numeric" value={aGoals} onChange={(e) => setAGoals(e.target.value)} />
              <Input label="Side B goals" inputMode="numeric" value={bGoals} onChange={(e) => setBGoals(e.target.value)} />
            </div>
          </div>

          {saveError && <div className="text-sm text-red-400">{saveError}</div>}

          <div className="sticky bottom-0 -mx-4 bg-zinc-950 px-4 py-3 md:static md:mx-0 md:px-0">
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
              <Button onClick={onSave} disabled={saving} type="button">
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function ClubSelect({
  label,
  clubs,
  value,
  onChange,
}: {
  label: string;
  clubs: Club[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const grouped = useMemo(() => {
    const sorted = (clubs ?? []).slice().sort((a, b) => {
      const sa = Number(a.star_rating ?? 0);
      const sb = Number(b.star_rating ?? 0);
      if (sb !== sa) return sb - sa;
      return a.name.localeCompare(b.name);
    });

    const m = new Map<string, Club[]>();
    for (const c of sorted) {
      const s = Number(c.star_rating ?? 0);
      const key = `${s.toFixed(1).replace(/\.0$/, "")}★`;
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }

    return Array.from(m.entries());
  }, [clubs]);

  return (
    <label className="block">
      <div className="mb-1 text-xs text-zinc-400">{label}</div>
      <select
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">—</option>

        {grouped.map(([starLabel, cs]) => (
          <optgroup key={starLabel} label={starLabel}>
            {cs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

