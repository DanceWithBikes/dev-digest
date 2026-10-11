import type { IconName } from "@devdigest/ui";
import type { CiFailOn } from "@devdigest/shared";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. L02 adds Skills; later lessons add Evals/Stats/CI. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" },
  { key: "ci", labelKey: "editor.tabs.ci", icon: "GitBranch" },
];

/** CI gate policy options — shared by the Config tab and the CI tab (labels i18n'd under `agents.config.ciFailOnOptions`). */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];
