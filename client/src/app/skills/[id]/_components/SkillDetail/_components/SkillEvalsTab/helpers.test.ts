import { describe, it, expect } from "vitest";
import type { SkillEvalRunSummary } from "@devdigest/shared";
import { formatRunDate, formatScore, scoreTrend, shortSha } from "./helpers";

const run = (over: Partial<SkillEvalRunSummary>): SkillEvalRunSummary => ({
  run_id: "r", ran_at: "2026-10-08T10:00:00.000Z", config: "candidate", passed: 1, total: 1,
  avg_score: 1, git_sha: null, dirty: null, ...over,
});

describe("formatScore", () => {
  it("trims trailing zeros and renders null as a dash", () => {
    expect(formatScore(0.75)).toBe("0.75");
    expect(formatScore(1)).toBe("1");
    expect(formatScore(0.7)).toBe("0.7");
    expect(formatScore(null)).toBe("—");
  });
});

describe("shortSha / formatRunDate", () => {
  it("abbreviates the sha and formats the date in UTC", () => {
    expect(shortSha("722b66cdeadbeef")).toBe("722b66c");
    expect(shortSha(null)).toBe("—");
    expect(formatRunDate("2026-10-08T10:24:55.000Z")).toBe("2026-10-08 10:24");
    expect(formatRunDate("nope")).toBe("nope");
  });
});

describe("scoreTrend", () => {
  it("orders candidate runs oldest first and drops baseline and unscored runs", () => {
    const t = scoreTrend([
      run({ run_id: "b", ran_at: "2026-10-09T10:00:00.000Z", avg_score: 0.5 }),
      run({ run_id: "a", ran_at: "2026-10-08T10:00:00.000Z", avg_score: 0.9 }),
      run({ run_id: "c", config: "baseline", avg_score: 0.1 }),
      run({ run_id: "d", avg_score: null }),
    ]);
    expect(t.data).toEqual([0.9, 0.5]);
    expect(t.xLabels).toEqual(["10-08 10:00", "10-09 10:00"]);
  });
});
