/**
 * Holds the page title the mobile top bar renders — the component half of
 * `PageTitleContext.ts`, on its own so Fast Refresh can update it in place (Q10).
 */
import { useState, type ReactNode } from "react";

import { PageTitleContext } from "./PageTitleContext";

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}
