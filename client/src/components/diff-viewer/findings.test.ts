import { describe, it, expect } from "vitest";
import { anchorFindings, findingsForLine, type DiffFindingAnchor } from "./findings";
import type { Line } from "./helpers";

describe("anchorFindings", () => {
  it("matches an anchor whose line is rendered on the RIGHT side", () => {
    const anchors: DiffFindingAnchor[] = [{ id: "f1", line: 12 }];
    const { matched, unanchored } = anchorFindings(anchors, new Set(["RIGHT:12"]));
    expect(matched.get("RIGHT:12")).toEqual([{ id: "f1", line: 12 }]);
    expect(unanchored).toEqual([]);
  });

  it("surfaces an anchor as unanchored when its line isn't in the rendered patch", () => {
    const anchors: DiffFindingAnchor[] = [{ id: "f1", line: 999 }];
    const { matched, unanchored } = anchorFindings(anchors, new Set(["RIGHT:12"]));
    expect(matched.size).toBe(0);
    expect(unanchored).toEqual([{ id: "f1", line: 999 }]);
  });

  it("groups multiple anchors on the same line under one key", () => {
    const anchors: DiffFindingAnchor[] = [
      { id: "f1", line: 12 },
      { id: "f2", line: 12 },
    ];
    const { matched } = anchorFindings(anchors, new Set(["RIGHT:12"]));
    expect(matched.get("RIGHT:12")).toHaveLength(2);
  });
});

describe("findingsForLine", () => {
  const matched = new Map<string, DiffFindingAnchor[]>([["RIGHT:12", [{ id: "f1", line: 12 }]]]);

  it("returns the anchors for an add/ctx line whose newNo matches", () => {
    const ln: Line = { kind: "add", text: "x", newNo: 12 };
    expect(findingsForLine(ln, matched)).toEqual([{ id: "f1", line: 12 }]);
  });

  it("returns none for a line with no match, or a del line (no RIGHT number)", () => {
    const other: Line = { kind: "ctx", text: "x", oldNo: 5, newNo: 5 };
    expect(findingsForLine(other, matched)).toEqual([]);
    const del: Line = { kind: "del", text: "x", oldNo: 5 };
    expect(findingsForLine(del, matched)).toEqual([]);
  });

  it("short-circuits to an empty array when nothing is matched at all", () => {
    const ln: Line = { kind: "add", text: "x", newNo: 12 };
    expect(findingsForLine(ln, new Map())).toEqual([]);
  });
});
