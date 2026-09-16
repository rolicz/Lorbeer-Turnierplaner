/**
 * Controlled provider for the realtime connection status — the component half of
 * `RealtimeStatusContext.ts`, on its own so Fast Refresh can update it (Q10).
 * `hooks/realtime/RealtimeProvider` feeds it the live status.
 */
import type { ReactNode } from "react";

import { RealtimeContext, type RealtimeStatus } from "./RealtimeStatusContext";

export function RealtimeStatusProvider({
  status,
  children,
}: {
  status: RealtimeStatus;
  children: ReactNode;
}) {
  return <RealtimeContext.Provider value={{ status }}>{children}</RealtimeContext.Provider>;
}
