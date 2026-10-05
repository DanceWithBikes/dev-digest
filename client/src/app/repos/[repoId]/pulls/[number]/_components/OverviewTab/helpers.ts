import type { PrBrief, ReviewFocusItem, ReviewRecord, Verdict } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

export interface ReviewSummary {
  verdict: Verdict;
  findingsCount: number;
  blockers: number;
  score: number | null;
}

/** Verdict, counts and score of the newest completed `review`-kind run (reviews arrive newest-first); null when none. */
export function newestReviewSummary(reviews: ReviewRecord[] | undefined): ReviewSummary | null {
  const review = (reviews ?? []).find((r) => r.kind === "review" && r.verdict != null);
  if (!review || !review.verdict) return null;
  return {
    verdict: review.verdict,
    findingsCount: review.findings.length,
    // Same rule as the run accordion: undismissed CRITICAL findings.
    blockers: review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
    score: review.score,
  };
}

/** The brief was generated for a different head than the PR's current one. */
export function isBriefStale(brief: Pick<PrBrief, "head_sha">, headSha: string | null | undefined): boolean {
  return !!headSha && brief.head_sha !== headSha;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export type FocusTarget =
  | { kind: "tab"; path: string }
  | { kind: "github"; url: string }
  | { kind: "text" };

/** Changed file → Files changed tab; otherwise a GitHub link at the brief's head SHA when the repo is known; otherwise plain text. */
export function focusTarget(
  item: ReviewFocusItem,
  changedPaths: ReadonlySet<string>,
  repoFullName: string | null | undefined,
  briefHeadSha: string,
): FocusTarget {
  if (changedPaths.has(item.file)) return { kind: "tab", path: item.file };
  if (repoFullName && briefHeadSha) {
    return { kind: "github", url: githubBlobUrl(repoFullName, briefHeadSha, item.file, item.line) };
  }
  return { kind: "text" };
}
