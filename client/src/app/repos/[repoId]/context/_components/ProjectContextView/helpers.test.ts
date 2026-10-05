import { describe, it, expect } from "vitest";
import { buildTree, filterPaths, parseRoots, rootsErrorMessage } from "./helpers";

describe("buildTree", () => {
  it("groups paths by directory, sorted, with root files under an empty dir", () => {
    const tree = buildTree(["docs/b.md", "README.md", "docs/a.md", "client/docs/x.md"]);
    expect(tree.map((g) => g.dir)).toEqual(["", "client/docs", "docs"]);
    expect(tree[2]!.files.map((f) => f.name)).toEqual(["a.md", "b.md"]);
    expect(tree[0]!.files[0]).toEqual({ path: "README.md", name: "README.md" });
  });
});

describe("filterPaths", () => {
  it("matches a substring ignoring case", () => {
    const items = [{ path: "docs/Spec.md" }, { path: "docs/b.md" }];
    expect(filterPaths(items, "SPEC")).toEqual([{ path: "docs/Spec.md" }]);
    expect(filterPaths(items, "")).toHaveLength(2);
  });
});

describe("parseRoots", () => {
  it("trims lines and drops blanks", () => {
    expect(parseRoots(" docs/** \n\n  specs/*.md\n")).toEqual(["docs/**", "specs/*.md"]);
  });
});

describe("rootsErrorMessage", () => {
  it("reads the issue message from the validation envelope", () => {
    const err = { message: "Request validation failed", details: [{ params: { issue: { message: "bad root" } } }] };
    expect(rootsErrorMessage(err)).toBe("bad root");
  });
  it("falls back to the error message", () => {
    expect(rootsErrorMessage({ message: "boom" })).toBe("boom");
  });
});
