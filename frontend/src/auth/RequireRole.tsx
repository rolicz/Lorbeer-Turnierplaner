import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Role, useAuth } from "./AuthContext";

const rank: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };

export function RequireRole({ minRole, children }: { minRole: Role; children: React.ReactNode }) {
  const { role } = useAuth();
  const location = useLocation();
  // Remember where the viewer wanted to go so the login can send them back.
  if (rank[role] < rank[minRole]) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
