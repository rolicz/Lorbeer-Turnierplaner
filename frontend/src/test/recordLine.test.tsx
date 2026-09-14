/**
 * T14 — the standings meta line lines up across rows.
 *
 * jsdom has no layout, so the runtime proof that the segments share an x position is in
 * Playwright. What is asserted here is the thing that *produces* that width: the pad on
 * every `.record-num` comes from the list's widths, not from the row's own digits, so two
 * rows with different values still ask for exactly the same tracks.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import RecordLine, { RecordNum, recordWidths } from "../ui/primitives/RecordLine";

const pads = (el: HTMLElement): string[] =>
  Array.from(el.querySelectorAll<HTMLElement>(".record-num")).map((n) => n.style.getPropertyValue("--record-pad"));

describe("recordWidths", () => {
  it("takes the widest value per column across the list", () => {
    const w = recordWidths([
      { played: 9, wins: 3, draws: 0, losses: 6, gf: 15, ga: 4, gd: 11 },
      { played: 10, wins: 1, draws: 0, losses: 9, gf: 115, ga: 104, gd: -100 },
    ]);
    // `wdl` is the widest whole `W-D-L` token, in digits: "3-0-6" and "1-0-9" are 3.
    expect(w).toEqual({ played: 2, wdl: 3, gf: 3, ga: 3, gd: 3 });
  });

  it("ignores missing rows and counts a sign as no digit", () => {
    const w = recordWidths([null, undefined, { gd: -7 }]);
    expect(w).toEqual({ played: 1, wdl: 3, gf: 1, ga: 1, gd: 1 });
  });
});

describe("RecordLine", () => {
  const widths = recordWidths([
    { played: 9, wins: 3, draws: 0, losses: 6, gf: 15, ga: 4, gd: 11 },
    { played: 10, wins: 1, draws: 0, losses: 9, gf: 5, ga: 8, gd: -3 },
  ]);

  it("asks for the same tracks whatever the row's own digits are", () => {
    const a = render(<RecordLine played={9} wins={3} draws={0} losses={6} gf={15} ga={4} gd={11} widths={widths} />);
    const b = render(<RecordLine played={10} wins={1} draws={0} losses={9} gf={5} ga={8} gd={-3} widths={widths} />);
    // played(2) · W-D-L as ONE track (3 digits + its two hyphens) · GF(2) : GA(1) · GD(+2)
    expect(pads(a.container)).toEqual(['"00"', '"000--"', '"00"', '"0"', '"+00"']);
    expect(pads(b.container)).toEqual(pads(a.container));
  });

  it("keeps the separators for screen readers, so the line still reads as before", () => {
    const { container } = render(
      <RecordLine played={3} wins={3} draws={0} losses={0} gf={14} ga={6} gd={8} widths={recordWidths([{ played: 3, wins: 3, draws: 0, losses: 0, gf: 14, ga: 6, gd: 8 }])} />,
    );
    // A unit is glued to its number with a nbsp, after "GD" and after a played count.
    expect(container.textContent).toBe("3P · 3-0-0 · 14:6 · GD\u00a0+8");
    // …but not on screen: every separator is sr-only.
    container.querySelectorAll("span").forEach((s) => {
      if (s.textContent === " · ") expect(s.className).toContain("sr-only");
    });
  });

  it("renders only the segments it was given a value for", () => {
    const { container } = render(<RecordLine wins={2} draws={1} losses={0} widths={widths} extra="1.75 ppm" />);
    const segs = Array.from(container.querySelectorAll("[data-record-seg]")).map((s) => s.getAttribute("data-record-seg"));
    expect(segs).toEqual(["wdl", "extra"]);
    expect(container.textContent).toBe("2-1-0 · 1.75 ppm");
  });

  it("glues a spelled-out unit to its count", () => {
    const { container } = render(<RecordLine played={12} widths={widths} playedLabel="matches" />);
    expect(container.textContent).toBe("12\u00a0matches");
  });

  it("keeps the win / draw / loss colours, and the token in one track", () => {
    const { container } = render(<RecordLine wins={2} draws={1} losses={0} widths={widths} />);
    const token = container.querySelector<HTMLElement>('[data-record-seg="wdl"] .record-num');
    // One track for the whole word, so the hyphens stay glued to their numbers (A7).
    expect(container.querySelectorAll('[data-record-seg="wdl"] .record-num')).toHaveLength(1);
    expect(token?.textContent).toBe("2-1-0");
    const tones = Array.from(token?.querySelectorAll("span") ?? []).map((n) => n.className);
    expect(tones).toEqual(["text-win", "text-draw", "text-loss"]);
  });

  it("pads a signed number with a sign, not another digit", () => {
    const { container } = render(<RecordNum digits={2} sign>+8</RecordNum>);
    expect(container.querySelector<HTMLElement>(".record-num")?.style.getPropertyValue("--record-pad")).toBe('"+00"');
  });
});
