import React from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";

import NoGroupPage from "../pages/auth/NoGroupPage";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import { useAuth } from "./AuthContext";

/**
 * The gate in front of the shell (L4). Three answers, one per `AuthStatus`:
 *
 * - `anonymous` → the login screen, remembering where the reader wanted to go.
 * - `unknown`   → a loading screen that says whether the server can be reached. Never
 *   the login screen: the server has not rejected anything, we simply could not ask —
 *   and `AuthProvider` keeps asking (on `online`, on becoming visible, on a slow clock).
 * - `authed` with no membership → "not in a group yet" (`NoGroupPage`: a code and a way out).
 * - `authed` with a membership → the shell.
 *
 * The shell — its global websocket, its prefetches, its bell — therefore mounts only
 * for a member, which is what makes "logged out → no data request at all" true by
 * construction rather than by every query remembering to check.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, groups, serverUnreachable } = useAuth();
  const location = useLocation();

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (status === "unknown") return <BootScreen unreachable={serverUnreachable} />;
  if (groups.length === 0) return <NoGroupPage />;
  return <>{children}</>;
}

/**
 * The shell is not mounted, so neither is the realtime layer that draws the connection
 * marker; this screen says the same two things in the same two idioms (`TopBarStatus`:
 * `WifiOff` muted for offline, `RefreshCw` in `warn` while retrying).
 */
function BootScreen({ unreachable }: { unreachable: boolean }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const trouble = offline ? "offline" : unreachable ? "reconnecting" : null;
  return (
    <div className="grid min-h-screen place-items-center bg-bg-default px-4 pt-safe-t pb-safe-b" data-auth-boot>
      <div className="flex flex-col items-center gap-2">
        <PageLoadingScreen className="min-h-0" sectionCount={2} />
        {trouble ? (
          <span
            data-connection-status={trouble}
            className={`inline-flex items-center gap-1.5 text-xs ${offline ? "text-text-muted" : "text-warn"}`}
            role="status"
          >
            {offline ? <WifiOff size={14} aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
            <span>{offline ? "Offline" : "Cannot reach the server — retrying"}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

