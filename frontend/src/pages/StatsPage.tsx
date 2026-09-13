import { useSearchParams } from "react-router-dom";

import StatsInsights from "./stats/StatsInsights";
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
  const playerParam = Number(searchParams.get("player"));
  const playerId: number | "" = Number.isFinite(playerParam) && playerParam > 0 ? playerParam : "";
  // Matchup drill-in: `vs` is the opponent of `player` in H2H.
  const vsParam = Number(searchParams.get("vs"));
  const vsId: number | "" = Number.isFinite(vsParam) && vsParam > 0 ? vsParam : "";

  const patchParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };

  const setMode = (m: StatsMode) => patchParams({ mode: m });
  const setScope = (s: StatsScope) => patchParams({ source: s });
  const setPlayer = (id: number | "") => patchParams({ player: id === "" ? null : String(id) });
  /**
   * Open (or clear) the matchup; pass `withPlayer` to set both sides in one write.
   * `rel` (the matchup's Against/Together relation, only set by deep links from a
   * match page) is always reset here: an in-app matchup opens on "Against".
   */
  const setVs = (id: number | "", withPlayer?: number) =>
    patchParams({
      vs: id === "" ? null : String(id),
      rel: null,
      ...(withPlayer != null ? { player: String(withPlayer) } : {}),
    });

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
        playerId={playerId}
        onSelectPlayer={(id) => setPlayer(id)}
        vsId={vsId}
        onSetVs={setVs}
      />
    </PageLayout>
  );
}
