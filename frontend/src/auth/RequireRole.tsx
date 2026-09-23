import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ROLE_RANK, type Role, useAuth } from "./AuthContext";

/**
 * A page that needs more than membership: `owner` for the admin page (L6), `editor` for
 * anything an admin "viewing as" a lower role should be bounced from. Being logged in at
 * all is `RequireAuth`'s job, above every shell route — this only ranks roles.
 */
export function RequireRole({ minRole, children }: { minRole: Exclude<Role, "none">; children: React.ReactNode }) {
  const { role } = useAuth();
  const location = useLocation();
  // Remember where the viewer wanted to go so the login can send them back.
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
