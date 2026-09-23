import { ChevronRight, KeyRound } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { resetPassword } from "../../api/registration.api";
import { useAuth } from "../../auth/AuthContext";
import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import AuthScreen from "./AuthScreen";
import { formErrorText } from "./formError";
import { MIN_PASSWORD_LENGTH } from "./password";
import PasswordField from "./PasswordField";
import RetryCountdown from "./RetryCountdown";

/** The token a reset link carries: the fragment (`…/reset#<token>`, what the server mints), else `?token=`. */
function tokenFrom(hash: string, search: string): string {
  const fromHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (fromHash) return decodeURIComponent(fromHash);
  return new URLSearchParams(search).get("token") ?? "";
}

/**
 * Set a new password from a reset link (L5). The link is `{origin}/g/<slug>/reset#<token>`:
 * the token sits in the fragment so it never reaches a server log or a `Referer`, and this
 * page reads it **once** and replaces the address with the bare `/reset` in a layout effect
 * — before the first frame and before any request — so it is never kept in history, in the
 * app's remembered location or in a screenshot of the address bar. A reload afterwards
 * finds no token, which is the point: a link is used once.
 *
 * There is no "confirm password" field on purpose: the eye toggle shows what was typed,
 * which is the confirmation a light form needs (`DESIGN.md` §9b), and a second field is
 * one more thing to get wrong on a phone.
 */
export default function ResetPage() {
  const location = useLocation();
  const nav = useNavigate();
  const auth = useAuth();
  const [token] = useState(() => tokenFrom(location.hash, location.search));
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const carriesToken = location.hash.length > 1 || new URLSearchParams(location.search).has("token");
  useLayoutEffect(() => {
    if (!carriesToken) return;
    const rest = new URLSearchParams(location.search);
    rest.delete("token");
    const search = rest.toString();
    nav({ pathname: location.pathname, search: search ? `?${search}` : "", hash: "" }, { replace: true, state: location.state as unknown });
  }, [carriesToken, location.pathname, location.search, location.state, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        <EmptyState title="This link is not complete — ask the admin for a new one." className="py-4" />
      </AuthScreen>
    );
  }

  const waiting = retryAfter != null;

  return (
    <AuthScreen below={below}>
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="space-y-3"
        aria-label="Set password"
      >
        <PasswordField id="reset-password" label="New password" value={pw} onChange={setPw} newPassword />
        <Button
          type="submit"
          size="md"
          disabled={busy || waiting || pw.length < MIN_PASSWORD_LENGTH}
          className="w-full justify-center gap-2"
        >
          <KeyRound size={14} aria-hidden="true" />
          <span>{busy ? "Saving…" : "Set password"}</span>
        </Button>
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
