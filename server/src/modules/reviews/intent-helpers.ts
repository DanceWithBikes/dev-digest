import { createHash } from 'node:crypto';
import type { IntentSource, PrIntentRecord } from '@devdigest/shared';
import type { IntentDiffFiles } from './ports.js';

/**
 * `ok: false` → an entry in `missing_context[]` — the honesty field: a source
 * that was NAMED and could not be read.
 *
 * A spec attempt with no `ref` is a different statement — the PR referenced no
 * spec or plan at all — and is deliberately NOT a missing-context entry: it is
 * not a failure to report, it is the absence of a link, which the card states
 * in its own muted line off `sources[]`. Folding the two together would put an
 * amber warning on the majority of PRs, which never link a spec.
 */
export function deriveMissingContext(attempts: IntentSource[]): string[] {
  return attempts.filter((a) => !a.ok && !isUnlinkedSpec(a)).map(describeMissingSource);
}

/** The "this PR links no spec or plan" attempt: recorded, but not a failure. */
export function isUnlinkedSpec(attempt: IntentSource): boolean {
  return attempt.kind === 'spec' && attempt.ref == null && !attempt.ok;
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

/**
 * Fingerprint of the PR description an intent was classified from, so a later
 * read can tell whether it still describes the same text. SHA-1 hex, matching
 * `repo-intel/pipeline/*`'s content hashes.
 *
 * Deliberately returns a hash even for "no description" (the hash of the empty
 * string) rather than null: "classified while the PR had no description" and
 * "written before this column existed" are opposite situations — the first must
 * go stale the moment a description appears, the second cannot be judged at all
 * — and a null in the column is how `isIntentStale` tells them apart. Trimmed,
 * so whitespace-only counts as absent, matching the `body` source attempt.
 */
export function bodyFingerprint(body: string | null | undefined): string {
  return createHash('sha1').update(body?.trim() ?? '').digest('hex');
}

/**
 * Has the PR moved on since this intent was classified? Derived on read, never
 * stored — a stale record is not wrong data to delete, it is data the user must
 * be told to refresh (the re-run affordance), because its `missing_context[]`
 * is the part that rots first: an intent classified before the PR description
 * reached `pull_requests.body` keeps reporting "PR description is empty" long
 * after the author wrote one.
 *
 * Two signals, either is enough:
 *  - the head sha moved (a push, a force-push — what the card already showed);
 *  - the description changed. A description edit moves NO commit, so `head_sha`
 *    cannot see it.
 *
 * Records written before `body_sha` existed have nothing to compare, so rather
 * than flag every one of them we fall back to the one contradiction we can
 * still prove: the record claims the body source failed while the PR now has a
 * description (or the reverse).
 */
export function isIntentStale(
  record: Pick<PrIntentRecord, 'head_sha' | 'body_sha' | 'sources'>,
  pull: { headSha: string; body: string | null },
): boolean {
  if (record.head_sha && record.head_sha !== pull.headSha) return true;
  if (record.body_sha != null) return record.body_sha !== bodyFingerprint(pull.body);
  const recorded = record.sources?.find((s) => s.kind === 'body');
  return recorded != null && recorded.ok !== Boolean(pull.body?.trim());
}
