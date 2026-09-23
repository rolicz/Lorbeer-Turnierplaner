import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { passkeysSupported } from "../../api/passkeys.api";
import { useAuth } from "../../auth/AuthContext";
import { buttonClass } from "../primitives/Button";
import { NAV_JUMP_STATE } from "./backNavigation";

/**
 * "Secure your account — add a passkey." (L9) — the `PushSetupNotice` shape: one `warn`
 * line at the top of the page column, on every shell page, never on the auth screens
 * (they render outside `AppShell`).
 *
 * Shown while the account still logs in with the password it was *given* (migrated from
 * the old shared config, `passwordMigrated`) and has no passkey. **Not dismissible** —
 * Roli's decision: it is not a nag about this device but a fact about the account, and it
 * stops by itself the moment a passkey exists (`hasPasskey`, refreshed by Settings after
 * the ceremony). A device that cannot make a passkey at all is not asked to: the strip
 * renders nothing where `browserSupportsWebAuthn()` is false (e.g. plain http off
 * `localhost`), because the one action it offers could only fail there.
 *
 * `warn`, not `error` (`DESIGN.md` §2): nothing failed. It is a `card` with a tone, not an
 * `.inset` (§3 — the light theme repaints an inset's background over the tone).
 */
export default function SecureAccountNotice() {
  const { status, passwordMigrated, hasPasskey } = useAuth();
  const [supported] = useState(() => passkeysSupported());
  const location = useLocation();

  if (status !== "authed" || !passwordMigrated || hasPasskey || !supported) return null;
  // On the page that answers it the strip would only point at itself.
  const onAccountTab =
    location.pathname === "/settings" && (new URLSearchParams(location.search).get("tab") ?? "account") === "account";
  if (onAccountTab) return null;

  return (
    <div
      className="card mb-3 flex flex-wrap items-center gap-2 border-warn/40 bg-warn/10"
      role="status"
      data-secure-account-notice
    >
      <KeyRound size={16} className="text-warn" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm text-text-normal">Secure your account — add a passkey.</span>
      <Link
        to="/settings?tab=account"
        state={NAV_JUMP_STATE}
        className={buttonClass({ size: "sm", className: "ms-auto" })}
      >
        Add a passkey
      </Link>
    </div>
  );
}
