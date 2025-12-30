import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import Button from "../primitives/Button";

type Role = "reader" | "editor" | "admin";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, logout } = useAuth();
  const loc = useLocation();

  const nav: { to: string; label: string; min: Role }[] = [
    { to: "/dashboard", label: "Dashboard", min: "reader" },
    { to: "/tournaments", label: "Tournaments", min: "reader" },
    { to: "/clubs", label: "Clubs", min: "editor" },
    { to: "/admin/players", label: "Players", min: "admin" },
  ];

  const rank: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };

  const visible = nav.filter((n) => rank[role] >= rank[n.min]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-2 sm:px-4 sm:py-3">
          {/* Row 1: title + auth */}
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
                  className="rounded-xl px-3 py-2 text-sm hover:bg-zinc-900/60"
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

          {/* Row 2: nav (scrollable on mobile) */}
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
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
