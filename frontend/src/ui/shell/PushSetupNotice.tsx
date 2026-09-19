import { BellOff } from "lucide-react";
import { useState } from "react";

import { usePushNotifications } from "../../push/usePushNotifications";
import { dismissSetupNotice, isSetupNoticeDismissed } from "../../push/pushSetup";
import Button from "../primitives/Button";

/**
 * "This device gets no notifications" — said without being asked (P5).
 *
 * Re-adding the PWA destroys the service worker and the push subscription; Roli went
 * days without push and only found out by tapping Settings → Send test. Settings still
 * holds the truth, but nobody visits Settings to check something they do not know is
 * broken, so the shell says it on whatever page the reader happens to be on — a push
 * deep link or a shared link can skip the dashboard entirely.
 *
 * It shows only while nobody has decided on this install (`permission === "default"`)
 * and there is no subscription; a device that said no is never nagged, and the
 * dismissal lives in `localStorage`, which a reinstall wipes along with the
 * subscription — so the case that broke asks again, and only that case.
 */
export default function PushSetupNotice({ token }: { token: string | null }) {
  const push = usePushNotifications(token);
  const [dismissed, setDismissed] = useState(() => isSetupNoticeDismissed());

  if (dismissed || push.loading || push.setupState !== "needs-setup") return null;

  return (
    <div className="card mb-3 flex flex-wrap items-center gap-2 border-warn/40 bg-warn/10" role="status">
      <BellOff size={16} className="text-warn" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm text-text-normal">This device gets no notifications.</span>
      <span className="ms-auto inline-flex gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            dismissSetupNotice();
            setDismissed(true);
          }}
        >
          Not now
        </Button>
        <Button size="sm" disabled={push.syncing} onClick={() => void push.enable()}>
          {push.syncing ? "Turning on…" : "Turn on"}
        </Button>
      </span>
    </div>
  );
}
