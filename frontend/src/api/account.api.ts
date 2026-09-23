import { apiFetch } from "./client";
import type { AuthSession, MeResponse, RevokedCount } from "./types";

/** My logged-in devices, newest activity first; `current` marks this one (`GET /auth/sessions`). */
export function listMySessions(): Promise<AuthSession[]> {
  return apiFetch<AuthSession[]>("/auth/sessions", { method: "GET" });
}

/** Sign one of my devices out. The server only ever revokes a session of the caller's own. */
export function revokeMySession(sessionId: number): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/auth/sessions/${sessionId}`, { method: "DELETE" });
}

/** Sign every other device out; this one stays. */
export function revokeMyOthers(): Promise<RevokedCount> {
  return apiFetch<RevokedCount>("/auth/sessions/revoke-others", { method: "POST" });
}

/**
 * Set or change my password. `current_password` is required whenever the account has one
 * (403 when wrong) and omitted when it has none. Rate-limited like login (429 with a
 * `retry_after`); other devices stay signed in.
 */
export function changePassword(body: { current_password?: string; new_password: string }): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/password", { method: "POST", body: JSON.stringify(body) });
}

/** Drop my password — the server answers 409 unless a passkey keeps a way in (L9 offers it). */
export function removePassword(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/password", { method: "DELETE" });
}

/**
 * Join a group with an invite code (`ABCDEFGH`, the dash optional). Every bad code is the
 * one 400 "That code is not valid"; a group I am already in is a 409 and leaves the code
 * unspent. The **one** implementation: L5's no-group page and register flow import it
 * from here.
 */
export function redeemCode(code: string): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/redeem", { method: "POST", body: JSON.stringify({ code }) });
}
