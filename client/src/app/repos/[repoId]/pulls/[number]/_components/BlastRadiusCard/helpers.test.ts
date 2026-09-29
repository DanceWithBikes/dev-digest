import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { blastStats, hasDownstream } from "./helpers";

function radius(o: Partial<BlastRadius>): BlastRadius {
  return { changed_symbols: [], downstream: [], summary: "", ...o };
}

describe("blastStats", () => {
  it("sums callers across groups and deduplicates endpoints/crons reachable through more than one group", () => {
    const stats = blastStats(
      radius({
        changed_symbols: [
          { name: "rateLimit", file: "src/rate.ts", kind: "function" },
          { name: "bucketKey", file: "src/rate.ts", kind: "function" },
        ],
        downstream: [
          {
            symbol: "rateLimit",
            callers: [
              { name: "publicRouter", file: "src/api/index.ts", line: 23 },
              { name: "webhookHandler", file: "src/api/webhooks.ts", line: 45 },
            ],
            endpoints_affected: ["GET /api/public/items", "POST /api/public/webhooks"],
            crons_affected: ["reset-rate-buckets (hourly)"],
          },
          {
            symbol: "bucketKey",
            callers: [{ name: "healthCheck", file: "src/api/health.ts", line: 11 }],
            // Same endpoint as rateLimit's group — must count once, not twice.
            endpoints_affected: ["GET /api/public/items"],
            crons_affected: [],
          },
        ],
      }),
    );

    expect(stats).toEqual({ symbols: 2, totalCallers: 3, endpoints: 2, crons: 1 });
  });
});

describe("hasDownstream", () => {
  it("is false when every changed symbol has zero callers, even if the group itself is present", () => {
    const r = radius({
      changed_symbols: [{ name: "isolated", file: "src/a.ts", kind: "function" }],
      downstream: [{ symbol: "isolated", callers: [], endpoints_affected: [], crons_affected: [] }],
    });
    expect(hasDownstream(r)).toBe(false);
  });

  it("is true when at least one group has a caller", () => {
    const r = radius({
      downstream: [
        { symbol: "a", callers: [], endpoints_affected: [], crons_affected: [] },
        {
          symbol: "b",
          callers: [{ name: "caller", file: "src/b.ts", line: 1 }],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
    });
    expect(hasDownstream(r)).toBe(true);
  });
});
