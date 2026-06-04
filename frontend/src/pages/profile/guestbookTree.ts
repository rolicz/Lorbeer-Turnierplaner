/** Pure guestbook tree-building and unread-metric helpers (unit-tested). */
import type { PlayerGuestbookEntry } from "../../api/types";

export type GuestbookTree = {
  roots: PlayerGuestbookEntry[];
  childrenByParent: Map<number, PlayerGuestbookEntry[]>;
};

function createdTs(entry: PlayerGuestbookEntry): number {
  const t = Date.parse(entry.created_at);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Build a parent→children tree from a flat list of guestbook entries.
 * Roots are sorted newest-first; replies oldest-first.
 */
export function buildGuestbookTree(rows: PlayerGuestbookEntry[]): GuestbookTree {
  const byId = new Map<number, PlayerGuestbookEntry>();
  for (const row of rows) byId.set(row.id, row);

  const childrenByParent = new Map<number, PlayerGuestbookEntry[]>();
  const roots: PlayerGuestbookEntry[] = [];

  for (const row of rows) {
    const parentId = row.parent_entry_id;
    if (parentId != null && byId.has(parentId)) {
      const list = childrenByParent.get(parentId);
      if (list) list.push(row);
      else childrenByParent.set(parentId, [row]);
    } else {
      roots.push(row);
    }
  }

  const asc = (a: PlayerGuestbookEntry, b: PlayerGuestbookEntry) => {
    const ta = createdTs(a);
    const tb = createdTs(b);
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  };
  const desc = (a: PlayerGuestbookEntry, b: PlayerGuestbookEntry) => asc(b, a);

  roots.sort(desc);
  for (const list of childrenByParent.values()) list.sort(asc);

  return { roots, childrenByParent };
}

/**
 * For each entry, count the number of unread descendants (replies, recursively).
 * `isUnread` is called with each entry id.
 */
export function countUnreadRepliesByEntry(
  tree: GuestbookTree,
  isUnread: (id: number) => boolean
): Map<number, number> {
  const out = new Map<number, number>();
  const walk = (entryId: number): number => {
    const children = tree.childrenByParent.get(entryId) ?? [];
    let total = 0;
    for (const child of children) {
      if (isUnread(child.id)) total += 1;
      total += walk(child.id);
    }
    out.set(entryId, total);
    return total;
  };
  for (const root of tree.roots) walk(root.id);
  return out;
}

/** Most recent unread entry id (ties broken by higher id), or null. */
export function latestUnreadGuestbookId(
  rows: PlayerGuestbookEntry[],
  isUnread: (id: number) => boolean
): number | null {
  let bestId: number | null = null;
  let bestTs = -1;
  for (const row of rows) {
    if (!isUnread(row.id)) continue;
    const ts = createdTs(row);
    if (bestId == null || ts > bestTs || (ts === bestTs && row.id > bestId)) {
      bestId = row.id;
      bestTs = ts;
    }
  }
  return bestId;
}

/** "Alice x2, Bob x1 +3" summary of unread entry authors (top `limit`). */
export function summarizeUnreadGuestbookAuthors(
  rows: PlayerGuestbookEntry[],
  isUnread: (id: number) => boolean,
  limit = 4
): string {
  const unread = rows.filter((row) => isUnread(row.id));
  if (!unread.length) return "";
  const byAuthor = new Map<number, { name: string; count: number }>();
  for (const row of unread) {
    const authorId = Number(row.author_player_id);
    const prev = byAuthor.get(authorId);
    if (prev) prev.count += 1;
    else byAuthor.set(authorId, { name: row.author_display_name || `Player #${authorId}`, count: 1 });
  }
  const top = Array.from(byAuthor.values()).slice(0, limit);
  const parts = top.map((x) => `${x.name} x${x.count}`);
  const rest = byAuthor.size - top.length;
  return rest > 0 ? `${parts.join(", ")} +${rest}` : parts.join(", ");
}

/** Number of distinct authors among unread entries. */
export function countUnreadGuestbookAuthors(
  rows: PlayerGuestbookEntry[],
  isUnread: (id: number) => boolean
): number {
  const unread = rows.filter((row) => isUnread(row.id));
  if (!unread.length) return 0;
  return new Set(unread.map((row) => Number(row.author_player_id))).size;
}
