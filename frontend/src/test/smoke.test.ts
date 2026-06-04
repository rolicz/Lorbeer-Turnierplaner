// Smoke test — verifies that the Vitest runner is wired correctly.
// Real unit tests are added in Phase 6.
import { describe, it, expect } from "vitest";

describe("vitest runner", () => {
  it("is working", () => {
    expect(1 + 1).toBe(2);
  });
});
