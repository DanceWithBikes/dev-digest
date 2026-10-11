import type { CiInstallationState, CiRunStatus } from "@devdigest/shared";

/** Colour of the state label of an installation row. */
export const STATE_COLOR: Record<CiInstallationState, string> = {
  pr_open: "var(--warn)",
  active: "var(--ok)",
  pr_closed: "var(--text-muted)",
};

/** Colour of a run status (failed and succeeded must stay visually distinct, AC-111). */
export const RUN_STATUS_COLOR: Record<CiRunStatus, string> = {
  succeeded: "var(--ok)",
  no_findings: "var(--info)",
  failed: "var(--crit)",
  running: "var(--warn)",
};
