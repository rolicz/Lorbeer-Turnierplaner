/**
 * The pieces of a cup that more than one surface renders: the Cups sub-view
 * (`CupDetail`) and the dashboard preview (`pages/dashboard/CupsPreviewCard`).
 *
 * Everything a cup shows in exactly one place — the record tiles, the reign
 * list and the per-player table — stays in `CupDetail`.
 */
import { useMemo, type ReactNode } from "react";
import { Trophy } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import PlayerLink from "../../ui/primitives/PlayerLink";
import { cn } from "../../ui/cn";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { fmtDate } from "../../utils/format";
import { usePlayerColors } from "./usePlayerColors";
import { reignSpan, type PlayerRef, type Reign } from "./cupReigns";

const CHIP = "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums";
export const CHIP_PLAIN = `${CHIP} bg-bg-card-chip text-text-chip`;
export const CHIP_ACCENT = `${CHIP} bg-accent/15 text-accent ring-1 ring-inset ring-accent/40`;

/** The `×N` tournaments-held chip; the running reign wears the accent style. */
export function ReignChip({ tournaments, current }: { tournaments: number; current?: boolean }) {
  return (
    <span className={current ? CHIP_ACCENT : CHIP_PLAIN} title={`${tournaments} tournaments held`}>
      ×{tournaments}
    </span>
  );
}

/**
 * Who holds the cup: avatar + name in the cup's colour + one muted meta line.
 * The identity is a link to the profile (it stays clickable inside a row whose
 * own link is a stretched overlay), `trailing` takes whatever the surface puts
 * next to it — the reign chip on the dashboard, the `Current reign` tile in
 * `CupDetail`.
 */
export function CupHolder({
  owner,
  color,
  since,
  defended,
  avatarSizeClass = "h-12 w-12",
  trailing,
}: {
  owner: PlayerRef | null;
  /** The cup's colour — the holder's name wears it on both surfaces. */
  color: string;
  /** Start date of the running reign (`streak.since.date`). */
  since?: string | null;
  /** Tournaments defended; appended to the meta line when > 0. */
  defended?: number;
  avatarSizeClass?: string;
  trailing?: ReactNode;
}) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const held = since ? `Holding since ${fmtDate(since)}` : "—";
  const meta = defended && defended > 0 ? `${held} · ${defended} defended` : held;

  return (
    <div className="flex items-center gap-3">
      {owner ? (
        <PlayerLink
          playerId={owner.id}
          name={owner.display_name}
          className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3"
        >
          <AvatarCircle
            playerId={owner.id}
            name={owner.display_name}
            updatedAt={avatarUpdatedAtById.get(owner.id) ?? null}
            sizeClass={avatarSizeClass}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold" style={{ color }}>
              {owner.display_name}
            </span>
            <span className="block truncate text-xs text-text-muted">{meta}</span>
          </span>
        </PlayerLink>
      ) : (
        <>
          <span className={cn("grid shrink-0 place-items-center rounded-full bg-bg-card-chip/40 text-text-muted", avatarSizeClass)}>
            <Trophy size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">No owner yet</div>
            <div className="truncate text-xs text-text-muted">{meta}</div>
          </div>
        </>
      )}
      {trailing}
    </div>
  );
}

/**
 * The reign timeline: one bar whose segments are proportional to the
 * tournaments each reign was held, in the holders' stable player colours, with
 * the legend that names them. `onSelect` makes the segments buttons (the Cups
 * sub-view jumps to the reign's row); without it the bar is decorative and the
 * block around it owns the tap.
 */
export function CupReignTimeline({
  reigns,
  onSelect,
  className,
}: {
  reigns: Reign[];
  /** `index` is chronological — the same order as `reigns`. */
  onSelect?: (reign: Reign, index: number) => void;
  className?: string;
}) {
  const { colorOf } = usePlayerColors();
  const legend = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of reigns) if (!seen.has(r.holder.id)) seen.set(r.holder.id, r.holder.display_name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [reigns]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg-card-chip/50" aria-hidden={onSelect ? undefined : true}>
        {reigns.map((r, i) => {
          const style = { flexGrow: Math.max(1, r.tournaments), flexBasis: 0, backgroundColor: colorOf(r.holder.id).solid };
          const title = `${r.holder.display_name} · ${r.tournaments} tournaments · ${reignSpan(r)}`;
          const pulse = r.current ? (
            <span className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 0 2px rgb(var(--color-text-normal) / 0.45)" }} />
          ) : null;
          const key = `${r.startTournamentId}-${r.holder.id}`;
          return onSelect ? (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(r, i)}
              title={title}
              aria-label={`${r.holder.display_name}, ${r.tournaments} tournaments — jump to this reign`}
              className="relative h-full min-w-[6px] border-0 p-0"
              style={style}
            >
              {pulse}
            </button>
          ) : (
            <span key={key} title={title} className="relative h-full min-w-[6px]" style={style}>
              {pulse}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {legend.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(p.id).solid }} aria-hidden="true" />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
