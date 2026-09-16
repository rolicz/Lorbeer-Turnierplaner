/**
 * App-wide theme state: the context object and the hook that reads it. The
 * provider (mounted once in AppShell) keeps applying the theme to
 * <html data-theme> on every route, while the picker lives on the Settings page
 * and consumes this via useTheme().
 *
 * The provider is in `ThemeProvider.tsx`. A context and a component in one
 * module is the shape React Fast Refresh cannot update safely (Q10) — see
 * `auth/AuthContext.ts`.
 */
import { createContext, useContext } from "react";

import type { ThemeName } from "./useThemeManager";

export type ThemeCtxValue = { theme: ThemeName; setTheme: (t: ThemeName) => void };

export const ThemeCtx = createContext<ThemeCtxValue | null>(null);

export function useTheme(): ThemeCtxValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
