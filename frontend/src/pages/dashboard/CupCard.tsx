import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";

import { currentEraMode, getCup } from "../../api/cup.api";
import { qk } from "../../api/queryKeys";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { buildReigns } from "../stats/cupReigns";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { fmtDate } from "../../utils/format";

export default function CupCard({ cupKey }: { cupKey: string }) {
  const q = useQuery({ queryKey: qk.cup(cupKey), queryFn: () => getCup(cupKey) });
  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();
  const [showAll, setShowAll] = useState(false);
  const color = rgbFromCssVar(cupColorVarForKey(cupKey));

  const history = useMemo(() => q.data?.history ?? [], [q.data?.history]);
  // Same reigns the Cups sub-view builds: a row's ×N is the reign the new holder
  // started at that tournament.
  const reignByStart = useMemo(() => new Map(buildReigns(q.data).map((r) => [r.startTournamentId, r])), [q.data]);
  const shown = useMemo(() => (showAll ? history.slice().reverse() : history.slice(-8).reverse()), [history, showAll]);

  const owner = q.data?.owner ?? null;
  const eraMode = currentEraMode(q.data?.cup?.eras);
  const since = q.data?.streak?.since;
  // `tournaments_participated` counts the winning tournament itself, so a fresh win
  // is 1 → that's 0 actual defenses. Defenses = later tournaments the cup was held.
  const defended = Math.max(0, (q.data?.streak?.tournaments_participated ?? 0) - 1);

  return (
    <div>
      <ErrorToastOnError error={q.error} title="Cup loading failed" />
      {q.isLoading && !q.data ? <div className="text-text-muted">Loading…</div> : null}

      {q.data ? (
        <div className="relative space-y-3">
          {/* Current holder */}
          <div className="flex items-center gap-3">
            {eraMode !== "any" ? (
              <span
                className="absolute right-0 top-0 rounded-full bg-bg-card-chip/60 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-text-muted"
                title={`Currently counts ${eraMode} tournaments only`}
              >
                {eraMode}
              </span>
            ) : null}
            {owner ? (
              <AvatarCircle
                playerId={owner.id}
                name={owner.display_name}
                updatedAt={avatarUpdatedAtByPlayerId.get(owner.id) ?? null}
                sizeClass="h-10 w-10"
              />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-full bg-bg-card-chip/40 text-text-muted">
                <Trophy size={16} />
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-base font-semibold" style={{ color: owner ? color : undefined }}>
                {owner ? owner.display_name : "No owner yet"}
              </div>
              <div className="text-[11px] text-text-muted">
                {owner && since?.date ? `Holding since ${fmtDate(since.date)}` : "—"}
                {defended > 0 ? ` · ${defended} defended` : ""}
              </div>
            </div>
          </div>

          {/* Title history */}
          {history.length ? (
            <div>
              <div className="section-head"><span className="section-label">Title history</span></div>
              <div className="list-divided">
                {shown.map((h) => {
                  const hasFrom = !!(h.from?.id && h.from.id > 0 && h.from.display_name && h.from.display_name !== "—");
                  // streak_duration here is the OUTGOING owner's reign that just ended.
                  const endedNote = hasFrom && h.streak_duration > 0
                    ? ` · ended ${h.from.display_name}'s ${h.streak_duration}-tournament reign`
                    : "";
                  const reign = reignByStart.get(h.tournament_id);
                  return (
                    <Link key={`${h.tournament_id}-${h.date}`} to={`/live/${h.tournament_id}`} className="row row-tap">
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5 text-sm text-text-normal">
                          <b className="truncate" style={{ color }}>{h.to.display_name}</b>
                          {reign ? (
                            <span
                              className={
                                "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums " +
                                (reign.current ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/40" : "bg-bg-card-chip text-text-chip")
                              }
                              title={`${reign.tournaments} tournaments held`}
                            >
                              ×{reign.tournaments}
                            </span>
                          ) : null}
                          <span className="truncate text-text-muted">
                            {hasFrom ? `took it from ${h.from.display_name}` : "claimed it"}
                          </span>
                        </span>
                        <span className="block truncate text-[11px] text-text-muted">
                          {h.tournament_name} · {fmtDate(h.date)}{endedNote}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
              {history.length > 8 ? (
                <button type="button" className="mt-1 text-xs font-medium text-accent" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show less" : `Show all ${history.length}`}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-text-muted">No title changes yet.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
