/**
 * Where to send someone after they log in: the in-app path `RequireAuth` bounced them from, or the
 * dashboard. The path arrives in router state built from the URL they opened, so a crafted link
 * decides it — which makes this the one place an open redirect could start.
 *
 * Only a single-slash in-app path is accepted. `//evil.example` is a protocol-relative URL, and a
 * backslash — raw or encoded as `%5C` — is refused anywhere in the path, because browsers read `\`
 * as `/` in http(s) URLs and React Router 6 has a known open redirect built on exactly that
 * (GHSA-wrjc-x8rr-h8h6, fixed only in v7). The router's `/g/<slug>` basename already keeps a
 * navigation in-app; this makes the guard not depend on it.
 */
export function safeReturnPath(fromState: unknown): string {
  if (typeof fromState !== "string") return "/dashboard";
  if (!fromState.startsWith("/") || fromState.startsWith("//")) return "/dashboard";
  if (fromState.includes("\\") || /%5c/i.test(fromState)) return "/dashboard";
  if (fromState.startsWith("/login")) return "/dashboard";
  return fromState;
}
