import { useLocation } from "react-router-dom";
import FriendlyMatchCard from "./tools/FriendlyMatchCard";
import FriendlyMatchesListCard from "./tools/FriendlyMatchesListCard";

export default function FriendliesPage() {
  const location = useLocation();
  return (
    <div className="page" key={location.key}>
      <FriendlyMatchCard />
      <FriendlyMatchesListCard />
    </div>
  );
}
