/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { me } from "../api/auth.api";

export type Role = "reader" | "editor" | "admin";

type AuthState = {
  token: string | null;
  accountRole: Role;
  role: Role;
  playerId: number | null;
  playerName: string | null;
  actorPlayerId: number | null;
  actorPlayerName: string | null;
};

type AuthCtx = AuthState & {
  login: (token: string, role: Role, playerId: number | null, playerName: string | null) => void;
  logout: () => void;
  canCycleRole: boolean;
  cycleRole: () => void;
  canSwitchActor: boolean;
  setActorPlayer: (playerId: number | null, playerName: string | null) => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

const TOKEN_KEY = "ea_fc_token";
const ROLE_KEY = "ea_fc_role";
const PLAYER_ID_KEY = "ea_fc_player_id";
const PLAYER_NAME_KEY = "ea_fc_player_name";
const ROLE_OVERRIDE_KEY = "ea_fc_role_override";
const ACTOR_PLAYER_ID_KEY = "ea_fc_actor_player_id";
const ACTOR_PLAYER_NAME_KEY = "ea_fc_actor_player_name";
const ROLE_RANK: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [storedRole, setStoredRole] = useState<Role>(() => (localStorage.getItem(ROLE_KEY) as Role) || "reader");
  const [storedPlayerId, setStoredPlayerId] = useState<number | null>(() => {
    const raw = localStorage.getItem(PLAYER_ID_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [storedPlayerName, setStoredPlayerName] = useState<string | null>(() => localStorage.getItem(PLAYER_NAME_KEY));
  const [roleOverride, setRoleOverride] = useState<Role | null>(() => {
    const raw = localStorage.getItem(ROLE_OVERRIDE_KEY) as Role | null;
    if (raw === "reader" || raw === "editor" || raw === "admin") return raw;
    return null;
  });
  const [actorPlayerIdOverride, setActorPlayerIdOverride] = useState<number | null>(() => {
    const raw = localStorage.getItem(ACTOR_PLAYER_ID_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [actorPlayerNameOverride, setActorPlayerNameOverride] = useState<string | null>(
    () => localStorage.getItem(ACTOR_PLAYER_NAME_KEY)
  );

  const accountRole: Role = token ? storedRole : "reader";
  const normalizedOverride: Role | null =
    token && roleOverride && ROLE_RANK[roleOverride] <= ROLE_RANK[accountRole] ? roleOverride : null;
  const role: Role = token ? (normalizedOverride ?? accountRole) : "reader";
  const playerId = token ? storedPlayerId : null;
  const playerName = token ? storedPlayerName : null;
  const canCycleRole = !!token && accountRole === "admin";
  const canSwitchActor = !!token && accountRole === "admin";
  const actorPlayerId =
    accountRole === "admin" && actorPlayerIdOverride && actorPlayerIdOverride > 0 ? actorPlayerIdOverride : playerId;
  const actorPlayerName = canSwitchActor
    ? actorPlayerNameOverride || playerName
    : playerName;

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(PLAYER_ID_KEY);
    localStorage.removeItem(PLAYER_NAME_KEY);
    localStorage.removeItem(ROLE_OVERRIDE_KEY);
    localStorage.removeItem(ACTOR_PLAYER_ID_KEY);
    localStorage.removeItem(ACTOR_PLAYER_NAME_KEY);
    setToken(null);
    setStoredRole("reader");
    setStoredPlayerId(null);
    setStoredPlayerName(null);
    setRoleOverride(null);
    setActorPlayerIdOverride(null);
    setActorPlayerNameOverride(null);
  }

  // Validate stored token against backend. This prevents "UI says admin" when the token is stale/invalid
  // (e.g. jwt_secret changed on deployment).
  useEffect(() => {
    let cancelled = false;
    if (!token) return;

    void (async () => {
      try {
        const res = await me(token);
        if (cancelled) return;
        const serverRole = res?.role as Role | undefined;
        if (serverRole && serverRole !== storedRole) {
          localStorage.setItem(ROLE_KEY, serverRole);
          setStoredRole(serverRole);
        }
        const serverPlayerId = Number(res?.player_id ?? 0);
        const normalizedServerPlayerId = Number.isFinite(serverPlayerId) && serverPlayerId > 0 ? serverPlayerId : null;
        const serverPlayerName = res?.player_name ? String(res.player_name) : null;
        if (normalizedServerPlayerId !== storedPlayerId) {
          if (normalizedServerPlayerId == null) localStorage.removeItem(PLAYER_ID_KEY);
          else localStorage.setItem(PLAYER_ID_KEY, String(normalizedServerPlayerId));
          setStoredPlayerId(normalizedServerPlayerId);
        }
        if (serverPlayerName !== storedPlayerName) {
          if (!serverPlayerName) localStorage.removeItem(PLAYER_NAME_KEY);
          else localStorage.setItem(PLAYER_NAME_KEY, serverPlayerName);
          setStoredPlayerName(serverPlayerName);
        }
      } catch {
        if (cancelled) return;
        clearAuth();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, storedRole, storedPlayerId, storedPlayerName]);

  const cycleRole = useCallback(() => {
    if (!canCycleRole) return;
    const order: Role[] = ["admin", "editor", "reader"];
    const current: Role = normalizedOverride ?? "admin";
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    if (next === "admin") {
      localStorage.removeItem(ROLE_OVERRIDE_KEY);
      setRoleOverride(null);
      return;
    }
    localStorage.setItem(ROLE_OVERRIDE_KEY, next);
    setRoleOverride(next);
  }, [canCycleRole, normalizedOverride]);

  const setActorPlayer = useCallback(
    (pid: number | null, pname: string | null) => {
      if (!token || accountRole !== "admin") return;
      if (pid == null || (storedPlayerId != null && Number(pid) === Number(storedPlayerId))) {
        localStorage.removeItem(ACTOR_PLAYER_ID_KEY);
        localStorage.removeItem(ACTOR_PLAYER_NAME_KEY);
        setActorPlayerIdOverride(null);
        setActorPlayerNameOverride(null);
        return;
      }
      const safePid = Number(pid);
      if (!Number.isFinite(safePid) || safePid <= 0) return;
      localStorage.setItem(ACTOR_PLAYER_ID_KEY, String(safePid));
      if (pname) localStorage.setItem(ACTOR_PLAYER_NAME_KEY, pname);
      else localStorage.removeItem(ACTOR_PLAYER_NAME_KEY);
      setActorPlayerIdOverride(safePid);
      setActorPlayerNameOverride(pname || null);
    },
    [accountRole, storedPlayerId, token]
  );

  const value = useMemo<AuthCtx>(() => ({
    token,
    accountRole,
    role,
    playerId,
    playerName,
    actorPlayerId,
    actorPlayerName,
    login: (t, r, pid, pname) => {
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(ROLE_KEY, r);
      if (pid == null) localStorage.removeItem(PLAYER_ID_KEY);
      else localStorage.setItem(PLAYER_ID_KEY, String(pid));
      if (!pname) localStorage.removeItem(PLAYER_NAME_KEY);
      else localStorage.setItem(PLAYER_NAME_KEY, pname);
      localStorage.removeItem(ROLE_OVERRIDE_KEY);
      localStorage.removeItem(ACTOR_PLAYER_ID_KEY);
      localStorage.removeItem(ACTOR_PLAYER_NAME_KEY);
      setToken(t);
      setStoredRole(r);
      setStoredPlayerId(pid);
      setStoredPlayerName(pname);
      setRoleOverride(null);
      setActorPlayerIdOverride(null);
      setActorPlayerNameOverride(null);
    },
    logout: clearAuth,
    canCycleRole,
    cycleRole,
    canSwitchActor,
    setActorPlayer,
  }), [
    token,
    accountRole,
    role,
    playerId,
    playerName,
    actorPlayerId,
    actorPlayerName,
    canCycleRole,
    cycleRole,
    canSwitchActor,
    setActorPlayer,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
