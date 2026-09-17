import type { Severity, PrSeverityCounts } from "@devdigest/shared";

/** Worst-first display order. The API enum has no INFO — only these three. */
export const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const satisfies readonly Severity[];

/** Severity → its key in the server's rollup object. */
export const COUNT_KEY: Record<Severity, keyof PrSeverityCounts> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

/** Severity → i18n key under `prReview.severity`. */
export const LABEL_KEY: Record<Severity, string> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

export const POPOVER_WIDTH = 360;
export const POPOVER_MAX_HEIGHT = 380;
/** Gap between the trigger and the panel, and the viewport margin it keeps. */
export const POPOVER_GAP = 6;
export const POPOVER_VIEWPORT_MARGIN = 8;
/** Above Dropdown (40), below Drawer/Modal (50). */
export const POPOVER_Z = 45;

/** Hover intent: don't flash a card while the pointer sweeps down the list. */
export const OPEN_DELAY_MS = 120;
/** Grace period so the pointer can travel from the trigger into the card. */
export const CLOSE_DELAY_MS = 150;
