import { describe, it, expect } from "vitest";
import type { ContextDocument } from "@devdigest/shared";
import { buildRows, filterByPath, promptEstimate, sumTokens } from "./helpers";

const doc = (path: string, tokens: number): ContextDocument => ({
  path,
  type: "doc",
  chars: tokens * 4,
  tokens,
  agents_count: 0,
  skills_count: 0,
});
const DOCS = [doc("docs/Spec-A.md", 100), doc("docs/b.md", 50), doc("README.md", 10)];

describe("filterByPath", () => {
  it("matches a substring ignoring case", () => {
    expect(filterByPath(DOCS, "SPEC").map((d) => d.path)).toEqual(["docs/Spec-A.md"]);
  });
  it("keeps everything for an empty query", () => {
    expect(filterByPath(DOCS, "  ")).toHaveLength(3);
  });
});

describe("sumTokens", () => {
  it("sums the server counts and counts an unknown path as 0", () => {
    expect(sumTokens(["docs/b.md", "gone.md"], DOCS)).toBe(50);
  });
});

describe("promptEstimate", () => {
  it("counts a path shared by the agent and a skill once", () => {
    expect(promptEstimate(["docs/b.md", "README.md"], ["docs/b.md", "docs/Spec-A.md"], DOCS)).toBe(160);
  });
  it("counts a missing document as 0", () => {
    expect(promptEstimate(["gone.md"], [], DOCS)).toBe(0);
  });
});

describe("buildRows", () => {
  it("appends attachments that are no longer listed as missing", () => {
    const rows = buildRows(DOCS, [
      { path: "docs/b.md", missing: false },
      { path: "gone.md", missing: true },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[3]).toEqual({ path: "gone.md", type: null, tokens: 0, missing: true });
  });
});
