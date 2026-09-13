import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

import { rememberLocation } from "./lastLocation";
import { recordNavigation } from "./navStack";

/**
 * Per-destination page memory: records the current route as the last page of its
 * top-level destination on every navigation, so the nav shells can return you
 * there instead of dropping you on the destination's root. Also mirrors the
 * history stack (`navStack`) so contextual back knows what popping would land on
 * — and, because the mirror is told *how* each location arrived, whether there
 * is anything in front of it to swipe forward to.
 *
 * Mounted once in the shell, next to `useLocationRestore()`.
 */
export function useRememberLocation() {
  const location = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    recordNavigation(location.pathname, location.search, navType);
    rememberLocation(location.pathname, location.search);
    // `location.key` changes even when the same URL is pushed twice, which is
    // exactly when the index moves without the path doing so.
  }, [location.key, location.pathname, location.search, navType]);
}
