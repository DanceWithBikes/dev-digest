import { describe, it, expect } from "vitest";
import type { DownstreamImpact } from "@devdigest/shared";
import { edgePath, layoutGraph } from "./helpers";

function group(o: Partial<DownstreamImpact> & { symbol: string }): DownstreamImpact {
  return { callers: [], endpoints_affected: [], crons_affected: [], ...o };
}

describe("layoutGraph", () => {
  it("dedupes a caller shared by two changed symbols into one node with two edges, and only draws endpoint/cron edges from the specific caller that reaches them", () => {
    const layout = layoutGraph({
      downstream: [
        group({
          symbol: "rateLimit",
          callers: [
            { name: "publicRouter", file: "src/api/public/index.ts", line: 23, endpoints: ["GET /api/public/items"] },
            { name: "healthCheck", file: "src/api/public/health.ts", line: 11 },
          ],
          endpoints_affected: ["GET /api/public/items"],
          crons_affected: [],
        }),
        group({
          symbol: "bucketKey",
          // Same caller (file:name) as rateLimit's first caller — should collapse to one node.
          callers: [{ name: "publicRouter", file: "src/api/public/index.ts", line: 45 }],
          endpoints_affected: [],
          crons_affected: [],
        }),
      ],
    });

    const callerNodes = layout.nodes.filter((n) => n.kind === "caller");
    expect(callerNodes.map((n) => n.label).sort()).toEqual(["healthCheck", "publicRouter"]);

    const publicRouterEdges = layout.edges.filter((e) => e.to === "caller:src/api/public/index.ts:publicRouter");
    expect(publicRouterEdges.map((e) => e.from).sort()).toEqual(["symbol:bucketKey", "symbol:rateLimit"]);

    // healthCheck has no per-caller endpoints, so it draws no edge into column 3.
    const healthCheckOutEdges = layout.edges.filter((e) => e.from === "caller:src/api/public/health.ts:healthCheck");
    expect(healthCheckOutEdges).toHaveLength(0);

    const endpointNodes = layout.nodes.filter((n) => n.kind === "endpoint");
    expect(endpointNodes).toHaveLength(1);
    expect(layout.edges).toContainEqual({
      id: "caller:src/api/public/index.ts:publicRouter->endpoint:GET /api/public/items",
      from: "caller:src/api/public/index.ts:publicRouter",
      to: "endpoint:GET /api/public/items",
    });
  });

  it("returns a Bézier path for a known edge and null for one referencing a missing node", () => {
    const layout = layoutGraph({
      downstream: [group({ symbol: "a", callers: [{ name: "b", file: "f.ts", line: 1, endpoints: ["GET /x"] }] })],
    });
    const nodesById = new Map(layout.nodes.map((n) => [n.id, n]));
    const edge = layout.edges[0]!;
    expect(edgePath(nodesById, edge)).toMatch(/^M \d+ \d+ C /);
    expect(edgePath(nodesById, { id: "x", from: "symbol:missing", to: "caller:missing" })).toBeNull();
  });

  it("produces no nodes or edges for a changed symbol with no callers", () => {
    const layout = layoutGraph({ downstream: [group({ symbol: "lonely" })] });
    expect(layout.edges).toHaveLength(0);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]!.kind).toBe("symbol");
  });
});
