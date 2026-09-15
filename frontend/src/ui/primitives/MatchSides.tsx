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
 *
 * **It is read-only on every surface** (T9): a club is picked in the club panel
 * under the scoreboard, which owns both slots, the filters and the randomisers
 * (`ui/SelectClubsPanel.tsx`, `DESIGN.md` §9b). T2 briefly made the club line
 * itself the trigger; that split one job across two places.
 */
import type { ReactNode } from "react";

import type { Club } from "../../api/types";
import { cn } from "../cn";
import ClubBadge from "../ClubBadge";
import NationFlag from "../NationFlag";
import { clubLabelPartsById } from "../clubControls";
import { Stars, StarsToken } from "./Stars";

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
  aStars,
  bStars,
  size = "row",
  stars = "glyphs",
  className,
}: {
  clubs: Club[];
  aClubId?: number | null;
  bClubId?: number | null;
  /**
   * The rating each club carried **on the day of this match** (R4). Stats pass the
   * value the backend resolved; a live surface passes nothing and gets today's, which
   * is the right answer for a match that is being played now.
   */
  aStars?: number | null;
  bStars?: number | null;
  /** `hero` gives the club symbols their larger footprint and a normal-weight name. */
  size?: "hero" | "row";
  /**
   * How the rating is drawn (Q7). `glyphs` is the five-star picture on a line of its
   * own — right where the block has room. `token` folds it into the league line as
   * `★ 3.5`, which is one line less per row and puts the two numbers either side of
   * the centre gap, where they can be compared. The friendlies list uses `token`.
   */
  stars?: "glyphs" | "token";
  className?: string;
}) {
  const a = clubLabelPartsById(clubs, aClubId);
  const b = clubLabelPartsById(clubs, bClubId);

  // "No club" (and unresolved ids) render no symbol, no league and no stars.
  const aHasClub = clubs.some((c) => c.id === aClubId);
  const bHasClub = clubs.some((c) => c.id === bClubId);

  const badgeSize = size === "hero" ? "md" : "sm";
  const clubTone = size === "hero" ? "text-text-normal" : "text-text-muted";

  const aBadge = (
    <ClubBadge
      name={a.name}
      nation={a.national_nation}
      clubId={a.id}
      crestVersion={a.crest_updated_at}
      size={badgeSize}
    />
  );
  const bBadge = (
    <ClubBadge
      name={b.name}
      nation={b.national_nation}
      clubId={b.id}
      crestVersion={b.crest_updated_at}
      size={badgeSize}
    />
  );
  const clubCell = (side: "A" | "B") => {
    const isA = side === "A";
    const has = isA ? aHasClub : bHasClub;
    const parts = isA ? a : b;
    const badge = isA ? aBadge : bBadge;

    if (!has) return <span className="text-text-muted">{parts.name}</span>;

    // Symbols sit next to the centre gap: name → badge on the left, badge → name on the right.
    return isA ? (
      <>
        <Wrapped>{parts.name}</Wrapped>
        {badge}
      </>
    ) : (
      <>
        {badge}
        <Wrapped>{parts.name}</Wrapped>
      </>
    );
  };

  return (
    <div className={className}>
      <SideRow className={cn("text-sm", clubTone)} left={clubCell("A")} right={clubCell("B")} />

      <SideRow
        className="mt-0.5 text-xs text-text-muted"
        left={
          aHasClub ? (
            <>
              <Wrapped>{a.league_name}</Wrapped>
              <NationFlag nation={a.league_nation} />
              {/* The token sits on the inner edge, so the two ratings meet at the gap. */}
              {stars === "token" ? <StarsToken rating={aStars ?? a.rating ?? 0} /> : null}
            </>
          ) : null
        }
        right={
          bHasClub ? (
            <>
              {stars === "token" ? <StarsToken rating={bStars ?? b.rating ?? 0} mirror /> : null}
              <NationFlag nation={b.league_nation} />
              <Wrapped>{b.league_name}</Wrapped>
            </>
          ) : null
        }
      />

      {stars === "glyphs" ? (
        <SideRow
          className="mt-1 text-xs text-text-muted"
          left={aHasClub ? <Stars rating={aStars ?? a.rating ?? 0} textClassName="text-text-muted" /> : null}
          right={bHasClub ? <Stars rating={bStars ?? b.rating ?? 0} textClassName="text-text-muted" /> : null}
        />
      ) : null}
    </div>
  );
}
