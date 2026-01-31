import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "../../ui/primitives/Button";
import { getCup } from "../../api/cup.api";
import { useAnyTournamentWS } from "../../hooks/useTournamentWS";

import { Pill, pillDate, statusPill } from "../../ui/primitives/Pill";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

export default function CupCard() {
  const q = useQuery({ queryKey: ["cup"], queryFn: getCup });
  const [showAll, setShowAll] = useState(false);

  const history = q.data?.history ?? [];
  const shown = useMemo(() => {
    if (showAll) return history.slice().reverse(); // newest first
    return history.slice(-8).reverse();
  }, [history, showAll]);

  useAnyTournamentWS();

  return (
    <div>
      {q.isLoading && <div className="text-zinc-400">Loading…</div>}
      {q.error && <div className="text-sm text-red-400">{String(q.error)}</div>}

      {q.data && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">Current owner</div>
              <div className="truncate text-xl font-semibold accent">{q.data.owner.display_name}</div>
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
                <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-72 origin-top-right rounded-xl border border-zinc-800 bg-zinc-950/95 p-3 text-xs text-zinc-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  Cup transfers only when the current owner participates in a{" "}
                  <span className="text-zinc-100">done</span> tournament and does not win it.
                  <br />
                  Draw for first place does not transfer.
                </div>
              </span>
            </div>
          </div>

          <div className="panel-subtle p-2">
            <div className="text-xs text-zinc-500">Streak</div>
            <div className="mt-1 text-sm text-zinc-200">
              <span className="font-semibold text-xl">{q.data.streak.tournaments_participated}</span>
            </div>
            {q.data.streak.since.tournament_name && (
              <div className="mt-1 text-xs text-zinc-500">
                Since: 
                  {" "}
                <span className="text-xs text-zinc-300">
                  {q.data.streak.since.tournament_name}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-300 font-semibold">History</div>
            {history.length > 8 && (
              <Button variant="ghost" type="button" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : "Show all"}
              </Button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="text-sm text-zinc-500">No transfers yet.</div>
          ) : (
            <div className="space-y-2">
              {shown.map((h) => (
                <div key={`${h.tournament_id}-${h.date}`} className="panel-subtle px-3 py-2" >
                  <Link
                    to={`/live/${h.tournament_id}`}
                  >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-200">{h.tournament_name}</div>
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
                    <div className="shrink-0 text-sm text-zinc-200">
                      <span className="text-zinc-300">{h.from.display_name}</span>{" "}
                      <span className="text-zinc-500">→</span>{" "}
                      <span className="accent font-semibold">{h.to.display_name}</span>
                    </div>
                  </div>
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
