import { apiFetch } from "./client";
import type { EmailVerified, MeResponse } from "./types";

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

/**
 * Ask for a recovery link (`POST /auth/recover`, E3). Public. The answer is `{ok: true}`
 * **whatever the address** — known, unknown, unverified — so nothing here can tell anyone
 * which addresses have accounts; the only other answers are a 400 for something that is not
 * an address and a 429.
 */
export function requestRecovery(email: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/recover", { method: "POST", body: JSON.stringify({ email }) });
}

/**
 * Confirm an address from its link (`POST /auth/email/verify`, E3): the token from the
 * fragment. Public — the link may be opened on a device that is not logged in. Called from a
 * tap, never on load (a mail scanner that runs the page must not spend it).
 */
export function verifyEmail(token: string): Promise<EmailVerified> {
  return apiFetch<EmailVerified>("/auth/email/verify", { method: "POST", body: JSON.stringify({ token }) });
}

/** Join a group with a code — implemented once, in `account.api.ts` (L7 needed it first). */
export { redeemCode } from "./account.api";
