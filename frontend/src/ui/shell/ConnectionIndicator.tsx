import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../api/client";
import { qk } from "../../api/queryKeys";
import { useRealtimeStatus } from "../RealtimeStatusContext";

type LiveTournamentLite = { id: number; name: string };

type Visual = { label: string; dot: string; text: string; ping: boolean };

/**
 * Realtime status pill. Distinguishes a **running live tournament** ("Live",
 * tappable → its current match) from a merely **connected** socket ("Connected"),
 * plus Reconnecting / Offline from `RealtimeStatusContext`.
 */
export default function ConnectionIndicator({ compact = false }: { compact?: boolean }) {
  const status = useRealtimeStatus();
  const navigate = useNavigate();

  // Is a tournament actually live right now? (cheap, shared cache key)
  const liveQ = useQuery({
    queryKey: qk.tournamentsLive(),
    queryFn: () => apiFetch<LiveTournamentLite | null>("/tournaments/live"),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 15_000,
  });
  const liveTid = status !== "offline" && typeof liveQ.data?.id === "number" ? liveQ.data.id : null;

  const vis: Visual =
    status === "offline"
      ? { label: "Offline", dot: "bg-zinc-500", text: "text-text-muted", ping: false }
      : status === "reconnecting"
        ? { label: "Reconnecting", dot: "bg-amber-400", text: "text-amber-300", ping: false }
        : liveTid != null
          ? { label: "Live", dot: "bg-emerald-400", text: "text-emerald-300", ping: true }
          : { label: "Connected", dot: "bg-emerald-500/80", text: "text-text-muted", ping: false };

  const body = (
    <>
      <span className="relative inline-flex h-2 w-2 shrink-0">
        {vis.ping ? (
          <span className={`absolute inline-flex h-full w-full rounded-full ${vis.dot} opacity-60 animate-live-ping`} />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${vis.dot}`} />
      </span>
      {!compact ? <span className="truncate">{vis.label}</span> : null}
    </>
  );

  const cls = `inline-flex items-center gap-1.5 text-xs ${vis.text}`;

  if (liveTid != null) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/live/${liveTid}`)}
        className={`${cls} focus-ring rounded-full px-2 py-1 -mr-1 transition hover:bg-bg-card-chip/40`}
        title="Open the live tournament's current match"
        aria-label="Live tournament running — open current match"
      >
        {body}
      </button>
    );
  }

  return (
    <span className={cls} title={`Realtime: ${vis.label}`} aria-label={`Realtime status: ${vis.label}`}>
      {body}
    </span>
  );
}
