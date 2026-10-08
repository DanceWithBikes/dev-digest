import { describe, it, expect } from "vitest";
import type { EvalBatch } from "@devdigest/shared";
import {
  batchDelta,
  formatCost,
  formatDeltaPp,
  formatRanAt,
  latestTwoDone,
  newestFirst,
  orderPair,
  pct,
  recallSeries,
  trendSeries,
} from "./eval-metrics";

function batch(over: Partial<EvalBatch>): EvalBatch {
  return {
    id: "b",
    agent_id: "a",
    agent_version: 1,
    system_prompt: "p",
    provider: "openai",
    model: "m",
    skills: [],
    status: "done",
    error: null,
    ran_at: "2026-10-01T10:00:00Z",
    finished_at: null,
    cases_total: 8,
    cases_passed: 6,
    must_find_total: 0,
    must_find_matched: 0,
    kept_total: 0,
    noise_total: 0,
    dropped_total: 0,
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 0.5,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    ...over,
  } as EvalBatch;
}

describe("eval-metrics", () => {
  it("rounds to whole percents and shows a dash for null", () => {
    expect(pct(0.75)).toBe("75%");
    expect(pct(2 / 3)).toBe("67%");
    expect(pct(null)).toBe("—");
    expect(formatCost(null)).toBe("—");
    expect(formatDeltaPp(0.05)).toBe("+5 pp");
    expect(formatDeltaPp(-0.034)).toBe("-3 pp");
    expect(formatDeltaPp(null)).toBe("—");
    expect(formatDeltaPp(0.254, { signed: false })).toBe("25 pp");
  });

  it("orders a pair by ran_at and computes newer minus older", () => {
    const early = batch({ id: "e", ran_at: "2026-10-01T10:00:00Z", recall: 0.5, precision: null });
    const late = batch({ id: "l", ran_at: "2026-10-02T10:00:00Z", recall: 0.75, precision: 0.9 });
    const [older, newer] = orderPair(late, early);
    expect([older.id, newer.id]).toEqual(["e", "l"]);
    expect(batchDelta(older, newer)).toEqual({ recall: 0.25, precision: null, citation_accuracy: 0 });
  });

  it("builds a chronological trend from done batches only, labelled by version", () => {
    const t = trendSeries([
      batch({ id: "3", agent_version: 3, ran_at: "2026-10-03T00:00:00Z", recall: 0.9 }),
      batch({ id: "f", agent_version: 2, ran_at: "2026-10-02T00:00:00Z", status: "failed", recall: null }),
      batch({ id: "1", agent_version: 1, ran_at: "2026-10-01T00:00:00Z", recall: 0.4 }),
    ]);
    expect(t.xLabels).toEqual(["v1", "v3"]);
    expect(t.recall).toEqual([0.4, 0.9]);
    expect(t.batches.map((b) => b.id)).toEqual(["1", "3"]);
  });

  it("sorts newest first, picks the two newest done batches and reads recall from done ones", () => {
    const list = [
      batch({ id: "a", ran_at: "2026-10-01T00:00:00Z", recall: 0.5 }),
      batch({ id: "c", ran_at: "2026-10-03T00:00:00Z", status: "failed", recall: null }),
      batch({ id: "b", ran_at: "2026-10-02T00:00:00Z", recall: null }),
    ];
    expect(newestFirst(list).map((x) => x.id)).toEqual(["c", "b", "a"]);
    const { newest, previous } = latestTwoDone(list);
    expect([newest?.id, previous?.id]).toEqual(["b", "a"]);
    expect(recallSeries(list)).toEqual([0.5, 0]);
  });

  it("formats a timestamp, falling back to the raw string", () => {
    expect(formatRanAt("not a date")).toBe("not a date");
    expect(formatRanAt("2026-10-01T10:00:00Z", false)).toBe(new Date("2026-10-01T10:00:00Z").toLocaleDateString());
    expect(formatRanAt("2026-10-01T10:00:00Z")).toBe(new Date("2026-10-01T10:00:00Z").toLocaleString());
  });
});
