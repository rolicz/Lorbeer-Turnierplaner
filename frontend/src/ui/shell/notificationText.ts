/**
 * The bell's copy for all seven notification kinds (P3), moved out of
 * `NotificationBell.tsx` so the popover is left with rendering. Two questions per
 * item: the one-line headline, and the detail line under it.
 */
import type { MyNotification } from "../../api/types";
import { IDEA_STATUS_LABEL } from "../../pages/ideas/ideaMeta";

function ideaStatusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return (IDEA_STATUS_LABEL as Record<string, string>)[status] ?? status;
}

/** "comment_reply" | "guestbook" | "poke" | "idea_created" | "idea_comment" |
 * "idea_vote" | "idea_status" — the seven kinds `/me/notifications` builds. */
export function notificationHeadline(n: MyNotification): string {
  switch (n.kind) {
    case "comment_reply":
      return `${n.author_name} replied to your comment`;
    case "guestbook":
      return `${n.author_name} wrote on your guestbook`;
    case "poke":
      return `${n.author_name} poked you`;
    case "idea_created":
      return `${n.author_name} shared an idea`;
    case "idea_comment":
      return `${n.author_name} commented on your idea`;
    case "idea_vote":
      // Roli's own word for it, not the board's "wants" ("I want this too").
      return `${n.author_name} likes your idea`;
    case "idea_status":
      return `${n.author_name} set your idea to ${ideaStatusLabel(n.idea_status)}`;
    default:
      return n.author_name;
  }
}

/** For the three old kinds, the snippet as today. For an idea kind, the idea's
 * title alone, or `title · snippet` once there is a snippet (the app's ` · `
 * separator) — a comment or a status note, never for `idea_created`/`idea_vote`. */
export function notificationDetail(n: MyNotification): string {
  if (n.kind === "idea_created" || n.kind === "idea_comment" || n.kind === "idea_vote" || n.kind === "idea_status") {
    const title = n.idea_title ?? "";
    return n.snippet ? `${title} · ${n.snippet}` : title;
  }
  return n.snippet;
}
