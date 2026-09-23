import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";

import { createInvite, listInvites, revokeInvite } from "../../api/admin.api";
import { ApiError } from "../../api/client";
import { qk } from "../../api/queryKeys";
import type { Invite, InviteCreated } from "../../api/types";
import Button from "../../ui/primitives/Button";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import EmptyState from "../../ui/primitives/EmptyState";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import InlineLoading from "../../ui/primitives/InlineLoading";
import Input from "../../ui/primitives/Input";
import { List, ListRow } from "../../ui/primitives/List";
import { fmtCount, fmtDateTime } from "../../utils/format";
import { formatInviteCode, normalizeInviteCode } from "../auth/inviteCode";
import ShownOnce from "./ShownOnce";

function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.detail ?? `${fallback} (${e.status})`;
  return "Could not reach the server — check your connection and try again.";
}

/**
 * Minutes until a server timestamp. The wire is naive UTC (no zone marker, as everywhere in
 * the app), so a string without one is read as UTC here — only for this duration; what is
 * *printed* as a date stays `fmtDateTime`'s, like every other byline.
 */
function minutesLeft(iso: string, now = Date.now()): number {
  const utc = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const t = Date.parse(utc);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t - now) / 60_000));
}

function expiresText(iso: string): string {
  const m = minutesLeft(iso);
  return m > 0 ? `expires in ${fmtCount(m, "min", "min")}` : "expired";
}

/** The link that opens registration with this code filled in (L5 reads `?code=`). */
function registerLink(created: InviteCreated): string {
  return `${window.location.origin}/g/${created.group_slug}/register?code=${encodeURIComponent(normalizeInviteCode(created.code))}`;
}

/**
 * Invite codes (L6): create one — shown **once**, big, with copy buttons — and the list of
 * live codes, which never carries the code (the server does not return it).
 */
export default function InvitesTab() {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<InviteCreated | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<Invite | null>(null);

  const invitesQ = useQuery({ queryKey: qk.admin.invites(), queryFn: listInvites });
  const createMut = useMutation({
    mutationFn: (n: string) => createInvite(n),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.admin.invites() }),
  });
  const revokeMut = useMutation({
    mutationFn: (id: number) => revokeInvite(id),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.admin.invites() }),
  });

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const out = await createMut.mutateAsync(note.trim());
      setCreated(out);
      setNote("");
    } catch (err) {
      showErrorToast(errorText(err, "Could not create the code"), "Invite code failed");
    }
  }

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    const id = pendingRevoke.id;
    try {
      await revokeMut.mutateAsync(id);
      // The code on screen is the one just revoked: it no longer works, so stop showing it.
      if (created?.id === id) setCreated(null);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) showErrorToast(errorText(err, "Could not revoke the code"), "Revoke failed");
    } finally {
      setPendingRevoke(null);
    }
  }

  const invites = invitesQ.data ?? [];
  // The server may send the code with or without its dash; the screen always shows one.
  const shownCode = created ? formatInviteCode(normalizeInviteCode(created.code)) : "";

  return (
    <div className="space-y-3">
      <div className="section-head">
        <span className="section-label">Invite codes</span>
      </div>

      <form onSubmit={(e) => void onCreate(e)} className="space-y-2">
        <Input label="Note (who is it for)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
        <Button type="submit" size="md" className="w-full justify-center gap-2" disabled={createMut.isPending}>
          <UserPlus size={14} aria-hidden="true" />
          <span>{createMut.isPending ? "Creating…" : "Create code"}</span>
        </Button>
      </form>

      {created ? (
        <ShownOnce
          testId="invite-code"
          value={shownCode}
          valueClassName="text-2xl tabular-nums tracking-wider"
          copies={[
            { label: "Copy code", text: shownCode },
            { label: "Copy link", text: registerLink(created) },
          ]}
          note={`${created.note ? `For ${created.note}. ` : ""}Works once, ${expiresText(created.expires_at)}.`}
        />
      ) : null}

      <div className="section-head pt-2">
        <span className="section-label">Live codes</span>
      </div>
      {invitesQ.isLoading ? (
        <InlineLoading label="Loading…" />
      ) : invitesQ.isError ? (
        <div className="text-xs text-error" role="alert">
          Could not load the codes.
        </div>
      ) : invites.length === 0 ? (
        <EmptyState title="No live codes." className="py-6" />
      ) : (
        <List>
          {invites.map((inv) => (
            <ListRow
              key={inv.id}
              title={inv.note || "No note"}
              subtitle={[
                `created ${fmtDateTime(inv.created_at)}`,
                inv.created_by ? `by ${inv.created_by.display_name}` : null,
                expiresText(inv.expires_at),
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={() => setPendingRevoke(inv)}
                  aria-label={`Revoke the code${inv.note ? ` for ${inv.note}` : ""}`}
                  title="Revoke code"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              }
            />
          ))}
        </List>
      )}

      {/* A stored row is deleted, so the red block says what goes (§7). */}
      <ConfirmDialog
        open={!!pendingRevoke}
        title="Revoke this code?"
        subtitle="Nobody can register with it any more. You can create a new one."
        confirmLabel="Revoke code"
        busy={revokeMut.isPending}
        busyLabel="Revoking…"
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => {
          void confirmRevoke();
        }}
      >
        <div>The code{pendingRevoke?.note ? ` for ${pendingRevoke.note}` : ""} stops working at once.</div>
      </ConfirmDialog>
    </div>
  );
}
