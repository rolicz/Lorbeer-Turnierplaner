import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";

import type { Club } from "../api/types";
import type { FriendlyMatchResponse } from "../api/friendlies.api";
import FriendlyList, { groupFriendliesByDate } from "../pages/tools/FriendlyList";

const CLUBS: Club[] = [
  {
    id: 1,
    name: "Bayern München",
    game: "EA FC 26",
    star_rating: 5,
    league_id: 3,
    league_name: "Bundesliga",
    league_nation: "de",
    crest_updated_at: null,
  },
  {
    id: 2,
    name: "Heart of Midlothian F.C.",
    game: "EA FC 26",
    star_rating: 3.5,
    league_id: 11,
    league_name: "Scottish Premiership",
    league_nation: "gb-sct",
    crest_updated_at: null,
  },
];

function makeFriendly(
  id: number,
  date: string,
  goals: [number, number],
  names: [string[], string[]] = [["Roli"], ["Flo"]],
  opts: { canEdit?: boolean; createdAt?: string; clubs?: [number | null, number | null] } = {},
): FriendlyMatchResponse {
  const [aClub, bClub] = opts.clubs ?? [1, 2];
  return {
    id,
    mode: names[0].length > 1 ? "2v2" : "1v1",
    state: "finished",
    date,
    created_at: opts.createdAt ?? `${date}T12:00:00`,
    updated_at: opts.createdAt ?? `${date}T12:00:00`,
    sides: [
      {
        id: id * 10,
        side: "A",
        club_id: aClub,
        goals: goals[0],
        players: names[0].map((n, i) => ({ id: i + 1, display_name: n })),
      },
      {
        id: id * 10 + 1,
        side: "B",
        club_id: bClub,
        goals: goals[1],
        players: names[1].map((n, i) => ({ id: i + 11, display_name: n })),
      },
    ],
    can_edit: opts.canEdit ?? true,
    can_delete: opts.canEdit ?? true,
  } as FriendlyMatchResponse;
}

function renderList(rows: FriendlyMatchResponse[], extra: Partial<Parameters<typeof FriendlyList>[0]> = {}) {
  const onToggleRow = vi.fn();
  const utils = render(
    <FriendlyList
      groups={groupFriendliesByDate(rows)}
      clubs={CLUBS}
      showMeta
      expandedId={null}
      canEditRow={(f) => !!f.can_edit}
      onToggleRow={onToggleRow}
      renderEditor={() => <div data-testid="editor">editor</div>}
      {...extra}
    />,
  );
  return { ...utils, onToggleRow };
}

describe("groupFriendliesByDate", () => {
  it("groups by day, newest day first, newest entry first inside a day", () => {
    const groups = groupFriendliesByDate([
      makeFriendly(1, "2026-08-21", [1, 0], [["Roli"], ["Flo"]], { createdAt: "2026-08-21T10:00:00" }),
      makeFriendly(2, "2026-09-15", [2, 0]),
      makeFriendly(3, "2026-08-21", [3, 0], [["Roli"], ["Flo"]], { createdAt: "2026-08-21T20:00:00" }),
    ]);
    expect(groups.map((g) => g.dateKey)).toEqual(["2026-09-15", "2026-08-21"]);
    expect(groups[1].rows.map((r) => r.id)).toEqual([3, 1]);
  });
});

