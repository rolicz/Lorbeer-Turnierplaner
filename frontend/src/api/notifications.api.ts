import { apiFetch } from "./client";

export type NotificationKind = "comment_reply" | "guestbook" | "poke";

export type MyNotification = {
  kind: NotificationKind;
  id: number;
  tournament_id?: number | null;
  match_id?: number | null;
  profile_player_id?: number | null;
  author_player_id?: number | null;
  author_name: string;
  snippet: string;
  created_at: string;
  /** Client route to open the item (e.g. /live/12?comment=34). */
  path: string;
};

export type MyNotificationsResponse = {
  items: MyNotification[];
  unread_count: number;
};

export function listMyNotifications(token: string): Promise<MyNotificationsResponse> {
  return apiFetch("/me/notifications", { method: "GET", token });
}
