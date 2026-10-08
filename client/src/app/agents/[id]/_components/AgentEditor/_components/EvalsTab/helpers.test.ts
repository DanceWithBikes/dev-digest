import { describe, it, expect } from "vitest";
import type { EvalBatch, EvalCaseRecord } from "@devdigest/shared";
import { latestTwoDone } from "@/lib/eval-metrics";
import { caseStatus, metricDelta } from "./helpers";

const b = (id: string, ranAt: string, status: EvalBatch["status"], recall: number | null) =>
  ({ id, ran_at: ranAt, status, recall, precision: null, citation_accuracy: null }) as unknown as EvalBatch;

describe("EvalsTab helpers", () => {
  it("picks the two newest done batches and computes null-safe deltas", () => {
    const { newest, previous } = latestTwoDone([
      b("a", "2026-10-01T00:00:00Z", "done", 0.5),
      b("c", "2026-10-03T00:00:00Z", "failed", 1),
      b("b", "2026-10-02T00:00:00Z", "done", 0.75),
    ]);
    expect([newest?.id, previous?.id]).toEqual(["b", "a"]);
    expect(metricDelta(newest!, previous, "recall")).toBeCloseTo(0.25);
    expect(metricDelta(newest!, previous, "precision")).toBeUndefined();
  });

  it("maps last_run to a status", () => {
    const c = (last_run: EvalCaseRecord["last_run"]) => ({ last_run }) as EvalCaseRecord;
    expect(caseStatus(c(null))).toBe("neverRun");
    expect(caseStatus(c({ pass: null, batch_id: "x" }))).toBe("failed");
    expect(caseStatus(c({ pass: true, batch_id: "x" }))).toBe("passed");
    expect(caseStatus(c({ pass: false, batch_id: "x" }))).toBe("failed");
  });
});
