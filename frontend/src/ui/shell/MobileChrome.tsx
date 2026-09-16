import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Settings, ChevronLeft } from "lucide-react";

import { useLiveTournament } from "../../hooks/useLiveTournament";
import { drawerLeft, scrim } from "../motion/motion";
import { activeDest } from "./navConfig";
import { useDestinationLinks } from "./useDestinationLinks";
import { usePageTitleValue } from "../layout/PageTitleContext";
import { useHideOnScroll } from "../layout/useHideOnScroll";
import { NAV_JUMP_STATE, useBack } from "./backNavigation";
import Button from "../primitives/Button";
import TopBarStatus from "./TopBarStatus";

/** Mobile (and tablet < lg) top bar + slide-in navigation drawer. */
export default function MobileChrome({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const loc = useLocation();
  // Each entry points at the page you last had open in that destination (U6).
  const links = useDestinationLinks({ hasLiveEntry: true });
  const active = activeDest(loc.pathname);
  const settingsActive = loc.pathname.startsWith("/settings");
  const pageTitle = usePageTitleValue();
  const { hidden, atTop } = useHideOnScroll(72);
  const { hasBack, goBack } = useBack();

  // Shortcut to the live tournament, shown only while one is running. When on
  // its page, this entry owns the active state (not "Tournaments").
  const liveT = useLiveTournament().data ?? null;
  const onLivePage =
    !!liveT && (loc.pathname === `/live/${liveT.id}` || loc.pathname.startsWith(`/live/${liveT.id}/`));

  // The current page title: page-registered title wins, else the nav label, else brand.
  const title = pageTitle ?? active?.label ?? "Lorbeerkranz";

  // Lock body scroll + close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return (
    <>
      {/* Auto-hiding top bar — slides up on scroll-down, back down on scroll-up.
          Opaque since Q12: `nav-shell` no longer thins itself for a blur, so the
          `backdrop-blur-md` that used to sit here is gone with it — a blur behind
          an opaque surface is a compositing layer that costs a phone something and
          shows nothing. What tells you the page continues under the bar is the
          hairline plus `shadow-pop`, which appears the moment you leave the top. */}
      <header
        id="app-top-nav"
        className={
          "sticky top-0 z-30 nav-shell pt-safe-t transition-transform duration-300 ease-out-expo lg:hidden " +
          (hidden && !open ? "-translate-y-full" : "translate-y-0") +
          (atTop ? "" : " shadow-pop")
        }
      >
        {/* One row, three boxes, and the two side boxes are the same fixed width —
            that is the whole frame (Q13). `top-bar-side` (84px, in the Tailwind
            config) is the widest either side ever needs — the left cluster, menu
            40 + gap 4 + back 40 — so the menu sits at the screen edge on every
            page and the chevron appears *inboard* of it in space that was
            reserved anyway. The centre box therefore starts at 12+84+8 and is
            `100% − 208px` wide, i.e. its centre is the screen's centre at every
            width, in every state: the title never moves between pages, with back
            or without it, with the bell or without it.

            The chevron still does not *replace* the hamburger (Q6): on a page you
            went into, both are there, so a phone can still reach Clubs, Ideas and
            Settings without leaving first. It is drawn from one question,
            `useBack().hasBack`, asked for every route including the stats matchup.
            Q13 only moved it: Q6 put back at the edge, and it pushed the menu — and
            the title — a different distance on every page. */}
        <div className="flex h-14 items-center gap-2 px-3">
          <div className="flex w-top-bar-side shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            {hasBack ? (
              <Button
                type="button"
                variant="ghost"
                onClick={goBack}
                aria-label="Back"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <span
            data-testid="top-bar-title"
            className="min-w-0 flex-1 truncate text-center text-base font-semibold tracking-tight"
          >
            {title}
          </span>
          {/* The same 84px on the right, holding one control at a time: the bell,
              or the connection marker while the socket is in trouble. */}
          <div className="flex w-top-bar-side shrink-0 items-center justify-end">
            <TopBarStatus />
          </div>
        </div>
      </header>

      {/* Drawer */}
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              variants={scrim}
              initial="hidden"
              animate="show"
              exit="exit"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            />
            <motion.aside
              variants={drawerLeft}
              initial="hidden"
              animate="show"
              exit="exit"
              className="absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col border-r border-border-card-chip/40 bg-bg-card-outer pb-safe-b pl-safe-l pt-safe-t shadow-pop"
            >
              <div className="flex h-14 items-center justify-between gap-2 px-4">
                <span className="inline-flex items-center gap-2.5">
                  <img src="/icon-512.png" alt="" className="h-8 w-8 shrink-0 rounded-xl object-cover ring-1 ring-border-card-chip/40" />
                  <span className="text-sm font-semibold tracking-tight">Lorbeerkranz</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-9 w-9 items-center justify-center p-0"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>

              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
                {liveT ? (
                  <Link
                    to={`/live/${liveT.id}`}
                    state={NAV_JUMP_STATE}
                    onClick={() => setOpen(false)}
                    aria-current={onLivePage ? "page" : undefined}
                    className={
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-base transition focus-ring " +
                      (onLivePage
                        ? "bg-bg-card-chip/60 text-text-normal font-medium"
                        : "text-text-muted hover:bg-hover-default/40 hover:text-text-normal")
                    }
                  >
                    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                      <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full live-ping opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full live-dot" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">Live now</span>
                    <span className="max-w-[45%] truncate text-xs text-text-muted">{liveT.name}</span>
                  </Link>
                ) : null}
                {links.map(({ dest: d, to, isActive, state }) => {
                  const Icon = d.icon;
                  return (
                    <Link
                      key={d.key}
                      to={to}
                      state={state}
                      onClick={() => setOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-base transition focus-ring " +
                        (isActive
                          ? "bg-bg-card-chip/60 text-text-normal font-medium"
                          : "text-text-muted hover:bg-hover-default/40 hover:text-text-normal")
                      }
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{d.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto border-t border-border-card-chip/40 px-3 pb-4 pt-3">
                <Link
                  to="/settings"
                  state={NAV_JUMP_STATE}
                  onClick={() => setOpen(false)}
                  aria-current={settingsActive ? "page" : undefined}
                  className={
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-base transition focus-ring " +
                    (settingsActive
                      ? "bg-bg-card-chip/60 text-text-normal font-medium"
                      : "text-text-muted hover:bg-hover-default/40 hover:text-text-normal")
                  }
                >
                  <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>Settings</span>
                </Link>
              </div>
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
