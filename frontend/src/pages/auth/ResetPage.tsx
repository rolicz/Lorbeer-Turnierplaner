import { ChevronRight, KeyRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { registerPasskeyWithResetToken } from "../../api/passkeys.api";
import { resetPassword } from "../../api/registration.api";
import { useAuth } from "../../auth/AuthContext";
import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import AuthScreen from "./AuthScreen";
import { formErrorText, passkeyFormErrorText } from "./formError";
import PasskeyOrPassword from "./PasskeyOrPassword";
import { MIN_PASSWORD_LENGTH } from "./password";
import PasswordField from "./PasswordField";
import RetryCountdown from "./RetryCountdown";
import { useLinkToken } from "./useLinkToken";

/**
 * Set a new login from a reset link (L5; passkey first since E3). The link is
 * `{origin}/g/<slug>/reset#<token>` — the admin's, the CLI's and the emailed recovery link
 * all point here — and `useLinkToken` reads the token once and strips it from the address
 * bar before the first frame and before any request.
 *
 * The credential is chosen through `PasskeyOrPassword`: **Create a passkey** (the reset
 * pair) first, **Use a password instead** second. A closed sheet leaves the link live and
 * says nothing. There is no "confirm password" field on purpose: the eye toggle shows what
 * was typed, which is the confirmation a light form needs (`DESIGN.md` §9b).
 */
export default function ResetPage() {
  const nav = useNavigate();
  const auth = useAuth();
  const token = useLinkToken();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pkBusy, setPkBusy] = useState(false);

  const waiting = retryAfter != null;
  const ready = pw.length >= MIN_PASSWORD_LENGTH;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setErr(null);
    setBusy(true);
    try {
      const me = await resetPassword({ token, password: pw });
      auth.setSession(me);
      nav("/dashboard", { replace: true });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 429) {
        setRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setErr(formErrorText(e, "Could not set the password"));
    } finally {
      setBusy(false);
    }
  }

  async function onPasskey() {
    setErr(null);
    setPkBusy(true);
    try {
      const me = await registerPasskeyWithResetToken({ token, label: "" });
      // A closed sheet spends nothing and says nothing: the link is still good.
      if (!me) return;
      auth.setSession(me);
      nav("/dashboard", { replace: true });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 429) {
        setRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setErr(passkeyFormErrorText(e, "Could not create the passkey"));
    } finally {
      setPkBusy(false);
    }
  }

  const below = (
    <div>
      Know your password?{" "}
      <Link to="/login" className="inline-flex items-center gap-1 text-text-muted transition hover:text-text-normal">
        Log in <ChevronRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );

  if (!token) {
    return (
      <AuthScreen below={below}>
        <EmptyState title="This link is not complete — ask for a new one from the login screen or the admin." className="py-4" />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen below={below}>
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="space-y-3"
        aria-label="Set a new login"
      >
        <div>
          <h2 className="text-lg font-semibold">Set a new login</h2>
          <p className="mt-1 text-sm text-text-muted">This link works once. Using it signs out every other device.</p>
        </div>
        <PasskeyOrPassword
          onPasskey={onPasskey}
          passkeyBusy={pkBusy}
          passkeyDisabled={busy || waiting}
          passwordForm={
            <>
              <PasswordField id="reset-password" label="New password" value={pw} onChange={setPw} newPassword />
              <Button type="submit" size="md" disabled={busy || waiting || !ready} className="w-full justify-center gap-2">
                <KeyRound size={14} aria-hidden="true" />
                <span>{busy ? "Saving…" : "Set password"}</span>
              </Button>
            </>
          }
        />
        {err ? (
          <div className="text-xs text-error" role="alert" data-auth-error>
            {err}
          </div>
        ) : null}
        <RetryCountdown seconds={retryAfter} onExpire={() => setRetryAfter(null)} />
      </form>
    </AuthScreen>
  );
}
