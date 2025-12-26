import React from "react";
import { Navigate } from "react-router-dom";
import { Role, useAuth } from "./AuthContext";

const rank: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };

export function RequireRole({ minRole, children }: { minRole: Role; children: React.ReactNode }) {
  const { role } = useAuth();
  if (rank[role] < rank[minRole]) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
