import { describe, it, expect } from "vitest";
import { CLUB_BADGE_COLORS, clubBadgeColorIndex, clubInitials } from "../ui/ClubBadge";

describe("clubInitials", () => {
  it("takes the first letters of the first two words", () => {
    expect(clubInitials("Manchester United")).toBe("MU");
    expect(clubInitials("Real Madrid")).toBe("RM");
  });

  it("ignores words beyond the second", () => {
    expect(clubInitials("FC Bayern München")).toBe("FB");
    expect(clubInitials("Paris Saint-Germain FC")).toBe("PS");
  });

  it("uses the first two letters of a single-word name", () => {
    expect(clubInitials("Arsenal")).toBe("AR");
    expect(clubInitials("Juventus")).toBe("JU");
  });

  it("uppercases and tolerates extra whitespace", () => {
    expect(clubInitials("  ac  milan  ")).toBe("AM");
  });

  it("falls back to '?' for an empty name", () => {
    expect(clubInitials("")).toBe("?");
    expect(clubInitials("   ")).toBe("?");
  });

  it("handles one-letter names", () => {
    expect(clubInitials("A")).toBe("A");
  });
});

describe("clubBadgeColorIndex", () => {
  it("is stable for the same name", () => {
    expect(clubBadgeColorIndex("Borussia Dortmund")).toBe(clubBadgeColorIndex("Borussia Dortmund"));
    expect(clubBadgeColorIndex("Ajax")).toBe(clubBadgeColorIndex("  Ajax  "));
  });

  it("always lands inside the palette", () => {
    for (const name of ["Ajax", "Celtic", "SL Benfica", "Club Brugge", "New York City FC", ""]) {
      const i = clubBadgeColorIndex(name);
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(CLUB_BADGE_COLORS.length);
    }
  });

  it("spreads different names across most of the palette", () => {
    const names = [
      "Arsenal",
      "Chelsea",
      "Liverpool",
      "Manchester City",
      "Real Madrid",
      "FC Barcelona",
      "Bayern München",
      "Borussia Dortmund",
      "Juventus",
      "Inter",
      "Paris Saint-Germain",
      "Ajax",
      "Benfica",
      "Porto",
      "Celtic",
      "Rangers",
      "Boca Juniors",
      "River Plate",
      "Galatasaray",
      "Feyenoord",
    ];
    const used = new Set(names.map(clubBadgeColorIndex));
    expect(used.size).toBeGreaterThanOrEqual(8);
  });

  it("does not map two clearly different names to the same index by construction", () => {
    expect(clubBadgeColorIndex("Arsenal")).not.toBe(clubBadgeColorIndex("Arsenal FC"));
  });
});
