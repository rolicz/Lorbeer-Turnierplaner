import { ChevronDown, ChevronRight, KeyRound } from "lucide-react";
import React, { useState } from "react";

import { passkeysSupported } from "../../api/passkeys.api";
import Button from "../../ui/primitives/Button";

/**
 * Choosing a credential (E3) — the **one** place the app asks "passkey or password?", used
 * by the register page and the reset page. A passkey is the primary action and a password
 * the way round it (Roli, 2026-09-24):
 *
 * - a solid full-width **Create a passkey**, then a ghost full-width **Use a password
 *   instead**; pressing the ghost swaps both for the caller's `passwordForm` (its fields and
 *   its own submit button), with a muted **Create a passkey instead ›** above it — the way
 *   back, which discards nothing but the choice;
 * - where the browser cannot do WebAuthn at all (the phone against dev over plain-http LAN,
 *   an old browser) it renders `passwordForm` alone: no toggle, no mention of passkeys.
 *
 * It owns no error line and no request: `onPasskey` is the caller's, and a closed system
 * sheet is the caller's to swallow in silence (L9's rule) — the ceremony module already
 * answers `null` for it. `passkeyDisabled` holds only the passkey button (until the form
 * above it is filled in, or while a 429 counts down).
 */
export default function PasskeyOrPassword({
  onPasskey,
  passkeyBusy = false,
  passkeyDisabled = false,
  passwordForm,
  passwordLabel = "Use a password instead",
}: {
  onPasskey: () => Promise<void>;
  passkeyBusy?: boolean;
  passkeyDisabled?: boolean;
  passwordForm: React.ReactNode;
  passwordLabel?: string;
}) {
  // Asked once: a browser does not gain WebAuthn while the page is open.
  const [canPasskey] = useState(() => passkeysSupported());
  const [usePassword, setUsePassword] = useState(false);

  if (!canPasskey) {
    return (
      <div className="space-y-3" data-credential-choice="password-only">
        {passwordForm}
      </div>
    );
  }

  if (usePassword) {
    return (
      <div className="space-y-3" data-credential-choice="password">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-text-muted transition hover:text-text-normal"
          onClick={() => setUsePassword(false)}
        >
          Create a passkey instead <ChevronRight size={14} aria-hidden="true" />
        </button>
        {passwordForm}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-credential-choice="passkey">
      <Button
        type="button"
        size="md"
        className="w-full justify-center gap-2"
        disabled={passkeyBusy || passkeyDisabled}
        onClick={() => {
          void onPasskey();
        }}
      >
        <KeyRound size={14} aria-hidden="true" />
        <span>{passkeyBusy ? "Waiting for your passkey…" : "Create a passkey"}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="md"
        className="w-full justify-center gap-2"
        disabled={passkeyBusy}
        onClick={() => setUsePassword(true)}
      >
        <ChevronDown size={14} aria-hidden="true" />
        <span>{passwordLabel}</span>
      </Button>
    </div>
  );
}
