import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import StatsTable from "../stats/StatsTable";
import { useStandings, DEFAULT_COLS } from "../stats/standings";

/**
 * Compact standings preview on the dashboard: the same sortable Stats table with a
 * fixed column set (Pts · PPM · P · Win% · Elo) and no controls. Sorting works on the
 * column headers; clicking a row (or the footer) opens the full Table tab in Stats.
 */
export default function StandingsPreviewCard() {
  const navigate = useNavigate();
  const { rows, loading } = useStandings("overall", "tournaments");

  const openFullTable = () =>
    navigate("/stats?section=players&view=table", { state: { statsTab: "table" } });

  return (
    <div>
      <div className="section-head">
        <span className="section-label">Standings</span>
      </div>

      <StatsTable
        rows={rows}
        loading={loading}
        onSelect={openFullTable}
        mode="overall"
        scope="tournaments"
        showControls={false}
        fixedColumns={DEFAULT_COLS}
      />

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={openFullTable}
          className="inline-flex items-center gap-1 text-[11px] text-text-muted transition hover:text-text-normal"
          title="Open the full table in Stats"
        >
          Full table <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
