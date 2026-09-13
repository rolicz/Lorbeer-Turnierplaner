import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import StatsInsights from "./stats/StatsInsights";
import { formatMatchupSide, parseMatchupSide } from "./stats/statsNav";
import type { StatsMode } from "./stats/statsMode";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import PageLayout from "../ui/layout/PageLayout";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import type { StatsScope } from "../api/types";

const MODE_VALUES: StatsMode[] = ["overall", "1v1", "2v2"];
const SCOPE_VALUES: StatsScope[] = ["tournaments", "both", "friendlies"];

export default function StatsPage() {
  const pageEntered = useRouteEntryLoading();
  const [searchParams, setSearchParams] = useSearchParams();

  // --- shared state, persisted in the URL so it survives section switches ---
  // (the section/sub-view themselves live in `?view=`/`?sub=`, owned by StatsInsights;
  // older URL shapes are mapped by `stats/statsNav.ts`)
  const modeParam = searchParams.get("mode");
  const mode: StatsMode = modeParam && (MODE_VALUES as string[]).includes(modeParam) ? (modeParam as StatsMode) : "overall";
  const scopeParam = searchParams.get("source");
  const scope: StatsScope = scopeParam && (SCOPE_VALUES as string[]).includes(scopeParam) ? (scopeParam as StatsScope) : "tournaments";
  // Both matchup sides carry one or two ids (`?player=1,5&vs=2,4`, T7); everything
  // outside the matchup uses the first id, so single-id URLs behave exactly as before.
  // (memoised on the raw param, so the arrays stay stable across renders and the
  // matchup's request / summary memos are not recomputed on every keystroke elsewhere)
  const playerParam = searchParams.get("player");
  const playerIds = useMemo(() => parseMatchupSide(playerParam), [playerParam]);
  // Matchup drill-in: `vs` is the opposing player (or team) of `player` in H2H.
  const vsParam = searchParams.get("vs");
  const vsIds = useMemo(() => parseMatchupSide(vsParam), [vsParam]);

  /**
   * Every stats param is a same-page rewrite (`replace`), so browser Back leaves
   * `/stats` instead of undoing filter taps — except a drill-in that swaps the
   * whole body, which asks for `push` and becomes its own history entry (T11).
   */
  const patchParams = (changes: Record<string, string | null>, opts?: { push?: boolean }) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: !opts?.push });
  };

  const setMode = (m: StatsMode) => patchParams({ mode: m });
  const setScope = (s: StatsScope) => patchParams({ source: s });
  const setPlayer = (id: number | "") => patchParams({ player: id === "" ? null : String(id) });
  /**
   * Open (or clear) the matchup; pass `withPlayer` to set both sides in one write.
   * Each side is one or two player ids — two on both sides means the exact team
   * matchup. `rel` (the matchup's Against/Together relation, only set by deep links
   * from a match page) is always reset here: an in-app matchup opens on "Against".
   * Clearing the matchup also collapses a team back to its first player, because
   * outside the drill-in only one player can be selected.
   *
   * Opening one is `push`ed (T11): it changes what the page shows, so back — the
   * gesture, the browser button and the in-view one alike — returns to the list
   * it was opened from. Clearing stays a `replace`, because that is the *other*
   * way out, used when there is no stats page behind the drill-in at all.
   */
  const setVs = (ids: number[], withPlayer?: number[], opts?: { push?: boolean }) =>
    patchParams(
      {
        vs: formatMatchupSide(ids),
        rel: null,
        ...(withPlayer?.length
          ? { player: formatMatchupSide(withPlayer) }
          : ids.length
            ? {}
            : { player: formatMatchupSide(playerIds.slice(0, 1)) }),
      },
      opts,
    );

  if (!pageEntered) {
    return <PageLayout><PageLoadingScreen sectionCount={3} /></PageLayout>;
  }

  return (
    <PageLayout title="Stats">
      <StatsInsights
        mode={mode}
        scope={scope}
        onModeChange={setMode}
        onScopeChange={setScope}
        playerIds={playerIds}
        onSelectPlayer={(id) => setPlayer(id)}
        vsIds={vsIds}
        onSetVs={setVs}
      />
    </PageLayout>
  );
}
