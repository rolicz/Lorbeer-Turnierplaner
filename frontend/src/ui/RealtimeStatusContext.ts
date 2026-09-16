/**
 * Connection status for the live websocket layer, surfaced to the shell's
 * ConnectionIndicator: the context object and the hook that reads it.
 *
 * The provider is in `RealtimeStatusProvider.tsx`. A context and a component in
 * one module is the shape React Fast Refresh cannot update safely (Q10) — see
 * `auth/AuthContext.ts` for what that cost us.
 */
import { createContext, useContext } from "react";

export type RealtimeStatus = "live" | "reconnecting" | "offline";

export type RealtimeContextValue = { status: RealtimeStatus };

export const RealtimeContext = createContext<RealtimeContextValue>({ status: "offline" });

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeContext).status;
}
