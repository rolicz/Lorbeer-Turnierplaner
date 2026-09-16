/**
 * The auth context object and the hook that reads it — and nothing else.
 *
 * The provider lives next door in `AuthProvider.tsx` on purpose (Q10). A module
 * that exports a component *and* a context cannot be hot-updated safely: React
 * Fast Refresh declines the module, Vite re-times the importers instead, and the
 * mounted provider ends up handing out the *old* `createContext` object while
 * this hook — a live binding — reads the new one. The result is
 * "useAuth must be used within AuthProvider" thrown with `AuthProvider` sitting
 * right there in the component stack, above `RouteErrorBoundary`, blanking the
 * whole app. Keeping this file free of components (and, being `.ts`, free of JSX
 * altogether) is what makes the update correct.
 */
import { createContext, useContext } from "react";

export type Role = "reader" | "editor" | "admin";

export type AuthState = {
  token: string | null;
  accountRole: Role;
  role: Role;
  playerId: number | null;
  playerName: string | null;
  actorPlayerId: number | null;
  actorPlayerName: string | null;
};

export type AuthCtx = AuthState & {
  login: (token: string, role: Role, playerId: number | null, playerName: string | null) => void;
  logout: () => void;
  canCycleRole: boolean;
  cycleRole: () => void;
  canSwitchActor: boolean;
  setActorPlayer: (playerId: number | null, playerName: string | null) => void;
};

export const AuthContext = createContext<AuthCtx | null>(null);

/**
 * The throw is deliberate: a missing provider is a broken tree, and softening it
 * to a default would hide that instead of reporting it (Q10).
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
