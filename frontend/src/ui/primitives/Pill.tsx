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
      className={`inline-flex items-center justify-center text-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium leading-none min-w-14 ${className ?? pillBaseColors()}`}
    >
      {children}
    </span>
  );
}

export function statusMatchPill(state: "scheduled" | "playing" | "finished") {
  if (state === "playing") return `${colorMatch(state)} border-emerald-500/40`;
  if (state === "scheduled") return `${colorMatch(state)} border-sky-500/30`;
  return `bg-neutral-900 ${colorMatch(state)}`;
}

export function colorMatch(state: "scheduled" | "playing" | "finished") {
  if (state === "playing") return "bg-emerald-500/10 text-emerald-100";
  if (state === "scheduled") return "bg-sky-500/10 text-sky-100";
  return `${pillBaseColors()}`;
}

export function statusPill(status: "draft" | "live" | "done") {
  if (status === "live") return `${colorTournament(status)} border-emerald-500/40`;
  if (status === "draft") return `${colorTournament(status)} border-sky-500/30`;
  return `${colorTournament(status)}`;
}

export function colorTournament(status: "draft" | "live" | "done") {
  if (status === "live") return "bg-emerald-500/10 text-emerald-100";
  if (status === "draft") return "bg-sky-500/10 text-sky-100";
  return `${pillBaseColors()}`;
}

function pillBaseColors() {
  return "bg-neutral-950 text-zinc-300 border-zinc-600";
}

export function pillDate() {
  return `font-mono tabular-nums ${pillBaseColors()}`;
}