/**
 * Centralised TanStack Query key factory.
 *
 * Usage:
 *   useQuery({ queryKey: qk.tournament(tid), ... })
 *   qc.invalidateQueries({ queryKey: qk.stats.players() })
 *
 * Invalidation with a prefix (e.g. qk.stats.all()) invalidates all queries
 * under that namespace because TanStack matches any query whose key starts
 * with the given array.
 */

export const qk = {
  // ---- tournaments --------------------------------------------------------
  tournaments: () => ["tournaments"] as const,
  tournamentsLive: () => ["tournaments", "live"] as const,
  tournament: (id: number | string) => ["tournament", id] as const,

  // ---- comments -----------------------------------------------------------
  commentsSummary: () => ["comments", "summary"] as const,
  commentsTournament: (tournamentId: number) => ["comments", tournamentId] as const,
  commentsReadIds: (tournamentId: number, token: string | null) =>
    ["comments", "read", tournamentId, token ?? "none"] as const,
  commentsReadMap: (token: string | null) => ["comments", "read-map", token ?? "none"] as const,

  // ---- players ------------------------------------------------------------
  players: () => ["players"] as const,
  playerProfiles: () => ["players", "profiles"] as const,
  playerAvatars: () => ["players", "avatars"] as const,
  playerHeaders: () => ["players", "headers"] as const,
  playerProfile: (playerId: number | string) => ["players", "profile", playerId] as const,
  playerGuestbook: (playerId: number | string) => ["players", "guestbook", playerId] as const,
  playerGuestbookSummary: () => ["players", "guestbook", "summary"] as const,
  playerGuestbookReadIds: (playerId: number | string, token: string | null) =>
    ["players", "guestbook", "read", playerId, token ?? "none"] as const,
  playerGuestbookReadMap: (token: string | null) =>
    ["players", "guestbook", "read-map", token ?? "none"] as const,
  playerPokes: (playerId: number | string) => ["players", "pokes", playerId] as const,
  playerPokesSummary: () => ["players", "pokes", "summary"] as const,
  playerPokesReadIds: (playerId: number | string, token: string | null) =>
    ["players", "pokes", "read", playerId, token ?? "none"] as const,
  playerPokesReadMap: (token: string | null) =>
    ["players", "pokes", "read-map", token ?? "none"] as const,
  playerPokesAuthoredUnread: (token: string | null) =>
    ["players", "pokes", "authored-unread", token ?? "none"] as const,

  // ---- clubs / leagues ----------------------------------------------------
  clubs: (game?: string) => (game ? (["clubs", game] as const) : (["clubs"] as const)),
  leagues: () => ["leagues"] as const,

  // ---- cup ----------------------------------------------------------------
  cup: (key: string) => ["cup", key] as const,
  cupDefs: () => ["cup", "defs"] as const,
  cupAll: () => ["cup"] as const,

  // ---- friendlies ---------------------------------------------------------
  friendlies: (mode?: string) => (mode ? (["friendlies", mode] as const) : (["friendlies"] as const)),

  // ---- stats --------------------------------------------------------------
  stats: {
    all: () => ["stats"] as const,
    players: (mode?: string, lastN?: number) =>
      mode !== undefined && lastN !== undefined
        ? (["stats", "players", mode, lastN] as const)
        : (["stats", "players"] as const),
    h2h: (playerId?: number | string, limit?: number, order?: string) =>
      playerId !== undefined
        ? (["stats", "h2h", playerId, limit, order] as const)
        : (["stats", "h2h"] as const),
    streaks: (mode?: string, limit?: number, scope?: string) =>
      mode !== undefined
        ? (["stats", "streaks", mode, limit, scope] as const)
        : (["stats", "streaks"] as const),
    ratings: (mode?: string, scope?: string) =>
      mode !== undefined
        ? (["stats", "ratings", mode, scope] as const)
        : (["stats", "ratings"] as const),
    playerMatches: (playerId?: number | string, scope?: string) =>
      playerId !== undefined
        ? (["stats", "playerMatches", playerId, scope] as const)
        : (["stats", "playerMatches"] as const),
    playerTiles: (playerId?: number | string, mode?: string) =>
      playerId !== undefined
        ? (["stats", "playerTiles", playerId, mode] as const)
        : (["stats", "playerTiles"] as const),
    starsPerformance: (playerId?: number | string, scope?: string) =>
      playerId !== undefined
        ? (["stats", "starsPerformance", playerId, scope] as const)
        : (["stats", "starsPerformance"] as const),
    odds: (req: unknown) => ["stats", "odds", req] as const,
  },

  // ---- match-specific H2H (live page) ------------------------------------
  matchH2h: (relation: string, mode: string, aIds: number[], bIds: number[]) =>
    ["match-h2h", relation, mode, aIds, bIds] as const,
  matchH2hDuo: (ids: number[]) => ["match-h2h", "duo", ids] as const,
} as const;
