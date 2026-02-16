/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";

export type SubNavItem = {
  key: string;
  label: string;
  icon?: string;
  title?: string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  activeClassName?: string;
  disabled?: boolean;
  iconOnly?: boolean;
  iconOnlyMobile?: boolean;
};

type SubNavCtx = {
  items: SubNavItem[];
  setItems: (items: SubNavItem[]) => void;
};

const SubNavContext = createContext<SubNavCtx | null>(null);

export function SubNavProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<SubNavItem[]>([]);
  const value = useMemo<SubNavCtx>(() => ({ items, setItems }), [items]);
  return <SubNavContext.Provider value={value}>{children}</SubNavContext.Provider>;
}

export function useSubNavContext() {
  const ctx = useContext(SubNavContext);
  if (!ctx) throw new Error("useSubNavContext must be used within SubNavProvider");
  return ctx;
}

export function usePageSubNav(items: SubNavItem[]) {
  const { setItems } = useSubNavContext();
  useLayoutEffect(() => {
    setItems(items);
  }, [items, setItems]);
}
