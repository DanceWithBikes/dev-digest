/** Constants for the Conventions page. */

import type { ConventionCategory } from "@devdigest/shared";

/** Card grid template (responsive auto-fill) — matches Agents and Skills. */
export const CARD_GRID_COLS = "repeat(auto-fill, minmax(320px, 1fr))";

/** Category pill colours. */
export const CATEGORY_COLORS: Record<ConventionCategory, string> = {
  naming: "#3b82f6",
  structure: "#8b5cf6",
  "error-handling": "#ef4444",
  testing: "#10b981",
  typing: "#06b6d4",
  imports: "#f59e0b",
  formatting: "#ec4899",
  other: "#999999",
};

/** Selectable categories, in the order the inline editor offers them. */
export const CATEGORIES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "imports",
  "typing",
  "error-handling",
  "testing",
  "formatting",
  "other",
];

/** Width of the Create-skill modal. */
export const CREATE_MODAL_WIDTH = 760;

/** Rows in the modal's body editor — the assembled markdown is long. */
export const BODY_ROWS = 16;
