import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { rememberLocation } from "./lastLocation";

/**
 * Per-destination page memory: records the current route as the last page of its
 * top-level destination on every navigation, so the nav shells can return you
 * there instead of dropping you on the destination's root.
 *
 * Mounted once in the shell, next to `useLocationRestore()`.
 */
export function useRememberLocation() {
  const location = useLocation();

  useEffect(() => {
    rememberLocation(location.pathname, location.search);
  }, [location.pathname, location.search]);
}
