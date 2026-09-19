/**
 * The subject vocabulary in the browser (K2): the three kinds a guestbook entry can be
 * about — the header image, the About text or the avatar — with their words, their glyphs
 * and the two counts the feed and the items need.
 *
 * One module, because two surfaces speak it: the feed's chip on an entry
 * (`GuestbookEntryCard`) and the "comment on this" trigger on the item itself
 * (`SubjectCommentTrigger`, K3). A second copy of "Header image" is how a chip and a
 * button come to disagree about what the reader is looking at.
 *
 * Pure: no React, no network, no query keys — the labels and the two small folds only.
 * Whether a subject is still what the profile shows is `subject.current`, computed
 * server-side by `services/guestbook_subjects.py::subjects_for_entries` and rendered
 * here, never re-derived (the A10 rule).
 */
import { AlignLeft, CircleUserRound, ImageIcon, type LucideIcon } from "lucide-react";

import type { GuestbookSubjectKind, PlayerGuestbookEntry, PlayerGuestbookSubject } from "../../api/types";
import { fmtCount } from "../../utils/format";

export const SUBJECT_KINDS = ["header_image", "about", "avatar"] as const satisfies readonly GuestbookSubjectKind[];

/** The chip's word while the subject is still what the profile shows. */
export const SUBJECT_LABEL: Record<GuestbookSubjectKind, string> = {
  header_image: "Header image",
  about: "About text",
  avatar: "Avatar",
};

/** …and once it has changed — a word in the chip, never only a glyph (M8). */
export const SUBJECT_LABEL_EARLIER: Record<GuestbookSubjectKind, string> = {
  header_image: "Earlier header image",
  about: "Earlier About text",
  avatar: "Earlier avatar",
};

export const SUBJECT_ICON: Record<GuestbookSubjectKind, LucideIcon> = {
  header_image: ImageIcon,
  about: AlignLeft,
  avatar: CircleUserRound,
};

/** What the trigger on an item is about, for its title: "Comment on the header image". */
export const SUBJECT_NOUN: Record<GuestbookSubjectKind, string> = {
  header_image: "the header image",
  about: "the About text",
  avatar: "the avatar",
};

/** The chip's word: what the entry was about *then*, which is what the pin is for. */
export function subjectChipLabel(s: PlayerGuestbookSubject): string {
  return s.current ? SUBJECT_LABEL[s.kind] : SUBJECT_LABEL_EARLIER[s.kind];
}

/** The chip always opens the snapshot — the lightbox for an image, a modal for the text. */
export function subjectChipTitle(s: PlayerGuestbookSubject): string {
  return s.kind === "about" ? "Show the text this is about" : "Show the image this is about";
}

/** The trigger's own word: a count once there is one, the invitation while there is none. */
export function subjectTriggerLabel(count: number): string {
  return count > 0 ? fmtCount(count, "comment", "comments") : "Comment";
}

export function subjectTriggerTitle(kind: GuestbookSubjectKind, count: number): string {
  const noun = SUBJECT_NOUN[kind];
  return count > 0 ? `${fmtCount(count, "comment", "comments")} on ${noun}` : `Comment on ${noun}`;
}

/**
 * Roots with a subject that is **still current**, per kind — what the item's trigger shows.
 * Replies never count (a reply's subject is its root's, and it carries none of its own), and
 * an entry about an earlier version is not about the picture hanging there now.
 */
export function countCurrentSubjectEntries(rows: PlayerGuestbookEntry[]): Record<GuestbookSubjectKind, number> {
  const counts: Record<GuestbookSubjectKind, number> = { header_image: 0, about: 0, avatar: 0 };
  for (const row of rows) {
    if (row.parent_entry_id != null) continue;
    const subject = row.subject;
    if (!subject || !subject.current) continue;
    if (!(subject.kind in counts)) continue;
    counts[subject.kind] += 1;
  }
  return counts;
}
