import {
  matchColor,
  matchStatusPill,
  pillBaseClass,
  pillDateClass,
  tournamentColor,
  tournamentStatusPill,
} from "../theme";

export function Pill({
  className,
  children,
  title,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const base = pillBaseClass();
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center text-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium leading-none min-w-14 ${base} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

export const statusMatchPill = matchStatusPill;
export const colorMatch = matchColor;
export const statusPill = tournamentStatusPill;
export const colorTournament = tournamentColor;
export const pillDate = pillDateClass;
