import { apiFetch } from "./client";
import type { MyNotificationsResponse } from "./types";

/**
 * The personal notification bell. The item types live in `api/types.ts` with every
 * other generated shape — `/me/notifications` has a response model since P1, so
 * nothing here is hand-written any more.
 */
export function listMyNotifications(token: string): Promise<MyNotificationsResponse> {
  return apiFetch("/me/notifications", { method: "GET", token });
}
