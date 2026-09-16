import { describe, expect, it } from "vitest";

import type { Idea, IdeaArea, IdeaKind, IdeaStatus } from "../api/types";
import {
  areaLabel,
  filterIdeas,
  ideaMatchesTab,
  ideaStatusPillClass,
  selectableAreas,
  sortIdeas,
  toggleArea,
  usedAreaKeys,
} from "../pages/ideas/ideaMeta";

const CATALOG: IdeaArea[] = [
  { key: "general", label: "Not about one page", selectable: true },
  { key: "several", label: "Several pages", selectable: true },
  { key: "dashboard", label: "Dashboard", selectable: true },
  { key: "stats", label: "Stats", selectable: true },
  // Retired: it still labels the old ideas that name it, but cannot be chosen.
  { key: "tools", label: "Tools", selectable: false },
];

let nextId = 1;
function idea(over: Partial<Idea> = {}): Idea {
  const id = over.id ?? nextId++;
  return {
    id,
    author_player_id: 1,
    author_display_name: "Roli",
    title: `Idea ${id}`,
    body: "",
    kind: "feature" as IdeaKind,
    status: "new" as IdeaStatus,
    status_note: "",
    areas: ["stats"],
    created_at: "2026-09-01T10:00:00",
    updated_at: "2026-09-01T10:00:00",
    edited_at: null,
    has_image: false,
    image_updated_at: null,
    votes: 0,
    my_vote: 0,
    can_edit: false,
    can_delete: false,
    can_set_status: false,
    ...over,
  };
}

describe("tabs", () => {
  it("counts new, planned and doing as open; done and declined as closed", () => {
    const open: IdeaStatus[] = ["new", "planned", "doing"];
    const closed: IdeaStatus[] = ["done", "declined"];
    for (const status of open) {
      expect(ideaMatchesTab(idea({ status }), "open")).toBe(true);
      expect(ideaMatchesTab(idea({ status }), "closed")).toBe(false);
    }
    for (const status of closed) {
      expect(ideaMatchesTab(idea({ status }), "open")).toBe(false);
      expect(ideaMatchesTab(idea({ status }), "closed")).toBe(true);
    }
  });

  it("shows everything under All", () => {
    const all: IdeaStatus[] = ["new", "planned", "doing", "done", "declined"];
    expect(all.every((status) => ideaMatchesTab(idea({ status }), "all"))).toBe(true);
  });
});

describe("filterIdeas", () => {
  it("combines the tab and the area filter", () => {
    const rows = [
      idea({ id: 1, status: "new", areas: ["stats"] }),
      idea({ id: 2, status: "done", areas: ["stats"] }),
      idea({ id: 3, status: "new", areas: ["dashboard", "stats"] }),
    ];
    expect(filterIdeas(rows, { tab: "open", area: null }).map((i) => i.id)).toEqual([1, 3]);
    expect(filterIdeas(rows, { tab: "open", area: "dashboard" }).map((i) => i.id)).toEqual([3]);
    expect(filterIdeas(rows, { tab: "all", area: "stats" }).map((i) => i.id)).toEqual([1, 2, 3]);
  });
});

describe("sortIdeas", () => {
  it("puts the most wanted first and breaks ties by recency", () => {
    const rows = [
      idea({ id: 1, votes: 2, created_at: "2026-09-01T10:00:00" }),
      idea({ id: 2, votes: 5, created_at: "2026-08-01T10:00:00" }),
      idea({ id: 3, votes: 2, created_at: "2026-09-05T10:00:00" }),
    ];
    expect(sortIdeas(rows, "top").map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("sorts by date alone under Newest, and never mutates its input", () => {
    const rows = [
      idea({ id: 1, votes: 9, created_at: "2026-08-01T10:00:00" }),
      idea({ id: 2, votes: 0, created_at: "2026-09-09T10:00:00" }),
    ];
    expect(sortIdeas(rows, "new").map((i) => i.id)).toEqual([2, 1]);
    expect(rows.map((i) => i.id)).toEqual([1, 2]);
  });
});

describe("areas", () => {
  it("offers only the areas some idea actually carries, in catalog order", () => {
    const rows = [idea({ areas: ["stats"] }), idea({ areas: ["dashboard", "stats"] })];
    expect(usedAreaKeys(rows, CATALOG)).toEqual(["dashboard", "stats"]);
  });

  it("keeps an area this build no longer knows, so the idea stays reachable", () => {
    const rows = [idea({ areas: ["stats"] }), idea({ areas: ["wherever"] })];
    expect(usedAreaKeys(rows, CATALOG)).toEqual(["stats", "wherever"]);
    expect(areaLabel("wherever", CATALOG)).toBe("wherever");
    expect(areaLabel("tools", CATALOG)).toBe("Tools");
  });

  it("never offers a retired area for a new idea", () => {
    expect(selectableAreas(CATALOG).map((a) => a.key)).not.toContain("tools");
  });
});

describe("toggleArea", () => {
  it("adds and removes a page", () => {
    expect(toggleArea([], "stats")).toEqual(["stats"]);
    expect(toggleArea(["stats"], "dashboard")).toEqual(["stats", "dashboard"]);
    expect(toggleArea(["stats", "dashboard"], "stats")).toEqual(["dashboard"]);
  });

  it("lets a scope answer stand alone, in both directions", () => {
    expect(toggleArea(["stats", "dashboard"], "general")).toEqual(["general"]);
    expect(toggleArea(["general"], "several")).toEqual(["several"]);
    expect(toggleArea(["general"], "stats")).toEqual(["stats"]);
    expect(toggleArea(["general"], "general")).toEqual([]);
  });
});

describe("ideaStatusPillClass", () => {
  it("uses the three status tokens and never a result or error colour", () => {
    const classes = (["new", "planned", "doing", "done", "declined"] as IdeaStatus[]).map(
      ideaStatusPillClass,
    );
    expect(classes.every((c) => c.includes("status-"))).toBe(true);
    expect(classes.some((c) => /\b(text|bg|border)-(win|draw|loss|error|warn)\b/.test(c))).toBe(false);
    // In progress reads as "happening now", the rest do not.
    expect(ideaStatusPillClass("doing")).toContain("green");
    expect(ideaStatusPillClass("new")).toContain("blue");
    expect(ideaStatusPillClass("done")).toBe(ideaStatusPillClass("declined"));
  });
});
