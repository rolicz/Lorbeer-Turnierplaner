import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useLiveTournament } from "../../hooks/useLiveTournament";
import { prefersReducedMotion } from "../scroll";
import { activeDest, visibleDests } from "./navConfig";

/**
 * Mobile (and tablet < lg) fixed bottom tab bar with the primary destinations.
 *
 * Clubs (editor+) and Settings stay in the drawer — five items are what fits a
 * phone row, and the drawer keeps every entry. Unlike the top bar this never
 * hides on scroll: it is the app's main navigation on a phone.
 */
export default function BottomTabBar() {
  const { role } = useAuth();
  const loc = useLocation();
  const dests = visibleDests(role).filter((d) => d.key !== "clubs");
  const active = activeDest(loc.pathname);

  // While a tournament is running, the Tournaments tab carries the live dot and
  // is a shortcut to its page (the drawer's "Live now" entry stays as is).
  const liveT = useLiveTournament().data ?? null;

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 nav-shell border-b-0 border-t backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
    >
      <div className="flex items-stretch">
        {dests.map((d) => {
          const Icon = d.icon;
          const isActive = active?.key === d.key;
          const live = d.key === "tournaments" ? liveT : null;
          const to = live ? `/live/${live.id}` : d.to;
          return (
            <Link
              key={d.key}
              to={to}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                // Tapping the tab you are already on takes you back to the top.
                if (!isActive) return;
                window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
              }}
              className={
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition focus-ring " +
                (isActive ? "text-accent" : "text-text-muted")
              }
            >
              <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {live ? (
                  <span className="absolute -right-1.5 -top-1 flex h-2 w-2 items-center justify-center" aria-hidden="true">
                    <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full live-ping opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full live-dot" />
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] font-medium leading-none">{d.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
