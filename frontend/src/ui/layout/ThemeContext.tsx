/* eslint-disable react-refresh/only-export-components */
/**
 * App-wide theme state. The provider (mounted once in AppShell) keeps applying
 * the theme to <html data-theme> on every route, while the picker now lives on
 * the dedicated Settings page and consumes this via useTheme().
 */
import { createContext, useContext, type ReactNode } from "react";
import { useThemeManager, type ThemeName } from "./useThemeManager";

type ThemeCtxValue = { theme: ThemeName; setTheme: (t: ThemeName) => void };

const ThemeCtx = createContext<ThemeCtxValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeManager();
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeCtxValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
