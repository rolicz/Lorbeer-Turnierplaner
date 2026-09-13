import { Link, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import StatsTable from "../stats/StatsTable";
import { useStandings, DEFAULT_COLS } from "../stats/standings";

/**
 * Compact standings preview on the dashboard: the same sortable Stats table with a
 * fixed column set (Pts · PPM · P · Win% · Elo) and no controls. Sorting works on the
 * column headers; a row opens that player in Stats (their name opens their profile),
 * the header and the footer open the full table.
 */
export default function StandingsPreviewCard() {
  const navigate = useNavigate();
  const { rows, loading } = useStandings("overall", "tournaments");

  const openFullTable = () =>
    navigate("/stats?view=overview&sub=table");
  const openPlayer = (id: number) =>
    navigate(`/stats?view=player&player=${id}`);

  return (
    <div>
      <div className="section-head">
        <Link
          to="/stats?view=overview&sub=table"
          title="Open the full table in Stats"
          className="section-label inline-flex items-center gap-2 no-underline transition hover:text-text-normal"
        >
          Standings
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <StatsTable
        rows={rows}
        loading={loading}
        onSelect={openPlayer}
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
