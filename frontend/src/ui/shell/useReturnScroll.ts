/**
 * Scroll memory for view changes that are *not* navigations.
 *
 * Tabs, stats sections and the H2H matchup all swap the page body while staying
 * on the same history entry (they rewrite query params with `replace`), so the
 * history-level restoration in `useScrollRestoration` deliberately leaves them
 * alone — and closing such a drill-in dropped the user at the top of the list
 * they had scrolled through. This hook gives every in-page view its own
 * remembered offset instead:
 *
 * ```ts
 * const { save, restore, swap } = useReturnScroll();
 * swap(currentKey, nextKey);   // leaving a view for another one
 * swap(currentKey, null);      // drilling in: remember, then start at the top
 * restore(listKey);            // the drill-in's own back button
 * ```
 *
 * Keys are caller-chosen and must be stable for a view (e.g.
 * `"/stats:h2h:players"`, `"/profiles/1?tab=matches"`) — the URL string being
 * left is not, because the param that opens a drill-in is part of it.
 * sessionStorage, so it survives a reload but not a new tab; every accessor is
 * failure-tolerant and never throws.
 */
import { useCallback, useEffect, useRef } from "react";

import { restoreWindowScroll } from "../scroll";

const KEY = "lk:return-scroll";

/** Plenty for a session; oldest entries are dropped first. */
const MAX_ENTRIES = 60;

type Offsets = Record<string, number>;

function read(): Offsets {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Offsets = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Remember `y` (default: the current offset) as where `key`'s body was left. */
export function saveReturnScroll(key: string, y = typeof window === "undefined" ? 0 : window.scrollY): void {
  if (!key) return;
  const offsets = read();
  // Re-insert so the freshest keys stay at the end of the pruning order.
  delete offsets[key];
  offsets[key] = Math.max(0, Math.round(y));
  const keys = Object.keys(offsets);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete offsets[k];
  try {
    sessionStorage.setItem(KEY, JSON.stringify(offsets));
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

/** The offset `key` was left at, or `null` when that view was never seen. */
export function readReturnScroll(key: string): number | null {
  if (!key) return null;
  const y = read()[key];
  return typeof y === "number" ? y : null;
}

/** Test seam. */
export function resetReturnScroll(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export type ReturnScroll = {
  /** Remember the current offset for `key`. */
  save: (key: string) => void;
  /** Go back to `key`'s remembered offset (top when it has none) after paint. */
  restore: (key: string) => void;
  /** Leave `from` for `to` — `null` means "this is a drill-in, start at the top". */
  swap: (from: string, to: string | null) => void;
};

export function useReturnScroll(): ReturnScroll {
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cancelRef.current?.();
      cancelRef.current = null;
    },
    [],
  );

  const save = useCallback((key: string) => saveReturnScroll(key), []);

  const restore = useCallback((key: string) => {
    cancelRef.current?.();
    cancelRef.current = restoreWindowScroll(readReturnScroll(key) ?? 0);
  }, []);

  const swap = useCallback(
    (from: string, to: string | null) => {
      save(from);
      cancelRef.current?.();
      cancelRef.current = restoreWindowScroll(to == null ? 0 : (readReturnScroll(to) ?? 0));
    },
    [save],
  );

  return { save, restore, swap };
}
