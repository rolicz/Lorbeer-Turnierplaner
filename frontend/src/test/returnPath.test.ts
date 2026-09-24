import { describe, expect, it } from "vitest";

import { safeReturnPath } from "../pages/auth/returnPath";

describe("safeReturnPath — where login sends you back to", () => {
  it("keeps an ordinary in-app path, query and all", () => {
    expect(safeReturnPath("/live/3?tab=comments")).toBe("/live/3?tab=comments");
    expect(safeReturnPath("/profiles/3")).toBe("/profiles/3");
  });

  it("falls back to the dashboard for anything that is not a string path", () => {
    expect(safeReturnPath(undefined)).toBe("/dashboard");
    expect(safeReturnPath(null)).toBe("/dashboard");
    expect(safeReturnPath(42)).toBe("/dashboard");
    expect(safeReturnPath("")).toBe("/dashboard");
    expect(safeReturnPath("live/3")).toBe("/dashboard");
    expect(safeReturnPath("https://evil.example/")).toBe("/dashboard");
  });

  it("refuses a protocol-relative path", () => {
    expect(safeReturnPath("//evil.example")).toBe("/dashboard");
    expect(safeReturnPath("//evil.example/g/altherren/dashboard")).toBe("/dashboard");
  });

  it("refuses a backslash anywhere, raw or encoded — browsers read it as a slash", () => {
    expect(safeReturnPath("/\\evil.example")).toBe("/dashboard");
    expect(safeReturnPath("/\\\\evil.example")).toBe("/dashboard");
    expect(safeReturnPath("/live/3\\..\\evil")).toBe("/dashboard");
    expect(safeReturnPath("/%5Cevil.example")).toBe("/dashboard");
    expect(safeReturnPath("/%5cevil.example")).toBe("/dashboard");
    expect(safeReturnPath("/live/%5C%5Cevil.example")).toBe("/dashboard");
  });

  it("never sends you back to the login screen", () => {
    expect(safeReturnPath("/login")).toBe("/dashboard");
    expect(safeReturnPath("/login?next=x")).toBe("/dashboard");
  });
});
