import { apiFetch } from "./client";
import type { MeResponse } from "./types";

/**
 * Log in with a display name (any casing — "flo" logs in as "Flo") and a password.
 * The answer is `MeOut`, and the session rides back as the `lk_session` cookie: nothing
 * in the body is a credential and nothing here is stored.
 */
export function login(username: string, password: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

/**
 * End this device's session. `pushEndpoint` is this browser's push subscription, if it
 * has one: the server disables it in the same request, so no hook has to race the
 * session's end to do it afterwards.
 */
export function logout(pushEndpoint: string | null): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ push_endpoint: pushEndpoint }),
  });
}

/** Who the cookie says we are — an *account* path, so a session with no membership gets it too. */
export function me(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me", { method: "GET" });
}

/**
 * Nobody is logged out by the switch: the JWT the app stored before the cookie batch buys
 * one cookie session, once. 401 is a bad JWT, 410 is the server having stopped honouring
 * them at all — both mean "forget it"; anything else means "ask again later".
 */
export function exchangeLegacyToken(legacyJwt: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/exchange", {
    method: "POST",
    headers: { Authorization: `Bearer ${legacyJwt}` },
  });
}
