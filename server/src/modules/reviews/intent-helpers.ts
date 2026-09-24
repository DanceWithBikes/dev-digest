import type { IntentSource } from '@devdigest/shared';
import type { IntentDiffFiles } from './ports.js';

/** `ok: false` → an entry in `missing_context[]` — the honesty field. */
export function deriveMissingContext(attempts: IntentSource[]): string[] {
  return attempts.filter((a) => !a.ok).map(describeMissingSource);
}

function describeMissingSource(attempt: IntentSource): string {
  switch (attempt.kind) {
    case 'body':
      return 'PR description is empty';
    case 'issue':
      return `Linked issue ${attempt.ref ?? ''} could not be read`.trim();
    case 'spec':
      return `Linked spec "${attempt.ref ?? ''}" could not be read`.trim();
    default:
      return `${attempt.kind} unavailable`;
  }
}

/**
 * `#123` / `closes #123` / `fixes #123` / `resolves #123` — first match wins.
 * Mirrors the regex `adapters/github/octokit.ts`'s `resolveLinkedIssue` uses
 * on a fresh GitHub fetch; this one runs on the PERSISTED
 * `pull_requests.body`, since the Intent Layer does not re-fetch the PR.
 */
const ISSUE_REF_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

export function parseIssueRef(body: string | null | undefined): number | null {
  if (!body) return null;
  const m = body.match(ISSUE_REF_RE);
  return m?.[1] ? Number(m[1]) : null;
}

/**
 * A plan/spec reference: a repo-relative markdown path mentioned in the body,
 * e.g. "see docs/specs/intent-layer.md" or "Plan: docs/design/foo.md". No
 * fetch, no URL — internal sources only (plan §0 decision #1), resolved with
 * `container.git.readFile`, never an outbound HTTP call.
 */
const SPEC_REF_RE = /\b((?:docs\/(?:specs|design|plans?)|plans?)\/[\w.-]+\.md)\b/i;

export function parseSpecRef(body: string | null | undefined): string | null {
  if (!body) return null;
  const m = body.match(SPEC_REF_RE);
  return m?.[1] ?? null;
}

/** True when the diff carries at least one changed file — used for the
 *  "files" source attempt (Availability: always, per plan §1). */
export function hasChangedFiles(diff: IntentDiffFiles): boolean {
  return diff.files.length > 0;
}
