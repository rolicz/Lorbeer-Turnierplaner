/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { me } from "../api/auth.api";
import { ApiError } from "../api/client";
import { showErrorToast } from "../ui/primitives/ErrorToast";
import { readStored, removeStored, writeStored } from "../utils/safeStorage";

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

/**
 * Only the server saying "this token is no good" ends a session. A request that
 * never got an answer — aborted (a dev force-reload, a navigation), offline, DNS
 * down, the backend restarting — says nothing about the token, and logging the
 * user out over one of those is how a PWA on flaky wifi silently became a reader (A9).
 */
function isTokenRejection(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStored(TOKEN_KEY));
  const [storedRole, setStoredRole] = useState<Role>(() => (readStored(ROLE_KEY) as Role) || "reader");
  const [storedPlayerId, setStoredPlayerId] = useState<number | null>(() => {
    const raw = readStored(PLAYER_ID_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [storedPlayerName, setStoredPlayerName] = useState<string | null>(() => readStored(PLAYER_NAME_KEY));
  const [roleOverride, setRoleOverride] = useState<Role | null>(() => {
    const raw = readStored(ROLE_OVERRIDE_KEY) as Role | null;
    if (raw === "reader" || raw === "editor" || raw === "admin") return raw;
    return null;
  });
  const [actorPlayerIdOverride, setActorPlayerIdOverride] = useState<number | null>(() => {
    const raw = readStored(ACTOR_PLAYER_ID_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [actorPlayerNameOverride, setActorPlayerNameOverride] = useState<string | null>(
    () => readStored(ACTOR_PLAYER_NAME_KEY)
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
    removeStored(TOKEN_KEY);
    removeStored(ROLE_KEY);
    removeStored(PLAYER_ID_KEY);
    removeStored(PLAYER_NAME_KEY);
    removeStored(ROLE_OVERRIDE_KEY);
    removeStored(ACTOR_PLAYER_ID_KEY);
    removeStored(ACTOR_PLAYER_NAME_KEY);
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
          writeStored(ROLE_KEY, serverRole);
          setStoredRole(serverRole);
        }
        const serverPlayerId = Number(res?.player_id ?? 0);
        const normalizedServerPlayerId = Number.isFinite(serverPlayerId) && serverPlayerId > 0 ? serverPlayerId : null;
        const serverPlayerName = res?.player_name ? String(res.player_name) : null;
        if (normalizedServerPlayerId !== storedPlayerId) {
          if (normalizedServerPlayerId == null) removeStored(PLAYER_ID_KEY);
          else writeStored(PLAYER_ID_KEY, String(normalizedServerPlayerId));
          setStoredPlayerId(normalizedServerPlayerId);
        }
        if (serverPlayerName !== storedPlayerName) {
          if (!serverPlayerName) removeStored(PLAYER_NAME_KEY);
          else writeStored(PLAYER_NAME_KEY, serverPlayerName);
          setStoredPlayerName(serverPlayerName);
        }
      } catch (err) {
        if (cancelled) return;
        // Keep the session unless the server itself rejected the token; a failed
        // request only means we could not ask.
        if (isTokenRejection(err)) clearAuth();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, storedRole, storedPlayerId, storedPlayerName]);

  // Central 401 handler: any authenticated request that gets 401 fires "api:unauthorized".
  // We clear auth state and show one toast so the user knows why they were logged out.
  useEffect(() => {
    const onUnauthorized = () => {
      clearAuth();
      showErrorToast("Session expired — please log in again.", "Session expired");
    };
    window.addEventListener("api:unauthorized", onUnauthorized);
    return () => window.removeEventListener("api:unauthorized", onUnauthorized);
  }, []);

  const cycleRole = useCallback(() => {
    if (!canCycleRole) return;
    const order: Role[] = ["admin", "editor", "reader"];
    const current: Role = normalizedOverride ?? "admin";
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    if (next === "admin") {
      removeStored(ROLE_OVERRIDE_KEY);
      setRoleOverride(null);
      return;
    }
    writeStored(ROLE_OVERRIDE_KEY, next);
    setRoleOverride(next);
  }, [canCycleRole, normalizedOverride]);

  const setActorPlayer = useCallback(
    (pid: number | null, pname: string | null) => {
      if (!token || accountRole !== "admin") return;
      if (pid == null || (storedPlayerId != null && Number(pid) === Number(storedPlayerId))) {
        removeStored(ACTOR_PLAYER_ID_KEY);
        removeStored(ACTOR_PLAYER_NAME_KEY);
        setActorPlayerIdOverride(null);
        setActorPlayerNameOverride(null);
        return;
      }
      const safePid = Number(pid);
      if (!Number.isFinite(safePid) || safePid <= 0) return;
      writeStored(ACTOR_PLAYER_ID_KEY, String(safePid));
      if (pname) writeStored(ACTOR_PLAYER_NAME_KEY, pname);
      else removeStored(ACTOR_PLAYER_NAME_KEY);
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
      writeStored(TOKEN_KEY, t);
      writeStored(ROLE_KEY, r);
      if (pid == null) removeStored(PLAYER_ID_KEY);
      else writeStored(PLAYER_ID_KEY, String(pid));
      if (!pname) removeStored(PLAYER_NAME_KEY);
      else writeStored(PLAYER_NAME_KEY, pname);
      removeStored(ROLE_OVERRIDE_KEY);
      removeStored(ACTOR_PLAYER_ID_KEY);
      removeStored(ACTOR_PLAYER_NAME_KEY);
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
