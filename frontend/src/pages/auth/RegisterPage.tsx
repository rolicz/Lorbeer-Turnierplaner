import { ChevronRight, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { register } from "../../api/registration.api";
import { useAuth } from "../../auth/AuthContext";
import Button from "../../ui/primitives/Button";
import Input from "../../ui/primitives/Input";
import AuthScreen from "./AuthScreen";
import { formErrorText } from "./formError";
import { normalizeInviteCode } from "./inviteCode";
import InviteCodeField from "./InviteCodeField";
import { MIN_PASSWORD_LENGTH } from "./password";
import PasswordField from "./PasswordField";
import RetryCountdown from "./RetryCountdown";

/**
 * Register with an invite code (L5): the code, the display name the app will show, a
 * password — and nothing else (no confirm field: the eye toggle is the confirmation).
 * A `?code=ABCD-EFGH` in the URL prefills the code, so a link pasted into a chat lands
 * ready to fill in (the admin page offers that link beside the bare code, L6).
 *
 * The server's refusals are shown verbatim as one line under the form; a taken name or a
 * short password leaves the code unspent, so the reader just corrects the field and
 * presses again. Success hands the new session to the provider and opens the dashboard.
 */
export default function RegisterPage() {
  const location = useLocation();
  const nav = useNavigate();
  const auth = useAuth();
  const [code, setCode] = useState(() => normalizeInviteCode(new URLSearchParams(location.search).get("code") ?? ""));
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Somebody already logged in has nothing to register; the app (or, for an account in no
  // group yet, the "join" screen) is where a code goes.
  if (auth.status === "authed") return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const me = await register({ code, display_name: name.trim(), password: pw });
      auth.setSession(me);
      nav("/dashboard", { replace: true });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 429) {
        setRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setErr(formErrorText(e, "Could not register"));
    } finally {
      setBusy(false);
    }
  }

  const waiting = retryAfter != null;
  const ready = code.length > 0 && name.trim().length > 0 && pw.length >= MIN_PASSWORD_LENGTH;

  return (
    <AuthScreen
      below={
        <div>
          Already have an account?{" "}
          <Link to="/login" className="inline-flex items-center gap-1 text-text-muted transition hover:text-text-normal">
            Log in <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="space-y-3"
        aria-label="Register"
      >
        <InviteCodeField value={code} onChange={setCode} />
        <Input
          label="Display name"
          type="text"
          name="username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          placeholder="The name the others will see"
        />
        <PasswordField id="register-password" value={pw} onChange={setPw} newPassword />
        {/* The page's only action names itself at every width (A6). */}
        <Button type="submit" size="md" disabled={busy || waiting || !ready} className="w-full justify-center gap-2">
          <UserPlus size={14} aria-hidden="true" />
          <span>{busy ? "Registering…" : "Register"}</span>
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
