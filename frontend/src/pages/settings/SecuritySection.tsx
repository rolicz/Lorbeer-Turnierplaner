import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Eye, EyeOff, LogOut, UserPlus } from "lucide-react";

import { changePassword, listMySessions, redeemCode, revokeMyOthers, revokeMySession } from "../../api/account.api";
import { ApiError } from "../../api/client";
import { qk } from "../../api/queryKeys";
import type { AuthSession } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import Button from "../../ui/primitives/Button";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { List, ListRow } from "../../ui/primitives/List";
import { Pill } from "../../ui/primitives/Pill";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import { fmtCount, fmtDate, fmtDateTime } from "../../utils/format";
import InviteCodeField from "../auth/InviteCodeField";
import RetryCountdown from "../auth/RetryCountdown";
import SettingsSection from "./SettingsSection";

/** The server's floor (`services/passwords.py::MIN_PASSWORD_LENGTH`); no other rule. */
const MIN_PASSWORD_LENGTH = 10;

/** A form's error line: the server's own sentence, else what went wrong in plain words. */
function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail ?? `${fallback} (${e.status})`;
  return "Could not reach the server — check your connection and try again.";
}

// ---- Devices --------------------------------------------------------------------------

function DevicesSection() {
  const qc = useQueryClient();
  const sessionsQ = useQuery({ queryKey: qk.auth.sessions(), queryFn: listMySessions });
  const [pendingRevoke, setPendingRevoke] = useState<AuthSession | null>(null);
  const [pendingOthers, setPendingOthers] = useState(false);

  const revokeOne = useMutation({
    mutationFn: (id: number) => revokeMySession(id),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.auth.sessions() }),
  });
  const revokeOthers = useMutation({
    mutationFn: revokeMyOthers,
    onSettled: () => qc.invalidateQueries({ queryKey: qk.auth.sessions() }),
  });

  const rows = sessionsQ.data ?? [];
  const others = rows.filter((r) => !r.current);

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    try {
      await revokeOne.mutateAsync(pendingRevoke.id);
    } catch (e) {
      // A 404 is a device that already went away (expired, or signed out elsewhere):
      // the refetch shows the truth, nothing to report.
      if (!(e instanceof ApiError && e.status === 404)) showErrorToast(errorText(e, "Could not sign it out"), "Sign out failed");
    } finally {
      setPendingRevoke(null);
    }
  }

  async function confirmOthers() {
    try {
      await revokeOthers.mutateAsync();
    } catch (e) {
      showErrorToast(errorText(e, "Could not sign them out"), "Sign out failed");
    } finally {
      setPendingOthers(false);
    }
  }

  return (
    <SettingsSection title="Devices">
      {sessionsQ.isLoading ? (
        <InlineLoading label="Loading…" />
      ) : sessionsQ.isError ? (
        <div className="text-xs text-error" role="alert">
          Could not load your devices.
        </div>
      ) : (
        <>
          <List>
            {rows.map((row) => (
              <ListRow
                key={row.id}
                title={row.device_label || "Unknown device"}
                // This device is being used right now, so "last seen" would only say "now" —
                // and at 390px the pill beside it truncated the line (measured).
                subtitle={
                  row.current
                    ? `Since ${fmtDate(row.created_at)}`
                    : `Since ${fmtDate(row.created_at)} · last seen ${fmtDateTime(row.last_seen_at)}`
                }
                trailing={
                  row.current ? (
                    <Pill className="pill-default" title="The device you are using right now">
                      this device
                    </Pill>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      onClick={() => setPendingRevoke(row)}
                      aria-label={`Sign out ${row.device_label || "Unknown device"}`}
                      title="Sign out this device"
                    >
                      <LogOut size={14} aria-hidden="true" />
                    </Button>
                  )
                }
              />
            ))}
          </List>
          {others.length > 0 ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="w-full justify-center gap-2"
                onClick={() => setPendingOthers(true)}
                disabled={revokeOthers.isPending}
              >
                <LogOut size={14} aria-hidden="true" />
                <span>Sign out other devices</span>
              </Button>
            </div>
          ) : null}
        </>
      )}

      {/* Reversible — the device can log in again — so no red block (§7). */}
      <ConfirmDialog
        open={!!pendingRevoke}
        title={`Sign out ${pendingRevoke?.device_label || "Unknown device"}?`}
        subtitle="That device has to log in again with your name and password."
        confirmLabel="Sign out"
        busy={revokeOne.isPending}
        busyLabel="Signing out…"
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => {
          void confirmRevoke();
        }}
      />
      <ConfirmDialog
        open={pendingOthers}
        title="Sign out other devices?"
        subtitle={`${fmtCount(others.length, "device", "devices")} ${others.length === 1 ? "has" : "have"} to log in again with your name and password. This one stays signed in.`}
        confirmLabel="Sign out other devices"
        busy={revokeOthers.isPending}
        busyLabel="Signing out…"
        onCancel={() => setPendingOthers(false)}
        onConfirm={() => {
          void confirmOthers();
        }}
      />
    </SettingsSection>
  );
}

// ---- Password -------------------------------------------------------------------------

