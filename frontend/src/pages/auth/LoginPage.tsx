import { ChevronRight, Fingerprint, LogIn } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { login } from "../../api/auth.api";
import { ApiError } from "../../api/client";
import { loginWithPasskey, passkeysSupported } from "../../api/passkeys.api";
import { useAuth } from "../../auth/AuthContext";
import Button from "../../ui/primitives/Button";
import Input from "../../ui/primitives/Input";
import AuthScreen from "./AuthScreen";
import PasswordField from "./PasswordField";
import RetryCountdown from "./RetryCountdown";

/** What the line under the form says for an answer the server gave; a network failure has its own. */
function loginErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return e.detail ?? "Wrong username or password";
    return e.detail ?? `Login failed (${e.status})`;
  }
  return "Could not reach the server — check your connection and try again.";
}

/** The passkey's own line: the server's one 401 sentence, or what the browser refused. */
function passkeyErrorText(e: unknown): string {
  if (e instanceof ApiError) return e.detail ?? `Login failed (${e.status})`;
  if (e instanceof Error && e.name !== "TypeError") return "This device could not use a passkey here.";
  return "Could not reach the server — check your connection and try again.";
}

/**
 * The login screen (L4): display name + password, inside `AuthScreen` and outside the
 * shell. A wrong password is one `text-error` line under the form — never a toast, whose
 * viewport lives in the shell — and a 429 is `RetryCountdown`, which disables the button
 * for exactly the seconds the server named. There is no "read-only viewing" any more:
 * nothing is readable without a login.
 */
export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  // Asked once: a browser does not gain WebAuthn while the page is open. False off a
  // secure context — the phone on the LAN IP over plain http sees no passkey button.
  const [canPasskey] = useState(() => passkeysSupported());
  const [pkBusy, setPkBusy] = useState(false);
  const [pkRetryAfter, setPkRetryAfter] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  // Where RequireAuth bounced us from; ignore anything that isn't an in-app path.
  const fromState = (location.state as { from?: unknown } | null)?.from;
  const from =
    typeof fromState === "string" &&
    fromState.startsWith("/") &&
    !fromState.startsWith("//") &&
    !fromState.startsWith("/login")
      ? fromState
      : "/dashboard";

  // Already in (a bookmark to /login, a back swipe after logging in): nothing to ask.
  if (auth.status === "authed") return <Navigate to={from} replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await login(username.trim(), pw);
      auth.setSession(res);
      nav(from, { replace: true });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 429) {
        setRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setErr(loginErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPasskey() {
    setErr(null);
    setPkBusy(true);
    try {
      const res = await loginWithPasskey();
      // A cancelled sheet is not an error: nothing happened, nothing is said.
      if (!res) return;
      auth.setSession(res);
      nav(from, { replace: true });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 429) {
        setPkRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setErr(passkeyErrorText(e));
    } finally {
      setPkBusy(false);
    }
  }

  const waiting = retryAfter != null;

  return (
    <AuthScreen
      below={
        <>
          <div>
            <Link to="/recover" className="inline-flex items-center gap-1 text-text-muted transition hover:text-text-normal">
              Lost your passkey or password? <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div>
            New here?{" "}
            <Link
              to="/register"
              className="inline-flex items-center gap-1 text-text-muted transition hover:text-text-normal"
            >
              Register with a code <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="space-y-3"
        aria-label="Log in"
      >
        {/* The session ended without the reader asking — the one thing the login screen
            says on its own. `warn`: nothing failed, the reader has to log in again. */}
        {auth.signedOutReason === "expired" ? (
          <div className="text-xs text-warn" role="status">
            Your session has ended — log in again.
          </div>
        ) : null}
        <Input
          label="Name"
          type="text"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Your player name"
        />
        <PasswordField id="login-password" value={pw} onChange={setPw} placeholder="Your password" />
        {/* The page's only action, so it says what it does at every width — the
            compact-mobile idiom (icon below md) would leave it unnamed (A6). */}
        <Button
          type="submit"
          size="md"
          disabled={busy || waiting || !pw || !username.trim()}
          className="w-full justify-center gap-2"
        >
          <LogIn size={14} aria-hidden="true" />
          <span>{busy ? "Logging in…" : "Log in"}</span>
        </Button>
        {err ? (
          <div className="text-xs text-error" role="alert" data-login-error>
            {err}
          </div>
        ) : null}
        <RetryCountdown seconds={retryAfter} onExpire={() => setRetryAfter(null)} />
      </form>
      {/* After the form, not before it: a person with a password is not made to hunt for
          it (L9). Hidden where the browser cannot do WebAuthn at all. */}
      {canPasskey ? (
        <div className="mt-3 space-y-3" data-passkey-login>
          <hr className="divider" />
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="w-full justify-center gap-2"
            disabled={pkBusy || pkRetryAfter != null}
            onClick={() => {
              void onPasskey();
            }}
          >
            <Fingerprint size={14} aria-hidden="true" />
            <span>{pkBusy ? "Waiting for your passkey…" : "Use a passkey"}</span>
          </Button>
          {/* The cross-device case, said once where it applies (E3): a passkey that lives on
              the phone signs in on a computer through the browser's QR code. */}
          <p className="text-xs text-text-muted" data-passkey-hint>
            Passkey on your phone, logging in on a computer? Choose it in the passkey prompt and scan the code with your phone.
          </p>
          <RetryCountdown seconds={pkRetryAfter} onExpire={() => setPkRetryAfter(null)} />
        </div>
      ) : null}
    </AuthScreen>
  );
}
