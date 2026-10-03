import { describe, expect, it } from "vitest";
import { clampedNow } from "./relative-time";

describe("clampedNow", () => {
  it("returns now when it is not before the timestamp", () => {
    const now = new Date("2026-01-01T00:10:00Z");
    expect(clampedNow(now, new Date("2026-01-01T00:00:00Z"))).toBe(now);
  });

  it("returns the timestamp when now predates it, so the result is never in the future", () => {
    const at = new Date("2026-01-01T00:10:00Z");
    expect(clampedNow(new Date("2026-01-01T00:00:00Z"), at)).toBe(at);
  });
});
