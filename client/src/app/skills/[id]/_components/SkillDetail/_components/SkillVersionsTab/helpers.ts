import type { PrFile } from "@devdigest/shared";
import { DIFF_MAX_LINES } from "./constants";

/** One step of a line-level diff, in output order. */
export interface DiffOp {
  kind: "ctx" | "del" | "add";
  text: string;
}

/**
 * Line diff of two texts, longest-common-subsequence based.
 *
 * Written here rather than pulled from a library because the DiffViewer we
 * reuse takes a unified-diff STRING (it is built for GitHub patches, which
 * arrive pre-diffed) and nothing in the client produces one. This is the
 * missing half: compare, then render through the existing viewer.
 *
 * Over DIFF_MAX_LINES the LCS table (O(n·m) cells) stops being worth it for a
 * body no one reads line by line, so the diff degrades to "all of it changed",
 * which is still true and still renders.
 */
export function diffLines(before: string[], after: string[]): DiffOp[] {
  if (before.length + after.length > DIFF_MAX_LINES) {
    return [
      ...before.map((text): DiffOp => ({ kind: "del", text })),
      ...after.map((text): DiffOp => ({ kind: "add", text })),
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of before[i..] / after[j..].
  const lcs: number[][] = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        before[i] === after[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      ops.push({ kind: "ctx", text: before[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      // Deletions before additions, so a replaced line reads "-old" then "+new".
      ops.push({ kind: "del", text: before[i]! });
      i++;
    } else {
      ops.push({ kind: "add", text: after[j]! });
      j++;
    }
  }
  while (i < before.length) ops.push({ kind: "del", text: before[i++]! });
  while (j < after.length) ops.push({ kind: "add", text: after[j++]! });
  return ops;
}

/** The three prefixes a unified diff uses, keyed by op kind. */
const PREFIX: Record<DiffOp["kind"], string> = { ctx: " ", del: "-", add: "+" };

/**
 * Render two texts as a single-hunk unified diff. One hunk covering the whole
 * file (no context trimming): a skill body is short, and hiding unchanged
 * paragraphs from someone deciding whether to restore a version would be the
 * wrong economy.
 */
export function toUnifiedDiff(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const ops = diffLines(beforeLines, afterLines);
  return renderHunk(ops, beforeLines.length, afterLines.length);
}

function renderHunk(ops: DiffOp[], oldCount: number, newCount: number): string {
  const header = `@@ -1,${oldCount} +1,${newCount} @@`;
  return [header, ...ops.map((op) => PREFIX[op.kind] + op.text)].join("\n");
}

/**
 * A synthetic PrFile so the shared DiffViewer can render a skill body diff.
 * The viewer only ever reads path, patch and the two counts.
 */
export function toDiffFile(path: string, before: string, after: string): PrFile {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const ops = diffLines(beforeLines, afterLines);
  return {
    path,
    additions: ops.filter((op) => op.kind === "add").length,
    deletions: ops.filter((op) => op.kind === "del").length,
    patch: renderHunk(ops, beforeLines.length, afterLines.length),
  };
}

/**
 * `YYYY-MM-DD HH:mm` in UTC for a version row.
 *
 * Deliberately not Intl.DateTimeFormat: a month name depends on the CLDR data
 * baked into the runtime ("Sep" vs "Sept" across Node versions), and the local
 * timezone would make a snapshot look like it was written on another day than
 * the one the server recorded.
 */
export function formatVersionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 16).replace("T", " ");
}
