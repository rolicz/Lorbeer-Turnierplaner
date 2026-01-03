import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../../ui/primitives/Button";
import type { Club, Match, MatchSide } from "../../api/types";
// import { useTournamentWS } from "../../hooks/useTournamentWS";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { StarsFA } from "../../ui/primitives/StarsFA";


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

function toHalfStep(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 2) / 2;
}

function sortClubsForDropdown(clubs: Club[]) {
  return clubs
    .slice()
    .sort((a, b) => (Number(b.star_rating ?? 0) - Number(a.star_rating ?? 0)) || a.name.localeCompare(b.name));
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

function clubLabelPartsById(clubs: Club[], id: number | null | undefined) {
  if (!id) return { name: "—", rating: null as number | null, ratingText: null as string | null };
  const c = clubs.find((x) => x.id === id);
  if (!c) return { name: `#${id}`, rating: null as number | null, ratingText: null as string | null };
  const r = Number(c.star_rating);
  return {
    name: c.name,
    rating: Number.isFinite(r) ? r : null,
    ratingText: Number.isFinite(r) ? `${starsLabel(r)}★` : null,
  };
}

type PatchPayload = {
  aGoals: number;
  bGoals: number;
  aClub: number | null;
  bClub: number | null;
};

const STAR_OPTIONS: number[] = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.5); // 0.5..5.0

function ensureSelectedClubVisible(filtered: Club[], all: Club[], selectedId: number | null): Club[] {
  if (!selectedId) return filtered;

  const inFiltered = filtered.some((c) => c.id === selectedId);
  if (inFiltered) return filtered;

  const selected = all.find((c) => c.id === selectedId);
  if (selected) return [selected, ...filtered];

  // Fallback: keep a synthetic option so the select still shows something
  return [{ id: selectedId, name: `#${selectedId}`, star_rating: null } as any, ...filtered];
}

