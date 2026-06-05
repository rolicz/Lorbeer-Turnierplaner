/* eslint-disable react-refresh/only-export-components */
/**
 * Connection status for the live websocket layer, surfaced to the shell's
 * ConnectionIndicator. Phase A ships the context + hook; Phase C replaces the
 * provider with the real, stateful realtime layer that drives `status`.
 */
import { createContext, useContext, type ReactNode } from "react";

export type RealtimeStatus = "live" | "reconnecting" | "offline";

type RealtimeContextValue = { status: RealtimeStatus };

const RealtimeContext = createContext<RealtimeContextValue>({ status: "offline" });

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeContext).status;
}

/** Controlled provider — Phase C feeds the live status in. */
export function RealtimeStatusProvider({
  status,
  children,
}: {
  status: RealtimeStatus;
  children: ReactNode;
}) {
  return <RealtimeContext.Provider value={{ status }}>{children}</RealtimeContext.Provider>;
}
