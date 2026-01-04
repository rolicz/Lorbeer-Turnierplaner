export function Pill({
  className,
  children,
  title,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium leading-none ${className ?? "border-zinc-700 bg-zinc-900/30 text-zinc-300"}`}
    >
      {children}
    </span>
  );
}

export function statusMatchPill(state: "scheduled" | "playing" | "finished") {
  if (state === "playing") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (state === "scheduled") return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return "border-zinc-700 bg-zinc-900/40 text-zinc-300";
}

export function colorMatch(state: "scheduled" | "playing" | "finished") {
  if (state === "playing") return "bg-emerald-500/10";
  if (state === "scheduled") return "bg-sky-500/10 text-sky-200";
  return "bg-zinc-900/40 text-zinc-300";
}

export function statusPill(status: "draft" | "live" | "done") {
  if (status === "live") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "draft") return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return "border-zinc-700/40 bg-zinc-900/40 text-zinc-300";
}

export function colorTournament(status: "draft" | "live" | "done") {
  if (status === "live") return "bg-emerald-500/10 text-emerald-200";
  if (status === "draft") return "bg-sky-500/10 text-sky-200";
  return "bg-zinc-900/40 text-zinc-300";
}
