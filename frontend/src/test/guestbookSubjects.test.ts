import { describe, expect, it } from "vitest";

import {
  SUBJECT_EXCERPT_MAX,
  SUBJECT_ICON,
  SUBJECT_KINDS,
  SUBJECT_LABEL,
  SUBJECT_LABEL_EARLIER,
  SUBJECT_NOUN,
  countCurrentSubjectEntries,
  subjectCitationLabel,
  subjectCitationTitle,
  subjectExcerpt,
  subjectTriggerLabel,
  subjectTriggerTitle,
} from "../pages/profile/guestbookSubjects";
import type { GuestbookSubjectKind, PlayerGuestbookEntry, PlayerGuestbookSubject } from "../api/types";

function subject(partial: Partial<PlayerGuestbookSubject> & { kind: GuestbookSubjectKind }): PlayerGuestbookSubject {
  return {
    kind: partial.kind,
    snapshot_id: partial.snapshot_id ?? 1,
    captured_at: partial.captured_at ?? "2026-09-19T10:00:00",
    text: partial.text ?? "",
    has_image: partial.has_image ?? true,
    current: partial.current ?? true,
  };
}

function entry(partial: Partial<PlayerGuestbookEntry> & { id: number }): PlayerGuestbookEntry {
  return {
    id: partial.id,
    profile_player_id: partial.profile_player_id ?? 1,
    author_player_id: partial.author_player_id ?? 2,
    author_display_name: partial.author_display_name ?? "Berni",
    parent_entry_id: partial.parent_entry_id ?? null,
    body: partial.body ?? "nice",
    created_at: partial.created_at ?? "2026-09-19T10:00:00",
    updated_at: partial.updated_at ?? "2026-09-19T10:00:00",
    upvotes: partial.upvotes ?? 0,
    downvotes: partial.downvotes ?? 0,
    my_vote: partial.my_vote ?? 0,
    can_edit: partial.can_edit ?? false,
    subject: partial.subject ?? null,
  };
}

describe("the subject vocabulary", () => {
  it("has one word, one earlier word, one glyph and one noun per kind — no key without all four", () => {
    expect(SUBJECT_KINDS).toEqual(["header_image", "about", "avatar"]);
    for (const table of [SUBJECT_LABEL, SUBJECT_LABEL_EARLIER, SUBJECT_ICON, SUBJECT_NOUN]) {
      expect(Object.keys(table).sort()).toEqual([...SUBJECT_KINDS].sort());
    }
  });

  it("names the subject while it is current and says 'Earlier …' once it has changed", () => {
    expect(subjectCitationLabel(subject({ kind: "header_image", current: true }))).toBe("Header image");
    expect(subjectCitationLabel(subject({ kind: "header_image", current: false }))).toBe("Earlier header image");
    expect(subjectCitationLabel(subject({ kind: "about", current: false }))).toBe("Earlier About text");
    expect(subjectCitationLabel(subject({ kind: "avatar", current: false }))).toBe("Earlier avatar");
  });

  it("promises the snapshot, not the live item — the text for About, the image for the two pictures", () => {
    expect(subjectCitationTitle(subject({ kind: "about" }))).toBe("Show the text this is about");
    expect(subjectCitationTitle(subject({ kind: "header_image" }))).toBe("Show the image this is about");
    expect(subjectCitationTitle(subject({ kind: "avatar" }))).toBe("Show the image this is about");
  });

  it("quotes an About text as words, not as someone's layout", () => {
    expect(subjectExcerpt("  Ich bin der Roli.\n\n  Seit 2004 dabei.  ")).toBe("Ich bin der Roli. Seit 2004 dabei.");
    expect(subjectExcerpt("")).toBe("");
  });

  it("cuts a long excerpt at a word boundary and closes it with the app's ellipsis", () => {
    const long = "wort ".repeat(60).trim();
    const cut = subjectExcerpt(long);
    expect(cut.length).toBeLessThanOrEqual(SUBJECT_EXCERPT_MAX + 1);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.includes("...")).toBe(false);
    // A boundary, never mid-word.
    expect(cut.slice(0, -1).endsWith("wort")).toBe(true);
  });

  it("takes the cap itself when one word is longer than the whole excerpt", () => {
    const cut = subjectExcerpt("a".repeat(400), 20);
    expect(cut).toBe("a".repeat(20) + "…");
  });

  it("invites at zero and counts from one", () => {
    expect(subjectTriggerLabel(0)).toBe("Comment");
    expect(subjectTriggerLabel(1)).toBe("1 comment");
    expect(subjectTriggerLabel(3)).toBe("3 comments");
    expect(subjectTriggerTitle("header_image", 0)).toBe("Comment on the header image");
    expect(subjectTriggerTitle("about", 1)).toBe("1 comment on the About text");
    expect(subjectTriggerTitle("avatar", 2)).toBe("2 comments on the avatar");
  });
});

describe("countCurrentSubjectEntries", () => {
  it("counts roots about the version on the profile now, per kind", () => {
    const counts = countCurrentSubjectEntries([
      entry({ id: 1, subject: subject({ kind: "header_image" }) }),
      entry({ id: 2, subject: subject({ kind: "header_image" }) }),
      entry({ id: 3, subject: subject({ kind: "avatar" }) }),
    ]);
    expect(counts).toEqual({ header_image: 2, about: 0, avatar: 1 });
  });

  it("ignores replies, subjects that are no longer current, and untagged entries", () => {
    const counts = countCurrentSubjectEntries([
      entry({ id: 1, parent_entry_id: 9, subject: subject({ kind: "about" }) }),
      entry({ id: 2, subject: subject({ kind: "about", current: false }) }),
      entry({ id: 3 }),
      entry({ id: 4, subject: subject({ kind: "about" }) }),
    ]);
    expect(counts).toEqual({ header_image: 0, about: 1, avatar: 0 });
  });

  it("is all zeroes for an empty feed", () => {
    expect(countCurrentSubjectEntries([])).toEqual({ header_image: 0, about: 0, avatar: 0 });
  });
});
