import CupCard from "./CupCard";
import Card from "../../ui/primitives/Card";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <CupCard />

        {/* Placeholder card for easy future additions */}
        <Card title="Coming next">
          <div className="text-sm text-zinc-400">
            Add widgets here later (stats, recent tournaments, top scorers, streaks…).
          </div>
        </Card>
      </div>
    </div>
  );
}
