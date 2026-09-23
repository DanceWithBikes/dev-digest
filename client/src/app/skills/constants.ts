/** Constants shared by the whole /skills segment (library + detail page). */

import type { SkillType } from "@devdigest/shared";

/** Type pill colours (from the design prototype). */
export const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Selectable types, in the order the editor offers them. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
