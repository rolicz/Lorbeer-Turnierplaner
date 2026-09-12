import { useEffect, useRef } from "react";
import type { SetURLSearchParams } from "react-router-dom";

import type { FocusGuestbookEntry } from "./useProfileGuestbook";

/**
 * Handle the `?unread=1` deep link: once all profile data is loaded, switch to
 * the guestbook tab (where the entries are mounted) and scroll/focus the latest
 * unread entry — at most once per entry id. Lifted verbatim from ProfilePage.
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
}
