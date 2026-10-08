import { describe, it, expect } from "vitest";
import { formatVersionDate } from "./helpers";

describe("formatVersionDate", () => {
  it("formats an ISO timestamp in UTC so the row never shifts by timezone", () => {
    expect(formatVersionDate("2026-09-21T08:05:00Z")).toBe("2026-09-21 08:05");
    expect(formatVersionDate("2026-09-21T23:30:00+02:00")).toBe("2026-09-21 21:30");
  });

  it("falls back to the raw value rather than rendering 'Invalid Date'", () => {
    expect(formatVersionDate("not-a-date")).toBe("not-a-date");
  });
});
