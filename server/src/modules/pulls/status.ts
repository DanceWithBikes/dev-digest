import type { PrFindingPreview, PrStatus } from '@devdigest/shared';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
 * severity breakdown, and a review STATUS. The DB `status` column holds
 * GitHub's merge state (open/merged/closed); the review status
 * (needs_review / reviewed / stale) is DERIVED here for OPEN PRs from the
 * commit a review last ran against (`lastReviewedSha`) vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

/** Worst-first ordering for the list rollup (DB text sorts alphabetically). */
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** Severity, then confidence — the order the popover renders previews in. */
function byWorstFirst(a: PreviewableFinding, b: PreviewableFinding): number {
  const rank = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
  return rank !== 0 ? rank : b.confidence - a.confidence;
}

/**
 * Previews shipped per PR on the list. The popover scrolls rather than paging,
 * and the counts beside it stay exact, so a cap only bounds the list payload.
 */
export const FINDING_PREVIEW_LIMIT = 20;

/** The popover clamps the rationale to 2 lines; don't ship the whole markdown. */
export const FINDING_PREVIEW_RATIONALE_MAX = 240;

/** Row shape the preview needs — structural so this file stays DB-free. */
interface PreviewableFinding {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
}

/** Worst-first, capped, rationale-truncated previews for the list popover. */
export function toFindingPreviews(rows: PreviewableFinding[]): PrFindingPreview[] {
  return [...rows]
    .sort(byWorstFirst)
    .slice(0, FINDING_PREVIEW_LIMIT)
    .map((r) => ({
      id: r.id,
      severity: r.severity as PrFindingPreview['severity'],
      category: r.category as PrFindingPreview['category'],
      title: r.title,
      file: r.file,
      start_line: r.startLine,
      end_line: r.endLine,
      confidence: r.confidence,
      rationale:
        r.rationale.length > FINDING_PREVIEW_RATIONALE_MAX
          ? `${r.rationale.slice(0, FINDING_PREVIEW_RATIONALE_MAX).trimEnd()}…`
          : r.rationale,
    }));
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}
