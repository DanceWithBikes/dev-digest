/* diff-text.ts — pure text-diff helpers: a line diff of two texts rendered as a
   unified diff, and a splitter for a pasted multi-file unified diff. */
import type { PrFile } from "@devdigest/shared";

/**
 * Combined line budget for the LCS diff. Beyond it the diff degrades to a
 * whole-body replacement instead of filling an O(n·m) table.
 */
export const DIFF_MAX_LINES = 4000;

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
 * Split a pasted unified diff into one synthetic PrFile per file.
 *
 * The path comes from the `+++ b/<path>` line, exactly as the server parser
 * does; `/dev/null` (a deleted file) falls back to the `--- a/<path>` line.
 * A diff with no `--- ` / `+++ ` header pair (a bare hunk, plain text) yields
 * no files. `patch` holds the hunks only (from the first `@@` on), which is
 * what the DiffViewer reads.
 */
export function splitUnifiedDiff(text: string): PrFile[] {
  const lines = text.split("\n");
  const files: PrFile[] = [];
  let current: { path: string; patch: string[]; additions: number; deletions: number } | null = null;
  let oldPath: string | null = null;
  let inHunk = false;
  // Lines the current hunk still owes, from its `@@ -a,b +c,d @@` header.
  let oldRem = 0;
  let newRem = 0;

  const flush = () => {
    if (current) {
      files.push({
        path: current.path,
        additions: current.additions,
        deletions: current.deletions,
        patch: current.patch.join("\n"),
      });
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("diff --git ")) {
      flush();
      oldPath = null;
      inHunk = false;
      oldRem = newRem = 0;
      continue;
    }
    const hunkOpen = oldRem > 0 || newRem > 0;
    // While a hunk still owes lines, `--- ` / `+++ ` are content; once both
    // counts are spent, such a pair opens the next file (no `diff --git` needed).
    if (!hunkOpen && line.startsWith("--- ") && (lines[i + 1] ?? "").startsWith("+++ ")) {
      flush();
      inHunk = false;
      oldPath = stripPrefix(line.slice(4), "a/");
      const newPath = stripPrefix(lines[i + 1]!.slice(4), "b/");
      const path = newPath === "/dev/null" ? oldPath : newPath;
      if (path && path !== "/dev/null") current = { path, patch: [], additions: 0, deletions: 0 };
      i++;
      continue;
    }
    if (!current) continue;
    if (!hunkOpen && line.startsWith("@@")) {
      inHunk = true;
      const m = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
      oldRem = m ? Number(m[1] ?? 1) : 0;
      newRem = m ? Number(m[2] ?? 1) : 0;
    } else if (!inHunk) continue;
    else if (line.startsWith("+")) newRem--;
    else if (line.startsWith("-")) oldRem--;
    else if (!line.startsWith("\\")) {
      oldRem--;
      newRem--;
    }
    current.patch.push(line);
    if (line.startsWith("+")) current.additions++;
    else if (line.startsWith("-")) current.deletions++;
  }
  flush();
  return files;
}

function stripPrefix(raw: string, prefix: string): string {
  const value = raw.split("\t")[0]!.trim();
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
