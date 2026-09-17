import { describe, it, expect } from "vitest";
import {
  fmtDate,
  fmtDateLong,
  fmtDateTime,
  fmtTs,
  fmtMonthDate,
  fmtInt,
  fmtAvg,
  fmtOdd,
  clamp,
  wrapTwoLinesWords,
  parseDateSafe,
  fmtShortDate,
  fmtRating,
  fmtRank,
} from "../utils/format";

describe("fmtDate", () => {
  it("returns empty string for null/undefined", () => {
    expect(fmtDate(null)).toBe("");
    expect(fmtDate(undefined)).toBe("");
    expect(fmtDate("")).toBe("");
  });

  it("returns a non-empty string for a valid date", () => {
    expect(fmtDate("2024-03-15")).not.toBe("");
  });

  it("returns empty string for an unparseable string", () => {
    expect(fmtDate("not-a-date")).toBe("");
  });

  it("pins the de-AT numeric shape regardless of runtime locale", () => {
    expect(fmtDate("2026-09-12")).toBe("12.09.2026");
  });
});

describe("fmtDateLong", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(fmtDateLong(null)).toBe("");
    expect(fmtDateLong(undefined)).toBe("");
    expect(fmtDateLong("")).toBe("");
  });

  it("pins the en-GB spelled-out shape", () => {
    expect(fmtDateLong("2026-09-12")).toBe("12 September 2026");
  });
});

describe("fmtDateTime", () => {
  it("returns empty string for null/undefined", () => {
    expect(fmtDateTime(null)).toBe("");
    expect(fmtDateTime(undefined)).toBe("");
  });

  it("returns a non-empty string for a valid ISO datetime", () => {
    expect(fmtDateTime("2024-03-15T14:30:00")).not.toBe("");
  });

  it("pins the de-AT numeric shape regardless of runtime locale", () => {
    expect(fmtDateTime("2026-09-12T14:30:00")).toBe("12.09.2026, 14:30");
  });
});

describe("fmtTs", () => {
  it("returns a non-empty string for a valid timestamp", () => {
    expect(fmtTs(Date.parse("2024-03-15T14:30:00Z"))).not.toBe("");
  });
});

describe("fmtMonthDate", () => {
  it("formats a Date as MM/YY", () => {
    const d = new Date(2024, 2, 15); // March 2024
    expect(fmtMonthDate(d)).toBe("03/24");
  });

  it("returns empty for an invalid Date", () => {
    expect(fmtMonthDate(new Date("not-a-date"))).toBe("");
  });
});

describe("fmtInt", () => {
  it("truncates to integer", () => {
    expect(fmtInt(3.9)).toBe("3");
    expect(fmtInt(-2.1)).toBe("-2");
    expect(fmtInt(0)).toBe("0");
  });

  it("returns '0' for non-finite values", () => {
    expect(fmtInt(NaN)).toBe("0");
    expect(fmtInt(Infinity)).toBe("0");
  });
});

describe("fmtAvg", () => {
  it("formats to 2 decimal places", () => {
    expect(fmtAvg(1.5)).toBe("1.50");
    expect(fmtAvg(0)).toBe("0.00");
  });

  it("returns '0.00' for non-finite", () => {
    expect(fmtAvg(NaN)).toBe("0.00");
  });
});

describe("fmtOdd", () => {
  it("formats to 2 decimal places", () => {
    expect(fmtOdd(1.5)).toBe("1.50");
  });

  it("returns '—' for non-finite", () => {
    expect(fmtOdd(NaN)).toBe("—");
    expect(fmtOdd(Infinity)).toBe("—");
  });
});

describe("clamp", () => {
  it("clamps to [lo, hi]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("wrapTwoLinesWords", () => {
  it("returns [text, ''] when short enough", () => {
    const [a, b] = wrapTwoLinesWords("hello", 10);
    expect(a).toBe("hello");
    expect(b).toBe("");
  });

  it("splits a long string into two roughly equal lines", () => {
    const [a, b] = wrapTwoLinesWords("hello world foo bar", 10);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });

  it("returns empty strings for empty input", () => {
    const [a, b] = wrapTwoLinesWords("", 10);
    expect(a).toBe("");
    expect(b).toBe("");
  });
});

describe("parseDateSafe", () => {
  it("returns a timestamp for valid date strings", () => {
    const t = parseDateSafe("2024-03-15");
    expect(t).not.toBeNull();
    expect(typeof t).toBe("number");
  });

  it("returns null for null/undefined/invalid", () => {
    expect(parseDateSafe(null)).toBeNull();
    expect(parseDateSafe(undefined)).toBeNull();
    expect(parseDateSafe("not-a-date")).toBeNull();
  });
});

describe("fmtShortDate", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(fmtShortDate(null)).toBe("");
    expect(fmtShortDate(undefined)).toBe("");
    expect(fmtShortDate("")).toBe("");
  });

  it("returns empty string for unparseable input", () => {
    expect(fmtShortDate("not-a-date")).toBe("");
  });

  it("returns a non-empty string for a valid ISO date", () => {
    expect(fmtShortDate("2024-03-15")).not.toBe("");
  });

  it("pins the en-GB abbreviated shape with a four-digit year", () => {
    expect(fmtShortDate("2026-09-12")).toBe("12 Sept 2026");
  });
});

describe("fmtRating", () => {
  it("rounds to nearest integer", () => {
    expect(fmtRating(1523.7)).toBe("1524");
    expect(fmtRating(1000)).toBe("1000");
    expect(fmtRating(1523.2)).toBe("1523");
  });

  it("returns '—' for non-finite values", () => {
    expect(fmtRating(NaN)).toBe("—");
    expect(fmtRating(Infinity)).toBe("—");
  });
});

describe("fmtRank", () => {
  it("formats rank with total", () => {
    expect(fmtRank(3, 8)).toBe("#3/8");
    expect(fmtRank(1, 10)).toBe("#1/10");
  });

  it("uses '?' when total is null", () => {
    expect(fmtRank(2, null)).toBe("#2/?");
  });
});
