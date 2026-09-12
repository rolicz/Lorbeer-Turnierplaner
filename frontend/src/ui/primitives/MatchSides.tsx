/**
 * The club columns under a score (`DESIGN.md` §8): club badge + name, flag +
 * league, and stars **only for a side that has a club** — a clubless side shows
 * a muted "No club" and nothing else.
 *
 *      FC Bayern München 🛡   🛡 FC Barcelona
 *             Bundesliga 🇩🇪   🇪🇸 La Liga
 *                  ★★★★★       ★★★★★
 *
 * Both sides hug the centre gap, mirroring the `ScoreLine` above them, so the
 * block stays a readable cluster instead of spreading across a desktop panel.
 * Shared by the hero panel, the live match list and the stats match history.
 */
import type { ReactNode } from "react";

import type { Club } from "../../api/types";
import { cn } from "../cn";
import ClubBadge from "../ClubBadge";
import NationFlag from "../NationFlag";
import { clubLabelPartsById } from "../clubControls";
import { StarsFA } from "./StarsFA";

/** One row of the block: left side right-aligned, right side left-aligned. */
function SideRow({ left, right, className }: { left: ReactNode; right: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3", className)}>
      <div className="flex min-w-0 items-center justify-end gap-1.5 text-right">{left}</div>
      <div />
      <div className="flex min-w-0 items-center gap-1.5 text-left">{right}</div>
    </div>
  );
}

function Wrapped({ children }: { children: ReactNode }) {
  return <span className="min-w-0 whitespace-normal break-words leading-tight md:truncate">{children}</span>;
}

export default function MatchSides({
  clubs,
  aClubId,
  bClubId,
  size = "row",
  className,
}: {
  clubs: Club[];
  aClubId?: number | null;
  bClubId?: number | null;
  /** `hero` gives the club symbols their larger footprint and a normal-weight name. */
  size?: "hero" | "row";
  className?: string;
}) {
  const a = clubLabelPartsById(clubs, aClubId);
  const b = clubLabelPartsById(clubs, bClubId);

  // "No club" (and unresolved ids) render no symbol, no league and no stars.
  const aHasClub = clubs.some((c) => c.id === aClubId);
  const bHasClub = clubs.some((c) => c.id === bClubId);

  const badgeSize = size === "hero" ? "md" : "sm";
  const clubTone = size === "hero" ? "text-text-normal" : "text-text-muted";

  return (
    <div className={className}>
      <SideRow
        className={cn("text-sm", clubTone)}
        left={
          aHasClub ? (
            <>
              <Wrapped>{a.name}</Wrapped>
              <ClubBadge
                name={a.name}
                nation={a.national_nation}
                clubId={a.id}
                crestVersion={a.crest_updated_at}
                size={badgeSize}
              />
            </>
          ) : (
            <span className="text-text-muted">{a.name}</span>
          )
        }
        right={
          bHasClub ? (
            <>
              <ClubBadge
                name={b.name}
                nation={b.national_nation}
                clubId={b.id}
                crestVersion={b.crest_updated_at}
                size={badgeSize}
              />
              <Wrapped>{b.name}</Wrapped>
            </>
          ) : (
            <span className="text-text-muted">{b.name}</span>
          )
        }
      />

      <SideRow
        className="mt-0.5 text-xs text-text-muted"
        left={
          aHasClub ? (
            <>
              <Wrapped>{a.league_name}</Wrapped>
              <NationFlag nation={a.league_nation} />
            </>
          ) : null
        }
        right={
          bHasClub ? (
            <>
              <NationFlag nation={b.league_nation} />
              <Wrapped>{b.league_name}</Wrapped>
            </>
          ) : null
        }
      />

      <SideRow
        className="mt-1 text-xs text-text-muted"
        left={aHasClub ? <StarsFA rating={a.rating ?? 0} textClassName="text-text-muted" /> : null}
        right={bHasClub ? <StarsFA rating={b.rating ?? 0} textClassName="text-text-muted" /> : null}
      />
    </div>
  );
}
