import { Link, useLocation } from "react-router-dom";

import { useLiveTournament } from "../../hooks/useLiveTournament";
import { prefersReducedMotion } from "../scroll";
import { useDestinationLinks } from "./useDestinationLinks";

/**
 * Mobile (and tablet < lg) fixed bottom tab bar with the primary destinations.
 *
 * Clubs (editor+), Ideas and Settings stay in the drawer — five items are what
 * fits a phone row, and the drawer keeps every entry. Unlike the top bar this
 * never hides on scroll: it is the app's main navigation on a phone.
 *
 * It hides for exactly one thing: the on-screen keyboard (`hide-on-keyboard`,
 * `keyboardOpen.ts`, Q2). iOS re-anchors a fixed bottom element to the shrunken
 * visual viewport, so while you type the bar would sit on top of the keyboard,
 * above the composer — which is what Roli filmed. `pl-safe-l pr-safe-r` keep the
 * five tabs out of a landscape notch; the bar's background still reaches the
 * screen edge, the way the drawer's does (Q4).
 *
 * Its surface is `nav-shell`, opaque since Q12 — the same class the top bar wears,
 * changed together so the two bars on one screen can never disagree. The blur that
 * went with the old translucency is gone here too; the `border-t` is what marks the
 * edge the list runs under.
 */
export default function BottomTabBar() {
  const loc = useLocation();
  // Each item points at the page you last had open in that destination (U6);
  // Tournaments falls back to the running tournament, as U2 introduced it.
  const links = useDestinationLinks({ exclude: ["clubs", "ideas"] });

  // While a tournament is running, the Tournaments tab carries the live dot.
  const liveT = useLiveTournament().data ?? null;

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="hide-on-keyboard fixed inset-x-0 bottom-0 z-30 nav-shell border-b-0 border-t pb-safe-b pl-safe-l pr-safe-r lg:hidden"
    >
      <div className="flex items-stretch">
        {links.map(({ dest: d, to, isActive, state }) => {
          const Icon = d.icon;
          const live = d.key === "tournaments" ? liveT : null;
          return (
            <Link
              key={d.key}
              to={to}
              state={state}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                // Tapping the destination you are already in returns to its root;
                // when you are already there, it takes you back to the top instead.
                if (!isActive || loc.pathname !== to) return;
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
              <span className="text-micro font-medium leading-none">{d.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
