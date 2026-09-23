/** Constants for the skill detail page. */

/** The three tabs, in order. The value also lives in `?tab=`. */
export const SKILL_TABS = ["config", "preview", "versioning"] as const;
export type SkillTab = (typeof SKILL_TABS)[number];

/** Tab used when `?tab=` is missing or is not one of SKILL_TABS. */
export const DEFAULT_TAB: SkillTab = "config";
