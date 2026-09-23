import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, KeyRound, LogOut, Trash2, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  changePassword,
  listMySessions,
  redeemCode,
  removePassword,
  revokeMyOthers,
  revokeMySession,
} from "../../api/account.api";
import { ApiError } from "../../api/client";
import { listPasskeys, passkeysSupported, registerPasskey, removePasskey } from "../../api/passkeys.api";
import { qk } from "../../api/queryKeys";
import type { AuthSession, Passkey } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import Button from "../../ui/primitives/Button";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import InlineLoading from "../../ui/primitives/InlineLoading";
import Input from "../../ui/primitives/Input";
import { List, ListRow } from "../../ui/primitives/List";
import { Pill } from "../../ui/primitives/Pill";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import { fmtCount, fmtDate, fmtDateTime } from "../../utils/format";
import InviteCodeField from "../auth/InviteCodeField";
import { MIN_PASSWORD_LENGTH } from "../auth/password";
import PasswordField from "../auth/PasswordField";
import RetryCountdown from "../auth/RetryCountdown";
import SettingsSection from "./SettingsSection";

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

// ---- Passkeys (L9) ---------------------------------------------------------------------

/** The server's own sentence for the last way in — shown before the tap, not after it. */
const LAST_WAY_IN = "Set a password before removing your last passkey — an account needs one way in";

/** What went wrong while adding a passkey, in words; a cancelled sheet never gets here. */
function addPasskeyErrorText(e: unknown): string {
  if (e instanceof ApiError) return e.detail ?? `Could not add the passkey (${e.status})`;
  // `excludeCredentials` at work: this authenticator already holds one of mine.
  if (e instanceof Error && e.name === "InvalidStateError") return "This device already has a passkey for your account.";
  if (e instanceof Error && e.name !== "TypeError") return "This device could not make a passkey.";
  return "Could not reach the server — check your connection and try again.";
}

function PasskeysSection() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { hasPassword, refresh, logout } = useAuth();
  const [supported] = useState(() => passkeysSupported());
  const passkeysQ = useQuery({ queryKey: qk.auth.passkeys(), queryFn: listPasskeys });
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Passkey | null>(null);
  const [removing, setRemoving] = useState(false);

  const rows = passkeysQ.data ?? [];
  // The server refuses this (409); saying so on the button first is kinder than a refusal.
  const lastWayIn = !hasPassword && rows.length === 1;

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddErr(null);
    setAdded(false);
    setAdding(true);
    try {
      const pk = await registerPasskey(label);
      if (!pk) return; // the sheet was closed: nothing happened, nothing to say
      setLabel("");
      setAdded(true);
      await qc.invalidateQueries({ queryKey: qk.auth.passkeys() });
      // `has_passkey` moves — and with it the app-wide strip. Same session: `refresh`.
      await refresh();
    } catch (err) {
      setAddErr(addPasskeyErrorText(err));
    } finally {
      setAdding(false);
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoving(true);
    try {
      await removePasskey(pendingRemove.id);
    } catch (err) {
      setRemoving(false);
      setPendingRemove(null);
      if (err instanceof ApiError && err.status === 404) {
        void qc.invalidateQueries({ queryKey: qk.auth.passkeys() });
        return;
      }
      showErrorToast(errorText(err, "Could not remove the passkey"), "Remove failed");
      return;
    }
    // Removing a passkey ended every session of this account, this one included — the
    // answer already cleared the cookie. `logout` settles the app's own state (its request
    // meets a dead session, which it treats as done), then the login screen.
    try {
      await logout();
    } catch {
      // Unreachable server after a delete that arrived: the next request meets the 401.
    }
    nav("/login", { replace: true });
  }

  return (
    <SettingsSection title="Passkeys">
      {passkeysQ.isLoading ? (
        <InlineLoading label="Loading…" />
      ) : passkeysQ.isError ? (
        <div className="text-xs text-error" role="alert">
          Could not load your passkeys.
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-text-muted">No passkeys yet.</div>
      ) : (
        <List>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              title={row.label || "Passkey"}
              subtitle={
                row.last_used_at
                  ? `Added ${fmtDate(row.created_at)} · last used ${fmtDateTime(row.last_used_at)}`
                  : `Added ${fmtDate(row.created_at)} · not used yet`
              }
              trailing={
                <span className="inline-flex items-center gap-1.5">
                  {row.backed_up ? (
                    <Pill className="pill-default" title="Synced to your other devices by your password manager">
                      synced
                    </Pill>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    iconOnly
                    disabled={lastWayIn}
                    onClick={() => setPendingRemove(row)}
                    aria-label={`Remove ${row.label || "passkey"}`}
                    title={lastWayIn ? LAST_WAY_IN : "Remove this passkey"}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                </span>
              }
            />
          ))}
        </List>
      )}
      {lastWayIn ? (
        <div className="mt-2 text-xs text-text-muted" data-passkey-last>
          {LAST_WAY_IN}.
        </div>
      ) : null}

      {supported ? (
        <form
          className="mt-3 space-y-2"
          aria-label="Add a passkey"
          onSubmit={(e) => {
            void onAdd(e);
          }}
        >
          <Input
            label="Name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Named after this device if left empty"
            maxLength={60}
            disabled={adding}
          />
          <Button type="submit" size="md" className="w-full justify-center gap-2" disabled={adding}>
            <KeyRound size={14} aria-hidden="true" />
            <span>{adding ? "Waiting for your passkey…" : "Add a passkey"}</span>
          </Button>
          {addErr ? (
            <div className="text-xs text-error" role="alert">
              {addErr}
            </div>
          ) : null}
          {added ? (
            <div className="text-xs text-text-muted" role="status">
              Passkey added. Next time, log in with it — no name, no password.
            </div>
          ) : null}
        </form>
      ) : (
        <div className="mt-3 text-xs text-text-muted" data-passkey-unsupported>
          This browser cannot make passkeys.
        </div>
      )}

      {/* A stored credential is deleted, and every session with it: the red block (§7). */}
      <ConfirmDialog
        open={!!pendingRemove}
        title={`Remove ${pendingRemove?.label || "this passkey"}?`}
        subtitle="Every device will be signed out, including this one."
        confirmLabel="Remove passkey"
        busy={removing}
        busyLabel="Removing…"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          void confirmRemove();
        }}
      >
        <div>This passkey stops working for your account.</div>
        <div>You will have to log in again here and on every other device.</div>
      </ConfirmDialog>
    </SettingsSection>
  );
}

