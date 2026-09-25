/* Finding injection for the DiffViewer (Files changed / Smart Diff tab). The
   viewer never imports FindingCard (it lives under src/app, and shared code
   never imports a route) — so the caller (DiffTab) renders the card and hands
   the viewer only anchors + a render callback, mirroring DiffCommentApi. */
import type { CSSProperties } from "react";
import type { ReactNode } from "react";
import { lineKey } from "./comments";
import type { Line } from "./helpers";

/** Where one finding anchors in the diff: the line it was reported on. */
export interface DiffFindingAnchor {
  id: string;
  line: number;
}

/** What the viewer needs to read + render findings inline. */
export interface DiffFindingApi {
  /** Finding anchors, per file path — drawn from ALL of the PR's review runs. */
  byPath: Map<string, DiffFindingAnchor[]>;
  /** Renders one finding's card — supplied by DiffTab, which owns FindingCard. */
  renderFinding: (findingId: string) => ReactNode;
  /**
   * Step 8: the "pseudocode summary" per file path, only for files with a
   * still-valid cached summary. Optional — undefined (or an empty map) means
   * every file renders exactly as it did before step 8, which is what makes
   * that step droppable.
   */
  summaryByPath?: Map<string, string>;
}

/**
 * Split one file's finding anchors into ones that land on a rendered line
 * (keyed via `lineKey("RIGHT", line)`, mirroring `keysForLine`) and
 * "unanchored" ones whose line isn't in this patch — surfaced separately so
 * nothing is silently dropped, the same policy `partitionThreads` uses for
 * outdated comments.
 */
export function anchorFindings(
  anchors: DiffFindingAnchor[],
  renderedKeys: Set<string>,
): { matched: Map<string, DiffFindingAnchor[]>; unanchored: DiffFindingAnchor[] } {
  const matched = new Map<string, DiffFindingAnchor[]>();
  const unanchored: DiffFindingAnchor[] = [];
  for (const a of anchors) {
    const key = lineKey("RIGHT", a.line);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(a);
      matched.set(key, list);
    } else {
      unanchored.push(a);
    }
  }
  return { matched, unanchored };
}

/** Anchors matching a given parsed line, resolved via the same keys threads use. */
export function findingsForLine(ln: Line, matched: Map<string, DiffFindingAnchor[]>): DiffFindingAnchor[] {
  if (matched.size === 0) return [];
  const key = lineKey("RIGHT", ln.newNo);
  return (key && matched.get(key)) || [];
}

// ---- styles (layout only; the card itself is FindingCard, supplied by the caller) ----
export const fs = {
  /** Unanchored findings render at the top of the file body, not dropped. */
  unanchoredWrap: {
    margin: "6px 14px 10px 58px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  /** The per-file "has findings" indicator, beside the comment-count chip. */
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    background: "var(--crit)",
    display: "inline-block",
  } satisfies CSSProperties,
  /** Step 8's "What this does: …" line, above the diff body. */
  summaryLine: {
    margin: "8px 14px 4px 14px",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    fontStyle: "italic",
  } satisfies CSSProperties,
} as const;
