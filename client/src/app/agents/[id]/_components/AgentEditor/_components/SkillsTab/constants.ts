import type { SkillType } from "@devdigest/shared";

/** Type pill colours — same palette as the Skills Lab. */
export const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Toggle size (px) for the per-row global-enabled switch — row-sized, not page-sized. */
export const ENABLED_TOGGLE_SIZE = 13;
