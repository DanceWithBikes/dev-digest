import type { CiRunStatus, CiRunsQuery } from "@devdigest/shared";

/** Columns: repository, pull request, agent, verdict, findings, cost, duration, job. */
export const RUN_GRID = "minmax(140px,1.4fr) 80px minmax(100px,1fr) minmax(150px,1.4fr) 80px 80px 80px 70px";

export const HEAD_KEYS = ["repository", "pullRequest", "agent", "verdict", "findings", "cost", "duration", "job"] as const;

export const WINDOW_VALUES: readonly CiRunsQuery["window"][] = ["7d", "all"];
export const WINDOW_LABEL_KEY: Record<CiRunsQuery["window"], string> = { "7d": "last7Days", all: "allTime" };

export const STATUS_VALUES: readonly CiRunStatus[] = ["succeeded", "failed", "no_findings", "running"];

/** Distinct colours so a failed run never reads like a succeeded one (AC-111). */
export const STATUS_COLOR: Record<CiRunStatus, string> = {
  succeeded: "var(--ok)",
  no_findings: "var(--info)",
  failed: "var(--crit)",
  running: "var(--warn)",
};
