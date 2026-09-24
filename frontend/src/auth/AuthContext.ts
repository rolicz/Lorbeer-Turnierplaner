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

import type { MeGroup, MeResponse, Role } from "../api/types";

export type { Role };

/**
 * The one ranking of the four roles (L4): `navConfig`, `RequireRole` and the "view as"
 * cycle all read it, so a role added later is ranked exactly once. `none` is an account
 * with no membership in this group — it can log in, and sees nothing.
 */
export const ROLE_RANK: Record<Role, number> = { none: 0, editor: 1, owner: 2, admin: 3 };

/** "May this role do what a `min` may do" — an owner may do everything an editor may. */
export function atLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * What the app knows about its session (L4, §11 of the auth plan):
 *
 * - `"unknown"`   — nothing cached and the server has not answered yet, or could not be
 *   reached. The shell does not mount; the reader sees a loading screen with the
 *   connection state, never a login screen — offline is not "logged out".
 * - `"authed"`    — the cookie session is believed to be good: `GET /me` said so, or a
 *   cached answer is on screen until it does. **Only a 401 ends it.**
 * - `"anonymous"` — the server was reached and rejected the session (or there never was
 *   one). This is the only state that shows the login screen.
 */
export type AuthStatus = "unknown" | "authed" | "anonymous";

export type AuthState = {
  status: AuthStatus;
  /** The account's effective role as the server computed it; `"none"` while not authed. */
  accountRole: Role;
  /** `accountRole`, or the "view as lower role" override an admin chose (frontend-only). */
  role: Role;
  playerId: number | null;
  playerName: string | null;
  siteAdmin: boolean;
  /** Every group the account belongs to, with the raw membership role. Empty = not in a group yet. */
  groups: MeGroup[];
  hasPassword: boolean;
  hasPasskey: boolean;
  /** The password is the one migrated from `secrets.json` — nobody has changed it yet. */
  passwordMigrated: boolean;
  /** The verified address, or null (E1). A pending change leaves the old one here. */
  email: string | null;
  /** An address waiting for its link to be opened, or null. */
  emailPending: string | null;
  emailVerified: boolean;
  /** The server can send mail — without it there is no email step at all (E4). */
  emailAvailable: boolean;
  /** The server's word: a passkey, or a password set on this code (never re-derived here). */
  loginSecure: boolean;
  sessionId: number | null;
  /**
   * The last boot attempt (`/me` or the exchange) failed without a status — the server
   * is unreachable or we are offline. Only meaningful while `status === "unknown"`.
   */
  serverUnreachable: boolean;
  /** Why the app is anonymous when it was not the reader's choice; the login screen says it. */
  signedOutReason: "expired" | null;
  /** Who acts — an admin "acting as" another player, else the account itself. */
  actorPlayerId: number | null;
  actorPlayerName: string | null;
};

export type AuthCtx = AuthState & {
  /** A fresh session from login / register / reset / the exchange: `authed`, overrides cleared. */
  setSession: (me: MeResponse) => void;
  /**
   * `POST /auth/logout` (this device's push subscription goes with it), then `anonymous`.
   * Rejects on a network error and changes nothing — a logout needs the server, or the
   * cookie would still be live on the next boot.
   */
  logout: () => Promise<void>;
  /** Ask `GET /me` again; a failure that is not a 401 changes nothing. */
  refresh: () => Promise<void>;
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
