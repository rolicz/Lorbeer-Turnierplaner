import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, UserCog } from "lucide-react";

import { createResetLink, listAccounts, setMemberRole } from "../../api/admin.api";
import { ApiError } from "../../api/client";
import { qk } from "../../api/queryKeys";
import type { AdminAccount, ResetLink } from "../../api/types";
import { GROUP_SLUG } from "../../app/basename";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import Button from "../../ui/primitives/Button";
import { ChipGroup } from "../../ui/primitives/Chip";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import EmptyState from "../../ui/primitives/EmptyState";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { List, ListRow } from "../../ui/primitives/List";
import Modal from "../../ui/primitives/Modal";
import { Pill } from "../../ui/primitives/Pill";
import { fmtCount, fmtDateTime } from "../../utils/format";
import SessionsSheet from "./SessionsSheet";
import ShownOnce from "./ShownOnce";

type AccountFilter = "all" | "online" | "migrated";

const FILTERS: { key: AccountFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Logged in" },
  { key: "migrated", label: "Migrated password" },
];

const EMPTY: Record<AccountFilter, string> = {
  all: "No accounts.",
  online: "Nobody is logged in.",
  migrated: "Nobody is on a migrated password.",
};

/** Still on the password `secrets.json` gave them, and nothing better to log in with. */
function onMigratedPassword(a: AdminAccount): boolean {
  return a.password_origin === "migrated" && !a.has_passkey;
}

function matches(a: AdminAccount, f: AccountFilter): boolean {
  if (f === "online") return a.session_count > 0;
  if (f === "migrated") return onMigratedPassword(a);
  return true;
}

function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail ?? `${fallback} (${e.status})`;
  return "Could not reach the server — check your connection and try again.";
}

function AccountSubtitle({ a }: { a: AdminAccount }) {
  // The login state leads: it is what the page is for, and at 390px beside two icon
  // buttons the line truncates — the timestamp may lose its tail, the marker may not.
  const parts: React.ReactNode[] = [];
  if (onMigratedPassword(a)) {
    parts.push(
      <span key="migrated" className="text-warn">
        migrated password
      </span>,
    );
  } else if (a.password_origin === "none" && !a.has_passkey) {
    parts.push("no login");
  }
  parts.push(fmtCount(a.session_count, "device", "devices"));
  if (a.last_seen_at) parts.push(`last seen ${fmtDateTime(a.last_seen_at)}`);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? " · " : null}
          {p}
        </span>
      ))}
    </>
  );
}

/**
 * Who has an account, who is logged in and who is still on a migrated password (L6).
 * A site admin also opens an account's devices and mints reset links; an owner sees the
 * list and promotes or demotes members, and nothing that the server would refuse them.
 */
