import CupCard from "./CupCard";
import CurrentMatchPreviewCard from "./CurrentMatchPreviewCard";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import RandomClubPickerCard from "./RandomClubPickerCard";

export default function DashboardPage() {
  return (
    <div className="page">
      <div className="grid gap-3 lg:grid-cols-2">
        <CurrentMatchPreviewCard />

        <CollapsibleCard title="Lorbeerkranz Wanderpokal" defaultOpen={true} variant="outer">
          <div className="card-inner">
            <CupCard />
          </div>
        </CollapsibleCard>

        {/* Keep dashboard cards consistent: participate in the same 2-col grid on desktop. */}
        <RandomClubPickerCard />
      </div>
    </div>
  );
}
