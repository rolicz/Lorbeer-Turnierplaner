import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { passkeysSupported } from "../../api/passkeys.api";
import { useAuth } from "../../auth/AuthContext";
import { useRefreshMeOnReturn } from "../../hooks/useRefreshMeOnReturn";
import { buttonClass } from "../primitives/Button";
import { NAV_JUMP_STATE } from "./backNavigation";

/** The sentence and the button for what is still missing — the five rows of `DESIGN.md` §7. */
function wording(needsEmail: boolean, needsLogin: boolean, supported: boolean): { text: string; action: string } {
  if (needsEmail && needsLogin) {
    return supported
      ? { text: "Secure your account — add an email address and a passkey.", action: "Secure account" }
      : { text: "Secure your account — add an email address and set a new password.", action: "Secure account" };
  }
  if (needsEmail) return { text: "Secure your account — add an email address.", action: "Add email" };
  return supported
    ? { text: "Secure your account — add a passkey.", action: "Add a passkey" }
    : { text: "Secure your account — set a new password.", action: "Set a password" };
}

/**
 * "Secure your account" (L9, E4) — the `PushSetupNotice` shape: one `warn` line at the top
 * of the page column, on every shell page, never on the auth screens (they render outside
 * `AppShell`) and never on Settings → Account, the page that answers it.
 *
 * **Its condition is written here and in `DESIGN.md` §7's row, nowhere else** (Roli,
 * 2026-09-24): an account is secured when it has **both** a verified email **and** a
 * secure login — a passkey, or a password set on this code (`loginSecure`, the server's
 * word, never re-derived). The email step exists only while the server can send mail
 * (`emailAvailable`), so the strip can always be cleared:
 *
 *     needsEmail = emailAvailable && !emailVerified
 *     needsLogin = !loginSecure
 *     shown      = authed && (needsEmail || needsLogin) && !onAccountTab
 *
 * It says which step is still missing. `passkeysSupported()` chooses the wording ("add a
 * passkey" / "set a new password"), never the visibility. **Not dismissible** — it stops by
 * itself; and because the email is confirmed from a link that opens in Safari, not in the
 * installed app, it asks `/me` again whenever the reader comes back while it is shown.
 *
 * `warn`, not `error` (`DESIGN.md` §2): nothing failed. It is a `card` with a tone, not an
 * `.inset` (§3 — the light theme repaints an inset's background over the tone).
 */
export default function SecureAccountNotice() {
  const { status, emailAvailable, emailVerified, loginSecure } = useAuth();
  const [supported] = useState(() => passkeysSupported());
  const location = useLocation();

  const needsEmail = emailAvailable && !emailVerified;
  const needsLogin = !loginSecure;
  // On the page that answers it the strip would only point at itself.
  const onAccountTab =
    location.pathname === "/settings" && (new URLSearchParams(location.search).get("tab") ?? "account") === "account";
  const shown = status === "authed" && (needsEmail || needsLogin) && !onAccountTab;

  useRefreshMeOnReturn(shown);

  if (!shown) return null;
  const { text, action } = wording(needsEmail, needsLogin, supported);

  return (
    <div
      className="card mb-3 flex flex-wrap items-center gap-2 border-warn/40 bg-warn/10"
      role="status"
      data-secure-account-notice
    >
      <KeyRound size={16} className="text-warn" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm text-text-normal">{text}</span>
      <Link
        to="/settings?tab=account"
        state={NAV_JUMP_STATE}
        className={buttonClass({ size: "sm", className: "ms-auto" })}
      >
        {action}
      </Link>
    </div>
  );
}
