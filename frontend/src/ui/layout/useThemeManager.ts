import { useEffect, useState } from "react";
import { THEMES } from "../../themes";

export type ThemeName = string;

/**
 * Theme state with localStorage persistence and application to
 * <html data-theme>. Migrates legacy theme keys (ibm→blue, football→green).
 */
export function useThemeManager() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const storedRaw = localStorage.getItem("theme");
    const stored = storedRaw === "ibm" ? "blue" : storedRaw === "football" ? "green" : storedRaw;
    if (stored && (THEMES as readonly ThemeName[]).includes(stored)) {
      return stored;
    }
    return "blue";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
}
