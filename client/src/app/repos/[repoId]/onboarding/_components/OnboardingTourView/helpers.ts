/** Pure helpers for the Onboarding Tour page. */

import type { OnboardingTour } from "@devdigest/shared";
import { DIAGRAM } from "./constants";
import type { DiagramLayout, LaidOutEdge, LaidOutNode } from "./types";

/**
 * Whether a link in model-written text may stay a link (AC-100): only
 * `https://github.com/<owner>/<repo>/…` of this very repo.
 */
export function isRepoLink(href: string, fullName: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password) {
    return false;
  }
  return url.pathname.toLowerCase().startsWith(`/${fullName.toLowerCase()}/`);
}

/** The AC-101 label decision: the server records whether a model call started. */
export function modelCallMade(tour: Pick<OnboardingTour, "model_call_made">): boolean {
  return tour.model_call_made;
}

/** Four decimals below a cent ("$0.0012"), two from a cent up ("$0.01", "$1.23"). */
export function formatCost(usd: number): string {
  return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
}

/** Whether the index covered fewer files than the repo has candidates (AC-74). */
export function isPartialIndex(tour: Pick<OnboardingTour, "indexed_files" | "candidate_files">): boolean {
  return tour.indexed_files < tour.candidate_files;
}

/** Whether `#hash` names one of the tour's section anchors. */
export function sectionIdFromHash(hash: string, ids: readonly string[]): string | null {
  const id = decodeHash(hash.replace(/^#/, ""));
  return ids.includes(id) ? id : null;
}

function decodeHash(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Shorten a diagram label so it fits its box. */
export function truncateLabel(label: string, max: number = DIAGRAM.labelMax): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Place diagram nodes deterministically: columns by dependency depth (cycles
 * are cut at the node count), rows in input order, each column centred.
 * Edges to unknown nodes and self-edges are dropped.
 */
export function layoutDiagram(diagram: {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; weight: number }[];
}): DiagramLayout {
  const { nodeWidth: W, nodeHeight: H, gapX, gapY, pad, pairOffset } = DIAGRAM;
  const ids = new Set(diagram.nodes.map((n) => n.id));
  const edges = diagram.edges.filter((e) => e.from !== e.to && ids.has(e.from) && ids.has(e.to));

  const depth = new Map(diagram.nodes.map((n) => [n.id, 0]));
  const cap = Math.max(diagram.nodes.length - 1, 0);
  for (let pass = 0; pass < diagram.nodes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const next = Math.min((depth.get(e.from) ?? 0) + 1, cap);
      if (next > (depth.get(e.to) ?? 0)) {
        depth.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byDepth = new Map<number, string[]>();
  for (const n of diagram.nodes) {
    const d = depth.get(n.id) ?? 0;
    const col = byDepth.get(d);
    if (col) col.push(n.id);
    else byDepth.set(d, [n.id]);
  }
  // Compact: depths can have holes (cycles), columns must not.
  const columns = [...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => ids);
  const tallest = Math.max(1, ...columns.map((c) => c.length));
  const innerHeight = tallest * H + (tallest - 1) * gapY;
  const labels = new Map(diagram.nodes.map((n) => [n.id, n.label]));

  const nodes: LaidOutNode[] = [];
  const pos = new Map<string, { cx: number; cy: number }>();
  columns.forEach((col, ci) => {
    const colHeight = col.length * H + (col.length - 1) * gapY;
    const top = pad + (innerHeight - colHeight) / 2;
    col.forEach((id, ri) => {
      const x = pad + ci * (W + gapX);
      const y = top + ri * (H + gapY);
      nodes.push({ id, label: labels.get(id) ?? id, x, y });
      pos.set(id, { cx: x + W / 2, cy: y + H / 2 });
    });
  });

  const has = new Set(edges.map((e) => `${e.from}\u0000${e.to}`));
  const laid: LaidOutEdge[] = edges.map((e, i) => {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const len = Math.hypot(dx, dy) || 1;
    // Distance from a box centre to its border along the edge direction.
    const t = Math.min(
      dx === 0 ? Infinity : W / 2 / Math.abs(dx),
      dy === 0 ? Infinity : H / 2 / Math.abs(dy),
    );
    const paired = has.has(`${e.to}\u0000${e.from}`);
    const ox = paired ? (-dy / len) * pairOffset : 0;
    const oy = paired ? (dx / len) * pairOffset : 0;
    const x1 = a.cx + dx * t + ox;
    const y1 = a.cy + dy * t + oy;
    const x2 = b.cx - dx * t + ox;
    const y2 = b.cy - dy * t + oy;
    return {
      key: `${e.from}->${e.to}#${i}`,
      from: e.from,
      to: e.to,
      weight: e.weight,
      x1,
      y1,
      x2,
      y2,
      mx: (x1 + x2) / 2,
      my: (y1 + y2) / 2,
    };
  });

  const cols = Math.max(columns.length, 1);
  return {
    width: pad * 2 + cols * W + (cols - 1) * gapX,
    height: pad * 2 + innerHeight,
    nodes,
    edges: laid,
  };
}
