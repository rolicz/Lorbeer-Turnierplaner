import { useRealtimeStatus, type RealtimeStatus } from "../RealtimeStatusContext";

const CONFIG: Record<RealtimeStatus, { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-emerald-400", text: "text-emerald-300" },
  reconnecting: { label: "Reconnecting", dot: "bg-amber-400", text: "text-amber-300" },
  offline: { label: "Offline", dot: "bg-zinc-500", text: "text-text-muted" },
};

/** Small realtime connection status pill, driven by RealtimeStatusContext. */
export default function ConnectionIndicator({ compact = false }: { compact?: boolean }) {
  const status = useRealtimeStatus();
  const cfg = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${cfg.text}`}
      title={`Realtime: ${cfg.label}`}
      aria-label={`Realtime status: ${cfg.label}`}
    >
      <span className="relative inline-flex h-2 w-2 shrink-0">
        {status === "live" ? (
          <span className={`absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-60 animate-live-ping`} />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${cfg.dot}`} />
      </span>
      {!compact ? <span className="truncate">{cfg.label}</span> : null}
    </span>
  );
}
