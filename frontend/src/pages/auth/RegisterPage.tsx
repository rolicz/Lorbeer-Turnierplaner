import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import EmptyState from "../../ui/primitives/EmptyState";
import AuthScreen from "./AuthScreen";

/** The route exists so the login screen's link has somewhere to go; L5 fills it. */
export default function RegisterPage() {
  return (
    <AuthScreen
      below={
        <div>
          Already have an account?{" "}
          <Link to="/login" className="inline-flex items-center gap-1 text-text-muted transition hover:text-text-normal">
            Log in <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      }
    >
      <EmptyState title="Coming in L5" className="py-4" />
    </AuthScreen>
  );
}
