import { useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

import NotificationBell from "./NotificationBell";
import { useConnectionTrouble, type ConnectionTrouble } from "./useConnectionTrouble";

/**
 * The mobile top bar's right slot — **one** 36px control at a time (Q13).
 *
 * The bar's title is centred on the screen, which only holds while both side
 * boxes reserve the same width. The connection state used to be a chip of text
 * *beside* the bell ("Reconnecting" ≈ 96px, "Offline" ≈ 56px, nothing at all
 * the rest of the time), so the right side had three widths and the title moved
 * with them. Here the marker **replaces** the bell instead of joining it: fixed
 * width by construction, and the stronger signal — the control you would reach
 * for is itself saying the connection is down, rather than a notification count
 * you cannot trust sitting next to a warning that you cannot trust it.
 *
 * Two things this must not do:
 * - **Blink.** `useConnectionTrouble` holds the slot for 1.2 s in both
 *   directions, so a wobbling socket cannot flip the corner of the screen
 *   between two icons.
 * - **Yank the popover away.** If the bell's list is open when the socket
 *   drops, the bell keeps the slot until the reader closes it. Losing the bell
 *   for the duration is acceptable; losing it mid-read is not.
 *
 * The desktop sidebar keeps the labelled chip (`ConnectionIndicator`): it has
 * room for the words and no centred title to protect.
 */
export default function TopBarStatus() {
  const trouble = useConnectionTrouble();
  const [bellOpen, setBellOpen] = useState(false);

  if (trouble && !bellOpen) return <ConnectionMarker trouble={trouble} />;
  return <NotificationBell align="right" placement="bottom" onOpenChange={setBellOpen} />;
}

function ConnectionMarker({ trouble }: { trouble: ConnectionTrouble }) {
  const offline = trouble === "offline";
  const label = offline ? "Offline" : "Reconnecting";
  const Icon = offline ? WifiOff : RefreshCw;

  // The tokens are T10's and A8's, unchanged: `warn` while it is retrying, and
  // `text-muted` for offline — deliberately the quieter of the two, because red
  // in this corner would be a second red dot next to the live one. No badge, no
  // fill, no animation: a marker, not an alarm.
  return (
    <span
      data-connection-status={trouble}
      title={`Realtime: ${label}`}
      className={
        "inline-flex h-9 w-9 items-center justify-center " +
        (offline ? "text-text-muted" : "text-warn")
      }
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="sr-only">{`Realtime status: ${label}`}</span>
    </span>
  );
}
