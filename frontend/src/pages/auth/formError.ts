import { ApiError } from "../../api/client";

/**
 * An auth form's error line (L5): the server's own sentence, verbatim ("That code is not
 * valid", "That name is taken", "That reset link is not valid"), else what went wrong in
 * plain words. A 429 never reaches this — it is `RetryCountdown`'s.
 */
export function formErrorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail ?? `${fallback} (${e.status})`;
  return "Could not reach the server — check your connection and try again.";
}

/**
 * The error line of a passkey ceremony that makes one (E3: register, reset): the server's
 * sentence verbatim ("That passkey could not be registered", "That passkey is already
 * registered", "That code is not valid" …), else what the browser refused — an
 * authenticator that already holds this account's passkey says `InvalidStateError` — else
 * the network line. A closed sheet never reaches this: the ceremony answers `null` for it.
 */
export function passkeyFormErrorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail ?? `${fallback} (${e.status})`;
  if (e instanceof Error && e.name !== "TypeError") return "This device could not make a passkey here.";
  return "Could not reach the server — check your connection and try again.";
}
