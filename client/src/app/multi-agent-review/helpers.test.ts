import { describe, it, expect } from "vitest";
import type { LocationGroup, RunEstimate } from "@devdigest/shared";
import { estimateTotals, formatSecondsCost, parseResultsView, takeLabel, visibleGroups } from "./helpers";

const est = (agent_id: string, ms: number | null, usd: number | null): RunEstimate => ({
  agent_id,
  median_duration_ms: ms,
  median_cost_usd: usd,
  runs: ms == null ? 0 : 3,
});

const group = (conflict: boolean): LocationGroup => ({
  file: "a.ts",
  start_line: 1,
  end_line: 2,
  title: "t",
  conflict,
  members: [],
  takes: [],
});

describe("formatSecondsCost", () => {
  it("renders seconds with one decimal and cost with two", () => {
    expect(formatSecondsCost(12_340, 0.5, "—")).toBe("12.3s · $0.50");
  });
  it("renders a missing half as an em dash", () => {
    expect(formatSecondsCost(null, 0.5, "—")).toBe("— · $0.50");
    expect(formatSecondsCost(1000, null, "—")).toBe("1.0s · —");
  });
});

describe("estimateTotals", () => {
  it("takes the slowest time and the summed cost of the checked agents", () => {
    const t = estimateTotals(["a", "b"], [est("a", 10_000, 0.1), est("b", 30_000, 0.25), est("c", 99_000, 9)]);
    expect(t).toEqual({ maxSeconds: 30, sumCost: 0.35, partial: false });
  });
  it("flags a partial total when a checked agent has no estimate", () => {
    expect(estimateTotals(["a", "b"], [est("a", 10_000, 0.1), est("b", null, null)]).partial).toBe(true);
    expect(estimateTotals(["a", "z"], [est("a", 10_000, 0.1)]).partial).toBe(true);
  });
});

describe("parseResultsView", () => {
  it("only 'tabs' selects tabs", () => {
    expect(parseResultsView("tabs")).toBe("tabs");
    expect(parseResultsView("columns")).toBe("columns");
    expect(parseResultsView("bogus")).toBe("columns");
    expect(parseResultsView(null)).toBe("columns");
  });
});

describe("visibleGroups", () => {
  it("filters to conflicts on demand", () => {
    const groups = [group(true), group(false)];
    expect(visibleGroups(groups, false)).toHaveLength(2);
    expect(visibleGroups(groups, true)).toEqual([groups[0]]);
  });
});

describe("takeLabel", () => {
  it("maps verdicts to label keys", () => {
    expect(takeLabel("CRITICAL")).toBe("CRITICAL");
    expect(takeLabel("ignored")).toBe("didNotFlag");
    expect(takeLabel("no_result")).toBe("noResult");
  });
});
