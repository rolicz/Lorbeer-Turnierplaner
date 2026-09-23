import { useEffect, useRef, useState } from "react";

/**
 * "Too many attempts — try again in Ns" (L4): the one way a form shows a 429. The
 * limiter slows an attacker down and never locks anyone out, so the line counts the
 * seconds the server named (`ApiError.retryAfter`) and then goes away by itself; the
 * form disables its button for exactly as long. `text-warn`, not `text-error`: nothing
 * failed, the server is asking for patience (`DESIGN.md` §2).
 *
 * `seconds` is the wait as the server named it; `null` renders nothing. `onExpire` is
 * called once, when the count reaches zero, so the form can re-enable its button.
 */
export default function RetryCountdown({ seconds, onExpire }: { seconds: number | null; onExpire?: () => void }) {
  // When *this* wait started, and the clock since — recorded in an effect, so the render
  // that first sees a new `seconds` shows the full count and cannot report it expired
  // before it began (the first cut of this fired `onExpire` on that very render).
  const [clock, setClock] = useState<{ seconds: number | null; at: number; now: number }>({ seconds: null, at: 0, now: 0 });
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    const at = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClock({ seconds, at, now: at });
    if (seconds == null || seconds <= 0) return;
    const tick = window.setInterval(() => setClock((c) => ({ ...c, now: Date.now() })), 250);
    return () => window.clearInterval(tick);
  }, [seconds]);

  const counting = seconds != null && seconds > 0;
  const measured = counting && clock.seconds === seconds;
  const remaining = !counting ? 0 : measured ? Math.max(0, Math.ceil(seconds - (clock.now - clock.at) / 1000)) : seconds;
  const expired = measured && remaining <= 0;

  useEffect(() => {
    if (expired) onExpireRef.current?.();
  }, [expired]);

  if (!counting || remaining <= 0) return null;
  return (
    <div className="text-xs text-warn" role="status" data-retry-countdown>
      Too many attempts — try again in {remaining}s
    </div>
  );
}
