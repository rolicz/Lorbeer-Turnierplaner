import { useCallback, useState } from "react";
import FriendlyMatchCard from "./tools/FriendlyMatchCard";
import FriendlyMatchesListCard from "./tools/FriendlyMatchesListCard";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import PageLayout from "../ui/layout/PageLayout";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import { Plus, List } from "lucide-react";

type Tab = "create" | "all";
const TABS: SectionTab<Tab>[] = [
  { key: "all", label: "All Friendlies", icon: <List size={14} /> },
  { key: "create", label: "New", icon: <Plus size={14} /> },
];

export default function FriendliesPage() {
  const pageEntered = useRouteEntryLoading();
  const [active, setActive] = useState<Tab>("all");

  const handleCreateReady = useCallback(() => {}, []);
  const handleListReady = useCallback(() => {}, []);

  if (!pageEntered) {
    return <PageLayout><PageLoadingScreen sectionCount={3} /></PageLayout>;
  }

  return (
    <PageLayout title="Friendlies">
      <SectionTabs tabs={TABS} active={active} onChange={setActive} className="mb-4" />

      {active === "all" && (
        <FriendlyMatchesListCard embedded onInitialReady={handleListReady} />
      )}
      {active === "create" && (
        <FriendlyMatchCard embedded onInitialReady={handleCreateReady} />
      )}
    </PageLayout>
  );
}