describe("FriendlyList (Q7)", () => {
  it("titles a group with its date and count, never with the page's own name", () => {
    const { getByRole, queryByText } = renderList([makeFriendly(1, "2026-08-28", [9, 1])]);
    const heading = getByRole("heading", { level: 2 });
    expect(heading.textContent).toMatch(/2026/);
    expect(heading.textContent).not.toMatch(/Friendlies/);
    // The count trails the section rule; the date is not demoted to a chip under a title.
    expect(queryByText("1 match")).not.toBeNull();
  });

  it("gives every score the same fixed numeral track, sized by the whole list", () => {
    const { container } = render(
      <FriendlyList
        groups={groupFriendliesByDate([
          makeFriendly(1, "2026-09-15", [12, 3]),
          makeFriendly(2, "2026-08-21", [2, 1]),
        ])}
        clubs={CLUBS}
        showMeta={false}
        expandedId={null}
        canEditRow={() => true}
        onToggleRow={() => {}}
        renderEditor={() => null}
      />,
    );
    // `RecordNum` writes the pad as a custom property: two digits everywhere, even in
    // the group whose own widest score is one digit (T14's mechanism, one list = one width).
    const pads = [...container.querySelectorAll<HTMLElement>(".record-num")].map((el) =>
      el.style.getPropertyValue("--record-pad"),
    );
    expect(pads.length).toBe(4);
    expect(new Set(pads)).toEqual(new Set(['"00"']));
  });

  it("makes the row itself the only control, and nothing nests inside it", () => {
    const { container } = renderList([makeFriendly(1, "2026-08-28", [9, 1])]);
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].className).toContain("absolute inset-0");
    expect(buttons[0]).toHaveAccessibleName("Open friendly: Roli 9–1 Flo");
    // No control inside the row's hit area, and no link inside a link.
    expect(buttons[0].querySelectorAll("button, a")).toHaveLength(0);
    expect(container.querySelectorAll("a a")).toHaveLength(0);
  });

  it("does not make a row a button when the caller cannot edit it", () => {
    const { container } = renderList([
      makeFriendly(1, "2026-08-28", [9, 1], [["Roli"], ["Flo"]], { canEdit: false }),
    ]);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("reports the tap so the page can open that friendly's editor", () => {
    const { container, onToggleRow } = renderList([makeFriendly(7, "2026-08-28", [9, 1])]);
    fireEvent.click(container.querySelector("button")!);
    expect(onToggleRow).toHaveBeenCalledWith(7);
  });

  it("renders the editor under the row, outside the row's own hit area", () => {
    const { container, getByTestId } = renderList([makeFriendly(1, "2026-08-28", [9, 1])], { expandedId: 1 });
    const editor = getByTestId("editor");
    const row = container.querySelector(".list-divided")!.firstElementChild!;
    expect(row.firstElementChild?.contains(editor)).toBe(false);
    expect(row.lastElementChild?.contains(editor)).toBe(true);
  });

  // --- Q8: the club beside the result ----------------------------------------

  /** The three grid cells of a row's score line: left names, numerals, right names. */
  function scoreCells(container: HTMLElement) {
    const grid = container.querySelector("[data-score-line]")!.firstElementChild!;
    const [left, numerals, right] = [...grid.children] as HTMLElement[];
    return { left, numerals, right };
  }

  it("puts each side's club symbol beside its own names in Compact", () => {
    const { container } = renderList([makeFriendly(1, "2026-08-28", [9, 1])], { showMeta: false });
    const { left, numerals, right } = scoreCells(container);

    // Left side: symbol first, then the names — which still hug the score.
    expect(left.firstElementChild).toHaveTextContent("BM");
    expect(left.lastElementChild).toHaveTextContent("Roli");
    // Right side mirrors it: names, then the symbol on the outer edge.
    expect(right.firstElementChild).toHaveTextContent("Flo");
    expect(right.lastElementChild).toHaveTextContent("HO");
    // And nothing entered the numeral track — that column may not move (Q7).
    expect(numerals.textContent?.replace(/\s/g, "")).toBe("91");
    expect(numerals.querySelectorAll("img")).toHaveLength(0);
  });

  it("names the club for screen readers, because in Compact the symbol is the whole statement", () => {
    const { container, getByText } = renderList([makeFriendly(1, "2026-08-28", [9, 1])], { showMeta: false });
    expect(getByText("Bayern München").className).toContain("sr-only");
    expect(getByText("Heart of Midlothian F.C.").className).toContain("sr-only");
    expect(scoreCells(container).left.firstElementChild).toContainElement(getByText("Bayern München"));
  });

  it("keeps the slot when a side has no club, so every row keeps the same shape", () => {
    const { container } = renderList(
      [makeFriendly(1, "2026-08-28", [0, 0], [["Roli"], ["Flo"]], { clubs: [null, 2] })],
      { showMeta: false },
    );
    const { left, right } = scoreCells(container);
    // An inert box of the badge's own size, no symbol and no words.
    expect(left.firstElementChild).toHaveTextContent("");
    expect(left.firstElementChild?.className).toContain("h-4 w-4");
    expect(left.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(left.children).toHaveLength(2);
    expect(right.children).toHaveLength(2);
    expect(right.lastElementChild).toHaveTextContent("HO");
  });

  it("gives Details no second symbol — its club line already carries one", () => {
    const { container } = renderList([makeFriendly(1, "2026-08-28", [9, 1])]);
    const { left, right } = scoreCells(container);
    // The score line's name cells are the bare name blocks again.
    expect(left.textContent).toBe("Roli");
    expect(right.textContent).toBe("Flo");
    // Exactly one symbol per side on the row, and it belongs to `MatchSides`.
    const monograms = [...container.querySelectorAll("span")].filter((el) => /^(BM|HO)$/.test(el.textContent ?? ""));
    expect(monograms).toHaveLength(2);
  });

  it("prints the club rating as one token instead of five glyphs", () => {
    const { container } = renderList([makeFriendly(1, "2026-08-28", [9, 1])]);
    const ratings = [...container.querySelectorAll('[role="img"]')].filter((el) =>
      (el.getAttribute("aria-label") ?? "").includes("out of 5 stars"),
    );
    expect(ratings).toHaveLength(2);
    expect(ratings.map((el) => el.textContent)).toEqual(["5", "3.5"]);
    expect(within(ratings[0] as HTMLElement).queryAllByRole("img")).toHaveLength(0);
  });
});
