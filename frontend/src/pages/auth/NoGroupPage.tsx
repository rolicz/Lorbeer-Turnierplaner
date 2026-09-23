import { LogOut, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { redeemCode } from "../../api/registration.api";
import { useAuth } from "../../auth/AuthContext";
import Button from "../../ui/primitives/Button";
import AuthScreen from "./AuthScreen";
import { formErrorText } from "./formError";
import InviteCodeField from "./InviteCodeField";
import RetryCountdown from "./RetryCountdown";

/**
 * "You're not in a group yet" (L5): what `RequireAuth` renders for an account that is
 * logged in and belongs to no group — registered by an admin without an invite, or taken
 * out of its only group. One code field and "Join"; the answer is `MeOut`, handed to
 * `setSession`, and the shell mounts the moment `groups` is no longer empty — no second
 * `GET /me`, no navigation (the reader is already on the URL they asked for).
 *
 * `setSession` rather than L7's `refresh()`: it clears the query cache, which is right
 * here — nothing is mounted under this screen, and nothing cached from an earlier
 * membership may be shown to the new one.
 *
 * "Log out" is always offered: an account with nowhere to go must still be able to leave.
 */
export default function NoGroupPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      auth.setSession(await redeemCode(code));
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 429) {
        setRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setErr(formErrorText(e, "Could not join"));
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setErr(null);
    setLeaving(true);
    try {
      await auth.logout();
      nav("/login", { replace: true });
    } catch {
      setErr("Could not reach the server — you are still logged in.");
    } finally {
      setLeaving(false);
    }
  }

  const waiting = retryAfter != null;

  return (
    <AuthScreen
      below={
        <Button type="button" variant="ghost" size="md" className="gap-2" onClick={() => void onLogout()} disabled={leaving}>
          <LogOut size={14} aria-hidden="true" />
          <span>{leaving ? "Logging out…" : "Log out"}</span>
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="space-y-3"
        aria-label="Join a group"
        data-no-group
      >
        <div>
          <h2 className="text-lg font-semibold">You're not in a group yet.</h2>
          <p className="mt-1 text-sm text-text-muted">Ask a member for an invite code and enter it here.</p>
        </div>
        <InviteCodeField value={code} onChange={setCode} disabled={busy} />
        <Button type="submit" size="md" disabled={busy || waiting || code.length === 0} className="w-full justify-center gap-2">
          <UserPlus size={14} aria-hidden="true" />
          <span>{busy ? "Joining…" : "Join"}</span>
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
