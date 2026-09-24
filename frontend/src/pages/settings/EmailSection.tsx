import { useState } from "react";
import { ChevronDown, ChevronUp, Mail, RefreshCw } from "lucide-react";

import { removeEmail, resendEmail, setEmail } from "../../api/account.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useRefreshMeOnReturn } from "../../hooks/useRefreshMeOnReturn";
import Button from "../../ui/primitives/Button";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import Input from "../../ui/primitives/Input";
import { List, ListRow } from "../../ui/primitives/List";
import { Pill } from "../../ui/primitives/Pill";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import { formErrorText } from "../auth/formError";
import RetryCountdown from "../auth/RetryCountdown";
import SettingsSection from "./SettingsSection";

/**
 * Settings → Account → Email (E4): the address that lets an account back in without the
 * admin. Four states, all read off `MeOut` through `useAuth()` and never re-derived:
 *
 * - the server cannot send mail → one line, and no form (the server would answer 409);
 * - no address → why it is worth having, the field, **Send verification link**;
 * - an address pending → its row with **pending**, "open the link", **Send again** and
 *   **Change**; a verified address, if there is one, stays listed above it — it still works;
 * - verified → its row with **verified**, **Change** and **Remove email**.
 *
 * The link opens in Safari, not in the installed app, so while an address is pending the
 * section asks `/me` again whenever the reader comes back (`useRefreshMeOnReturn`).
 */
export default function EmailSection() {
  const { email, emailPending, emailAvailable, refresh } = useAuth();
  const [changing, setChanging] = useState(false);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useRefreshMeOnReturn(emailAvailable && !!emailPending);

  if (!emailAvailable) {
    return (
      <SettingsSection title="Email">
        <div className="text-xs text-text-muted" data-email-off>
          Email is not set up on this server. If you get locked out, ask the admin for a reset link.
        </div>
      </SettingsSection>
    );
  }

  const hasAny = !!email || !!emailPending;
  const showForm = !hasAny || changing;
  const waiting = retryAfter != null;

  function clearLines() {
    setErr(null);
    setSent(null);
    setRemoved(false);
  }

  function toggleChange() {
    // The way out is the way in: closing discards what was typed.
    setChanging((v) => !v);
    setValue("");
    clearLines();
  }

  /** One request, its three outcomes: the answer, a 429 that counts down, or the error line. */
  async function run<T>(fn: () => Promise<T>, fallback: string): Promise<T | null> {
    clearLines();
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) setRetryAfter(e.retryAfter ?? 60);
      else setErr(formErrorText(e, fallback));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const typed = value.trim();
    const res = await run(() => setEmail(typed), "Could not send the link");
    if (!res) return;
    setValue("");
    setChanging(false);
    setSent(res.email_pending ?? typed);
    // The same session, a fresh answer — never `setSession`, which is for a new one (L7).
    await refresh();
  }

  async function onResend() {
    const res = await run(() => resendEmail(), "Could not send the link");
    if (!res) return;
    setSent(res.email_pending ?? emailPending);
    await refresh();
  }

  async function onRemove() {
    setRemoving(true);
    try {
      await removeEmail();
      clearLines();
      setChanging(false);
      setRemoved(true);
      await refresh();
    } catch (e) {
      showErrorToast(formErrorText(e, "Could not remove the email"), "Remove failed");
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  return (
    <SettingsSection title="Email">
      {hasAny ? (
        <List>
          {email ? (
            <ListRow
              title={email}
              trailing={
                <Pill className="pill-default" title="This address can get you back in">
                  verified
                </Pill>
              }
            />
          ) : null}
          {emailPending ? (
            <ListRow
              title={emailPending}
              trailing={
                <Pill className="pill-default" title="Waiting for the link to be opened">
                  pending
                </Pill>
              }
            />
          ) : null}
        </List>
      ) : (
        <div className="mb-3 text-xs text-text-muted">
          A verified email lets you get back in if you lose your passkey or forget your password.
        </div>
      )}

      {emailPending ? (
        <div className="mt-2 text-xs text-text-muted" data-email-pending>
          Open the link we sent to confirm it — on any device. Check your spam folder too.
        </div>
      ) : null}

      {hasAny ? (
        <div className="mt-3 flex gap-2">
          {emailPending ? (
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="flex-1 justify-center gap-2"
              onClick={() => {
                void onResend();
              }}
              disabled={busy || waiting}
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>Send again</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="flex-1 justify-center gap-2"
            onClick={toggleChange}
            aria-expanded={changing}
          >
            <span>Change</span>
            {changing ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </Button>
        </div>
      ) : null}

      {showForm ? (
        <form
          className={hasAny ? "mt-3 space-y-2" : "space-y-2"}
          aria-label="Set your email"
          onSubmit={(e) => {
            void onSubmit(e);
          }}
        >
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={254}
            disabled={busy}
          />
          <Button
            type="submit"
            size="md"
            className="w-full justify-center gap-2"
            disabled={busy || waiting || value.trim().length === 0}
          >
            <Mail size={14} aria-hidden="true" />
            <span>{busy ? "Sending…" : "Send verification link"}</span>
          </Button>
        </form>
      ) : null}

      {err ? (
        <div className="mt-2 text-xs text-error" role="alert">
          {err}
        </div>
      ) : null}
      {sent ? (
        <div className="mt-2 text-xs text-text-muted" role="status">
          Verification link sent to {sent}.
        </div>
      ) : null}
      {removed && !hasAny ? (
        <div className="mt-2 text-xs text-text-muted" role="status">
          Email removed.
        </div>
      ) : null}
      <div className={waiting ? "mt-2" : undefined}>
        <RetryCountdown seconds={retryAfter} onExpire={() => setRetryAfter(null)} />
      </div>

      {email && !changing ? (
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="mt-2 w-full justify-center text-text-muted"
          onClick={() => setConfirmRemove(true)}
          data-remove-email
        >
          Remove email
        </Button>
      ) : null}

      {/* A stored address is deleted, and with it the way back in by email: the red block (§7). */}
      <ConfirmDialog
        open={confirmRemove}
        title="Remove your email address?"
        confirmLabel="Remove email"
        busy={removing}
        busyLabel="Removing…"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          void onRemove();
        }}
      >
        <div>You will not be able to get back in by email until you verify a new one.</div>
      </ConfirmDialog>
    </SettingsSection>
  );
}
