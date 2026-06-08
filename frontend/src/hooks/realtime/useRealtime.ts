/**
 * React hooks over the shared websocket connection layer.
 *
 * Live data arrives as surgical cache updates (see applyEvent.ts) — a single
 * tournament.sync replaces the tournament cache wholesale, so a goal is a zero-
 * refetch DOM update. We additionally RESYNC (a narrow refetch of the active
 * data) whenever a socket (re)connects after a gap or the tab becomes visible
 * again, to catch anything missed while disconnected/backgrounded.
 */
import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { qk } from "../../api/queryKeys";
import { useAuth } from "../../auth/AuthContext";
import { buildWsUrlForPath, subscribe, type RealtimeMessage } from "./connection";
import { applyGlobalMessage, applyTournamentMessage } from "./applyEvent";

function safeUrl(fn: () => string): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/** Run `resync` when the tab returns to the foreground (covers half-open sockets). */
function useVisibilityResync(enabled: boolean, resync: () => void) {
  const resyncRef = useRef(resync);
  useEffect(() => {
    resyncRef.current = resync;
  });
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") resyncRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);
}

// ---- per-tournament channel ------------------------------------------------

function resyncTournament(qc: QueryClient, tid: number) {
  void qc.invalidateQueries({ queryKey: qk.tournament(tid) });
  void qc.invalidateQueries({ queryKey: qk.commentsTournament(tid) });
}

export function useTournamentWS(tid: number | null) {
  const qc = useQueryClient();
  const { token } = useAuth();
  const url = tid ? safeUrl(() => buildWsUrlForPath(`/ws/tournaments/${tid}`, token)) : null;

  useVisibilityResync(!!tid, () => {
    if (tid) resyncTournament(qc, tid);
  });

  useEffect(() => {
    if (!tid || !url) return;
    return subscribe(url, {
      onMessage: (msg: RealtimeMessage) => applyTournamentMessage(qc, msg),
      // Skip the very first connect (initial GET already loaded fresh state);
      // only resync after a real reconnect.
      onOpen: (first) => {
        if (!first) resyncTournament(qc, tid);
      },
    });
  }, [qc, tid, url]);
}

// ---- global channel --------------------------------------------------------

function resyncGlobal(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.tournaments() });
  void qc.invalidateQueries({ queryKey: qk.tournamentsLive() });
  void qc.invalidateQueries({ queryKey: qk.commentsSummary() });
}

export function useAnyTournamentWS() {
  const qc = useQueryClient();
  const { token } = useAuth();
  const url = safeUrl(() => buildWsUrlForPath(`/ws/tournaments`, token));

  useVisibilityResync(true, () => resyncGlobal(qc));

  useEffect(() => {
    if (!url) return;
    return subscribe(url, {
      onMessage: (msg: RealtimeMessage) => applyGlobalMessage(qc, msg),
      onOpen: (first) => {
        if (!first) resyncGlobal(qc);
      },
    });
  }, [qc, url]);
}

// ---- per-player profile channel (pokes / guestbook) ------------------------

function resyncPlayer(qc: QueryClient, playerId: number, token?: string | null) {
  void qc.invalidateQueries({ queryKey: qk.playerPokesSummary() });
  void qc.invalidateQueries({ queryKey: qk.playerPokes(playerId) });
  void qc.invalidateQueries({ queryKey: qk.playerPokesReadIds(playerId, token ?? null) });
  if (token) {
    void qc.invalidateQueries({ queryKey: qk.playerPokesReadMap(token) });
    void qc.invalidateQueries({ queryKey: qk.playerPokesAuthoredUnread(token) });
  }
}

export function usePlayerProfileWS(playerId: number | null, token?: string | null) {
  const qc = useQueryClient();
  const url = playerId ? safeUrl(() => buildWsUrlForPath(`/ws/players/${playerId}`, token)) : null;

  useVisibilityResync(!!playerId, () => {
    if (playerId) resyncPlayer(qc, playerId, token);
  });

  useEffect(() => {
    if (!playerId || !url) return;
    return subscribe(url, {
      // Poke/guestbook payloads are read-state heavy and viewer-specific, so a
      // narrow refetch is both correct and cheap.
      onMessage: () => resyncPlayer(qc, playerId, token),
      onOpen: (first) => {
        if (!first) resyncPlayer(qc, playerId, token);
      },
    });
  }, [playerId, qc, token, url]);
}
