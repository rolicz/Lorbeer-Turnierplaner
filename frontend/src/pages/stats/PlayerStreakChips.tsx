/** One player's streak chips ("current / record") — shared by the profile Stats tab
 *  and the stats Player section. A chip is highlighted while the current run equals
 *  the all-time record of every player (i.e. the record is being set right now). */
import { useMemo } from "react";

import type { StatsStreakCategory } from "../../api/types";
import { recordIcon } from "./recordIcons";

/** Category order + glyphs (the one map every record-icon consumer reads, M4). */
const CATEGORIES = [
  { key: "win_streak", label: "Win streak", Icon: recordIcon("win_streak") },
  { key: "unbeaten_streak", label: "Unbeaten streak", Icon: recordIcon("unbeaten_streak") },
  { key: "scoring_streak", label: "Scoring streak", Icon: recordIcon("scoring_streak") },
  { key: "clean_sheet_streak", label: "Clean sheet streak", Icon: recordIcon("clean_sheet_streak") },
] as const;

export default function PlayerStreakChips({
  categories,
  globalCategories,
}: {
  /** Categories for one player (`getStatsStreaks({ playerId })`). */
  categories: StatsStreakCategory[];
  /** Field-wide categories (`getStatsStreaks()` without a player) for the record check. */
  globalCategories: StatsStreakCategory[];
}) {
  const streakByKey = useMemo(() => {
    const m = new Map<string, { current: number; record: number }>();
    for (const cat of categories) {
      const current = cat.current?.[0]?.length ?? 0;
      const record = cat.records?.[0]?.length ?? 0;
      m.set(cat.key, { current, record });
    }
    return m;
  }, [categories]);
  const globalRecordByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const cat of globalCategories) {
      m.set(cat.key, cat.records?.[0]?.length ?? 0);
    }
    return m;
  }, [globalCategories]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
      {CATEGORIES.map(({ key, label, Icon }) => {
        const cur = streakByKey.get(key)?.current ?? 0;
        const rec = streakByKey.get(key)?.record ?? 0;
        const globalRec = globalRecordByKey.get(key) ?? 0;
        const isNewRecordNow = cur > 0 && cur === globalRec;
        return (
          <div
            key={key}
            data-streak={key}
            className={"inset px-3 py-2 " + (isNewRecordNow ? "border border-accent" : "")}
          >
            <div className="inline-flex items-center gap-2 text-text-muted">
              <Icon size={12} aria-hidden="true" />
              <span>{label}</span>
            </div>
            <div className="font-semibold mt-0.5">
              {cur}
              <span className="text-text-muted"> / {rec}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
