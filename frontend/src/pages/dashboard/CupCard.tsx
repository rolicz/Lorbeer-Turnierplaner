import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "../../ui/primitives/Button";
import { getCup } from "../../api/cup.api";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { listPlayerAvatarMeta, playerAvatarUrl } from "../../api/playerAvatars.api";

import { Pill, pillDate } from "../../ui/primitives/Pill";
import SectionHeader from "../../ui/primitives/SectionHeader";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

function OwnerAvatar({
  playerId,
  name,
  updatedAt,
  className = "h-10 w-10",
}: {
  playerId: number;
  name: string;
  updatedAt: string | null;
  className?: string;
}) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <span className={`panel-subtle inline-flex items-center justify-center overflow-hidden rounded-full shrink-0 ${className}`}>
      {updatedAt ? (
        <img
          src={playerAvatarUrl(playerId, updatedAt)}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-sm font-semibold text-text-muted">{initial}</span>
      )}
    </span>
  );
}

export default function CupCard({ cupKey }: { cupKey: string }) {
  const q = useQuery({ queryKey: ["cup", cupKey], queryFn: () => getCup(cupKey) });
  const avatarsQ = useQuery({ queryKey: ["players", "avatars"], queryFn: listPlayerAvatarMeta });
  const [showAll, setShowAll] = useState(false);
  const varName = cupColorVarForKey(cupKey);

  const history = q.data?.history ?? [];
  const shown = useMemo(() => {
    if (showAll) return history.slice().reverse(); // newest first
    return history.slice(-8).reverse();
  }, [history, showAll]);

  const avatarUpdatedAtByPlayerId = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of avatarsQ.data ?? []) m.set(r.player_id, r.updated_at);
    return m;
  }, [avatarsQ.data]);

  return (
    <div>
      {q.isLoading && <div className="text-text-muted">Loading…</div>}
      {q.error && <div className="text-sm text-red-400">{String(q.error)}</div>}

	      {q.data && (
	        <div className="space-y-3">
	          <div className="flex items-start justify-between gap-3">
	            <div className="min-w-0">
	              <div className="text-xs text-text-muted">Current owner</div>
	              {q.data.owner ? (
	                <div className="mt-1 flex items-center gap-3 min-w-0">
	                  <OwnerAvatar
	                    playerId={q.data.owner.id}
	                    name={q.data.owner.display_name}
	                    updatedAt={avatarUpdatedAtByPlayerId.get(q.data.owner.id) ?? null}
	                  />
	                  <div className="min-w-0 truncate text-xl font-semibold" style={{ color: rgbFromCssVar(varName) }}>
	                    {q.data.owner.display_name}
	                  </div>
	                </div>
	              ) : (
	                <div className="truncate text-xl font-semibold text-text-muted">No owner yet</div>
	              )}
	            </div>
            <div className="flex items-center gap-2">
              <span className="relative inline-flex group">
                <Button
                  variant="ghost"
                  aria-label="Info"
                  title="Info"
                >
                  <i className="fa fa-info" aria-hidden="true" />
                </Button>
                <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-72 origin-top-right rounded-xl border border-border-card-chip bg-bg-card-outer/95 p-3 text-xs text-text-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: rgbFromCssVar(varName) }}
                      aria-hidden="true"
                    />
                    <span className="text-text-normal">{q.data.cup.name}</span>
                    {q.data.cup.since_date ? (
                      <span className="text-text-muted">from {fmtDate(q.data.cup.since_date)}</span>
                    ) : (
                      <span className="text-text-muted">all-time</span>
                    )}
                  </div>
                  <div className="mt-2">
                  Cup transfers only when the current owner participates in a{" "}
                  <span className="text-text-normal">done</span> tournament and does not win it.
                  <br />
                  Draw for first place does not transfer.
                  </div>
                </div>
              </span>
            </div>
          </div>

          <div className="panel-subtle p-2">
            <div className="text-xs text-text-muted">Streak</div>
            <div className="mt-1 text-sm text-text-normal">
              <span className="font-semibold text-xl">{q.data.streak.tournaments_participated}</span>
            </div>
            {q.data.streak.since.tournament_name && (
              <div className="mt-1 text-xs text-text-muted">
                Since: 
                  {" "}
                <span className="text-xs text-text-muted">
                  {q.data.streak.since.tournament_name}
                </span>
              </div>
            )}
            {q.data.cup.since_date ? (
              <div className="mt-1 text-xs text-text-muted">From: {fmtDate(q.data.cup.since_date)}</div>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">History</div>
            {history.length > 8 && (
              <Button variant="ghost" type="button" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : "Show all"}
              </Button>
            )}
          </div>

	          {history.length === 0 ? (
	            <div className="text-sm text-text-muted">No transfers yet.</div>
	          ) : (
	            <div className="space-y-2">
	              {shown.map((h) => (
	                <div key={`${h.tournament_id}-${h.date}`} className="panel-subtle px-3 py-2" >
                  <Link
                    to={`/live/${h.tournament_id}`}
                  >
	                  <SectionHeader
	                    left={
	                      <div className="min-w-0">
	                        <div className="truncate text-sm text-text-normal">{h.tournament_name}</div>
	                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Pill className={pillDate()} title="Date">
                            <span>{fmtDate(h.date)}</span>
                          </Pill>

                          {h.streak_duration > 0 && (
                            <Pill title="Streak">
                              <span>Streak: {h.streak_duration}</span>
                            </Pill>
                          )}
                        </div>
	                      </div>
	                    }
	                    right={
	                      <div className="text-sm text-text-normal">
		                        {h.from?.id && h.from.id > 0 && h.from.display_name && h.from.display_name !== "—" ? (
		                          <>
		                            <span className="text-text-muted">{h.from.display_name}</span>{" "}
		                            <span className="text-text-muted">→</span>{" "}
		                          </>
		                        ) : (
		                          <span className="text-text-muted">→ </span>
		                        )}
	                        <span className="font-semibold" style={{ color: rgbFromCssVar(varName) }}>
	                          {h.to.display_name}
	                        </span>
	                      </div>
	                    }
	                    rightClassName="shrink min-w-0 justify-end"
	                  />
	                  </Link>
	                </div>
	              ))}
	            </div>
	          )}


        </div>
      )}
    </div>
  );
}
