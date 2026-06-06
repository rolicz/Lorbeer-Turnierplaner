/* eslint-disable react-refresh/only-export-components */
/**
 * Lets a page publish its title to the mobile top bar (so the title shows once,
 * in the bar, instead of duplicated below). Static pages fall back to the nav
 * label; dynamic pages (live tournament, match, profile) register a title here.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = { title: string | null; setTitle: (t: string | null) => void };
const PageTitleContext = createContext<Ctx | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

/** Register the current page's title (cleared automatically on unmount). */
export function usePageTitle(title: string | null | undefined) {
  const ctx = useContext(PageTitleContext);
  const setTitle = ctx?.setTitle;
  useEffect(() => {
    if (!setTitle) return;
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}

export function usePageTitleValue(): string | null {
  return useContext(PageTitleContext)?.title ?? null;
}
