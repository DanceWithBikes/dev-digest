import { describe, it, expect } from "vitest";
import type { ReviewRecord, FindingRecord, PrBrief } from "@devdigest/shared";
import { newestReviewSummary, isBriefStale, shortSha, focusTarget } from "./helpers";

function review(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: "approve",
    summary: null,
    score: 80,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...over,
  };
}
const finding = (severity: string, dismissed = false) =>
  ({ severity, dismissed_at: dismissed ? "2026-01-01" : null }) as unknown as FindingRecord;

describe("newestReviewSummary (AC-58, AC-59)", () => {
  it("returns null with no reviews or no completed review", () => {
    expect(newestReviewSummary(undefined)).toBeNull();
    expect(newestReviewSummary([])).toBeNull();
    expect(newestReviewSummary([review({ verdict: null })])).toBeNull();
  });
  it("uses the first (newest) review with a verdict, skipping unfinished ones", () => {
    const s = newestReviewSummary([
      review({ verdict: null, score: 1 }),
      review({ verdict: "request_changes", score: 42, findings: [finding("CRITICAL"), finding("CRITICAL", true), finding("LOW")] }),
      review({ verdict: "approve", score: 99 }),
    ]);
    expect(s).toEqual({ verdict: "request_changes", findingsCount: 3, blockers: 1, score: 42 });
  });
  it("skips a newer summary-kind run that carries a verdict", () => {
    const s = newestReviewSummary([
      review({ kind: "summary", verdict: "approve", score: 90 }),
      review({ kind: "review", verdict: "comment", score: 70 }),
    ]);
    expect(s?.verdict).toBe("comment");
    expect(s?.score).toBe(70);
  });
});

describe("isBriefStale / shortSha (AC-62)", () => {
  it("is stale only when the PR head is known and differs", () => {
    const b = { head_sha: "aaa" } as Pick<PrBrief, "head_sha">;
    expect(isBriefStale(b, "bbb")).toBe(true);
    expect(isBriefStale(b, "aaa")).toBe(false);
    expect(isBriefStale(b, null)).toBe(false);
    expect(isBriefStale(b, undefined)).toBe(false);
  });
  it("shortens to 7 characters", () => {
    expect(shortSha("0123456789abcdef")).toBe("0123456");
  });
});

describe("focusTarget (AC-76, AC-79)", () => {
  const item = { file: "src/a.ts", line: 7, reason: "r" };
  it("changed file leads to the tab", () => {
    expect(focusTarget(item, new Set(["src/a.ts"]), "o/r", "sha")).toEqual({ kind: "tab", path: "src/a.ts" });
  });
  it("unchanged file with a known repo links to GitHub at the brief SHA and line", () => {
    expect(focusTarget(item, new Set(), "o/r", "sha1")).toEqual({
      kind: "github",
      url: "https://github.com/o/r/blob/sha1/src/a.ts#L7",
    });
  });
  it("unchanged file without a repo name is plain text", () => {
    expect(focusTarget(item, new Set(), null, "sha1")).toEqual({ kind: "text" });
  });
});
