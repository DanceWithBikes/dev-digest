import type { PrIntentRecord } from '@devdigest/shared';
import type { IntentDiffFile, IntentHunk } from './ports.js';

/**
 * Pure assembly of the gathered sources into prompt text, plus the
 * file+hunk-header digest. Never touches `UnifiedDiff` or its `.raw` —
 * `IntentDiffFile` only carries `path` + hunk numbers (plan §1: "diff bodies
 * are never sent").
 */

/**
 * Re-render the `@@ -a,b +c,d @@` header from the numbers the diff parser
 * keeps (`adapters/git/diff-parser.ts:46` discards the header text itself).
 */
export function renderHunkHeader(hunk: IntentHunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
}

/** One line per changed file, followed by its hunk headers only — never a
 *  diff line body. */
export function renderFilesDigest(files: IntentDiffFile[]): string {
  if (files.length === 0) return '(no changed files)';
  return files
    .map((f) => {
      const headers = f.hunks.map(renderHunkHeader).join('\n  ');
      return headers ? `${f.path}\n  ${headers}` : f.path;
    })
    .join('\n');
}

/** Commit messages, oldest first, one subject line per commit. */
export function renderCommitsDigest(messages: string[]): string {
  if (messages.length === 0) return '(no commits)';
  return messages.map((m) => `- ${m.split(/\r?\n/, 1)[0]}`).join('\n');
}

/**
 * Render a stored `PrIntentRecord` into the reviewer's `intent` prompt slot
 * (plan §2/§5): the summary, what's in/out of scope, and the gaps the
 * classifier itself flagged — so the reviewer sees where the evidence was
 * thin, not just a confident-sounding sentence. The caller (`run-executor.ts`)
 * passes the result as `ReviewInput.intent`; `reviewer-core` wraps it in
 * `<untrusted source="intent">` and prefixes `## PR intent (derived)` — this
 * function returns only the body text.
 */
export function renderIntentForPrompt(record: PrIntentRecord): string {
  const parts: string[] = [record.intent];

  if (record.in_scope.length > 0) {
    parts.push(`In scope:\n${record.in_scope.map((s) => `- ${s}`).join('\n')}`);
  }
  if (record.out_of_scope.length > 0) {
    parts.push(`Out of scope:\n${record.out_of_scope.map((s) => `- ${s}`).join('\n')}`);
  }
  const missing = record.missing_context ?? [];
  if (missing.length > 0) {
    parts.push(`Missing context (unresolved sources — do not treat as evidence):\n${missing
      .map((s) => `- ${s}`)
      .join('\n')}`);
  }

  return parts.join('\n\n');
}
