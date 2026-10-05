/* SPEC-02 pure client rules: the link policy (AC-100), the cost label inputs
   (AC-101), the partial-index decision (AC-74), and the diagram layout (AC-91):
   a link may stay a link only when it points into THIS repo on github.com. */
import { describe, it, expect } from "vitest";
import { formatCost, isPartialIndex, isRepoLink, layoutDiagram, modelCallMade, sectionIdFromHash, truncateLabel } from "./helpers";

describe("isRepoLink (AC-100)", () => {
  const repo = "acme/payments-api";
  it.each([
    "https://github.com/acme/payments-api/blob/abc/src/a.ts",
    "https://github.com/acme/payments-api/pull/12",
    "https://github.com/Acme/Payments-API/tree/main",
  ])("AC-100: keeps %s as a link", (href) => {
    expect(isRepoLink(href, repo)).toBe(true);
  });

  it.each([
    "https://example.com/",
    "https://github.com/other/repo/blob/abc/a.ts",
    "https://github.com/acme/payments-api-evil/blob/abc/a.ts",
    "https://github.com/acme/payments-apix/",
    "http://github.com/acme/payments-api/blob/a",
    "https://github.com.evil.com/acme/payments-api/blob/a",
    "https://evil.com/https://github.com/acme/payments-api/",
    "https://user:pw@github.com/acme/payments-api/blob/a",
    "https://github.com/acme/payments-api/../../evil/repo/x",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "/relative/path",
    "#anchor",
    "",
  ])("AC-100: renders %j as plain text", (href) => {
    expect(isRepoLink(href, repo)).toBe(false);
  });
});

describe("header labels (AC-73, AC-74, AC-101)", () => {
  it("AC-74: a partial index is indexed < candidates", () => {
    expect(isPartialIndex({ indexed_files: 5000, candidate_files: 12450 })).toBe(true);
    expect(isPartialIndex({ indexed_files: 5, candidate_files: 5 })).toBe(false);
  });

  it("AC-101: whether a model call was made comes from the tour record, not from the cost or the tokens", () => {
    expect(modelCallMade({ model_call_made: false })).toBe(false);
    expect(modelCallMade({ model_call_made: true })).toBe(true);
  });

  it("AC-101: costs below a cent keep four decimals so they are not shown as $0.00", () => {
    expect(formatCost(0.0034)).toBe("$0.0034");
    expect(formatCost(0.0123)).toBe("$0.01");
    expect(formatCost(1.234)).toBe("$1.23");
  });
});

describe("sectionIdFromHash (AC-77)", () => {
  const ids = ["architecture", "critical-paths", "run-locally", "reading-path", "first-tasks"];
  it("AC-77: a fragment naming a section anchor resolves to it; an unknown fragment resolves to nothing", () => {
    expect(sectionIdFromHash("#reading-path", ids)).toBe("reading-path");
    expect(sectionIdFromHash("reading-path", ids)).toBe("reading-path");
    expect(sectionIdFromHash("#nope", ids)).toBeNull();
    expect(sectionIdFromHash("", ids)).toBeNull();
    expect(sectionIdFromHash("#%E0%A4%A", ids)).toBeNull();
  });
});

describe("layoutDiagram (AC-91)", () => {
  it("AC-91: gives every node a distinct place and every directed edge a start and an end on different boxes", () => {
    const layout = layoutDiagram({
      nodes: [
        { id: "a", label: "a" },
        { id: "b", label: "b" },
        { id: "c", label: "c" },
      ],
      edges: [
        { from: "a", to: "b", weight: 2 },
        { from: "b", to: "c", weight: 1 },
      ],
    });
    expect(layout.nodes).toHaveLength(3);
    expect(new Set(layout.nodes.map((n) => `${n.x},${n.y}`)).size).toBe(3);
    expect(layout.edges.map((e) => [e.from, e.to, e.weight])).toEqual([
      ["a", "b", 2],
      ["b", "c", 1],
    ]);
    for (const e of layout.edges) expect([e.x1, e.y1]).not.toEqual([e.x2, e.y2]);
    // An importer sits left of what it imports, so the arrow points the way the import goes.
    const x = (id: string) => layout.nodes.find((n) => n.id === id)!.x;
    expect(x("a")).toBeLessThan(x("b"));
    expect(x("b")).toBeLessThan(x("c"));
  });

  it.each([
    ["a mutual dependency", [{ id: "a", label: "a" }, { id: "b", label: "b" }], [["a", "b"], ["b", "a"]]],
    ["a three-node cycle", [{ id: "a", label: "a" }, { id: "b", label: "b" }, { id: "c", label: "c" }], [["a", "b"], ["b", "c"], ["c", "a"]]],
  ] as const)("AC-91: %s still gets finite coordinates for every node, edge and the canvas", (_n, nodes, pairs) => {
    const layout = layoutDiagram({
      nodes: nodes.map((n) => ({ ...n })),
      edges: pairs.map(([from, to]) => ({ from, to, weight: 1 })),
    });
    const numbers = [
      layout.width,
      layout.height,
      ...layout.nodes.flatMap((n) => [n.x, n.y]),
      ...layout.edges.flatMap((e) => [e.x1, e.y1, e.x2, e.y2, e.mx, e.my]),
    ];
    expect(numbers.every((v) => Number.isFinite(v))).toBe(true);
    expect(layout.edges).toHaveLength(pairs.length);
  });

  it("AC-91: drops an edge to an unknown node and a self-edge, and survives a cycle", () => {
    const layout = layoutDiagram({
      nodes: [{ id: "a", label: "a" }, { id: "b", label: "b" }],
      edges: [
        { from: "a", to: "b", weight: 1 },
        { from: "b", to: "a", weight: 1 },
        { from: "a", to: "a", weight: 9 },
        { from: "a", to: "ghost", weight: 1 },
      ],
    });
    expect(layout.edges.map((e) => `${e.from}->${e.to}`)).toEqual(["a->b", "b->a"]);
    expect(layout.nodes).toHaveLength(2);
  });

  it("AC-91: an empty diagram lays out nothing", () => {
    expect(layoutDiagram({ nodes: [], edges: [] }).nodes).toEqual([]);
  });
});

describe("truncateLabel (AC-30 group labels)", () => {
  it("keeps a 20-character group path whole and shortens a longer one with an ellipsis", () => {
    expect(truncateLabel("server/modules/agent")).toBe("server/modules/agent");
    const long = "packages/something/very/deep/path";
    expect(truncateLabel(long)).toHaveLength(22);
    expect(truncateLabel(long).endsWith("…")).toBe(true);
  });
});
