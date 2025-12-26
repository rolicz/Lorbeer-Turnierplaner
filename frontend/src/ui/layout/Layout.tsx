import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import Button from "../primitives/Button";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, logout } = useAuth();
  const loc = useLocation();

  const nav = [
    { to: "/tournaments", label: "Tournaments", min: "reader" as const },
    { to: "/clubs", label: "Clubs", min: "editor" as const },
    { to: "/admin/players", label: "Players", min: "admin" as const },
  ];

  const rank = { reader: 1, editor: 2, admin: 3 } as const;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="font-semibold tracking-tight">EA FC</div>
            <div className="text-sm text-zinc-400">
              role: <span className="accent">{role}</span>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {nav
              .filter(n => rank[role] >= rank[n.min])
              .map(n => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    loc.pathname.startsWith(n.to) ? "bg-zinc-900" : "hover:bg-zinc-900/60"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            {role === "reader" ? (
              <Link to="/login" className="rounded-xl px-3 py-2 text-sm hover:bg-zinc-900/60">
                Login
              </Link>
            ) : (
              <Button variant="ghost" onClick={logout}>Logout</Button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
