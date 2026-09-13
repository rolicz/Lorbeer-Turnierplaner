import { useEffect, useRef } from "react";
import type { SetURLSearchParams } from "react-router-dom";

import type { FocusGuestbookEntry } from "./useProfileGuestbook";

/**
 * Handle the guestbook deep links: `?unread=1` (the guestbook card's "jump to
 * unread") and `?entry=<id>` (the notification bell). Once all profile data is
 * loaded, switch to the guestbook tab (where the entries are mounted), drop the
 * deep-link param and scroll/focus the entry — at most once per entry id.
 */
export function useGuestbookUnreadJump({
  ready,
  searchParams,
  setSearchParams,
  latestUnreadGuestbookEntryId,
  focusGuestbookEntry,
}: {
  ready: boolean;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  latestUnreadGuestbookEntryId: number | null;
  focusGuestbookEntry: FocusGuestbookEntry;
}) {
  const handledRef = useRef<number | null>(null);
  useEffect(() => {
    const jumpUnread = searchParams.get("unread") === "1";
    if (!jumpUnread) {
      handledRef.current = null;
      return;
    }
    if (!latestUnreadGuestbookEntryId) return;
    if (!ready) return;
    if (handledRef.current === latestUnreadGuestbookEntryId) return;
    handledRef.current = latestUnreadGuestbookEntryId;
    // Switch to the guestbook tab (it's only mounted there) + clear the flag.
    const next = new URLSearchParams(searchParams);
    next.set("tab", "guestbook");
    next.delete("unread");
    setSearchParams(next, { replace: true });
    // focusGuestbookEntry polls for the element, so it survives the tab switch.
    focusGuestbookEntry(latestUnreadGuestbookEntryId, { blink: false, behavior: "auto" });
  }, [focusGuestbookEntry, latestUnreadGuestbookEntryId, searchParams, setSearchParams, ready]);

  // `?entry=<id>`: the notification bell links straight to one guestbook entry.
  const handledEntryRef = useRef<number | null>(null);
  useEffect(() => {
    const raw = searchParams.get("entry");
    const entryId = raw ? Number(raw) : NaN;
    if (!raw || !Number.isFinite(entryId) || entryId <= 0) {
      handledEntryRef.current = null;
      return;
    }
    if (!ready) return;
    if (handledEntryRef.current === entryId) return;
    handledEntryRef.current = entryId;
    const next = new URLSearchParams(searchParams);
    next.set("tab", "guestbook");
    next.delete("entry");
    setSearchParams(next, { replace: true });
    // Polls for the element, so it survives the tab switch; blink to point it out.
    focusGuestbookEntry(entryId, { blink: true, behavior: "smooth" });
  }, [focusGuestbookEntry, searchParams, setSearchParams, ready]);
}
