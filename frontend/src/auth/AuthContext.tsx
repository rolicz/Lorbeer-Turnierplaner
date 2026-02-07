import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { me } from "../api/auth.api";

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

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    setToken(null);
    setStoredRole("reader");
  }

  // Validate stored token against backend. This prevents "UI says admin" when the token is stale/invalid
  // (e.g. jwt_secret changed on deployment).
  useEffect(() => {
    let cancelled = false;
    if (!token) return;

    (async () => {
      try {
        const res = await me(token);
        if (cancelled) return;
        const serverRole = res?.role as Role | undefined;
        if (serverRole && serverRole !== storedRole) {
          localStorage.setItem(ROLE_KEY, serverRole);
          setStoredRole(serverRole);
        }
      } catch {
        if (cancelled) return;
        clearAuth();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, storedRole]);

  const value = useMemo<AuthCtx>(() => ({
    token,
    role,
    login: (t, r) => {
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(ROLE_KEY, r);
      setToken(t);
      setStoredRole(r);
    },
    logout: clearAuth,
  }), [token, role, storedRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
