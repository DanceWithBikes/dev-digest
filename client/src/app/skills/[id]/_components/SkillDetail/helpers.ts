import { DEFAULT_TAB, SKILL_TABS, type SkillTab } from "./constants";

/**
 * `?tab=` is user-editable, so an unknown value must not blank the page — it
 * falls back to the default tab instead of rendering nothing.
 */
export function parseTab(raw: string | null): SkillTab {
  return SKILL_TABS.includes(raw as SkillTab) ? (raw as SkillTab) : DEFAULT_TAB;
}
