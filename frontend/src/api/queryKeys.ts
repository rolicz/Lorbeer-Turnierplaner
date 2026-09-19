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
  /** Counts for the re-assign confirmation (Q5) — fetched when the dialog opens. */
  tournamentReassignPreview: (id: number | string) => ["tournament", id, "reassign-preview"] as const,

  // ---- comments -----------------------------------------------------------
  commentsSummary: () => ["comments", "summary"] as const,
  /** Prefix key — invalidates/matches all comment queries for a tournament. */
  commentsTournament: (tournamentId: number) => ["comments", tournamentId] as const,
  /** Full key including viewer token — use in useQuery. */
  commentsTournamentFull: (tournamentId: number, token: string | null) =>
    ["comments", tournamentId, token ?? "none"] as const,
  commentsReadIds: (tournamentId: number, token: string | null) =>
    ["comments", "read", tournamentId, token ?? "none"] as const,
  commentsReadMap: (token: string | null) => ["comments", "read-map", token ?? "none"] as const,

  // ---- ideas / feature requests -------------------------------------------
  /** Prefix key — invalidates every ideas query regardless of viewer. */
  ideasAll: () => ["ideas"] as const,
  /** Full key including the viewer token: rows carry per-caller capability flags and my_vote. */
  ideas: (token: string | null) => ["ideas", "list", token ?? "none"] as const,
  ideaAreas: () => ["ideas", "areas"] as const,
  ideaVoters: (ideaId: number | string) => ["ideas", "voters", ideaId] as const,

  // ---- players ------------------------------------------------------------
  players: () => ["players"] as const,
  playerProfiles: () => ["players", "profiles"] as const,
  playerAvatars: () => ["players", "avatars"] as const,
  playerHeaders: () => ["players", "headers"] as const,
  playerProfile: (playerId: number | string) => ["players", "profile", playerId] as const,
  /** Prefix key — invalidates a profile's guestbook regardless of who is looking at it. */
  playerGuestbook: (playerId: number | string) => ["players", "guestbook", playerId] as const,
  /**
   * Full key including the viewer token — use in `useQuery`. The rows carry per-caller
   * answers (`can_edit` from `guestbook_can_edit`, `my_vote`), so one identity's payload
   * must never be handed to another: the `commentsTournamentFull` / `friendliesList` /
   * `ideas` shape, and the prefix above still reaches every one of them (G4).
   */
  playerGuestbookFull: (playerId: number | string, token: string | null) =>
    ["players", "guestbook", playerId, token ?? "none"] as const,
  playerGuestbookSummary: () => ["players", "guestbook", "summary"] as const,
  playerGuestbookReadIds: (playerId: number | string, token: string | null) =>
    ["players", "guestbook", "read", playerId, token ?? "none"] as const,
  playerGuestbookReadMap: (token: string | null) =>
    ["players", "guestbook", "read-map", token ?? "none"] as const,
  playerPokes: (playerId: number | string) => ["players", "pokes", playerId] as const,
  playerPokesSummary: () => ["players", "pokes", "summary"] as const,
  /** Prefix key — invalidates poke-read state for a player across all tokens. */
  playerPokesReadPrefix: (playerId: number | string) =>
    ["players", "pokes", "read", playerId] as const,
  playerPokesReadIds: (playerId: number | string, token: string | null) =>
    ["players", "pokes", "read", playerId, token ?? "none"] as const,
  playerPokesReadMap: (token: string | null) =>
    ["players", "pokes", "read-map", token ?? "none"] as const,
  playerPokesAuthoredUnread: (token: string | null) =>
    ["players", "pokes", "authored-unread", token ?? "none"] as const,

  // ---- personal notifications (in-app feed) ------------------------------
  /** Prefix key — invalidates all notification queries regardless of token. */
  notificationsAll: () => ["me", "notifications"] as const,
  notifications: (token: string | null) => ["me", "notifications", token ?? "none"] as const,

  // ---- clubs / leagues ----------------------------------------------------
  clubs: (game?: string) => (game ? (["clubs", game] as const) : (["clubs"] as const)),
  /** One club's star-rating history (R4) — read-only, shown next to the editors. */
  clubStarHistory: (clubId: number) => ["clubs", "star-history", clubId] as const,
  leagues: () => ["leagues"] as const,

  // ---- cup ----------------------------------------------------------------
  cup: (key: string) => ["cup", key] as const,
  cupDefs: () => ["cup", "defs"] as const,
  cupAll: () => ["cup"] as const,

  // ---- friendlies ---------------------------------------------------------
  /** Prefix key — invalidates every friendlies query regardless of mode/viewer. */
  friendlies: (mode?: string) => (mode ? (["friendlies", mode] as const) : (["friendlies"] as const)),
  /** Full key including the viewer token: the rows carry per-caller capability flags (A10). */
  friendliesList: (mode: string, token: string | null) =>
    ["friendlies", mode, token ?? "none"] as const,

  // ---- push notifications -------------------------------------------------
  push: {
    config: () => ["push", "config"] as const,
    subscriptions: (token: string | null) => ["push", "subscriptions", token] as const,
    /** Prefix key — invalidates all subscription queries regardless of token. */
    subscriptionsAll: () => ["push", "subscriptions"] as const,
  },

  // ---- stats --------------------------------------------------------------
  stats: {
    all: () => ["stats"] as const,
    players: (mode?: string, lastN?: number | string, scope?: string) =>
      mode !== undefined && lastN !== undefined
        ? scope !== undefined
          ? (["stats", "players", mode, lastN, scope] as const)
          : (["stats", "players", mode, lastN] as const)
        : (["stats", "players"] as const),
    h2h: (playerId?: number | string, limit?: number, order?: string, scope?: string) =>
      playerId !== undefined && limit !== undefined && order !== undefined
        ? scope !== undefined
          ? (["stats", "h2h", playerId, limit, order, scope] as const)
          : (["stats", "h2h", playerId, limit, order] as const)
        : (["stats", "h2h"] as const),
    /** Per-player H2H detail in the matrix view: key shape differs from h2h(). */
    h2hPlayerDetail: (playerId: number | null, scope: string) =>
      ["stats", "h2h", "player", playerId, scope] as const,
    /** Profile-page H2H snippet: 4-element key distinct from the full h2h() shape. */
    h2hProfile: (playerId: number | string) =>
      ["stats", "h2h", "profile", playerId] as const,
    h2hMatches: (mode: string, relation: string, leftIds: string, rightIds: string, exact: string, scope: string) =>
      ["stats", "h2hMatches", mode, relation, leftIds, rightIds, exact, scope] as const,
    streaks: (mode?: string, limitOrPlayer?: number | string, scope?: string) =>
      mode !== undefined && limitOrPlayer !== undefined
        ? scope !== undefined
          ? (["stats", "streaks", mode, limitOrPlayer, scope] as const)
          : (["stats", "streaks", mode, limitOrPlayer] as const)
        : (["stats", "streaks"] as const),
    ratings: (mode?: string, scope?: string | number) =>
      mode !== undefined
        ? scope !== undefined
          ? (["stats", "ratings", mode, scope] as const)
          : (["stats", "ratings", mode] as const)
        : (["stats", "ratings"] as const),
    ratingsHistory: (mode: string, scope: string) =>
      ["stats", "ratingsHistory", mode, scope] as const,
    /**
     * `/stats/records` — one entry per (mode, scope), and the badge band reads the very
     * entry the Records page reads at its defaults ("overall", "tournaments"), so tapping
     * a badge into Stats is a cache hit on the payload the badge was drawn from.
     * Both args are required: a partial key would be a second entry that can disagree.
     */
    records: (mode: string, scope: string) => ["stats", "records", mode, scope] as const,
    playerMatches: (playerId?: number | string, scope?: string) =>
      playerId !== undefined
        ? scope !== undefined
          ? (["stats", "playerMatches", playerId, scope] as const)
          : (["stats", "playerMatches", playerId] as const)
        : (["stats", "playerMatches"] as const),
    /** Profile-page snippet key — uses hyphen form "player-matches" distinct from playerMatches. */
    playerMatchesProfile: (playerId: number | string) =>
      ["stats", "player-matches", "profile", playerId] as const,
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