/**
 * The password field with its eye toggle, built by hand like the login screen's: a
 * `<button>` inside `Input`'s `<label>` would be invalid HTML.
 */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="input-label block">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="input-field pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={show}
          title={show ? "Hide password" : "Show password"}
        >
          {show ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
        </Button>
      </div>
      {hint}
    </div>
  );
}

function PasswordSection() {
  const { hasPassword, passwordMigrated, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const toggleLabel = hasPassword ? "Change password" : "Set a password";
  const longEnough = next.length >= MIN_PASSWORD_LENGTH;

  function toggle() {
    // The way out is the way in: closing discards what was typed.
    setOpen((v) => !v);
    setCurrent("");
    setNext("");
    setErr(null);
    setDone(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await changePassword(hasPassword ? { current_password: current, new_password: next } : { new_password: next });
      setOpen(false);
      setCurrent("");
      setNext("");
      setDone(true);
      // The same session, a fresh answer: `has_password` / `password_migrated` move.
      // Not `setSession` — that is for a *new* session and clears the whole cache.
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setErr(errorText(e, "Could not change the password"));
    } finally {
      setBusy(false);
    }
  }

  const waiting = retryAfter != null;

  return (
    <SettingsSection title="Password">
      {passwordMigrated && hasPassword ? (
        <div className="mb-2 text-xs text-warn" data-password-migrated>
          This is the password you were given — change it, or add a passkey.
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="md"
        className="w-full justify-center gap-2"
        onClick={toggle}
        aria-expanded={open}
      >
        <span>{toggleLabel}</span>
        {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </Button>
      {done && !open ? (
        <div className="mt-2 text-xs text-text-muted" role="status">
          Password changed. Your other devices stay signed in.
        </div>
      ) : null}
      {open ? (
        <form
          className="mt-3 space-y-3"
          aria-label={toggleLabel}
          onSubmit={(e) => {
            void onSubmit(e);
          }}
        >
          {hasPassword ? (
            <PasswordField
              id="settings-current-password"
              label="Current password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
            />
          ) : null}
          <PasswordField
            id="settings-new-password"
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            hint={
              <div className={`input-hint ${longEnough ? "text-text-normal" : "text-text-muted"}`}>
                At least {MIN_PASSWORD_LENGTH} characters
              </div>
            }
          />
          <Button
            type="submit"
            size="md"
            className="w-full justify-center"
            disabled={busy || waiting || !longEnough || (hasPassword && !current)}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
          {err ? (
            <div className="text-xs text-error" role="alert">
              {err}
            </div>
          ) : null}
          <RetryCountdown seconds={retryAfter} onExpire={() => setRetryAfter(null)} />
        </form>
      ) : null}
      {/* L9: the passkey rows go here, and the muted "Remove password" action appears only
          when `hasPasskey` — `removePassword()` is in `account.api.ts` for it. Until a
          passkey can exist the server answers 409, so nothing is offered. */}
    </SettingsSection>
  );
}

// ---- Groups ---------------------------------------------------------------------------

function GroupsSection() {
  const { groups, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setJoined(null);
    setBusy(true);
    const before = new Set(groups.map((g) => g.id));
    try {
      const me = await redeemCode(code);
      const added = me.groups.find((g) => !before.has(g.id));
      setCode("");
      setJoined(added ? added.name : "the group");
      // Same session, one more membership: ask `/me` again rather than `setSession`,
      // which is for a new session and would clear the query cache under this page.
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setRetryAfter(e.retryAfter ?? 60);
        return;
      }
      setErr(errorText(e, "Could not join"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection title="Groups">
      {groups.length > 0 ? (
        <List>
          {groups.map((g) => (
            <ListRow
              key={g.id}
              title={g.name}
              trailing={
                <Pill className="pill-default" title="Your role in this group">
                  {g.role}
                </Pill>
              }
            />
          ))}
        </List>
      ) : null}
      <form
        className="mt-3 space-y-2"
        aria-label="Join a group"
        onSubmit={(e) => {
          void onSubmit(e);
        }}
      >
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <InviteCodeField value={code} onChange={setCode} disabled={busy} />
          </div>
          <Button
            type="submit"
            variant="ghost"
            size="md"
            className="shrink-0 justify-center gap-2"
            disabled={busy || retryAfter != null || code.length === 0}
          >
            <UserPlus size={14} aria-hidden="true" />
            <span>{busy ? "Joining…" : "Join"}</span>
          </Button>
        </div>
        {err ? (
          <div className="text-xs text-error" role="alert">
            {err}
          </div>
        ) : null}
        {joined ? (
          <div className="text-xs text-text-muted" role="status">
            You joined {joined}.
          </div>
        ) : null}
        <RetryCountdown seconds={retryAfter} onExpire={() => setRetryAfter(null)} />
      </form>
    </SettingsSection>
  );
}

/**
 * Settings → Account (L7): where I am logged in, my password, and the groups I am in —
 * three settings groups under "Account". Everything is the caller's own; the server
 * decides ownership, this page only renders what it answers.
 */
export default function SecuritySection() {
  return (
    <>
      <DevicesSection />
      <PasswordSection />
      <GroupsSection />
    </>
  );
}
