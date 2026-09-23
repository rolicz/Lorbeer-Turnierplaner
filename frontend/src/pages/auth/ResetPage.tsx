import EmptyState from "../../ui/primitives/EmptyState";
import AuthScreen from "./AuthScreen";

/** The route exists so a reset link has a page to land on; L5 fills it. */
export default function ResetPage() {
  return (
    <AuthScreen>
      <EmptyState title="Coming in L5" className="py-4" />
    </AuthScreen>
  );
}
