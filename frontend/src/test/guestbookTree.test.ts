import { describe, it, expect } from "vitest";
import {
  buildGuestbookTree,
  countUnreadRepliesByEntry,
  latestUnreadGuestbookId,
  summarizeUnreadGuestbookAuthors,
  countUnreadGuestbookAuthors,
} from "../pages/profile/guestbookTree";
import type { PlayerGuestbookEntry } from "../api/types";

function entry(partial: Partial<PlayerGuestbookEntry> & { id: number }): PlayerGuestbookEntry {
  return {
    id: partial.id,
    profile_player_id: partial.profile_player_id ?? 1,
    author_player_id: partial.author_player_id ?? 2,
    author_display_name: partial.author_display_name ?? "Alice",
    parent_entry_id: partial.parent_entry_id ?? null,
    body: partial.body ?? "hi",
    created_at: partial.created_at ?? "2024-01-01T00:00:00",
    updated_at: partial.updated_at ?? "2024-01-01T00:00:00",
    upvotes: partial.upvotes ?? 0,
    downvotes: partial.downvotes ?? 0,
    my_vote: partial.my_vote ?? 0,
  };
}

describe("buildGuestbookTree", () => {
  it("separates roots from children and sorts roots newest-first", () => {
    const rows = [
      entry({ id: 1, created_at: "2024-01-01T10:00:00" }),
      entry({ id: 2, created_at: "2024-01-02T10:00:00" }),
      entry({ id: 3, parent_entry_id: 1, created_at: "2024-01-01T11:00:00" }),
    ];
    const tree = buildGuestbookTree(rows);
    expect(tree.roots.map((r) => r.id)).toEqual([2, 1]); // newest first
    expect(tree.childrenByParent.get(1)?.map((r) => r.id)).toEqual([3]);
    expect(tree.childrenByParent.has(2)).toBe(false);
  });

  it("treats entries with missing parents as roots", () => {
    const rows = [entry({ id: 5, parent_entry_id: 999 })];
    const tree = buildGuestbookTree(rows);
    expect(tree.roots.map((r) => r.id)).toEqual([5]);
  });

  it("sorts replies oldest-first", () => {
    const rows = [
      entry({ id: 1 }),
      entry({ id: 3, parent_entry_id: 1, created_at: "2024-01-03T00:00:00" }),
      entry({ id: 2, parent_entry_id: 1, created_at: "2024-01-02T00:00:00" }),
    ];
    const tree = buildGuestbookTree(rows);
    expect(tree.childrenByParent.get(1)?.map((r) => r.id)).toEqual([2, 3]);
  });
});

describe("countUnreadRepliesByEntry", () => {
  it("counts unread descendants recursively", () => {
    const rows = [
      entry({ id: 1 }),
      entry({ id: 2, parent_entry_id: 1 }),
      entry({ id: 3, parent_entry_id: 2 }),
    ];
    const tree = buildGuestbookTree(rows);
    const unread = new Set([2, 3]);
    const counts = countUnreadRepliesByEntry(tree, (id) => unread.has(id));
    expect(counts.get(1)).toBe(2); // both descendants unread
    expect(counts.get(2)).toBe(1); // one descendant unread
    expect(counts.get(3)).toBe(0);
  });

  it("returns 0 for all entries when none are unread", () => {
    const rows = [entry({ id: 1 }), entry({ id: 2, parent_entry_id: 1 })];
    const tree = buildGuestbookTree(rows);
    const counts = countUnreadRepliesByEntry(tree, () => false);
    expect(counts.get(1)).toBe(0);
  });
});

describe("latestUnreadGuestbookId", () => {
  it("returns the newest unread id", () => {
    const rows = [
      entry({ id: 1, created_at: "2024-01-01T00:00:00" }),
      entry({ id: 2, created_at: "2024-01-05T00:00:00" }),
      entry({ id: 3, created_at: "2024-01-03T00:00:00" }),
    ];
    const unread = new Set([1, 3]);
    expect(latestUnreadGuestbookId(rows, (id) => unread.has(id))).toBe(3);
  });

  it("returns null when nothing is unread", () => {
    const rows = [entry({ id: 1 })];
    expect(latestUnreadGuestbookId(rows, () => false)).toBeNull();
  });
});

describe("summarizeUnreadGuestbookAuthors", () => {
  it("summarizes author counts", () => {
    const rows = [
      entry({ id: 1, author_player_id: 2, author_display_name: "Alice" }),
      entry({ id: 2, author_player_id: 2, author_display_name: "Alice" }),
      entry({ id: 3, author_player_id: 3, author_display_name: "Bob" }),
    ];
    const result = summarizeUnreadGuestbookAuthors(rows, () => true);
    expect(result).toBe("Alice x2, Bob x1");
  });

  it("adds +N when authors exceed the limit", () => {
    const rows = [1, 2, 3, 4, 5].map((id) =>
      entry({ id, author_player_id: id, author_display_name: `P${id}` })
    );
    const result = summarizeUnreadGuestbookAuthors(rows, () => true, 4);
    expect(result).toContain("+1");
  });

  it("returns empty string when nothing unread", () => {
    expect(summarizeUnreadGuestbookAuthors([entry({ id: 1 })], () => false)).toBe("");
  });
});

describe("countUnreadGuestbookAuthors", () => {
  it("counts distinct unread authors", () => {
    const rows = [
      entry({ id: 1, author_player_id: 2 }),
      entry({ id: 2, author_player_id: 2 }),
      entry({ id: 3, author_player_id: 3 }),
    ];
    expect(countUnreadGuestbookAuthors(rows, () => true)).toBe(2);
  });
});
