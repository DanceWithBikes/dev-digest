import type { UnifiedDiff, DiffHunk } from '@devdigest/shared';

/**
 * Minimal unified-diff parser. Extracts per-file hunks and the set of new-side
 * line numbers each hunk covers — exactly what the citation-grounding gate
 * needs (file:line must intersect a real hunk).
 *
 * Handles standard `git diff` output:
 *   diff --git a/path b/path
 *   --- a/path
 *   +++ b/path
 *   @@ -oldStart,oldLines +newStart,newLines @@
 */
export function parseUnifiedDiff(raw: string): UnifiedDiff {
  const files: UnifiedDiff['files'] = [];
  const lines = raw.split('\n');

  let current: UnifiedDiff['files'][number] | null = null;
  let hunk: DiffHunk | null = null;
  let newLineCursor = 0;
  // Lines the current hunk header still promises on each side. While either is
  // positive a line is hunk content, so `--- x` / `+++ x` bodies are not headers.
  let oldRemaining = 0;
  let newRemaining = 0;

  const flushHunk = () => {
    if (current && hunk) current.hunks.push(hunk);
    hunk = null;
  };
  const flushFile = () => {
    flushHunk();
    if (current) files.push(current);
    current = null;
  };

  for (const line of lines) {
    if (current && hunk && (oldRemaining > 0 || newRemaining > 0)) {
      const h: DiffHunk = hunk;
      if (line.startsWith('+')) {
        current.additions++;
        h.newLineNumbers.push(newLineCursor++);
        newRemaining--;
      } else if (line.startsWith('-')) {
        current.deletions++;
        oldRemaining--;
      } else {
        // context (or a `\ No newline` marker, which HEAD also counted as context)
        h.newLineNumbers.push(newLineCursor++);
        if (!line.startsWith('\\')) {
          oldRemaining--;
          newRemaining--;
        }
      }
      continue;
    }
    if (line.startsWith('diff --git')) {
      flushFile();
      // path resolved from +++ line below; placeholder for now
      current = { path: '', additions: 0, deletions: 0, hunks: [] };
      continue;
    }
    if (line.startsWith('+++ ')) {
      if (!current) current = { path: '', additions: 0, deletions: 0, hunks: [] };
      const p = line.slice(4).replace(/^b\//, '').trim();
      current.path = p === '/dev/null' ? current.path : p;
      continue;
    }
    if (line.startsWith('--- ')) {
      // A `---` after finished hunks starts a new file even without `diff --git`
      // (concatenated `fileDiff()` outputs).
      if (current && hunk) {
        flushFile();
        current = { path: '', additions: 0, deletions: 0, hunks: [] };
      }
      continue;
    }
    const hh = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hh) {
      flushHunk();
      const newStart = Number(hh[3]);
      const newLines = hh[4] ? Number(hh[4]) : 1;
      hunk = {
        file: current?.path ?? '',
        oldStart: Number(hh[1]),
        oldLines: hh[2] ? Number(hh[2]) : 1,
        newStart,
        newLines,
        newLineNumbers: [],
      };
      newLineCursor = newStart;
      oldRemaining = hunk.oldLines;
      newRemaining = newLines;
      continue;
    }
    if (!current || !hunk) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions++;
      hunk.newLineNumbers.push(newLineCursor);
      newLineCursor++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions++;
      // deletion: no new-side line consumed
    } else {
      // context line: advances new-side cursor and counts as covered
      hunk.newLineNumbers.push(newLineCursor);
      newLineCursor++;
    }
  }
  flushFile();

  return { raw, files: files.filter((f) => f.path) };
}

/**
 * Wrap one file's stored patch (hunks only, no file header) into unified diff
 * text that `parseUnifiedDiff` resolves to exactly that file. A bare patch
 * parses to 0 files because the path comes from the `+++ ` line.
 */
export function fileDiff(path: string, patch: string): string {
  return `--- a/${path}\n+++ b/${path}\n${patch}`;
}
