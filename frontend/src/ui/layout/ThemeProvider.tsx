/**
 * The theme provider component — the component half of `ThemeContext.ts`, on its
 * own so Fast Refresh can update it in place (Q10).
 */
import type { ReactNode } from "react";

import { ThemeCtx } from "./ThemeContext";
import { useThemeManager } from "./useThemeManager";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeManager();
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
