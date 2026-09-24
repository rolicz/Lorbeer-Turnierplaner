import { ChevronRight, MailCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../../api/client";
import { verifyEmail } from "../../api/registration.api";
import { useAuth } from "../../auth/AuthContext";
import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import AuthScreen from "./AuthScreen";
import { formErrorText } from "./formError";
import RetryCountdown from "./RetryCountdown";
import { useLinkToken } from "./useLinkToken";

const LINK_CLASS = "inline-flex items-center gap-1 text-text-muted transition hover:text-text-normal";

/**
 * Confirm an email address from its link (E3, `/verify-email#<token>`). The token is read
 * and stripped by `useLinkToken`, exactly as `/reset` does it.
 *
 * **Confirming is a tap, never an automatic POST on load**: mail providers and corporate
 * scanners open the links in a message, and some run the page's JavaScript — a page that
 * verified on load would spend the link before the person ever saw it (and would confirm an
 * address for whoever's scanner fetched it). So the page shows **Confirm** and waits.
 *
 * Public: the link may be opened on a device that is not logged in. Success says so and,
 * when this device *is* logged in, offers the way back to Settings → Account.
 */
export default function VerifyEmailPage() {
  const auth = useAuth();
  const token = useLinkToken();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  async function onConfirm() {
    setErr(null);
    setBusy(true);
    try {
      await verifyEmail(token);
      setDone(true);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 429) {
        setRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setErr(formErrorText(e, "Could not confirm the address"));
    } finally {
      setBusy(false);
    }
  }

  const below =
    auth.status === "authed" ? null : (
      <div>
        <Link to="/login" className={LINK_CLASS}>
          Log in <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
    );

  if (!token && !done) {
    return (
      <AuthScreen below={below}>
        <EmptyState
          title="This link is not complete — ask for a new one in Settings → Account."
          className="py-4"
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen below={below}>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Confirm your email</h2>
        {done ? (
          <>
            <p className="text-sm text-text-muted" role="status" data-email-verified>
              Verified. You can close this and go back to the app.
            </p>
            {auth.status === "authed" ? (
              <Link to="/settings?tab=account" className={LINK_CLASS}>
                Back to Settings <ChevronRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
          </>
        ) : (
          <>
            <Button
              type="button"
              size="md"
              className="w-full justify-center gap-2"
              disabled={busy || retryAfter != null}
              onClick={() => {
                void onConfirm();
              }}
            >
              <MailCheck size={14} aria-hidden="true" />
              <span>{busy ? "Confirming…" : "Confirm"}</span>
            </Button>
            {err ? (
              <div className="text-xs text-error" role="alert" data-auth-error>
                {err}
              </div>
            ) : null}
            <RetryCountdown seconds={retryAfter} onExpire={() => setRetryAfter(null)} />
          </>
        )}
      </div>
    </AuthScreen>
  );
}
