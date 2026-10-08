import { describe, it, expect } from "vitest";
import { diffLines, splitUnifiedDiff, toDiffFile, toUnifiedDiff } from "./diff-text";

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

describe("splitUnifiedDiff", () => {
  const TWO_FILES = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,2 @@",
    " keep",
    "-old",
    "+new",
    "diff --git a/src/b.ts b/src/b.ts",
    "--- a/src/b.ts",
    "+++ b/src/b.ts",
    "@@ -1 +1,2 @@",
    " x",
    "+y",
  ].join("\n");

  it("returns one PrFile per file with counts and a hunks-only patch", () => {
    const files = splitUnifiedDiff(TWO_FILES);
    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(files[0]).toMatchObject({ additions: 1, deletions: 1 });
    expect(files[0]!.patch?.startsWith("@@ -1,2 +1,2 @@")).toBe(true);
    expect(files[1]).toMatchObject({ additions: 1, deletions: 0 });
  });

  it("works without `diff --git` lines and keeps '--' / '++' body lines inside the hunk", () => {
    const files = splitUnifiedDiff("--- a/f.ts\n+++ b/f.ts\n@@ -1 +1 @@\n--- removed\n+++ added");
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: "f.ts", additions: 1, deletions: 1 });
  });

  it("splits two concatenated per-file diffs that carry no `diff --git` line", () => {
    const text = [
      "--- a/one.ts", "+++ b/one.ts", "@@ -1 +1 @@", "-a", "+b",
      "--- a/two.ts", "+++ b/two.ts", "@@ -1 +1,2 @@", " k", "+n",
    ].join("\n");
    const files = splitUnifiedDiff(text);
    expect(files.map((f) => f.path)).toEqual(["one.ts", "two.ts"]);
    expect(files[0]).toMatchObject({ additions: 1, deletions: 1 });
    expect(files[1]).toMatchObject({ additions: 1, deletions: 0 });
  });

  it("keeps `-- ` / `++ ` content lines mid-hunk in the same file", () => {
    const text = ["--- a/f.ts", "+++ b/f.ts", "@@ -1,3 +1,3 @@", " ctx", "--- removed", "+++ added", " tail"].join("\n");
    const files = splitUnifiedDiff(text);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: "f.ts", additions: 1, deletions: 1 });
  });

  it("uses the old path for a deleted file", () => {
    const files = splitUnifiedDiff("--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x");
    expect(files.map((f) => f.path)).toEqual(["gone.ts"]);
  });

  it("yields 0 files for a headerless patch or plain text", () => {
    expect(splitUnifiedDiff("@@ -1 +1 @@\n-a\n+b")).toEqual([]);
    expect(splitUnifiedDiff("hello")).toEqual([]);
    expect(splitUnifiedDiff("")).toEqual([]);
  });
});
