import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BookOpen, Hand, Lightbulb, ListChecks, MessageSquare, Reply, ThumbsUp } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import { qk } from "../../api/queryKeys";
import { listMyNotifications } from "../../api/notifications.api";
import { usePushNotifications } from "../../push/usePushNotifications";
import { PUSH_BLOCKED_HINT, PUSH_BLOCKED_TITLE } from "../../push/pushSetup";
import type { MyNotification, MyNotificationsResponse } from "../../api/types";
import { fmtDate } from "../../utils/format";
import { useClickOutside } from "../layout/useClickOutside";
import Button from "../primitives/Button";
import EmptyState from "../primitives/EmptyState";
import InlineLoading from "../primitives/InlineLoading";
import { notificationDetail, notificationHeadline } from "./notificationText";

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

/** One icon per kind: "comment_reply" | "guestbook" | "poke" | "idea_created" |
 * "idea_comment" | "idea_vote" | "idea_status" — the seven `/me/notifications` builds. */
function kindIcon(kind: MyNotification["kind"]) {
  if (kind === "comment_reply") return <Reply className="h-4 w-4" aria-hidden="true" />;
  if (kind === "guestbook") return <BookOpen className="h-4 w-4" aria-hidden="true" />;
  if (kind === "poke") return <Hand className="h-4 w-4" aria-hidden="true" />;
  if (kind === "idea_created") return <Lightbulb className="h-4 w-4" aria-hidden="true" />;
  if (kind === "idea_comment") return <MessageSquare className="h-4 w-4" aria-hidden="true" />;
  if (kind === "idea_vote") return <ThumbsUp className="h-4 w-4" aria-hidden="true" />;
  return <ListChecks className="h-4 w-4" aria-hidden="true" />; // idea_status
}

/**
 * Personal notification bell (replies to your comments, pokes, guestbook) — and the one
 * place the app says that **this device is blocked from receiving push** (Q-E).
 *
 * Roli's ask, after push finally worked on his phone: "if someone denies notifications,
 * indicate that still in the bell on top right." P5 deliberately said nothing to a denied
 * device; he overruled that on 2026-09-23. The constraint that shapes it: the browser will
 * never prompt again, so there is nothing to offer — only something to say, and somewhere
 * to point.
 *
 * It is a **glyph swap, not a second control**: `Bell` becomes `BellOff` in `warn` inside
 * the same 36px button. The mobile top bar's right box holds one control and its width is
 * what keeps the title centred on the screen (Q13), so nothing may be added beside the
 * bell — and a mark that changed the button's size would move the title on every page.
 * It is also not confusable with the unread count, which is an accent pill in the opposite
 * corner: `BellOff` + "3" reads exactly right, because the bell's own items come from the
 * server and keep arriving whether or not this device may be pushed to.
 *
 * Not dismissible, and deliberately not a banner. `PushSetupNotice` nags once per install
 * about the device that *can* still be fixed from here; this one cannot, so it costs no
 * space, interrupts nothing, and stays for exactly as long as the state does.
 */
export default function NotificationBell({
  align = "right",
  placement = "bottom",
  onOpenChange,
}: {
  align?: "left" | "right";
  placement?: "top" | "bottom";
  /**
   * Told whenever the popover opens or closes (and told `false` on unmount).
   * The mobile top bar shares one 40px slot between this bell and the
   * connection marker, and will not take the slot away from an open list (Q13).
   */
  onOpenChange?: (open: boolean) => void;
}) {
  const { token } = useAuth();
  const navigate = useNavigate();
  // The app's one answer to "does this device receive push" (P5's module, Q-E's state).
  // Never a second boolean computed here: `permission === "denied"` alone would nag the
  // reader who turned push off in Settings, and would speak before the server's config
  // has said whether push exists at all.
  const blocked = usePushNotifications(token).setupState === "blocked";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(wrapRef, open, () => setOpen(false));
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  const q = useQuery({
    queryKey: qk.notifications(token),
    queryFn: () => listMyNotifications(token as string),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  if (!token) return null;

  const items = q.data?.items ?? [];
  const count = q.data?.unread_count ?? 0;

  function openItem(n: MyNotification) {
    // Optimistically drop it so the badge updates immediately; the destination
    // marks the underlying item read, and a refetch confirms.
    qc.setQueryData<MyNotificationsResponse>(qk.notifications(token), (prev) =>
      prev
        ? {
            items: prev.items.filter((x) => !(x.kind === n.kind && x.id === n.id)),
            unread_count: Math.max(0, prev.unread_count - 1),
          }
        : prev,
    );
    setOpen(false);
    navigate(n.path);
  }

  return (
    <div ref={wrapRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          (count > 0 ? `Notifications (${count} unread)` : "Notifications") + (blocked ? ` — ${PUSH_BLOCKED_TITLE}` : "")
        }
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center p-0"
        title={blocked ? PUSH_BLOCKED_TITLE : "Notifications"}
        data-push-blocked={blocked ? "1" : undefined}
      >
        {blocked ? (
          <BellOff className="h-5 w-5 text-warn" aria-hidden="true" />
        ) : (
          <Bell className="h-5 w-5" aria-hidden="true" />
        )}
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-accent px-1 text-micro leading-4 text-white ring-2 ring-bg-card-outer">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          className={
            // A floating panel is a `card` with `shadow-pop` (DESIGN.md §3/§4), like the
            // stats filter popover — the rows bring their own padding, so `p-0`.
            "card absolute z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden p-0 shadow-pop backdrop-blur-md " +
            (align === "right" ? "right-0 " : "left-0 ") +
            (placement === "top" ? "bottom-full mb-2" : "top-full mt-2")
          }
        >
          <div className="flex items-center justify-between gap-2 border-b border-border-card-chip/40 px-3 py-2">
            <span className="text-sm font-semibold text-text-normal">Notifications</span>
            <span className="text-xs text-text-muted">{count > 0 ? `${count} new` : "All caught up"}</span>
          </div>

          {/* Where to go, since there is nowhere in the app to go. `warn`, not `error`:
              nothing failed and nothing is about to be destroyed (DESIGN.md §2) — the
              reader chose this, and everything in the list below still works. */}
          {blocked ? (
            <div className="flex items-start gap-2 border-b border-border-card-chip/40 bg-warn/10 px-3 py-2">
              <BellOff size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
              <span className="min-w-0 text-xs">
                <span className="block text-text-normal">{PUSH_BLOCKED_TITLE}</span>
                <span className="mt-0.5 block text-text-muted">{PUSH_BLOCKED_HINT}</span>
              </span>
            </div>
          ) : null}

          <div className="max-h-[min(70vh,26rem)] overflow-y-auto">
            {items.length === 0 ? (
              q.isLoading ? (
                <div className="px-3 py-6 text-center"><InlineLoading /></div>
              ) : (
                <EmptyState title="Nothing new right now." className="px-3 py-6" />
              )
            ) : (
              <ul className="divide-y divide-border-card-chip/30">
                {items.map((n) => (
                  <li key={`${n.kind}-${n.id}`}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-hover-default/40 focus-ring"
                    >
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-card-chip/50 text-accent">
                        {kindIcon(n.kind)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-text-normal">{notificationHeadline(n)}</span>
                        {notificationDetail(n) ? (
                          <span className="mt-0.5 block truncate text-xs text-text-muted">
                            {notificationDetail(n)}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block text-xs text-text-muted">{timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
