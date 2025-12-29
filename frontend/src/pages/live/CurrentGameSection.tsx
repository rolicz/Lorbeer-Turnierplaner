import { useEffect, useMemo, useState } from "react";
import Button from "../../ui/primitives/Button";
import type { Club, Match, MatchSide } from "../../api/types";

function sideBy(m: Match, side: "A" | "B"): MatchSide | undefined {
  return m.sides.find((s) => s.side === side);
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function starsLabel(v: any): string {
  if (typeof v === "number") return v.toFixed(1).replace(/\.0$/, "");
  const n = Number(v);
  if (Number.isFinite(n)) return n.toFixed(1).replace(/\.0$/, "");
  return String(v ?? "");
}

function sortClubsForDropdown(clubs: Club[]) {
  return clubs
    .slice()
    .sort((a, b) => (b.star_rating ?? 0) - (a.star_rating ?? 0) || a.name.localeCompare(b.name));
}

function namesStack(side?: MatchSide) {
  const ps = side?.players ?? [];
  if (!ps.length) return ["—"];
  return ps.map((p) => p.display_name);
}

function namesInline(side?: MatchSide) {
  const ps = side?.players ?? [];
  if (!ps.length) return "—";
  return ps.map((p) => p.display_name).join(" + ");
}

export default function CurrentGameSection({
  status,
  match,
  clubs,
  canControl,
  busy,
  onPatch,
}: {
  status: "draft" | "live" | "done";
  match: Match | null;
  clubs: Club[];
  canControl: boolean;
  busy: boolean;
  onPatch: (matchId: number, body: any) => Promise<any>;
}) {
  if (status !== "live" || !match) return null;

  const a = sideBy(match, "A");
  const b = sideBy(match, "B");

  const aNames = useMemo(() => namesStack(a), [a]);
  const bNames = useMemo(() => namesStack(b), [b]);

  const aInline = useMemo(() => namesInline(a), [a]);
  const bInline = useMemo(() => namesInline(b), [b]);

  const clubsSorted = useMemo(() => sortClubsForDropdown(clubs), [clubs]);

  const [aClub, setAClub] = useState<number | null>(a?.club_id ?? null);
  const [bClub, setBClub] = useState<number | null>(b?.club_id ?? null);
  const [aGoals, setAGoals] = useState<number>(Number(a?.goals ?? 0));
  const [bGoals, setBGoals] = useState<number>(Number(b?.goals ?? 0));

  // Re-sync local editor state whenever backend updates this match
  useEffect(() => {
    setAClub(a?.club_id ?? null);
    setBClub(b?.club_id ?? null);
    setAGoals(Number(a?.goals ?? 0));
    setBGoals(Number(b?.goals ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, match?.state, a?.club_id, b?.club_id, a?.goals, b?.goals]);

  const showDashScore = match.state === "scheduled" && aGoals === 0 && bGoals === 0;
  const scoreText = showDashScore ? "- : -" : `${aGoals} : ${bGoals}`;

  async function save(stateOverride?: "scheduled" | "playing" | "finished") {
    if (!canControl) return;
  
    const nextState: "scheduled" | "playing" | "finished" =
      stateOverride ?? match.state ?? "scheduled";
  
    await onPatch(match.id, {
      state: nextState,
      sideA: { club_id: aClub, goals: aGoals },
      sideB: { club_id: bClub, goals: bGoals },
    });
  }


  return (
    <div className="space-y-3">
      {/* Top row */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-400">
          Next match{" "}
          <span className="text-zinc-500">
            · leg {match.leg} · {match.state}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {canControl && match.state === "scheduled" && (
            <Button variant="ghost" onClick={() => save("playing")} disabled={busy}>
              Start
            </Button>
          )}
          {canControl && (
            <Button variant="ghost" onClick={() => save()} disabled={busy}>
              Save
            </Button>
          )}
          {canControl && (
            <Button onClick={() => save("finished")} disabled={busy}>
              Finish
            </Button>
          )}
        </div>
      </div>

      {/* MOBILE: align A / score / B around the SCORE only */}
      <div className="space-y-3 md:hidden">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/10 p-3">
          {/* Row 1: names + score */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            {/* Side A */}
            <div className="min-w-0">
              {aNames.map((n, i) => (
                <div
                  key={`${n}-${i}`}
                  className="text-[15px] font-semibold text-zinc-100 whitespace-normal break-words leading-tight"
                >
                  {n}
                </div>
              ))}
            </div>
            
            {/* Score (this is the center anchor) */}
            <div className="px-1 text-center">
              <div className="text-2xl font-extrabold tracking-tight text-zinc-100">
                {scoreText}
              </div>
            </div>
            
            {/* Side B */}
            <div className="min-w-0 text-right">
              {bNames.map((n, i) => (
                <div
                  key={`${n}-${i}`}
                  className="text-[15px] font-semibold text-zinc-100 whitespace-normal break-words leading-tight"
                >
                  {n}
                </div>
              ))}
            </div>
          </div>
            
          {/* Row 2: goal steppers (separate so it doesn't “center” the names) */}
          {canControl && (
            <div className="mt-3 flex items-center justify-center gap-4">
              <GoalStepper value={aGoals} onChange={setAGoals} disabled={busy} ariaLabel="Goals left" />
              <GoalStepper value={bGoals} onChange={setBGoals} disabled={busy} ariaLabel="Goals right" />
            </div>
          )}
        </div>
        
        {/* Clubs (with player-name labels) */}
        <div className="grid grid-cols-1 gap-2">
          <ClubSelect
            label={`${aInline} — club`}
            value={aClub}
            onChange={setAClub}
            disabled={!canControl || busy}
            clubs={clubsSorted}
            placeholder="Select club…"
          />
          <ClubSelect
            label={`${bInline} — club`}
            value={bClub}
            onChange={setBClub}
            disabled={!canControl || busy}
            clubs={clubsSorted}
            placeholder="Select club…"
          />
        </div>
      </div>


      {/* DESKTOP/TABLET */}
      <div className="hidden md:block space-y-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="min-w-0">
            {aNames.map((n, i) => (
              <div key={`${n}-${i}`} className="truncate text-lg font-semibold text-zinc-100 leading-tight">
                {n}
              </div>
            ))}
          </div>

          <div className="px-2 text-center">
            <div className="text-3xl font-extrabold tracking-tight text-zinc-100">{scoreText}</div>

            {canControl && (
              <div className="mt-2 flex items-center justify-center gap-4">
                <GoalStepper value={aGoals} onChange={setAGoals} disabled={busy} ariaLabel="Goals left" />
                <GoalStepper value={bGoals} onChange={setBGoals} disabled={busy} ariaLabel="Goals right" />
              </div>
            )}
          </div>

          <div className="min-w-0 text-right">
            {bNames.map((n, i) => (
              <div key={`${n}-${i}`} className="truncate text-lg font-semibold text-zinc-100 leading-tight">
                {n}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <ClubSelect
            label={`${aInline} — club`}
            value={aClub}
            onChange={setAClub}
            disabled={!canControl || busy}
            clubs={clubsSorted}
            placeholder="Select club…"
          />
          <ClubSelect
            label={`${bInline} — club`}
            value={bClub}
            onChange={setBClub}
            disabled={!canControl || busy}
            clubs={clubsSorted}
            placeholder="Select club…"
          />
        </div>
      </div>

      {!canControl && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 px-3 py-2 text-sm text-zinc-400">
          Read-only. Login as editor/admin to control the live match.
        </div>
      )}
    </div>
  );
}

function GoalStepper({
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
      >
        −
      </button>
      <div className="min-w-[44px] text-center text-lg font-bold text-zinc-100">{value}</div>
      <button
        type="button"
        className="h-9 w-10 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900/40 disabled:opacity-50"
        onClick={inc}
        disabled={disabled}
      >
        +
      </button>
    </div>
  );
}

function ClubSelect({
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
