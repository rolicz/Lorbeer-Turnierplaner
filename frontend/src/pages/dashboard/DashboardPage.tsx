import CupCard from "./CupCard";
import Card from "../../ui/primitives/Card";
import CurrentMatchPreviewCard from "./CurrentMatchPreviewCard";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";

export default function DashboardPage() {
  return (
    <div className="page">
      <div className="grid gap-3 lg:grid-cols-2">
        <CurrentMatchPreviewCard />

        <CollapsibleCard title="Lorbeerkranz Wanderpokal" defaultOpen={true} className="card-outer">
          <CupCard />
        </CollapsibleCard>
        
      </div>
    </div>
  );
}
