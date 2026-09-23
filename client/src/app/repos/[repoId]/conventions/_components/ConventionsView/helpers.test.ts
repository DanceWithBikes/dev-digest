import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { acceptedCandidates, confidencePct, hasScanned, pendingCandidates } from "./helpers";

function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    repo_id: "r1",
    category: "naming",
    rule: "A rule",
    evidence_path: "src/a.ts",
    evidence_line: 3,
    evidence_snippet: "export function useX()",
    confidence: 0.8,
    status: "pending",
    created_at: "2026-09-21T00:00:00.000Z",
    ...over,
  };
}

describe("pendingCandidates", () => {
  it("hides rejected candidates so a rejection survives the reload", () => {
    const list = pendingCandidates([
      candidate({ id: "a", status: "pending" }),
      candidate({ id: "b", status: "rejected" }),
      candidate({ id: "c", status: "accepted" }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["a"]);
  });

  it("puts the strongest evidence first", () => {
    const list = pendingCandidates([
      candidate({ id: "weak", confidence: 0.55 }),
      candidate({ id: "strong", confidence: 0.95 }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["strong", "weak"]);
  });
});

describe("acceptedCandidates", () => {
  it("returns only what will end up in the skill", () => {
    const list = acceptedCandidates([
      candidate({ id: "a", status: "accepted" }),
      candidate({ id: "b", status: "pending" }),
      candidate({ id: "c", status: "rejected" }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("confidencePct", () => {
  it("rounds to a whole percent", () => {
    expect(confidencePct(0.874)).toBe("87%");
    expect(confidencePct(1)).toBe("100%");
  });
});

describe("hasScanned", () => {
  it("is false before any scan and true once rows exist in any status", () => {
    expect(hasScanned(undefined)).toBe(false);
    expect(hasScanned([])).toBe(false);
    expect(hasScanned([candidate({ status: "rejected" })])).toBe(true);
  });
});
