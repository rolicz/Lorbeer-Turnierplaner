import FriendlyMatchCard from "./tools/FriendlyMatchCard";
import FriendlyMatchesListCard from "./tools/FriendlyMatchesListCard";

export default function FriendliesPage() {
  return (
    <div className="page">
      <FriendlyMatchCard />
      <FriendlyMatchesListCard />
    </div>
  );
}
