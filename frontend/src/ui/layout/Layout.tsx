import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import Button from "../primitives/Button";
import { useAnyTournamentWS } from "../../hooks/useTournamentWS";

type Role = "reader" | "editor" | "admin";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, logout } = useAuth();
  const loc = useLocation();
  useAnyTournamentWS();

  const nav: { to: string; label: string; min: Role }[] = [
    { to: "/dashboard", label: "Dashboard", min: "reader" },
    { to: "/tournaments", label: "Tournaments", min: "reader" },
    { to: "/clubs", label: "Clubs", min: "editor" },
    { to: "/players", label: "Players", min: "reader" },
  ];

  const rank: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };
  const visible = nav.filter((n) => rank[role] >= rank[n.min]);

  return (
    <div className="min-h-screen">
      {/* Fixed top bar, respecting mobile safe-area insets */}
      <div
        className="
          fixed inset-x-0 top-0 z-30
          border-b border-zinc-800 bg-zinc-900/30 backdrop-blur
          pt-[env(safe-area-inset-top,0px)]
          pl-[env(safe-area-inset-left,0px)]
          pr-[env(safe-area-inset-right,0px)]
        "
      >
        <div className="mx-auto max-w-5xl px-4 py-2 sm:py-3">
          {/* Row 1: title + role + auth */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="shrink-0 font-semibold tracking-tight">EA FC</div>
              <div className="truncate text-xs text-zinc-400 sm:text-sm">
                role: <span className="accent">{role}</span>
              </div>
            </div>

            <div className="shrink-0">
              {role === "reader" ? (
                <Link
                  to="/login"
                  title="Login"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-800 bg-transparent px-4 text-sm font-medium transition hover:bg-zinc-900/50"
                >
                  <i className="fa fa-sign-in md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">Login</span>
                </Link>
              ) : (
                <Button variant="ghost" onClick={logout} title="Logout">
                  <i className="fa fa-sign-out md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">Logout</span>
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: nav (always visible, scrollable on mobile) */}
          <nav className="-mx-3 mt-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:mt-3 sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="flex min-w-max items-center gap-1">
              {visible.map((n) => {
                const active = loc.pathname.startsWith(n.to);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={`rounded-xl px-3 py-2 text-sm ${
                      active ? "bg-zinc-900" : "hover:bg-zinc-900/60"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      {/* Content offset: header height + safe-area inset top */}
      <div className="pt-[calc(env(safe-area-inset-top,0px)+104px)] sm:pt-[calc(env(safe-area-inset-top,0px)+120px)]">
        <main
          className="
            mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6
            pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]
          "
        >
          {children}
        </main>
      </div>
    </div>
  );
}
