/**
 * Every record's glyph — the streak sites, the Records page and the profile badges read this
 * and nothing else (M3). Approved by Roli 2026-09-19 (the table at the top of
 * FEATURES_2026-09-badges.md). One map, one job: before this file the same mapping lived as
 * four separate copies (`StreaksView`, `StreakPatches`, `PlayerStreakChips`, `RecordsView`),
 * which is how `Goal` and `Flame` came to mean two different records at once.
 */
import {
  Award,
  Coins,
  Crosshair,
  Dumbbell,
  Flame,
  Gauge,
  Goal,
  Lock,
  PartyPopper,
  Rocket,
  Shield,
  TrendingUp,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { RecordKey } from "../../api/types";

export const RECORD_ICONS: Record<RecordKey, LucideIcon> = {
  most_titles: Trophy,
  highest_elo: Award,
  highest_elo_1v1: Award,
  highest_elo_2v2: Award,
  most_points: Coins,
  highest_ppm: Gauge,
  most_played: Dumbbell,
  most_goals_per_match: Crosshair,
  win_streak: Flame,
  unbeaten_streak: Shield,
  scoring_streak: Goal,
  clean_sheet_streak: Lock,
  biggest_win: Zap,
  highest_scoring_match: PartyPopper,
  most_goals_one_side: Rocket,
  biggest_upset: TrendingUp,
};

/** A key the frontend does not know (a newer backend) still gets a glyph. */
export function recordIcon(key: string): LucideIcon {
  return (RECORD_ICONS as Record<string, LucideIcon>)[key] ?? Award;
}

/** The mode a chip prints beside the Elo glyph; "" for every other record — a mode, not a count. */
export function recordModeLabel(key: string): "" | "1v1" | "2v2" {
  return key === "highest_elo_1v1" ? "1v1" : key === "highest_elo_2v2" ? "2v2" : "";
}
