import { useEffect, useRef, useState } from "react";

import { useRealtimeStatus } from "../RealtimeStatusContext";

/**
 * When — and only when — the chrome admits the realtime socket is in trouble.
 *
 * T10 built this rule into `ConnectionIndicator`: the happy path says nothing
 * (a working connection is the normal state), and a short grace keeps the
 * startup handshake quiet, because every page load passes through
 * `reconnecting` for a moment. Q13 gave the answer a second consumer — the
 * mobile top bar's right slot, where the marker *replaces* the notification
 * bell — so the rule moved here: two surfaces that disagreed about *when* the
 * app is in trouble would be worse than either of them.
 *
 * The slot therefore changes at most every 1.2 s, in both directions: a grace
 * before the marker appears, and a mirror of it before it hands the slot back.
 * Without the second half a socket that wobbles would blink the corner of the
 * screen between two icons; with it, the marker lingers for a beat after
 * recovery, which is the cheaper lie.
 *
 * Returns the trouble to show (`"reconnecting" | "offline"`), or `null` for
 * "say nothing".
 */
export type ConnectionTrouble = "reconnecting" | "offline";

export const TROUBLE_GRACE_MS = 1200;
export const TROUBLE_SETTLE_MS = 1200;

export function useConnectionTrouble(): ConnectionTrouble | null {
  const status = useRealtimeStatus();
  const trouble: ConnectionTrouble | null = status === "live" ? null : status;

  // What the slot committed to at the end of a wait. While it is occupied the
  // *live* trouble is what gets rendered (below), so a change of kind
  // (reconnecting → offline) shows at once; this value only carries the slot
  // through the settle period, when the socket is already back.
  const [slot, setSlot] = useState<ConnectionTrouble | null>(null);

  // When the pending change started. The timer is re-armed with the time it has
  // left rather than restarted, so a state change mid-wait cannot stretch the
  // grace — and the value the timer commits is always the current one.
  const pendingSince = useRef<number | null>(null);

  useEffect(() => {
    const occupied = slot !== null;
    const show = trouble !== null && !occupied;
    const hide = trouble === null && occupied;
    if (!show && !hide) {
      pendingSince.current = null;
      return undefined;
    }
    const now = Date.now();
    if (pendingSince.current === null) pendingSince.current = now;
    const full = show ? TROUBLE_GRACE_MS : TROUBLE_SETTLE_MS;
    const wait = Math.max(0, full - (now - pendingSince.current));
    const t = window.setTimeout(() => setSlot(show ? trouble : null), wait);
    return () => window.clearTimeout(t);
  }, [trouble, slot]);

  return slot === null ? null : (trouble ?? slot);
}
