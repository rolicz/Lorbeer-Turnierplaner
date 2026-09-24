/**
 * The auth provider component — and nothing else, so React Fast Refresh can
 * update it in place (Q10). The context object it fills lives in
 * `AuthContext.ts`; see the note there for what sharing one module cost us.
 *
 * There is no credential here (L4). The session is the `lk_session` cookie, which the
 * browser holds and this code cannot read; what the app keeps is the last `GET /me`
 * answer (`ea_fc_me`), so a relaunch paints the shell from cache before the server
 * has confirmed anything. The three rules that decide `status`:
 *
 * 1. **Only a 401 logs anyone out.** A request that never got an answer — aborted,
 *    offline, DNS down, the backend restarting — says nothing about the session, and
 *    logging the user out over one of those is how a PWA on flaky wifi silently became
 *    a login screen (A9, and Roli's "browsing on the train keeps working").
 * 2. **No cache and no answer is `unknown`**, not anonymous: the shell stays down and
 *    the reader sees a loading screen that says the server cannot be reached, and the
 *    question is asked again when the network comes back.
 * 3. **The old JWT buys one session.** A pre-batch install has `ea_fc_token` in
 *    storage; it is sent to `/auth/exchange` once, and removed the moment the server
 *    has answered — never before, so an exchange that could not be delivered is
 *    retried on the next boot instead of costing the person their login.
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";

import { exchangeLegacyToken, logout as apiLogout, me as apiMe } from "../api/auth.api";
import { ApiError } from "../api/client";
import type { MeGroup, MeResponse, Role } from "../api/types";
import { getBrowserPushSubscription } from "../push/push";
import { showErrorToast } from "../ui/primitives/ErrorToast";
import { readStored, removeStored, writeStored } from "../utils/safeStorage";
import { AuthContext, ROLE_RANK, type AuthCtx, type AuthStatus } from "./AuthContext";

/** The cached `GET /me` answer — what the app boots from before the server has spoken. */
export const ME_KEY = "ea_fc_me";
const ROLE_OVERRIDE_KEY = "ea_fc_role_override";
const ACTOR_PLAYER_ID_KEY = "ea_fc_actor_player_id";
const ACTOR_PLAYER_NAME_KEY = "ea_fc_actor_player_name";
/** Pre-batch storage: the JWT is read once for the exchange; all four are then removed for good. */
export const LEGACY_TOKEN_KEY = "ea_fc_token";
const LEGACY_KEYS = [LEGACY_TOKEN_KEY, "ea_fc_role", "ea_fc_player_id", "ea_fc_player_name"] as const;
/** While the boot has no answer, ask again this often — and on `online`, and on becoming visible. */
const UNKNOWN_RETRY_MS = 15_000;
/** How long `logout` waits for the service worker to name this device's push endpoint. */
const PUSH_ENDPOINT_TIMEOUT_MS = 1_500;

type SessionState = { status: AuthStatus; me: MeResponse | null };

function isRole(v: unknown): v is Role {
  return v === "none" || v === "editor" || v === "owner" || v === "admin";
}

/** The wire types `role` as a string; the app switches on it, so it is narrowed exactly once. */
function normalizeMe(raw: MeResponse): MeResponse {
  const groups: MeGroup[] = (Array.isArray(raw.groups) ? raw.groups : []).map((g) => ({
    ...g,
    role: g.role === "owner" ? "owner" : "member",
  }));
  return { ...raw, role: isRole(raw.role) ? raw.role : "none", groups };
}

function readCachedMe(): MeResponse | null {
  const raw = readStored(ME_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MeResponse> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.player_id !== "number" || typeof parsed.player_name !== "string") return null;
    return normalizeMe(parsed as MeResponse);
  } catch {
    return null;
  }
}

function dropLegacyKeys() {
  for (const key of LEGACY_KEYS) removeStored(key);
}

/**
 * Only the server saying "this session is no good" ends it — a 401, and nothing else. A
 * 403 is "not a member of this group", which is a different answer to a different
 * question and never a reason to throw a session away; anything without a status is a
 * request that did not arrive (A9).
 */
function isSessionRejection(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** The exchange's verdict on the old JWT: it buys nothing, forget it. */
function isExchangeRefusal(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 410);
}

/**
 * One request per boot, however many times the boot effect runs (StrictMode mounts it
 * twice in dev). For the exchange it is a correctness rule: a second POST would present
 * the cookie the first one just set, and the server revokes a session that logs in over
 * itself. For `/me` it is only economy — but "logged out → exactly one request" is what
 * the login screen promises, so the same singleton covers both.
 */
