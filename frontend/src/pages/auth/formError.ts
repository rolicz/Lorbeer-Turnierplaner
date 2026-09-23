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
