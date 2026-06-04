import { describe, it, expect } from "vitest";
import {
  fmtDate,
  fmtDateTime,
  fmtTs,
  fmtMonthDate,
  fmtInt,
  fmtAvg,
  fmtPct,
  fmtOdd,
  clamp,
  wrapTwoLinesWords,
  parseDateSafe,
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
});

describe("fmtDateTime", () => {
  it("returns empty string for null/undefined", () => {
    expect(fmtDateTime(null)).toBe("");
    expect(fmtDateTime(undefined)).toBe("");
  });

  it("returns a non-empty string for a valid ISO datetime", () => {
    expect(fmtDateTime("2024-03-15T14:30:00")).not.toBe("");
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

describe("fmtPct", () => {
  it("formats to 2 decimal places", () => {
    expect(fmtPct(0.75)).toBe("0.75");
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
