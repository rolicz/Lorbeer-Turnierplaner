import { apiFetch } from "./client";
import type { MeResponse } from "./types";

/**
 * A new account from an invite code (`POST /auth/register`). Public; the answer is
 * `MeOut` and the session rides back as the cookie. The server checks the code **first**
 * — a caller without a valid code never learns whether a name is taken — and a taken
 * name (409) or a short password (400) leaves the code unspent. `code` is the raw eight.
 */
export function register(body: { code: string; display_name: string; password: string }): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) });
}

/**
 * Redeem a reset link (`POST /auth/reset`): the token from the link's fragment and the
 * new password. Public; every other session of that player ends and this device gets a
 * fresh one. A too-short password is refused before the link is spent.
 */
export function resetPassword(body: { token: string; password: string }): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/reset", { method: "POST", body: JSON.stringify(body) });
}

/** Join a group with a code — implemented once, in `account.api.ts` (L7 needed it first). */
export { redeemCode } from "./account.api";
