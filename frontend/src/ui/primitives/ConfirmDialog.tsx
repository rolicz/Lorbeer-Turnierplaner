/**
 * Confirmation for an action that destroys data (`DESIGN.md` §7).
 *
 * A `Modal` on the app's own surface instead of `window.confirm`, because the point of
 * asking is to *name what is lost* — the match count, the cups that move, the two sides of
 * a friendly — and a native dialog can only show one line of text. Every delete asks,
 * an admin's included (A10): a delete is allowed even when real results hang off the row.
 */
import React from "react";

import Button from "./Button";
import Modal from "./Modal";

export default function ConfirmDialog({
  open,
  title,
  subtitle,
  confirmLabel,
  busyLabel,
  busy = false,
  onCancel,
  onConfirm,
  children,
}: {
  open: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** The button's verb, e.g. "Delete tournament" — never a bare "OK". */
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** What is lost. Rendered in the app's danger idiom (the `error` token, never
   *  `loss` — a deleted tournament is not a defeat); keep it to a few short lines. */
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={busy ? () => {} : onCancel}
      fullScreenOnMobile
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {children ? (
          <div className="space-y-1 rounded-xl border border-error/40 bg-error/10 p-3 text-xs text-error">
            {children}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? (busyLabel ?? "Deleting…") : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