// ---- Password -------------------------------------------------------------------------

function PasswordSection() {
  const { hasPassword, hasPasskey, passwordMigrated, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);

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

  async function onRemovePassword() {
    setRemoving(true);
    try {
      await removePassword();
      setRemoved(true);
      setDone(false);
      await refresh();
    } catch (e) {
      showErrorToast(errorText(e, "Could not remove the password"), "Remove failed");
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  const waiting = retryAfter != null;

  return (
    <SettingsSection title="Password">
      {/* Its advice is done once a passkey exists — the app-wide strip stops then too. */}
      {passwordMigrated && hasPassword && !hasPasskey ? (
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
            <PasswordField id="settings-current-password" label="Current password" value={current} onChange={setCurrent} />
          ) : null}
          <PasswordField id="settings-new-password" label="New password" value={next} onChange={setNext} newPassword />
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
      {removed && !hasPassword && !open ? (
        <div className="mt-2 text-xs text-text-muted" role="status">
          Password removed. You log in with your passkey now.
        </div>
      ) : null}
      {/* Only with a passkey: the server refuses it otherwise (one way in, always). */}
      {hasPassword && hasPasskey && !open ? (
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="mt-2 w-full justify-center text-text-muted"
          onClick={() => setConfirmRemove(true)}
          data-remove-password
        >
          Remove password
        </Button>
      ) : null}
      {/* Reversible by its own inverse — "Set a password" is right here — so no red block. */}
      <ConfirmDialog
        open={confirmRemove}
        title="Remove your password?"
        subtitle="You will log in with a passkey only. You can set a password again here."
        confirmLabel="Remove password"
        busy={removing}
        busyLabel="Removing…"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          void onRemovePassword();
        }}
      />
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
 * Settings → Account (L7, L9): where I am logged in, my passkeys, my password, and the
 * groups I am in — four settings groups under "Account". Everything is the caller's own; the server
 * decides ownership, this page only renders what it answers.
 */
export default function SecuritySection() {
  return (
    <>
      <DevicesSection />
      <PasskeysSection />
      <PasswordSection />
      <GroupsSection />
    </>
  );
}