export default function AccountsTab({ siteAdmin }: { siteAdmin: boolean }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [sheetFor, setSheetFor] = useState<AdminAccount | null>(null);
  const [resetFor, setResetFor] = useState<AdminAccount | null>(null);
  const [resetLink, setResetLink] = useState<{ name: string; link: ResetLink } | null>(null);
  const [roleFor, setRoleFor] = useState<AdminAccount | null>(null);

  const accountsQ = useQuery({ queryKey: qk.admin.accounts(), queryFn: listAccounts });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();

  const resetMut = useMutation({ mutationFn: (pid: number) => createResetLink(pid) });
  const roleMut = useMutation({
    mutationFn: ({ pid, role }: { pid: number; role: "owner" | "member" }) => setMemberRole(GROUP_SLUG, pid, role),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.admin.accounts() }),
  });

  const rows = (accountsQ.data ?? []).filter((a) => matches(a, filter));

  async function confirmReset() {
    if (!resetFor) return;
    const who = resetFor;
    try {
      const link = await resetMut.mutateAsync(who.player_id);
      setResetLink({ name: who.display_name, link });
    } catch (e) {
      showErrorToast(errorText(e, "Could not create the reset link"), "Reset link failed");
    } finally {
      setResetFor(null);
    }
  }

  async function confirmRole() {
    if (!roleFor) return;
    const next = roleFor.role === "owner" ? "member" : "owner";
    try {
      await roleMut.mutateAsync({ pid: roleFor.player_id, role: next });
    } catch (e) {
      // The last owner of a group cannot be demoted: the server's sentence says so.
      showErrorToast(errorText(e, "Could not change the role"), "Role not changed");
    } finally {
      setRoleFor(null);
    }
  }

  const promoting = roleFor?.role !== "owner";

  return (
    <div className="space-y-3">
      <div className="section-head">
        <span className="section-label">Accounts</span>
      </div>
      <ChipGroup value={filter} onChange={setFilter} options={FILTERS} ariaLabel="Show" />

      {accountsQ.isLoading ? (
        <InlineLoading label="Loading…" />
      ) : accountsQ.isError ? (
        <div className="text-xs text-error" role="alert">
          Could not load the accounts.
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={EMPTY[filter]} className="py-6" />
      ) : (
        <List>
          {rows.map((a) => {
            // `role` is effective: a site admin reads `admin` whatever their membership, and
            // `none` is not in this group — neither has a membership role to move here.
            const canToggleOwner = a.role === "owner" || a.role === "editor";
            const trailing =
              siteAdmin || canToggleOwner ? (
                <>
                  {canToggleOwner ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      onClick={() => setRoleFor(a)}
                      aria-label={a.role === "owner" ? `Remove ${a.display_name} as owner` : `Make ${a.display_name} owner`}
                      title={a.role === "owner" ? "Remove owner" : "Make owner"}
                    >
                      <UserCog size={14} aria-hidden="true" />
                    </Button>
                  ) : null}
                  {siteAdmin ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      onClick={() => setResetFor(a)}
                      aria-label={`Create a reset link for ${a.display_name}`}
                      title="Create reset link"
                    >
                      <KeyRound size={14} aria-hidden="true" />
                    </Button>
                  ) : null}
                </>
              ) : undefined;
            return (
              <ListRow
                key={a.player_id}
                // Devices are the site admin's alone (the server answers an owner 403), so for
                // an owner the row is information and not a control.
                onClick={siteAdmin ? () => setSheetFor(a) : undefined}
                ariaLabel={siteAdmin ? `Devices of ${a.display_name}` : undefined}
                leading={
                  <AvatarCircle
                    playerId={a.player_id}
                    name={a.display_name}
                    updatedAt={avatarUpdatedAtById.get(a.player_id) ?? null}
                    sizeClass="h-10 w-10"
                  />
                }
                trailing={trailing}
              >
                <span className="flex min-w-0 items-center gap-1.5" data-account-row={a.player_id}>
                  <span className="truncate font-medium text-text-normal">{a.display_name}</span>
                  {a.site_admin ? (
                    <Pill className="pill-default min-w-0">site admin</Pill>
                  ) : a.role === "owner" ? (
                    <Pill className="pill-default min-w-0">owner</Pill>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-text-muted">
                  <AccountSubtitle a={a} />
                </span>
              </ListRow>
            );
          })}
        </List>
      )}

      {siteAdmin ? (
        <SessionsSheet account={sheetFor} onClose={() => setSheetFor(null)} />
      ) : null}

      {/* Not irreversible — the link expires and a newer one replaces it — so no red block. */}
      <ConfirmDialog
        open={!!resetFor}
        title={`Create a reset link for ${resetFor?.display_name ?? ""}?`}
        subtitle="The link works once, for an hour. Using it sets a new password and signs every one of their devices out."
        confirmLabel="Create reset link"
        busy={resetMut.isPending}
        busyLabel="Creating…"
        onCancel={() => setResetFor(null)}
        onConfirm={() => {
          void confirmReset();
        }}
      />

      <Modal
        open={!!resetLink}
        title={`Reset link for ${resetLink?.name ?? ""}`}
        subtitle="Send it to them yourself."
        onClose={() => setResetLink(null)}
        maxWidth="max-w-md"
      >
        {resetLink ? (
          <ShownOnce
            testId="reset-link"
            value={resetLink.link.url}
            valueClassName="break-all text-xs"
            copies={[{ label: "Copy", text: resetLink.link.url }]}
            note="Works once, for an hour."
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!roleFor}
        title={promoting ? `Make ${roleFor?.display_name ?? ""} owner?` : `Remove ${roleFor?.display_name ?? ""} as owner?`}
        subtitle={
          promoting
            ? "An owner can create invite codes and make other members owners."
            : "They stay a member, and can no longer create invite codes or change roles."
        }
        confirmLabel={promoting ? "Make owner" : "Remove owner"}
        busy={roleMut.isPending}
        busyLabel="Saving…"
        onCancel={() => setRoleFor(null)}
        onConfirm={() => {
          void confirmRole();
        }}
      />
    </div>
  );
}
