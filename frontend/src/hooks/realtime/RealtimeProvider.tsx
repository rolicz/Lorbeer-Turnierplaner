/**
 * Bridges the connection layer's aggregate status (live | reconnecting | offline)
 * into the RealtimeStatusContext consumed by the shell's ConnectionIndicator.
 */
import { useSyncExternalStore, type ReactNode } from "react";

import { RealtimeStatusProvider } from "../../ui/RealtimeStatusContext";
import { getStatus, subscribeStatus } from "./connection";

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const status = useSyncExternalStore(
    (cb) => subscribeStatus(() => cb()),
    getStatus,
    getStatus,
  );
  return <RealtimeStatusProvider status={status}>{children}</RealtimeStatusProvider>;
}
