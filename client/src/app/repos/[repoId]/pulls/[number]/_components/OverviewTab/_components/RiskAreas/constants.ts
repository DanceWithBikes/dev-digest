import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Per-severity chip colour and icon; one distinct colour for high, medium and low. */
export const SEVERITY_META: Record<RiskSeverity, { color: string; icon: IconName }> = {
  high: { color: "var(--crit)", icon: "Shield" },
  medium: { color: "var(--warn)", icon: "AlertTriangle" },
  low: { color: "var(--info)", icon: "Info" },
};
