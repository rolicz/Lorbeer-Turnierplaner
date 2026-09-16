/**
 * Lets a page publish its title to the mobile top bar (so the title shows once,
 * in the bar, instead of duplicated below): the context object and the two hooks
 * that read it. Static pages fall back to the nav label; dynamic pages (live
 * tournament, match, profile) register a title here.
 *
 * The provider is in `PageTitleProvider.tsx`. A context and a component in one
 * module is the shape React Fast Refresh cannot update safely (Q10) — see
 * `auth/AuthContext.ts`.
 */
import { createContext, useContext, useEffect } from "react";

export type PageTitleCtxValue = { title: string | null; setTitle: (t: string | null) => void };

export const PageTitleContext = createContext<PageTitleCtxValue | null>(null);

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
