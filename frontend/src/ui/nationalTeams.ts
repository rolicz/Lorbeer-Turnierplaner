/**
 * National teams are countries, not clubs — their symbol is the country flag
 * instead of a generated monogram badge.
 *
 * The two pseudo-leagues `National (Men)` / `National (Women)` hold them, and
 * both genders share the same country codes. Keys are club names as they exist
 * in the DB (matched case-insensitively); anything not listed here simply keeps
 * the monogram badge.
 */

/** Club name → flag-icons code (ISO 3166-1 alpha-2 plus GB subdivisions). */
export const NATIONAL_TEAM_NATIONS: Record<string, string> = {
  Albania: "al",
  Algeria: "dz",
  Argentina: "ar",
  Armenia: "am",
  Australia: "au",
  Austria: "at",
  Azerbaijan: "az",
  Belarus: "by",
  Belgium: "be",
  Bolivia: "bo",
  "Bosnia and Herzegovina": "ba",
  Brazil: "br",
  Bulgaria: "bg",
  Cameroon: "cm",
  Canada: "ca",
  Chile: "cl",
  China: "cn",
  Colombia: "co",
  "Costa Rica": "cr",
  "Côte d'Ivoire": "ci",
  Croatia: "hr",
  Cyprus: "cy",
  Czechia: "cz",
  "Czech Republic": "cz",
  Denmark: "dk",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  Estonia: "ee",
  "Faroe Islands": "fo",
  Finland: "fi",
  France: "fr",
  Georgia: "ge",
  Germany: "de",
  Ghana: "gh",
  Greece: "gr",
  Honduras: "hn",
  Hungary: "hu",
  Iceland: "is",
  India: "in",
  Iran: "ir",
  Ireland: "ie",
  Israel: "il",
  Italy: "it",
  "Ivory Coast": "ci",
  Jamaica: "jm",
  Japan: "jp",
  Kazakhstan: "kz",
  Kosovo: "xk",
  Latvia: "lv",
  Lithuania: "lt",
  Luxembourg: "lu",
  Malta: "mt",
  Mexico: "mx",
  Moldova: "md",
  Montenegro: "me",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Nigeria: "ng",
  "North Macedonia": "mk",
  "Northern Ireland": "gb-nir",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Peru: "pe",
  Philippines: "ph",
  Poland: "pl",
  Portugal: "pt",
  Qatar: "qa",
  // Spelled "Quatar" in the existing DB — keep both so the flag shows either way.
  Quatar: "qa",
  "Republic of Ireland": "ie",
  Romania: "ro",
  Russia: "ru",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  Serbia: "rs",
  Slovakia: "sk",
  Slovenia: "si",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Turkey: "tr",
  Türkiye: "tr",
  Ukraine: "ua",
  "United States": "us",
  Uruguay: "uy",
  USA: "us",
  Venezuela: "ve",
  Vietnam: "vn",
  Wales: "gb-wls",
  Zambia: "zm",
};

const NATIONS_BY_LOWER_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NATIONAL_TEAM_NATIONS).map(([name, code]) => [name.toLowerCase(), code]),
);

/** True for the `National (Men)` / `National (Women)` pseudo-leagues. */
export function isNationalTeamLeague(leagueName?: string | null): boolean {
  return typeof leagueName === "string" && leagueName.startsWith("National (");
}

/**
 * Flag code to use as a club's symbol, or `null` to fall back to the monogram
 * badge. Only clubs in a National league resolve — a regular club that happens
 * to be named after a country keeps its badge.
 */
export function nationalTeamNation(
  clubName?: string | null,
  leagueName?: string | null,
): string | null {
  if (!isNationalTeamLeague(leagueName)) return null;
  const key = (clubName ?? "").trim().toLowerCase();
  if (!key) return null;
  return NATIONS_BY_LOWER_NAME[key] ?? null;
}
