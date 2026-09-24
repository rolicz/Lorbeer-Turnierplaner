import { ChevronRight, Mail } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../../api/client";
import { requestRecovery } from "../../api/registration.api";
import Button from "../../ui/primitives/Button";
import Input from "../../ui/primitives/Input";
import AuthScreen from "./AuthScreen";
import RetryCountdown from "./RetryCountdown";

/** The one sentence after a request — the same whatever the address, and whatever the server said. */
const RECOVERY_SENT_TEXT = "If that address is verified, a link is on its way. Check your spam folder too.";

/**
 * "Lost my passkey / forgot my password" (E3, `/recover`): an email address in, a one-hour
 * reset link out — to the address only if it is a verified one on an account. The server
 * answers `{ok: true}` whatever the address, and this page matches it: after a submit the
 * form is replaced by one sentence **whatever came back** — a 200, a 400, a 500, no network —
 * so nothing on screen can tell anyone whether an account exists. A 429 is the one answer
 * that keeps the form, as `RetryCountdown`, because it tells nobody anything about the
 * address and the person may want to correct a typo afterwards.
 *
 * The link lands on `/reset`, the same page the admin's link opens.
 */
export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await requestRecovery(email.trim());
      setSent(true);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 429) {
        setRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  const waiting = retryAfter != null;

  return (
    <AuthScreen
      below={
        <>
          <div>
            Know your password?{" "}
            <Link to="/login" className="inline-flex items-center gap-1 text-text-muted transition hover:text-text-normal">
              Log in <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="text-xs">No verified email on your account? Ask the admin for a reset link.</div>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Get back in</h2>
          {sent ? null : <p className="mt-1 text-sm text-text-muted">Enter the email address on your account.</p>}
        </div>
        {sent ? (
          <p className="text-sm text-text-muted" role="status" data-recovery-sent>
            {RECOVERY_SENT_TEXT}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              void onSubmit(e);
            }}
            className="space-y-3"
            aria-label="Get back in"
          >
            <Input
              label="Email"
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" size="md" disabled={busy || waiting || !email.trim()} className="w-full justify-center gap-2">
              <Mail size={14} aria-hidden="true" />
              <span>{busy ? "Sending…" : "Send me a link"}</span>
            </Button>
            <RetryCountdown seconds={retryAfter} onExpire={() => setRetryAfter(null)} />
          </form>
        )}
      </div>
    </AuthScreen>
  );
}
