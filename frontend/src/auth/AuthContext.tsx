import React, { createContext, useContext, useMemo, useState } from "react";

export type Role = "reader" | "editor" | "admin";

type AuthState = {
  token: string | null;
  role: Role;
};

type AuthCtx = AuthState & {
  login: (token: string, role: Role) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

const TOKEN_KEY = "ea_fc_token";
const ROLE_KEY = "ea_fc_role";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [storedRole, setStoredRole] = useState<Role>(() => (localStorage.getItem(ROLE_KEY) as Role) || "reader");

  const role: Role = token ? storedRole : "reader";

  const value = useMemo<AuthCtx>(() => ({
    token,
    role,
    login: (t, r) => {
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(ROLE_KEY, r);
      setToken(t);
      setStoredRole(r);
    },
    logout: () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ROLE_KEY);
      setToken(null);
      setStoredRole("reader");
    },
  }), [token, role, storedRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
