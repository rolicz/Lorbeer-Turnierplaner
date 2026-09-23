import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { listAccountSessions, revokeAllSessions, revokeSession } from "../../api/admin.api";
import { ApiError } from "../../api/client";
import { qk } from "../../api/queryKeys";
import type { AdminAccount, AuthSession } from "../../api/types";
import Button from "../../ui/primitives/Button";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import EmptyState from "../../ui/primitives/EmptyState";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { List, ListRow } from "../../ui/primitives/List";
import Modal from "../../ui/primitives/Modal";
import { Pill } from "../../ui/primitives/Pill";
import { fmtCount, fmtDate, fmtDateTime } from "../../utils/format";

function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail ?? `${fallback} (${e.status})`;
  return "Could not reach the server — check your connection and try again.";
}

const labelOf = (s: AuthSession) => s.device_label || "Unknown device";

/**
 * One account's logged-in devices (L6, site admin only). The admin's own current session
 * is marked "this device" and has no sign-out here — that is Settings → Account's job.
 */
export default function SessionsSheet({ account, onClose }: { account: AdminAccount | null; onClose: () => void }) {
  const qc = useQueryClient();
  const pid = account?.player_id ?? 0;
  const sessionsQ = useQuery({
    queryKey: qk.admin.sessions(pid),
    queryFn: () => listAccountSessions(pid),
    enabled: !!account,
  });
  const [pendingOne, setPendingOne] = useState<AuthSession | null>(null);
  const [pendingAll, setPendingAll] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.admin.all() });
  const revokeOne = useMutation({ mutationFn: (sid: number) => revokeSession(sid), onSettled: invalidate });
  const revokeAll = useMutation({ mutationFn: () => revokeAllSessions(pid), onSettled: invalidate });

  const rows = sessionsQ.data ?? [];
  const includesMine = rows.some((r) => r.current);

  async function confirmOne() {
    if (!pendingOne) return;
    try {
      await revokeOne.mutateAsync(pendingOne.id);
    } catch (e) {
      // 404: the device already went away; the refetch shows the truth.
      if (!(e instanceof ApiError && e.status === 404)) showErrorToast(errorText(e, "Could not sign it out"), "Sign out failed");
    } finally {
      setPendingOne(null);
    }
  }

  async function confirmAll() {
    try {
      await revokeAll.mutateAsync();
    } catch (e) {
      showErrorToast(errorText(e, "Could not sign them out"), "Sign out failed");
    } finally {
      setPendingAll(false);
    }
  }

  return (
    <>
      <Modal open={!!account} title={account?.display_name ?? ""} subtitle="Logged-in devices" onClose={onClose}>
        {sessionsQ.isLoading ? (
          <InlineLoading label="Loading…" />
        ) : sessionsQ.isError ? (
          <div className="text-xs text-error" role="alert">
            Could not load the devices.
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="Not logged in anywhere." className="py-6" />
        ) : (
          <>
            <List>
              {rows.map((row) => (
                <ListRow
                  key={row.id}
                  title={labelOf(row)}
                  subtitle={`Since ${fmtDate(row.created_at)} · last seen ${fmtDateTime(row.last_seen_at)} · ${row.kind}`}
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
                        onClick={() => setPendingOne(row)}
                        aria-label={`Sign out ${labelOf(row)}`}
                        title="Sign out this device"
                      >
                        <LogOut size={14} aria-hidden="true" />
                      </Button>
                    )
                  }
                />
              ))}
            </List>
            <div className="mt-3">
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="w-full justify-center gap-2"
                onClick={() => setPendingAll(true)}
                disabled={revokeAll.isPending}
              >
                <LogOut size={14} aria-hidden="true" />
                <span>Sign out every device</span>
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Reversible — they can log in again — so no red block (§7). */}
      <ConfirmDialog
        open={!!pendingOne}
        title={`Sign out ${pendingOne ? labelOf(pendingOne) : ""}?`}
        subtitle="They can log in again."
        confirmLabel="Sign out"
        busy={revokeOne.isPending}
        busyLabel="Signing out…"
        onCancel={() => setPendingOne(null)}
        onConfirm={() => {
          void confirmOne();
        }}
      />
      <ConfirmDialog
        open={pendingAll}
        title={`Sign out every device of ${account?.display_name ?? ""}?`}
        subtitle={`${fmtCount(rows.length, "device", "devices")} ${rows.length === 1 ? "has" : "have"} to log in again${
          includesMine ? " — this one included" : ""
        }. They can log in again.`}
        confirmLabel="Sign out every device"
        busy={revokeAll.isPending}
        busyLabel="Signing out…"
        onCancel={() => setPendingAll(false)}
        onConfirm={() => {
          void confirmAll();
        }}
      />
    </>
  );
}
