import { describe, it, expect } from "vitest";
import { diffLines, formatVersionDate, toDiffFile, toUnifiedDiff } from "./helpers";

describe("diffLines", () => {
  it("marks every line as context when nothing changed", () => {
    expect(diffLines(["a", "b"], ["a", "b"])).toEqual([
      { kind: "ctx", text: "a" },
      { kind: "ctx", text: "b" },
    ]);
  });

  it("keeps the surrounding lines as context around an insertion", () => {
    expect(diffLines(["a", "c"], ["a", "b", "c"])).toEqual([
      { kind: "ctx", text: "a" },
      { kind: "add", text: "b" },
      { kind: "ctx", text: "c" },
    ]);
  });

  it("reports a removal", () => {
    expect(diffLines(["a", "b", "c"], ["a", "c"])).toEqual([
      { kind: "ctx", text: "a" },
      { kind: "del", text: "b" },
      { kind: "ctx", text: "c" },
    ]);
  });

  it("emits the deletion before the addition for a replaced line", () => {
    expect(diffLines(["a", "old", "c"], ["a", "new", "c"])).toEqual([
      { kind: "ctx", text: "a" },
      { kind: "del", text: "old" },
      { kind: "add", text: "new" },
      { kind: "ctx", text: "c" },
    ]);
  });

  it("does not resurrect a common line out of order", () => {
    // "b" appears in both, but only one of the two can be a match.
    const ops = diffLines(["b", "x"], ["y", "b"]);
    expect(ops.filter((o) => o.kind === "ctx")).toEqual([{ kind: "ctx", text: "b" }]);
  });

  it("handles an empty side", () => {
    expect(diffLines([], ["a"])).toEqual([{ kind: "add", text: "a" }]);
    expect(diffLines(["a"], [])).toEqual([{ kind: "del", text: "a" }]);
  });
});

describe("toUnifiedDiff", () => {
  it("writes a hunk header with both line counts", () => {
    const patch = toUnifiedDiff("a\nc", "a\nb\nc");
    expect(patch.split("\n")[0]).toBe("@@ -1,2 +1,3 @@");
  });

  it("prefixes context, deletions and additions", () => {
    expect(toUnifiedDiff("a\nold", "a\nnew").split("\n")).toEqual([
      "@@ -1,2 +1,2 @@",
      " a",
      "-old",
      "+new",
    ]);
  });

  it("gives every body line exactly one prefix — the DiffViewer's parser strips one char", () => {
    const [header, ...body] = toUnifiedDiff("a\nold\nc", "a\nnew\nc").split("\n");
    expect(header).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/);
    expect(body.every((line) => [" ", "-", "+"].includes(line[0]!))).toBe(true);
    expect(body).toEqual([" a", "-old", "+new", " c"]);
  });
});

describe("toDiffFile", () => {
  it("counts the changed lines for the file header", () => {
    const file = toDiffFile("rubric.md", "a\nold\nc", "a\nnew\nextra\nc");
    expect(file).toMatchObject({ path: "rubric.md", additions: 2, deletions: 1 });
    expect(file.patch).toContain("+extra");
  });

  it("is a no-op diff when the bodies are identical", () => {
    const file = toDiffFile("rubric.md", "same\ntext", "same\ntext");
    expect(file.additions).toBe(0);
    expect(file.deletions).toBe(0);
  });
});

describe("formatVersionDate", () => {
  it("formats an ISO timestamp in UTC so the row never shifts by timezone", () => {
    expect(formatVersionDate("2026-09-21T08:05:00Z")).toBe("2026-09-21 08:05");
    expect(formatVersionDate("2026-09-21T23:30:00+02:00")).toBe("2026-09-21 21:30");
  });

  it("falls back to the raw value rather than rendering 'Invalid Date'", () => {
    expect(formatVersionDate("not-a-date")).toBe("not-a-date");
  });
});
