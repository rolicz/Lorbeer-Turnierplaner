import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BookOpen, Hand, Reply } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import { qk } from "../../api/queryKeys";
import {
  listMyNotifications,
  type MyNotification,
  type MyNotificationsResponse,
} from "../../api/notifications.api";
import { fmtDate } from "../../utils/format";
import { useClickOutside } from "../layout/useClickOutside";

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

function kindIcon(kind: MyNotification["kind"]) {
  if (kind === "comment_reply") return <Reply className="h-4 w-4" aria-hidden="true" />;
  if (kind === "guestbook") return <BookOpen className="h-4 w-4" aria-hidden="true" />;
  return <Hand className="h-4 w-4" aria-hidden="true" />;
}

function headline(n: MyNotification): string {
  if (n.kind === "comment_reply") return `${n.author_name} replied to your comment`;
  if (n.kind === "guestbook") return `${n.author_name} wrote on your guestbook`;
  return `${n.author_name} poked you`;
}

/** Personal notification bell (replies to your comments, pokes, guestbook). */
export default function NotificationBell({
  align = "right",
  placement = "bottom",
}: {
  align?: "left" | "right";
  placement?: "top" | "bottom";
}) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(wrapRef, open, () => setOpen(false));

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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `Notifications (${count} unread)` : "Notifications"}
        aria-expanded={open}
        className="icon-button focus-ring relative inline-flex h-9 w-9 items-center justify-center"
        title="Notifications"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-bg-card-outer">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={
            "absolute z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border-card-chip/40 bg-bg-card-outer shadow-pop " +
            (align === "right" ? "right-0 " : "left-0 ") +
            (placement === "top" ? "bottom-full mb-2" : "top-full mt-2")
          }
        >
          <div className="flex items-center justify-between gap-2 border-b border-border-card-chip/40 px-3 py-2">
            <span className="text-sm font-semibold text-text-normal">Notifications</span>
            <span className="text-[11px] text-text-muted">{count > 0 ? `${count} new` : "All caught up"}</span>
          </div>

          <div className="max-h-[min(70vh,26rem)] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-text-muted">
                {q.isLoading ? "Loading…" : "Nothing new right now."}
              </div>
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
                        <span className="block truncate text-sm text-text-normal">{headline(n)}</span>
                        {n.snippet ? (
                          <span className="mt-0.5 block truncate text-xs text-text-muted">{n.snippet}</span>
                        ) : null}
                        <span className="mt-0.5 block text-[11px] text-text-muted">{timeAgo(n.created_at)}</span>
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
