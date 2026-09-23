import type { ConventionCandidate } from "@devdigest/shared";

/**
 * Candidates still awaiting a decision, strongest evidence first.
 *
 * Rejected ones are filtered out rather than greyed out: the page is a triage
 * queue, and a rule the user already turned down re-appearing on every visit is
 * exactly the noise the persisted status exists to prevent.
 */
export function pendingCandidates(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return candidates
    .filter((c) => c.status === "pending")
    .sort((a, b) => b.confidence - a.confidence);
}

/** Candidates already accepted — the ones the skill will be assembled from. */
export function acceptedCandidates(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return candidates
    .filter((c) => c.status === "accepted")
    .sort((a, b) => b.confidence - a.confidence);
}

/** Confidence as a whole-percent string for the card, e.g. 0.874 → "87%". */
export function confidencePct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * True once a scan has ever run for this repo. Drives Run Scan vs ReScan: the
 * first run and a re-run are the same request but not the same promise to the
 * user, since a re-run adds to a list they have already triaged.
 */
export function hasScanned(candidates: ConventionCandidate[] | undefined): boolean {
  return (candidates?.length ?? 0) > 0;
}
