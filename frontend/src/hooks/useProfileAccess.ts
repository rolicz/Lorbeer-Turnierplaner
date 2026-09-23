import { useContext } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";

import { listAccounts } from "../api/admin.api";
import { listPlayers } from "../api/players.api";
import { qk } from "../api/queryKeys";
import { AuthContext } from "../auth/AuthContext";

/**
 * Stands in for a missing `QueryClientProvider` so the hooks below stay unconditional; it
 * is never asked anything (every query is disabled when it is the one in use).
 */
const NO_CLIENT = new QueryClient();

export type ProfileAccess = {
  /** The caller may open this player's profile: they share a group, or the caller is the site admin. */
  canOpen: boolean;
  /** This player shares no group with the caller — the `Users` mark beside the name. */
  foreign: boolean;
  /** The roster has not answered yet; until it does the answer is the optimistic one. */
  loading: boolean;
};

/**
 * "May I open this profile, and is this author from another group" — the **only** place
 * the browser answers it (L11). `PlayerLink` is the one caller; a surface that wants to know
 * renders a `PlayerLink` rather than asking here itself.
 *
 * The answer comes from what the client already holds: `qk.players()` is the caller's
 * roster, the members of every group they are in (L3's `roster_for`). In it → a door; not in
 * it → foreign, and a door only for the site admin. **The server refuses independently**
 * (`services/groups.py::ensure_shared_group`): this hook decides what is drawn, never what
 * may be read.
 *
 * Two refinements the roster alone cannot give:
 *
 * - **The site admin's roster is everyone** (`roster_for` answers a site admin with every
 *   player), so "not in my roster" can never mark anyone for them. For the site admin the
 *   mark comes from `qk.admin.accounts()` — already the admin page's list, and one the site
 *   admin is the one caller allowed to read — where a player whose role in the current group
 *   is `none` is in no group the site admin shares. Part 1 has one group; part 2's real
 *   answer is a field on the roster, which is a response-model change and was deliberately
 *   not made here.
 * - **While the roster is unknown** (first paint, a failed fetch, a tree with no session)
 *   every name stays a door and nothing is marked: a name flashing to plain text and back on
 *   every cold load is worse than a link the server may refuse — and it refuses with the
 *   profile page's own "This profile is in another group." state.
 *
 * `PlayerLink` is a primitive rendered inside dozens of components, many of them tested on
 * their own under a bare router; so this hook reads the two contexts **without** requiring
 * them (not `useAuth`, which throws by design, Q10) and a tree with no session or no query
 * client simply gets the optimistic answer above. The app always has both.
 */
export function useProfileAccess(playerId: number | null | undefined): ProfileAccess {
  const auth = useContext(AuthContext);
  const contextClient = useContext(QueryClientContext);
  const client = contextClient ?? NO_CLIENT;
  const authed = auth?.status === "authed" && contextClient != null;
  const siteAdmin = !!auth?.siteAdmin;
  const selfId = auth?.playerId ?? null;

  const rosterQ = useQuery({ queryKey: qk.players(), queryFn: listPlayers, enabled: authed }, client);
  const accountsQ = useQuery(
    { queryKey: qk.admin.accounts(), queryFn: listAccounts, enabled: authed && siteAdmin },
    client,
  );

  if (playerId == null || !Number.isFinite(playerId) || playerId <= 0) {
    return { canOpen: false, foreign: false, loading: false };
  }
  if (selfId != null && playerId === selfId) return { canOpen: true, foreign: false, loading: false };

  if (!authed) return { canOpen: true, foreign: false, loading: false };

  if (siteAdmin) {
    const row = accountsQ.data?.find((a) => a.player_id === playerId);
    return { canOpen: true, foreign: !!row && !row.site_admin && row.role === "none", loading: accountsQ.isPending };
  }

  const roster = rosterQ.data;
  if (!roster) return { canOpen: true, foreign: false, loading: rosterQ.isPending };
  const inRoster = roster.some((p) => p.id === playerId);
  return { canOpen: inRoster, foreign: !inRoster, loading: false };
}