export default function CurrentGameSection({
  status,
  match,
  clubs,
  canControl,
  busy,
  onPatch,
  onSwapSides,
}: {
  status: "draft" | "live" | "done";
  match: Match | null;
  clubs: Club[];
  canControl: boolean;
  busy: boolean;
  onPatch: (matchId: number, body: any) => Promise<any>;
  onSwapSides?: (matchId: number) => Promise<any>;
}) {
  // const tid = match && (match as any).tournament_id != null ? Number((match as any).tournament_id) : null;
  // useTournamentWS(tid);

  if (status === "done" || !match) return null;

  const a = sideBy(match, "A");
  const b = sideBy(match, "B");

  const aNames = useMemo(() => namesStack(a), [a]);
  const bNames = useMemo(() => namesStack(b), [b]);

  const aInline = useMemo(() => namesInline(a), [a]);
  const bInline = useMemo(() => namesInline(b), [b]);

  const clubsSorted = useMemo(() => sortClubsForDropdown(clubs), [clubs]);

  // ⭐ filter (does NOT change selected club; only changes what you can pick next)
  const [starFilter, setStarFilter] = useState<number | null>(null);

  const clubsFiltered = useMemo(() => {
    if (starFilter == null) return clubsSorted;
    return clubsSorted.filter((c) => toHalfStep(c.star_rating) === starFilter);
  }, [clubsSorted, starFilter]);

  const [aClub, setAClub] = useState<number | null>(a?.club_id ?? null);
  const [bClub, setBClub] = useState<number | null>(b?.club_id ?? null);
  const [aGoals, setAGoals] = useState<number>(Number(a?.goals ?? 0));
  const [bGoals, setBGoals] = useState<number>(Number(b?.goals ?? 0));

  const aClubParts = useMemo(() => clubLabelPartsById(clubs, aClub), [clubs, aClub]);
  const bClubParts = useMemo(() => clubLabelPartsById(clubs, bClub), [clubs, bClub]);

  // Make sure current clubs remain visible even if filter excludes them
  const clubsForA = useMemo(
    () => ensureSelectedClubVisible(clubsFiltered, clubsSorted, aClub),
    [clubsFiltered, clubsSorted, aClub]
  );
  const clubsForB = useMemo(
    () => ensureSelectedClubVisible(clubsFiltered, clubsSorted, bClub),
    [clubsFiltered, clubsSorted, bClub]
  );

  // -------------------------
  // AUTO-SAVE (debounced)
  // -------------------------
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<PatchPayload | null>(null);
  const lastKeyRef = useRef<string>("");

  function makeKey(m: Match, p: PatchPayload) {
    return JSON.stringify({
      matchId: m.id,
      state: m.state,
      aGoals: p.aGoals,
      bGoals: p.bGoals,
      aClub: p.aClub,
      bClub: p.bClub,
    });
  }

  function clearAutosave() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function flushAutosave() {
    if (!canControl) return;
    if (!match) return;

    const nextState = match.state;
    if (nextState == null) return;

    const p = pendingRef.current;
    if (!p) return;

    const key = makeKey(match, p);
    if (key === lastKeyRef.current) return;

    if (busy) {
      clearAutosave();
      timerRef.current = window.setTimeout(() => {
        void flushAutosave();
      }, 250);
      return;
    }

    lastKeyRef.current = key;

    try {
      await onPatch(match.id, {
        state: nextState,
        sideA: { club_id: p.aClub, goals: p.aGoals },
        sideB: { club_id: p.bClub, goals: p.bGoals },
      });
    } catch {
      lastKeyRef.current = "";
    }
  }

  function queueAutosave(override?: Partial<PatchPayload>) {
    if (!canControl) return;
    if (!match) return;

    const p: PatchPayload = {
      aGoals: override?.aGoals ?? aGoals,
      bGoals: override?.bGoals ?? bGoals,
      aClub: override?.aClub ?? aClub,
      bClub: override?.bClub ?? bClub,
    };

    pendingRef.current = p;

    const key = makeKey(match, p);
    if (key === lastKeyRef.current) return;

    clearAutosave();
    timerRef.current = window.setTimeout(() => {
      void flushAutosave();
    }, 350);
  }

  // Re-sync local editor state whenever backend updates this match
  useEffect(() => {
    const next: PatchPayload = {
      aGoals: Number(a?.goals ?? 0),
      bGoals: Number(b?.goals ?? 0),
      aClub: a?.club_id ?? null,
      bClub: b?.club_id ?? null,
    };

    setAClub(next.aClub);
    setBClub(next.bClub);
    setAGoals(next.aGoals);
    setBGoals(next.bGoals);

    clearAutosave();
    pendingRef.current = next;
    lastKeyRef.current = makeKey(match, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, match?.state, a?.club_id, b?.club_id, a?.goals, b?.goals]);

  const isScheduled = match.state === "scheduled";
  const showGoalInputs = canControl && !isScheduled;
  const scoreLeft = isScheduled ? "-" : String(aGoals);
  const scoreRight = isScheduled ? "-" : String(bGoals);

  async function save(stateOverride?: "scheduled" | "playing" | "finished", override?: Partial<PatchPayload>) {
    if (!canControl) return;
    if (!match) return;

    clearAutosave();

    const nextState = stateOverride ?? match.state;
    if (nextState == null) return;

    const payload: PatchPayload = {
      aGoals: override?.aGoals ?? aGoals,
      bGoals: override?.bGoals ?? bGoals,
      aClub: override?.aClub ?? aClub,
      bClub: override?.bClub ?? bClub,
    };

    pendingRef.current = payload;
    lastKeyRef.current = makeKey(match, payload);

    await onPatch(match.id, {
      state: nextState,
      sideA: { club_id: payload.aClub, goals: payload.aGoals },
      sideB: { club_id: payload.bClub, goals: payload.bGoals },
    });
  }

  async function reset() {
    if (!canControl) return;
    setAGoals(0);
    setBGoals(0);
    await save("scheduled", { aGoals: 0, bGoals: 0 });
  }

  return (
    <div className="space-y-3">
      {/* Top row */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-400">
          <span className="text-zinc-500">
            leg {match.leg} · #{match.order_index + 1} · {match.state}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {canControl && onSwapSides && (
            <Button variant="ghost" onClick={() => onSwapSides(match.id)} disabled={busy} title="Swap home/away (A↔B)">
              <i className="fa fa-arrow-right-arrow-left md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Swap Home/Away</span>
            </Button>
          )}

          {canControl && match.state === "scheduled" && (
            <Button variant="ghost" onClick={() => save("playing")} disabled={busy} title="Start">
              <i className="fa fa-play md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Start</span>
            </Button>
          )}

          {canControl && match.state !== "scheduled" && (
            <Button
              variant="ghost"
              onClick={() => {
                const text = "This will reset the match to 0:0 and scheduled state. Are you sure?";
                if (!window.confirm(text)) return;
                void reset();
              }}
              disabled={busy}
              title="Reset"
            >
              <i className="fa fa-rotate-left md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Reset</span>
            </Button>
          )}

          {canControl && (
            <Button
              disabled={busy}
              onClick={() => {
                const text =
                  match.state === "scheduled"
                    ? "Match not started. Are you sure you want to finish this match (0:0)?"
                    : undefined;
                if (text && !window.confirm(text)) return;
                void save("finished");
              }}
              title="Finish match"
            >
              <i className="fa fa-flag-checkered md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Finish</span>
            </Button>
          )}
        </div>
      </div>

      {/* MOBILE */}
      <div className="space-y-3 md:hidden">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/10 p-3">
          {/* Row 1: NAMES + SCORE (alignment only uses this row) */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
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

            <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">
              <span className={`text-xl font-semibold tabular-nums text-zinc-100`}>
                {scoreLeft}
              </span>
              <span className="text-zinc-500">:</span>
              <span className={`text-xl font-semibold tabular-nums text-zinc-100`}>
                {scoreRight}
              </span>
            </div>
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

          {/* Row 2: CLUBS (separate row) */}
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-zinc-500">
            <div className="min-w-0 whitespace-normal break-words leading-tight">{aClubParts.name}</div>
            <div />
            <div className="min-w-0 whitespace-normal break-words leading-tight text-right">{bClubParts.name}</div>
          </div>

          {/* Row 3: STARS (separate row) */}
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[11px] text-zinc-500">
            <div className="min-w-0">
              {aClubParts.rating != null ? <StarsFA rating={aClubParts.rating} textZinc="text-zinc-500" /> : <span>—</span>}
            </div>
            <div />
            <div className="min-w-0 flex justify-end">
              {bClubParts.rating != null ? <StarsFA rating={bClubParts.rating} textZinc="text-zinc-500" /> : <span>—</span>}
            </div>
          </div>

          {/* Row 4: INPUTS (separate row; not part of the alignment above) */}
          {showGoalInputs && (
            <div className="mt-3 flex items-center justify-center gap-4">
              <GoalStepper
                value={aGoals}
                onChange={(v) => {
                  setAGoals(v);
                  queueAutosave({ aGoals: v });
                }}
                disabled={busy}
                ariaLabel="Goals left"
              />
              <GoalStepper
                value={bGoals}
                onChange={(v) => {
                  setBGoals(v);
                  queueAutosave({ bGoals: v });
                }}
                disabled={busy}
                ariaLabel="Goals right"
              />
            </div>
          )}
        </div>

        {/* Filter + Clubs */}
        { canControl && (
        <CollapsibleCard title="Select Clubs" defaultOpen={false}>
          <div className="grid grid-cols-1 gap-2">
            <StarFilter value={starFilter} onChange={setStarFilter} disabled={busy} />

            <ClubSelect
              label={`${aInline} — club`}
              value={aClub}
              onChange={(v) => {
                if (v === aClub) return; // only save on actual change
                setAClub(v);
                queueAutosave({ aClub: v });
              }}
              disabled={!canControl || busy}
              clubs={clubsForA}
              placeholder="Select club…"
            />

            <ClubSelect
              label={`${bInline} — club`}
              value={bClub}
              onChange={(v) => {
                if (v === bClub) return; // only save on actual change
                setBClub(v);
                queueAutosave({ bClub: v });
              }}
              disabled={!canControl || busy}
              clubs={clubsForB}
              placeholder="Select club…"
            />
          </div>
        </CollapsibleCard>
        )}
      </div>

      {/* DESKTOP/TABLET */}
      <div className="hidden md:block space-y-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/10 p-4">
          {/* Row 1: NAMES + SCORE (alignment only uses this row) */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="min-w-0">
              {aNames.map((n, i) => (
                <div key={`${n}-${i}`} className="truncate text-lg font-semibold text-zinc-100 leading-tight">
                  {n}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">
              <span className={`text-xl font-semibold tabular-nums text-zinc-100`}>
                {scoreLeft}
              </span>
              <span className="text-zinc-500">:</span>
              <span className={`text-xl font-semibold tabular-nums text-zinc-100`}>
                {scoreRight}
              </span>
            </div>

            <div className="min-w-0 text-right">
              {bNames.map((n, i) => (
                <div key={`${n}-${i}`} className="truncate text-lg font-semibold text-zinc-100 leading-tight">
                  {n}
                </div>
              ))}
            </div>
          </div>

          {/* Row 2: CLUBS */}
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-4 text-sm text-zinc-500">
            <div className="min-w-0 truncate">{aClubParts.name}</div>
            <div />
            <div className="min-w-0 truncate text-right">{bClubParts.name}</div>
          </div>

          {/* Row 3: STARS */}
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-sm text-zinc-500">
            <div className="min-w-0">
              {aClubParts.rating != null ? <StarsFA rating={aClubParts.rating} textZinc="text-zinc-500" /> : <span>—</span>}
            </div>
            <div />
            <div className="min-w-0 flex justify-end">
              {bClubParts.rating != null ? <StarsFA rating={bClubParts.rating} textZinc="text-zinc-500" /> : <span>—</span>}
            </div>
          </div>

          {/* Row 4: INPUTS */}
          {showGoalInputs && (
            <div className="mt-3 flex items-center justify-center gap-4">
              <GoalStepper
                value={aGoals}
                onChange={(v) => {
                  setAGoals(v);
                  queueAutosave({ aGoals: v });
                }}
                disabled={busy}
                ariaLabel="Goals left"
              />
              <GoalStepper
                value={bGoals}
                onChange={(v) => {
                  setBGoals(v);
                  queueAutosave({ bGoals: v });
                }}
                disabled={busy}
                ariaLabel="Goals right"
              />
            </div>
          )}
        </div>

        { canControl && (
        <CollapsibleCard title="Select Clubs" defaultOpen={false}>
          <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-3">
            <StarFilter value={starFilter} onChange={setStarFilter} disabled={busy} compact />

            <ClubSelect
              label={`${aInline} — club`}
              value={aClub}
              onChange={(v) => {
                if (v === aClub) return;
                setAClub(v);
                queueAutosave({ aClub: v });
              }}
              disabled={!canControl || busy}
              clubs={clubsForA}
              placeholder="Select club…"
            />

            <ClubSelect
              label={`${bInline} — club`}
              value={bClub}
              onChange={(v) => {
                if (v === bClub) return;
                setBClub(v);
                queueAutosave({ bClub: v });
              }}
              disabled={!canControl || busy}
              clubs={clubsForB}
              placeholder="Select club…"
            />
          </div>
        </CollapsibleCard>
        )}
      </div>
    </div>
  );
}

function StarFilter({
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
        <span className="hidden md:inline text-xs text-zinc-400">Filter by stars</span>
        <span className="md:hidden inline-flex items-center gap-2 text-xs text-zinc-400">
          <i className="fa-solid fa-filter" aria-hidden="true" />
          <span className="sr-only">Filter by stars</span>
        </span>
      </div>

      <select
        className={`rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-60 ${
          compact ? "w-[160px]" : "w-full"
        }`}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
        title="Filter by stars"
      >
        <option value="">All stars</option>
        {STAR_OPTIONS.map((v) => (
          <option key={v} value={v}>
            {v.toFixed(1).replace(/\.0$/, "")}★
          </option>
        ))}
      </select>
    </label>
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
