import { useEffect, useState } from "react";

import { useRealtimeStatus } from "../RealtimeStatusContext";

/**
 * Realtime **trouble** indicator (T10).
 *
 * The happy path says nothing: a working connection is the normal state, and
 * announcing it next to the bell put a third "live" marker on a screen that
 * already has the bottom bar's pulsing dot and the page's own content. This
 * renders only while the socket is reconnecting or offline — the one thing the
 * reader cannot see anywhere else.
 *
 * A short grace period keeps the startup handshake (and any blink between two
 * sockets) quiet: every page load passes through `reconnecting` for a moment.
 */
const TROUBLE_GRACE_MS = 1200;

export default function ConnectionIndicator() {
  const status = useRealtimeStatus();
  const trouble = status !== "live";
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trouble) return;
    const t = window.setTimeout(() => setVisible(true), TROUBLE_GRACE_MS);
    // Recovery (or unmount) clears the pending timer and arms the grace period
    // again, so a second drop is just as quiet as the first.
    return () => {
      window.clearTimeout(t);
      setVisible(false);
    };
  }, [trouble]);

  if (!trouble || !visible) return null;

  const offline = status === "offline";
  const label = offline ? "Offline" : "Reconnecting";

  return (
    <span
      data-connection-status={status}
      className={`inline-flex items-center gap-1.5 text-xs ${offline ? "text-text-muted" : "text-draw"}`}
      title={`Realtime: ${label}`}
      aria-label={`Realtime status: ${label}`}
    >
      <span
        className={`inline-flex h-2 w-2 shrink-0 rounded-full ${offline ? "bg-status-bar-default" : "bg-draw"}`}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
