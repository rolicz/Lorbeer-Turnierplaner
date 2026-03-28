import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "../primitives/Button";
import { usePushNotifications } from "../../push/usePushNotifications";

function statusLabel(opts: {
  supported: boolean;
  token: string | null;
  configured: boolean;
  serverEnabled: boolean;
  permission: NotificationPermission | "unsupported";
  deviceEnabled: boolean;
}): string {
  if (!opts.token) return "Login required";
  if (!opts.supported) return "Unsupported";
  if (!opts.configured) return "Server setup missing";
  if (!opts.serverEnabled) return "Server unavailable";
  if (opts.permission === "denied") return "Blocked";
  if (opts.deviceEnabled) return "Enabled";
  if (opts.permission === "granted") return "Permission granted";
  return "Disabled";
}

export default function PushNotificationsMenu({ token }: { token: string | null }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPosition, setPanelPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const push = usePushNotifications(token);

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (event: MouseEvent) => {
      const menu = menuRef.current;
      const panel = panelRef.current;
      if (!menu) return;
      if (event.target instanceof Node && !menu.contains(event.target) && !panel?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onDocKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (token || !open) return undefined;
    const timer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [open, token]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePanelPosition = () => {
      const trigger = triggerRef.current;
      const viewport = window.visualViewport;
      const gutter = 8;
      const viewportWidth = Math.round(viewport?.width ?? window.innerWidth);
      const viewportHeight = Math.round(viewport?.height ?? window.innerHeight);
      const offsetLeft = Math.round(viewport?.offsetLeft ?? 0);
      const offsetTop = Math.round(viewport?.offsetTop ?? 0);
      const width = Math.max(0, Math.min(352, viewportWidth - gutter * 2));
      const rect = trigger?.getBoundingClientRect();
      const anchorRight = rect ? rect.right + offsetLeft : offsetLeft + viewportWidth - gutter;
      const top = rect ? Math.round(rect.bottom + offsetTop + 4) : offsetTop + gutter;
      const left = Math.max(
        offsetLeft + gutter,
        Math.min(anchorRight - width, offsetLeft + viewportWidth - gutter - width)
      );
      const maxHeight = Math.max(160, viewportHeight - (top - offsetTop) - gutter);
      setPanelPosition((current) =>
        current &&
        current.top === top &&
        current.left === left &&
        current.width === width &&
        current.maxHeight === maxHeight
          ? current
          : { top, left, width, maxHeight }
      );
    };

    const frameId = window.requestAnimationFrame(updatePanelPosition);
    const viewport = window.visualViewport;
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    viewport?.addEventListener("resize", updatePanelPosition);
    viewport?.addEventListener("scroll", updatePanelPosition);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
      viewport?.removeEventListener("resize", updatePanelPosition);
      viewport?.removeEventListener("scroll", updatePanelPosition);
    };
  }, [open]);

  const label = useMemo(
    () =>
      statusLabel({
        supported: push.supported,
        token,
        configured: push.configured,
        serverEnabled: push.serverEnabled,
        permission: push.permission,
        deviceEnabled: push.deviceEnabled,
      }),
    [push.configured, push.deviceEnabled, push.permission, push.serverEnabled, push.supported, token]
  );

  const statusToneClass = push.deviceEnabled
    ? "text-accent"
    : push.permission === "denied"
      ? "text-red-300"
      : "text-text-muted";

  if (!token) return null;

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="fixed z-[70] overflow-y-auto rounded-xl border border-border-card-chip bg-bg-card-inner p-3 shadow-xl overscroll-contain"
          style={
            panelPosition
              ? {
                  top: `${panelPosition.top}px`,
                  left: `${panelPosition.left}px`,
                  width: `${panelPosition.width}px`,
                  maxHeight: `${panelPosition.maxHeight}px`,
                }
              : {
                  top: "3.5rem",
                  left: "0.5rem",
                  right: "0.5rem",
                  maxHeight: "min(70svh, 32rem)",
                }
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-normal">Notifications</div>
              <div className={`text-xs ${statusToneClass}`}>{label}</div>
            </div>
            <button
              type="button"
              title="Refresh notification status"
              className="icon-button inline-flex h-8 w-8 items-center justify-center p-0"
              onClick={() => void push.refresh()}
              disabled={push.loading || push.syncing || push.testing}
            >
              <i className={"fa-solid " + (push.loading || push.syncing ? "fa-spinner fa-spin" : "fa-rotate-right")} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-border-card-chip/70 bg-bg-card-chip/35 p-3 text-xs text-text-muted">
            All players receive comment, guestbook, anpoebeln, tournament, match and score notifications.
          </div>

          <div className="mt-3 space-y-2 text-xs text-text-muted">
            <div>Permission: <span className="text-text-normal">{push.permission}</span></div>
            <div>This account has <span className="text-text-normal">{push.serverSubscriptionCount}</span> active device subscription(s).</div>
            <div>This device is <span className="text-text-normal">{push.deviceEnabled ? "linked" : "not linked"}</span> to your account.</div>
          </div>

          {push.platform === "ios" && !push.standalone ? (
            <div className="mt-3 rounded-xl border border-border-card-chip/70 bg-bg-card-chip/35 p-3 text-xs text-text-muted">
              On iPhone and iPad, install the app to the Home Screen first. Web push only works from the installed PWA.
            </div>
          ) : null}

          {!push.supported ? (
            <div className="mt-3 rounded-xl border border-border-card-chip/70 bg-bg-card-chip/35 p-3 text-xs text-text-muted">
              This browser does not expose the required Service Worker and Push APIs.
            </div>
          ) : null}

          {!push.configured || !push.serverEnabled ? (
            <div className="mt-3 rounded-xl border border-border-card-chip/70 bg-bg-card-chip/35 p-3 text-xs text-text-muted">
              {push.serverReason || "Push notifications are not configured on the server."}
            </div>
          ) : null}

          {push.error ? (
            <div className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-100">
              <div>{push.error}</div>
              <button
                type="button"
                className="mt-2 text-[11px] font-medium text-red-100 underline underline-offset-2"
                onClick={push.clearError}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {push.deviceEnabled ? (
              <Button
                variant="ghost"
                className="inline-flex h-9 items-center justify-center px-3 py-0"
                onClick={() => void push.disable()}
                disabled={push.syncing || push.testing}
              >
                {push.syncing ? "Disabling..." : "Disable"}
              </Button>
            ) : (
              <Button
                className="inline-flex h-9 items-center justify-center px-3 py-0"
                onClick={() => void push.enable()}
                disabled={!push.supported || !push.serverEnabled || push.syncing || push.testing}
              >
                {push.syncing ? "Enabling..." : "Enable"}
              </Button>
            )}
            <Button
              variant="ghost"
              className="inline-flex h-9 items-center justify-center px-3 py-0"
              onClick={() => void push.sendTestNotification()}
              disabled={!push.deviceEnabled || push.syncing || push.testing}
            >
              {push.testing ? "Sending..." : "Send Test"}
            </Button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Notifications"
        title={`Notifications: ${label}`}
        className="btn-base btn-ghost inline-flex h-9 sm:h-10 items-center justify-center gap-2 px-2 sm:px-3"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="relative inline-flex items-center justify-center">
          <i
            className={
              "fa-solid fa-bell text-sm " +
              (push.deviceEnabled ? "text-accent" : push.permission === "denied" ? "text-red-300" : "text-text-normal")
            }
            aria-hidden="true"
          />
          {push.deviceEnabled ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
          ) : null}
        </span>
        <span className={`hidden lg:inline text-xs ${statusToneClass}`}>{label}</span>
        <i
          className={"fa-solid text-[11px] text-text-muted " + (open ? "fa-chevron-up" : "fa-chevron-down")}
          aria-hidden="true"
        />
      </button>
      {panel}
    </div>
  );
}
