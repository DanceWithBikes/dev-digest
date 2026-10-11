import type { CiInstallation } from "@devdigest/shared";

/** Number of installations whose workflow is merged and running (AC-76). */
export function countActive(installations: readonly CiInstallation[]): number {
  return installations.filter((i) => i.state === "active").length;
}
