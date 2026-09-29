import type { BlastRadius } from "@devdigest/shared";
import { COLUMN_GAP, COLUMN_WIDTH, NODE_HEIGHT, ROW_GAP } from "./constants";

const LABEL_MAX = 22;

export type GraphNodeKind = "symbol" | "caller" | "endpoint";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Truncated for the node box — the untruncated form goes in `title`. */
  label: string;
  fullLabel: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

function truncate(label: string): string {
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
}

/**
 * Three columns: changed symbols -> their distinct callers (deduplicated by
 * `file:name`, so the same function called from two symbols collapses to one
 * node) -> the endpoints/crons those SPECIFIC callers reach (per-caller facts,
 * not the group-level union — a caller with no HTTP surface draws no edge into
 * column 3). Column order follows the server's rank order; nothing is re-sorted.
 */
export function layoutGraph(radius: Pick<BlastRadius, "downstream">): GraphLayout {
  const symbolNodes: GraphNode[] = [];
  const callerNodes = new Map<string, GraphNode>();
  const endpointNodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();

  const addEdge = (from: string, to: string) => {
    const id = `${from}->${to}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, from, to });
  };

  for (const group of radius.downstream) {
    const symbolId = `symbol:${group.symbol}`;
    if (!symbolNodes.some((n) => n.id === symbolId)) {
      symbolNodes.push({ id: symbolId, kind: "symbol", label: truncate(group.symbol), fullLabel: group.symbol, x: 0, y: 0 });
    }
    for (const caller of group.callers) {
      const callerId = `caller:${caller.file}:${caller.name}`;
      if (!callerNodes.has(callerId)) {
        callerNodes.set(callerId, {
          id: callerId,
          kind: "caller",
          label: truncate(caller.name),
          fullLabel: `${caller.name} (${caller.file}:${caller.line})`,
          x: 0,
          y: 0,
        });
      }
      addEdge(symbolId, callerId);

      for (const endpoint of caller.endpoints ?? []) {
        const endpointId = `endpoint:${endpoint}`;
        if (!endpointNodes.has(endpointId)) {
          endpointNodes.set(endpointId, { id: endpointId, kind: "endpoint", label: truncate(endpoint), fullLabel: endpoint, x: 0, y: 0 });
        }
        addEdge(callerId, endpointId);
      }
      for (const cron of caller.crons ?? []) {
        const cronId = `endpoint:${cron}`;
        if (!endpointNodes.has(cronId)) {
          endpointNodes.set(cronId, { id: cronId, kind: "endpoint", label: truncate(cron), fullLabel: cron, x: 0, y: 0 });
        }
        addEdge(callerId, cronId);
      }
    }
  }

  const columns = [symbolNodes, [...callerNodes.values()], [...endpointNodes.values()]];
  columns.forEach((col, ci) => {
    col.forEach((node, ri) => {
      node.x = ci * (COLUMN_WIDTH + COLUMN_GAP);
      node.y = ri * (NODE_HEIGHT + ROW_GAP);
    });
  });

  const rows = Math.max(1, ...columns.map((c) => c.length));
  const height = rows * (NODE_HEIGHT + ROW_GAP) - ROW_GAP;
  const width = columns.length * COLUMN_WIDTH + (columns.length - 1) * COLUMN_GAP;

  return { nodes: columns.flat(), edges, width, height };
}

/** A cubic Bézier from the right edge of `from` to the left edge of `to`. */
export function edgePath(nodesById: Map<string, GraphNode>, edge: GraphEdge): string | null {
  const from = nodesById.get(edge.from);
  const to = nodesById.get(edge.to);
  if (!from || !to) return null;
  const x1 = from.x + COLUMN_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}
