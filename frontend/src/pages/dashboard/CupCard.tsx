import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "../../ui/primitives/Card";
import Button from "../../ui/primitives/Button";
import { getCup } from "../../api/cup.api";

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

  return (
    <Card title="Lorbeerkranz Cup">
      {q.isLoading && <div className="text-zinc-400">Loading…</div>}
      {q.error && <div className="text-sm text-red-400">{String(q.error)}</div>}

      {q.data && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">Current owner</div>
              <div className="truncate text-xl font-semibold accent">{q.data.owner.display_name}</div>
            </div>
            <Button variant="ghost" onClick={() => q.refetch()} type="button" title="Refresh">
              <i className="fa fa-refresh md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/10 p-3">
            <div className="text-xs text-zinc-500">Streak</div>
            <div className="mt-1 text-sm text-zinc-200">
              <span className="font-semibold">{q.data.streak.tournaments_participated}</span>{" "}
              tournament{q.data.streak.tournaments_participated === 1 ? "" : "s"} participated (since{" "}
              <span className="text-zinc-300">{fmtDate(q.data.streak.since.date)}</span>)
            </div>
            {q.data.streak.since.tournament_name && (
              <div className="mt-1 text-xs text-zinc-500">
                Since: <span className="text-zinc-300">{q.data.streak.since.tournament_name}</span>
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
                <div key={`${h.tournament_id}-${h.date}`} className="rounded-xl border border-zinc-800 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-200">{h.tournament_name}</div>
                      <div className="text-xs text-zinc-500">{fmtDate(h.date)}</div>
                    </div>
                    <div className="shrink-0 text-sm text-zinc-200">
                      <span className="text-zinc-300">{h.from.display_name}</span>{" "}
                      <span className="text-zinc-500">→</span>{" "}
                      <span className="accent font-semibold">{h.to.display_name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-zinc-500">
            Cup transfers only when the current owner participates in a <span className="text-zinc-300">done</span>{" "}
            tournament and does not win it. Draw for first place does not transfer.
          </div>
        </div>
      )}
    </Card>
  );
}