let exchangeInFlight: Promise<MeResponse> | null = null;
let meInFlight: Promise<MeResponse> | null = null;

function meOnce(): Promise<MeResponse> {
  if (!meInFlight) {
    meInFlight = apiMe().finally(() => {
      meInFlight = null;
    });
  }
  return meInFlight;
}

async function browserPushEndpoint(): Promise<string | null> {
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), PUSH_ENDPOINT_TIMEOUT_MS));
  const lookup = getBrowserPushSubscription()
    .then((s) => s?.endpoint ?? null)
    .catch(() => null);
  return Promise.race([lookup, timeout]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Optional on purpose: the tests mount this provider bare, and the app mounts it
  // under `QueryClientProvider`. A new identity throws the previous one's cache away
  // *before* the shell can render it — the tournaments list carries per-caller flags
  // under a key that names no viewer, so a login as somebody else must not inherit them.
  const qc = useContext(QueryClientContext);
  const [session, setSessionState] = useState<SessionState>(() => {
    // An old JWT means the session has to be bought first: painting the shell from a
    // cache would fire requests on a cookie the exchange is about to revoke (a login
    // over a live session revokes it, L2), and their 401s would end the new session
    // before it began. Measured, not imagined — with a test harness that re-planted the
    // JWT on reload. In the app the two cannot coexist, and this keeps it that way.
    if (readStored(LEGACY_TOKEN_KEY)) return { status: "unknown", me: null };
    const cached = readCachedMe();
    return cached ? { status: "authed", me: cached } : { status: "unknown", me: null };
  });
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [signedOutReason, setSignedOutReason] = useState<"expired" | null>(null);
  const [roleOverride, setRoleOverride] = useState<Role | null>(() => {
    const raw = readStored(ROLE_OVERRIDE_KEY);
    return raw === "owner" || raw === "editor" ? raw : null;
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
  const [bootNonce, setBootNonce] = useState(0);

  // Event handlers and the boot effect need the *current* status, not the one they closed over.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  const meData = session.status === "authed" ? session.me : null;
  const accountRole: Role = meData?.role ?? "none";
  const normalizedOverride: Role | null =
    meData && roleOverride && ROLE_RANK[roleOverride] <= ROLE_RANK[accountRole] ? roleOverride : null;
  const role: Role = meData ? (normalizedOverride ?? accountRole) : "none";
  const playerId = meData?.player_id ?? null;
  const playerName = meData?.player_name ?? null;
  const canCycleRole = accountRole === "admin";
  const canSwitchActor = accountRole === "admin";
  const actorPlayerId =
    accountRole === "admin" && actorPlayerIdOverride && actorPlayerIdOverride > 0 ? actorPlayerIdOverride : playerId;
  const actorPlayerName = canSwitchActor ? actorPlayerNameOverride || playerName : playerName;

  const clearOverrides = useCallback(() => {
    removeStored(ROLE_OVERRIDE_KEY);
    removeStored(ACTOR_PLAYER_ID_KEY);
    removeStored(ACTOR_PLAYER_NAME_KEY);
    setRoleOverride(null);
    setActorPlayerIdOverride(null);
    setActorPlayerNameOverride(null);
  }, []);

  /** The server's current answer: cache it and believe it. Overrides are left alone (a refresh). */
  const applyMe = useCallback((raw: MeResponse) => {
    const next = normalizeMe(raw);
    writeStored(ME_KEY, JSON.stringify(next));
    setSessionState({ status: "authed", me: next });
    setServerUnreachable(false);
    setSignedOutReason(null);
  }, []);

  /** The server rejected the session, or the reader left: nothing cached, `anonymous`. */
  const clearAuth = useCallback(
    (reason: "expired" | null) => {
      removeStored(ME_KEY);
      clearOverrides();
      setSessionState({ status: "anonymous", me: null });
      setSignedOutReason(reason);
    },
    [clearOverrides]
  );

  /**
   * A 401 arrived. The *first* one decides why the app is anonymous — every request the
   * shell had in flight answers 401 too, and a late one must not overwrite "expired"
   * with nothing (measured: the desktop shell's prefetches beat the boot's own `/me`).
   */
  const endSession = useCallback(() => {
    const current = sessionRef.current.status;
    if (current === "anonymous") return;
    clearAuth(current === "authed" ? "expired" : null);
  }, [clearAuth]);

  /** A fresh session from login / register / reset / the exchange. */
  const setSession = useCallback(
    (raw: MeResponse) => {
      qc?.clear();
      clearOverrides();
      applyMe(raw);
    },
    [applyMe, clearOverrides, qc]
  );

  // Boot: the exchange if an old JWT is stored, else `GET /me`. Re-run by `bootNonce`
  // while the answer is still `unknown` (below).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const legacy = readStored(LEGACY_TOKEN_KEY);
      if (legacy) {
        try {
          exchangeInFlight ??= exchangeLegacyToken(legacy);
          const res = await exchangeInFlight;
          exchangeInFlight = null;
          dropLegacyKeys();
          if (cancelled) return;
          setSession(res);
          return;
        } catch (err) {
          exchangeInFlight = null;
          if (isExchangeRefusal(err)) {
            // The server's verdict on the JWT. A cookie session may still exist
            // beside it (unlikely, cheap to ask), so fall through to `/me`.
            dropLegacyKeys();
          } else {
            // No verdict: keep the JWT for the next boot. Rule 3 above.
            if (!cancelled) setServerUnreachable(true);
            return;
          }
        }
      }
      try {
        const res = await meOnce();
        if (cancelled) return;
        applyMe(res);
      } catch (err) {
        if (cancelled) return;
        if (isSessionRejection(err)) endSession();
        else setServerUnreachable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootNonce, applyMe, endSession, setSession]);

  // While nothing is known, keep asking: when the network comes back, when the app is
  // brought to the front, and on a slow clock in between. A `PageLoadingScreen` that
  // never re-asks would be a login screen with extra steps.
  useEffect(() => {
    if (session.status !== "unknown") return;
    const retry = () => setBootNonce((n) => n + 1);
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(retry, UNKNOWN_RETRY_MS);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [session.status]);

  // Central 401 handler: any request outside `/auth/` that gets a 401 fires
  // "api:unauthorized" (`api/client.ts`). The session is gone; say so once. A boot that
  // finds no session at all is not "expired" and gets no toast.
  useEffect(() => {
    const onUnauthorized = () => {
      const wasAuthed = sessionRef.current.status === "authed";
      endSession();
      if (wasAuthed) showErrorToast("Session expired — please log in again.", "Session expired");
    };
    window.addEventListener("api:unauthorized", onUnauthorized);
    return () => window.removeEventListener("api:unauthorized", onUnauthorized);
  }, [endSession]);

  const logout = useCallback(async () => {
    const endpoint = await browserPushEndpoint();
    try {
      await apiLogout(endpoint);
    } catch (err) {
      // The server answered (the row is gone, or never was): the cookie is dead either
      // way. Only a request that never arrived leaves the session standing — and then
      // the caller is told, because clearing here would log out a device whose cookie
      // the next boot would find alive.
      if (!(err instanceof ApiError)) throw err;
    }
    clearAuth(null);
  }, [clearAuth]);

  const refresh = useCallback(async () => {
    try {
      applyMe(await apiMe());
    } catch (err) {
      if (isSessionRejection(err)) endSession();
    }
  }, [applyMe, endSession]);

  const cycleRole = useCallback(() => {
    if (!canCycleRole) return;
    const order: Role[] = ["admin", "owner", "editor"];
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
      if (accountRole !== "admin") return;
      if (pid == null || (playerId != null && Number(pid) === Number(playerId))) {
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
    [accountRole, playerId]
  );

  const value = useMemo<AuthCtx>(
    () => ({
      status: session.status,
      accountRole,
      role,
      playerId,
      playerName,
      siteAdmin: meData?.site_admin ?? false,
      groups: meData?.groups ?? [],
      hasPassword: meData?.has_password ?? false,
      hasPasskey: meData?.has_passkey ?? false,
      passwordMigrated: meData?.password_migrated ?? false,
      // A cached answer from before E1 lacks these: no email step, and the login taken as
      // secure, until the boot's own `/me` says otherwise a moment later.
      email: meData?.email ?? null,
      emailPending: meData?.email_pending ?? null,
      emailVerified: meData?.email_verified ?? false,
      emailAvailable: meData?.email_available ?? false,
      loginSecure: meData?.login_secure ?? true,
      sessionId: meData?.session_id ?? null,
      serverUnreachable,
      signedOutReason,
      actorPlayerId,
      actorPlayerName,
      setSession,
      logout,
      refresh,
      canCycleRole,
      cycleRole,
      canSwitchActor,
      setActorPlayer,
    }),
    [
      session.status,
      meData,
      accountRole,
      role,
      playerId,
      playerName,
      serverUnreachable,
      signedOutReason,
      actorPlayerId,
      actorPlayerName,
      setSession,
      logout,
      refresh,
      canCycleRole,
      cycleRole,
      canSwitchActor,
      setActorPlayer,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
