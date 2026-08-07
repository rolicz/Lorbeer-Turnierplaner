import { describe, it, expect } from "vitest";
import {
  NATIONAL_TEAM_NATIONS,
  isNationalTeamLeague,
  nationalTeamNation,
} from "../ui/nationalTeams";

/** The national-team club names present in the dev DB (see FEATURES_2026-08.md G6). */
const DEV_DB_NAMES = [
  "Argentina",
  "Croatia",
  "Czechia",
  "Denmark",
  "England",
  "Finland",
  "France",
  "Germany",
  "Ghana",
  "Hungary",
  "Iceland",
  "Ireland",
  "Italy",
  "Mexico",
  "Morocco",
  "Netherlands",
  "Northern Ireland",
  "Norway",
  "Poland",
  "Portugal",
  "Quatar",
  "Romania",
  "Saudi Arabia",
  "Scotland",
  "Spain",
  "Sweden",
  "Ukraine",
  "United States",
  "Wales",
];

describe("isNationalTeamLeague", () => {
  it("matches both National pseudo-leagues", () => {
    expect(isNationalTeamLeague("National (Men)")).toBe(true);
    expect(isNationalTeamLeague("National (Women)")).toBe(true);
  });

  it("rejects regular leagues and missing values", () => {
    expect(isNationalTeamLeague("Bundesliga")).toBe(false);
    expect(isNationalTeamLeague("Nationalliga")).toBe(false);
    expect(isNationalTeamLeague(null)).toBe(false);
    expect(isNationalTeamLeague(undefined)).toBe(false);
  });
});

describe("NATIONAL_TEAM_NATIONS", () => {
  it("covers every national-team club in the dev DB", () => {
    for (const name of DEV_DB_NAMES) {
      expect(nationalTeamNation(name, "National (Men)"), name).not.toBeNull();
    }
  });

  it("only holds flag-icons-shaped codes", () => {
    for (const [name, code] of Object.entries(NATIONAL_TEAM_NATIONS)) {
      expect(code, name).toMatch(/^[a-z]{2}(-[a-z]{2,3})?$/);
    }
  });
});

describe("nationalTeamNation", () => {
  it("resolves national teams, women's teams included", () => {
    expect(nationalTeamNation("Germany", "National (Men)")).toBe("de");
    expect(nationalTeamNation("Germany", "National (Women)")).toBe("de");
    expect(nationalTeamNation("France", "National (Men)")).toBe("fr");
  });

  it("uses GB subdivision codes for the home nations", () => {
    expect(nationalTeamNation("England", "National (Men)")).toBe("gb-eng");
    expect(nationalTeamNation("Scotland", "National (Men)")).toBe("gb-sct");
    expect(nationalTeamNation("Wales", "National (Men)")).toBe("gb-wls");
    expect(nationalTeamNation("Northern Ireland", "National (Men)")).toBe("gb-nir");
  });

  it("tolerates casing and whitespace, and the DB's 'Quatar' spelling", () => {
    expect(nationalTeamNation("  germany ", "National (Men)")).toBe("de");
    expect(nationalTeamNation("Quatar", "National (Men)")).toBe("qa");
    expect(nationalTeamNation("Qatar", "National (Men)")).toBe("qa");
  });

  it("returns null for unmapped national clubs (they keep the monogram)", () => {
    expect(nationalTeamNation("Atlantis", "National (Men)")).toBeNull();
    expect(nationalTeamNation("", "National (Men)")).toBeNull();
  });

  it("returns null for clubs outside the National leagues", () => {
    expect(nationalTeamNation("Germany", "Bundesliga")).toBeNull();
    expect(nationalTeamNation("Wales", null)).toBeNull();
  });
});
