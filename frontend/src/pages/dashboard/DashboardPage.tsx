import CupCard from "./CupCard";
import Card from "../../ui/primitives/Card";
import CurrentMatchPreviewCard from "./CurrentMatchPreviewCard";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <CurrentMatchPreviewCard />

        <CollapsibleCard title="Lorbeerkranz Wanderpokal" defaultOpen={true}>
          <CupCard />
        </CollapsibleCard>
        
      </div>
    </div>
  );
}
