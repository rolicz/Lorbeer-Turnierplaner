import React from "react";
import { Navigate } from "react-router-dom";
import { ROLE_RANK, type Role, useAuth } from "./AuthContext";

/**
 * A page that needs more than membership: `owner` for the admin page (L6), `editor` for
 * anything an admin "viewing as" a lower role should be bounced from. Being logged in at
 * all is `RequireAuth`'s job, above every shell route — this only ranks roles.
 */
export function RequireRole({ minRole, children }: { minRole: Exclude<Role, "none">; children: React.ReactNode }) {
  const { role } = useAuth();
  // Everyone here is already logged in (`RequireAuth` sits above), so a missing role is not
  // a reason to log in again: `/login` would send an authed visitor straight back to `from`,
  // and the two redirects left a member on a blank `/admin` (measured, L6). Home instead.
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
