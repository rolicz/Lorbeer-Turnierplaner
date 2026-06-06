/**
 * Back-compat shim. The realtime layer now lives in `hooks/realtime/`
 * (optimistic-push: surgical cache updates + resync + connection status).
 * Existing imports keep working through these re-exports.
 */
export { useTournamentWS, useAnyTournamentWS, usePlayerProfileWS } from "./realtime/useRealtime";
