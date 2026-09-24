import { useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** The token a link carries: the fragment (`…#<token>`, what the server mints), else `?token=`. */
function tokenFrom(hash: string, search: string): string {
  const fromHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (fromHash) return decodeURIComponent(fromHash);
  return new URLSearchParams(search).get("token") ?? "";
}

/**
 * Read a one-time link's token **once** and take it out of the address bar (L5 wrote this
 * for `/reset`; E3 moved it here so `/verify-email` uses the same mechanism). The server
 * puts the token in the fragment so it never reaches a server log or a `Referer`; this
 * reads it on the first render and replaces the address with the bare path in a layout
 * effect — before the first frame and before any request — so it is never kept in
 * history, in the app's remembered location or in a screenshot of the address bar. A
 * reload afterwards finds no token, which is the point: a link is used once.
 *
 * Returns the token, or `""` when the link carried none.
 */
export function useLinkToken(): string {
  const location = useLocation();
  const nav = useNavigate();
  const [token] = useState(() => tokenFrom(location.hash, location.search));

  const carriesToken = location.hash.length > 1 || new URLSearchParams(location.search).has("token");
  useLayoutEffect(() => {
    if (!carriesToken) return;
    const rest = new URLSearchParams(location.search);
    rest.delete("token");
    const search = rest.toString();
    nav({ pathname: location.pathname, search: search ? `?${search}` : "", hash: "" }, { replace: true, state: location.state as unknown });
  }, [carriesToken, location.pathname, location.search, location.state, nav]);

  return token;
}
