/**
 * The clubs list carries no controls but the row itself (Q15) — the rule Q7
 * settled for the friendlies list, applied to the second list that opens an
 * editor in place. These assertions are the ones that would break if someone
 * put a button back on a row, nested one inside the row's hit area, or handed a
 * viewer without edit rights an affordance that does nothing.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";

import type { Club } from "../api/types";
import ClubList, { type ClubGroup } from "../pages/clubs/ClubList";

function makeClub(id: number, name: string, stars = 5, leagueId = 3): Club {
  return {
    id,
    name,
    game: "EA FC 26",
    star_rating: stars,
    league_id: leagueId,
    league_name: "Bundesliga",
    league_nation: "de",
    crest_updated_at: null,
  };
}

const BAYERN = makeClub(1, "FC Bayern München");
const PSG = makeClub(2, "Paris Saint-Germain", 5, 7);

function groups(): ClubGroup[] {
  return [
    {
      key: "5★|0",
      label: "5★",
      rows: [
        { club: BAYERN, leagueName: "Bundesliga", leagueNation: "de" },
        { club: PSG, leagueName: "Ligue 1", leagueNation: "fr" },
      ],
    },
  ];
}

function renderList(
  opts: { canEdit?: boolean; expandedId?: number | null; onToggleRow?: (c: Club) => void } = {},
) {
  return render(
    <ClubList
      groups={groups()}
      defaultOpen
      canEdit={opts.canEdit ?? true}
      expandedId={opts.expandedId ?? null}
      onToggleRow={opts.onToggleRow ?? (() => {})}
      renderEditor={(c) => (
        <div data-testid={`editor-${c.id}`}>
          <button type="button">Delete</button>
        </div>
      )}
    />,
  );
}

/** The row element of a club: the `.row` that holds its name. */
function rowOf(container: HTMLElement, name: string): HTMLElement {
  const label = within(container).getByText(name);
  const row = label.closest(".row");
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

describe("ClubList rows (Q15)", () => {
  it("puts no control on a row but the row itself", () => {
    const { container } = renderList();
    for (const name of ["FC Bayern München", "Paris Saint-Germain"]) {
      const row = rowOf(container, name);
      const buttons = row.querySelectorAll("button");
      expect(buttons.length).toBe(1);
      // …and the one button is the stretched overlay, not a labelled action.
      expect(buttons[0].className).toContain("absolute");
      expect(buttons[0].className).toContain("inset-0");
      expect(buttons[0].getAttribute("aria-label")).toBe(`Open club: ${name}`);
    }
    // The two buttons the row used to carry are gone from the list entirely.
    expect(within(container).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(container).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("nests no interactive element in another", () => {
    const { container } = renderList({ expandedId: BAYERN.id });
    expect(container.querySelectorAll("a a").length).toBe(0);
    expect(container.querySelectorAll("button button").length).toBe(0);
    expect(container.querySelectorAll("a button").length).toBe(0);
    expect(container.querySelectorAll("button a").length).toBe(0);
  });

  it("keeps the group header outside every row's hit area", () => {
    const { container } = renderList();
    const header = within(container).getByRole("button", { name: /5★/ });
    const row = rowOf(container, "FC Bayern München");
    expect(row.contains(header)).toBe(false);
    expect(header.contains(row)).toBe(false);
  });

  it("opens and closes the editor from the row", () => {
    const onToggleRow = vi.fn();
    const { container } = renderList({ onToggleRow });
    fireEvent.click(within(rowOf(container, "FC Bayern München")).getByRole("button"));
    expect(onToggleRow).toHaveBeenCalledWith(BAYERN);

    const open = renderList({ expandedId: BAYERN.id, onToggleRow });
    const openRow = rowOf(open.container, "FC Bayern München");
    const overlay = within(openRow).getByRole("button");
    expect(overlay.getAttribute("aria-expanded")).toBe("true");
    expect(overlay.getAttribute("aria-label")).toBe("Close club: FC Bayern München");
  });

  it("renders the editor under its row, on the accent rail, never inside it", () => {
    const { container } = renderList({ expandedId: BAYERN.id });
    const editor = within(container).getByTestId(`editor-${BAYERN.id}`);
    const row = rowOf(container, "FC Bayern München");
    expect(row.contains(editor)).toBe(false);

    const rail = editor.parentElement as HTMLElement;
    expect(rail.className).toContain("border-l-2");
    // The editor follows its own row, and precedes the next club's row.
    expect(row.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const next = rowOf(container, "Paris Saint-Germain");
    expect(rail.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Only the open row has one.
    expect(within(container).queryByTestId(`editor-${PSG.id}`)).toBeNull();
  });

  it("gives a viewer who cannot edit no button and no affordance", () => {
    const { container } = renderList({ canEdit: false });
    for (const name of ["FC Bayern München", "Paris Saint-Germain"]) {
      const row = rowOf(container, name);
      expect(row.querySelectorAll("button").length).toBe(0);
      expect(row.className).not.toContain("row-tap");
      expect(row.querySelector("[aria-expanded]")).toBeNull();
    }
    // The row still says everything it said before: name, game, league, rating.
    const row = rowOf(container, "FC Bayern München");
    expect(row.textContent).toContain("EA FC 26");
    expect(row.textContent).toContain("Bundesliga");
    expect(row.textContent).toContain("5★");
  });
});
