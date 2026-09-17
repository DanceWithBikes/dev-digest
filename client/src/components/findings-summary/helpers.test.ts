import { describe, it, expect } from "vitest";
import { countBySeverity, totalFindings, presentSeverities, lineLabel, plainText } from "./helpers";

describe("countBySeverity", () => {
  it("tallies the three API severities and ignores anything else", () => {
    expect(
      countBySeverity([
        { severity: "CRITICAL" },
        { severity: "CRITICAL" },
        { severity: "WARNING" },
        { severity: "INFO" },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 0 });
  });

  it("counts dismissed findings too — pills must match the cards rendered below", () => {
    const findings = [
      { severity: "CRITICAL", dismissed_at: "2026-09-18T00:00:00Z" },
      { severity: "CRITICAL", dismissed_at: null },
    ];
    expect(countBySeverity(findings).critical).toBe(2);
  });

  it("is all-zero for an empty list", () => {
    expect(countBySeverity([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe("presentSeverities", () => {
  it("keeps worst-first order and drops empty buckets", () => {
    expect(presentSeverities({ critical: 0, warning: 3, suggestion: 1 })).toEqual([
      "WARNING",
      "SUGGESTION",
    ]);
    expect(presentSeverities({ critical: 1, warning: 1, suggestion: 1 })).toEqual([
      "CRITICAL",
      "WARNING",
      "SUGGESTION",
    ]);
  });

  it("is empty when nothing was found", () => {
    expect(presentSeverities({ critical: 0, warning: 0, suggestion: 0 })).toEqual([]);
  });
});

describe("totalFindings", () => {
  it("sums the buckets", () => {
    expect(totalFindings({ critical: 2, warning: 1, suggestion: 3 })).toBe(6);
  });
});

describe("lineLabel", () => {
  it("collapses a single-line range", () => {
    expect(lineLabel({ start_line: 11, end_line: 11 })).toBe("11");
    expect(lineLabel({ start_line: 11, end_line: 15 })).toBe("11-15");
  });
});

describe("plainText", () => {
  it("strips markdown so the 2-line clamp measures real text", () => {
    expect(plainText("A literal `sk_live_` key is **committed**.")).toBe(
      "A literal sk_live_ key is committed.",
    );
    expect(plainText("See [the docs](https://example.com) for more")).toBe(
      "See the docs for more",
    );
    expect(plainText("line one\n\n   line two")).toBe("line one line two");
  });
});
