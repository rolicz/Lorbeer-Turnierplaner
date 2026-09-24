import { useEffect, useRef } from "react";

import { useAuth } from "../auth/AuthContext";

/** However often `focus` and `visibilitychange` fire together, `/me` is asked once per this. */
const MIN_INTERVAL_MS = 2_000;

/**
 * Ask `GET /me` again when the reader comes back to the app (E4). The verification link
 * opens in Safari, not in the installed PWA, so the PWA learns that an address was
 * confirmed only by asking — without this the strip would keep asking for an email that
 * is already verified. Enabled by the Email section while an address is pending and by
 * the strip while it is shown; nothing else needs it.
 */
export function useRefreshMeOnReturn(enabled: boolean) {
  const { refresh } = useAuth();
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  const lastRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const ask = () => {
      const now = Date.now();
      if (now - lastRef.current < MIN_INTERVAL_MS) return;
      lastRef.current = now;
      void refreshRef.current();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") ask();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", ask);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", ask);
    };
  }, [enabled]);
}
