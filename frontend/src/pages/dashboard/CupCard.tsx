import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";

import { getCup } from "../../api/cup.api";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { fmtDate } from "../../utils/format";

export default function CupCard({ cupKey }: { cupKey: string }) {
  const q = useQuery({ queryKey: ["cup", cupKey], queryFn: () => getCup(cupKey) });
  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();
  const [showAll, setShowAll] = useState(false);
  const color = rgbFromCssVar(cupColorVarForKey(cupKey));

  const history = useMemo(() => q.data?.history ?? [], [q.data?.history]);
  const shown = useMemo(() => (showAll ? history.slice().reverse() : history.slice(-8).reverse()), [history, showAll]);

  const owner = q.data?.owner ?? null;
  const since = q.data?.streak?.since;
  // `tournaments_participated` counts the winning tournament itself, so a fresh win
  // is 1 → that's 0 actual defenses. Defenses = later tournaments the cup was held.
  const defended = Math.max(0, (q.data?.streak?.tournaments_participated ?? 0) - 1);

  return (
    <div>
      <ErrorToastOnError error={q.error} title="Cup loading failed" />
      {q.isLoading && !q.data ? <div className="text-text-muted">Loading…</div> : null}

      {q.data ? (
        <div className="space-y-3">
          {/* Current holder */}
          <div className="flex items-center gap-3">
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
                {shown.map((h) => (
                  <Link key={`${h.tournament_id}-${h.date}`} to={`/live/${h.tournament_id}`} className="row row-tap">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-normal">
                        <b style={{ color }}>{h.to.display_name}</b>{" "}
                        <span className="text-text-muted">
                          {h.from?.id && h.from.id > 0 && h.from.display_name && h.from.display_name !== "—"
                            ? `took it from ${h.from.display_name}`
                            : "claimed it"}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-text-muted">
                        {h.tournament_name} · {fmtDate(h.date)}
                        {h.streak_duration > 0 ? ` · streak ${h.streak_duration}` : ""}
                      </span>
                    </span>
                  </Link>
                ))}
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
