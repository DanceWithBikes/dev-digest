import type { CiRun } from "@devdigest/shared";

/** "—" stands in for any value the run does not have (AC-110). */
export const NO_VALUE = "—";

export function formatCost(usd: number | null): string {
  return usd === null ? NO_VALUE : `$${usd.toFixed(4)}`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return NO_VALUE;
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

/** Blocker count to show: only a succeeded run that has blockers (AC-112). */
export function blockersToShow(run: Pick<CiRun, "status" | "blockers">): number | null {
  return run.status === "succeeded" && run.blockers !== null && run.blockers > 0 ? run.blockers : null;
}

export function prLabel(prNumber: number | null): string {
  return prNumber === null ? NO_VALUE : `#${prNumber}`;
}
