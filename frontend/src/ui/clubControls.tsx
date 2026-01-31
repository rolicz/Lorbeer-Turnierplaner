import type { Club } from "../api/types";

export type LeagueOpt = { id: number; name: string };

export const STAR_OPTIONS: number[] = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.5); // 0.5..5.0

export function starsLabel(v: any): string {
  if (typeof v === "number") return v.toFixed(1).replace(/\.0$/, "");
  const n = Number(v);
  if (Number.isFinite(n)) return n.toFixed(1).replace(/\.0$/, "");
  return String(v ?? "");
}

export function toHalfStep(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 2) / 2;
}

export function sortClubsForDropdown(clubs: Club[]) {
  return clubs
    .slice()
    .sort((a, b) => Number(b.star_rating ?? 0) - Number(a.star_rating ?? 0) || a.name.localeCompare(b.name));
}

export function leagueInfo(c: Club): { id: number | null; name: string | null } {
  const anyC = c as any;
  const id = anyC.league_id;
  const name = anyC.league_name ?? (id != null ? `League #${id}` : null);
  return { id: typeof id === "number" ? id : id != null ? Number(id) : null, name: name ? String(name) : null };
}

export function clubLabelPartsById(clubs: Club[], id: number | null | undefined) {
  if (!id) return { name: "No club", rating: null as number | null, ratingText: null as string | null };
  const c = clubs.find((x) => x.id === id);
  if (!c) return { name: `#${id}`, rating: null as number | null, ratingText: null as string | null };
  const r = Number(c.star_rating);
  return {
    name: c.name,
    league_name: (c as any).league_name,
    rating: Number.isFinite(r) ? r : null,
    ratingText: Number.isFinite(r) ? `${starsLabel(r)}★` : null,
  };
}

export function ensureSelectedClubVisible(filtered: Club[], all: Club[], selectedId: number | null): Club[] {
  if (!selectedId) return filtered;

  const inFiltered = filtered.some((c) => c.id === selectedId);
  if (inFiltered) return filtered;

  const selected = all.find((c) => c.id === selectedId);
  if (selected) return [selected, ...filtered];

  // Fallback: keep a synthetic option so the select still shows something
  return [{ id: selectedId, name: `#${selectedId}`, star_rating: null } as any, ...filtered];
}

export function randomClubAssignmentOk(clubA: Club, clubB: Club): boolean {
  if (clubB.id === clubA.id) return false;
  const aLeague = String((clubA as any).league_name ?? "");
  const bLeague = String((clubB as any).league_name ?? "");
  if (aLeague.startsWith("National (") && !bLeague.startsWith("National (")) return false;
  if (bLeague.startsWith("National (") && !aLeague.startsWith("National (")) return false;
  return true;
}

export function StarFilter({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1">
        <span className="hidden md:inline text-xs text-zinc-400">Filter by</span>
        <span className="md:hidden inline-flex items-center gap-2 text-xs text-zinc-400">
          <i className="fa-solid fa-filter" aria-hidden="true" />
          <span className="sr-only">Filter by stars</span>
        </span>
        <span className="text-xs text-zinc-400"> Stars</span>
      </div>

      <select
        className={`rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-60 ${
          compact ? "w-[140px]" : "w-full"
        }`}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
        title="Filter by stars"
      >
        <option value="">All</option>
        {STAR_OPTIONS.map((v) => (
          <option key={v} value={v}>
            {v.toFixed(1).replace(/\.0$/, "")}★
          </option>
        ))}
      </select>
    </label>
  );
}

export function LeagueFilter({
  value,
  onChange,
  disabled,
  options,
  compact,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  options: LeagueOpt[];
  compact?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1">
        <span className="hidden md:inline text-xs text-zinc-400">Filter by</span>
        <span className="md:hidden inline-flex items-center gap-2 text-xs text-zinc-400">
          <i className="fa-solid fa-filter" aria-hidden="true" />
          <span className="sr-only">Filter by league</span>
        </span>
        <span className="text-xs text-zinc-400"> League</span>
      </div>

      <select
        className={`rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-60 ${
          compact ? "w-[180px]" : "w-full"
        }`}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
        title="Filter by league"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GoalStepper({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  ariaLabel: string;
}) {
  const dec = () => onChange(clampInt(value - 1, 0, 99));
  const inc = () => onChange(clampInt(value + 1, 0, 99));

  return (
    <div className="inline-flex items-center gap-1" aria-label={ariaLabel}>
      <button
        type="button"
        className="h-9 w-10 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900/40 disabled:opacity-50"
        onClick={dec}
        disabled={disabled}
        title="Decrement score"
      >
        <i className="fa fa-minus" aria-hidden="true" />
      </button>
      <div className="min-w-[44px] text-center text-lg font-bold text-zinc-100">{value}</div>
      <button
        type="button"
        className="h-9 w-10 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900/40 disabled:opacity-50"
        onClick={inc}
        disabled={disabled}
        title="Increment score"
      >
        <i className="fa fa-plus" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ClubSelect({
  label,
  value,
  onChange,
  disabled,
  clubs,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  clubs: Club[];
  placeholder: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-zinc-400">{label}</div>
      <select
        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-60"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {starsLabel(c.star_rating)}★
          </option>
        ))}
      </select>
    </label>
  );
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
