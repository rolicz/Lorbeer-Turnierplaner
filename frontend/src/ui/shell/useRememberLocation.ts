import { useEffect } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router-dom";

import { recordCrumb } from "../../diagnostics/breadcrumbs";
import { markAlive } from "../../diagnostics/lifecycle";
import { isJumpNavigation } from "./backNavigation";
import { rememberLocation } from "./lastLocation";
import { recordNavigation } from "./navStack";

/**
 * Per-destination page memory: records the current route as the last page of its
 * top-level destination on every navigation, so the nav shells can return you
 * there instead of dropping you on the destination's root. Also mirrors the
 * history stack (`navStack`) so contextual back knows what popping would land on
 * (the mirror only ever looks one entry back — Q6).
 *
 * It is also where a navigation's **arrival kind** is recorded (Q6b). This hook
 * sees the one thing back cannot reconstruct later: whether the navigation that
 * created this entry was a nav-destination jump or an ordinary drill-in. It is
 * written **only on a PUSH** — the moment the entry is born, and the only moment
 * `location.state` still belongs to that navigation. On a REPLACE or a POP it
 * passes `null`, and `navStack` keeps what the entry was born with: a `?tab=`
 * replace wipes `location.state`, and re-deriving the kind from the wiped state
 * would relabel a jump as a drill-in and re-break N1.
 *
 * It is also where the diagnostics breadcrumb trail is fed (`recordCrumb`):
 * this hook already receives the one thing a crash report cannot reconstruct --
 * the URL *and* how it arrived (PUSH/POP/REPLACE) -- on every navigation.
 *
 * Mounted once in the shell, next to `useLocationRestore()`.
 */
export function useRememberLocation() {
  const location = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    recordNavigation(
      location.pathname,
      location.search,
      navType === NavigationType.Push ? (isJumpNavigation(location.state) ? "jump" : "drill") : null,
    );
    rememberLocation(location.pathname, location.search);
    recordCrumb(`${location.pathname}${location.search}`, navType);
    // Keep the liveness marker's copy of the trail current (throttled), so a
    // death that leaves no error behind still says what led up to it.
    markAlive();
    // `location.key` changes even when the same URL is pushed twice, which is
    // exactly when the index moves without the path doing so.
  }, [location.key, location.pathname, location.search, location.state, navType]);
}
